import { redactText, sanitizeForExport } from "./secret-vault.mjs";

export const permissionGrantFamilies = Object.freeze(["files", "network", "envVault", "subprocess", "containers", "gpu", "externalProviders", "artifactRetention"]);

const grantFamilySet = new Set(permissionGrantFamilies);
const fixedNow = "2026-06-12T00:00:00.000Z";
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u;
const rawSecretPattern = /(bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/iu;
const genericShellPattern = /^(?:shell|cmd|powershell|bash|sh|python|node|npm|pnpm|yarn|docker|podman)(?:[:\s-]|$)/iu;

export const sampleRunPermissionRequirements = Object.freeze([
  { family: "files", action: "read", target: "workspace:inputs/example.json" },
  { family: "network", action: "connect", target: "http://127.0.0.1:49152/health" },
  { family: "envVault", action: "read", target: "vault:providerCredential" },
  { family: "subprocess", action: "start", target: "adapter:adapter.local-python" },
  { family: "containers", action: "preflight", target: "container:rootless:adapter.local-python" },
  { family: "gpu", action: "request-device", target: "gpu:default" },
  { family: "externalProviders", action: "connect", target: "vault:providerCredential" },
  { family: "artifactRetention", action: "retain", target: "artifact-retention:7d" }
]);

export const samplePermissionGrantStore = createPermissionGrantStore(
  {
    runId: "run.local-001",
    grants: [
      grant("grant.files", "files", ["workspace:inputs", "workspace:outputs", "workspace:runs"]),
      grant("grant.network", "network", ["http://127.0.0.1:49152"]),
      grant("grant.env-vault", "envVault", ["vault:providerCredential"]),
      grant("grant.subprocess", "subprocess", ["adapter:adapter.local-python"]),
      grant("grant.containers", "containers", ["container:rootless:adapter.local-python"]),
      grant("grant.gpu", "gpu", ["gpu:default"]),
      grant("grant.external-provider", "externalProviders", ["vault:providerCredential"]),
      grant("grant.artifact-retention", "artifactRetention", ["artifact-retention:7d"])
    ]
  },
  { now: fixedNow }
);

export function createPermissionGrantStore(input = {}, options = {}) {
  const now = isoNow(options);
  const runId = requireOpaqueId(input.runId ?? "run.local-001", "runId");
  const grants = Array.isArray(input.grants) ? input.grants.map((entry) => normalizeGrant(entry, runId, now)) : [];
  return clone({
    schemaVersion: "agentique.permissionGrantStore.v1",
    runId,
    grants,
    audit: [auditEvent("store-created", "permission.store-created", "Permission grant store created.", { runId }, now)]
  });
}

export function grantPermission(store, grantInput, options = {}) {
  const now = isoNow(options);
  const errors = validateStore(store);
  if (errors.length > 0) return blocked(store, errors);
  try {
    const normalized = normalizeGrant(grantInput, store.runId, now);
    const next = {
      ...clone(store),
      grants: [...store.grants.filter((entry) => entry.id !== normalized.id), normalized],
      audit: [
        ...(store.audit ?? []),
        auditEvent(
          "grant",
          "permission.granted",
          `${normalized.family} grant recorded.`,
          {
            grantId: normalized.id,
            family: normalized.family,
            targets: normalized.targets
          },
          now
        )
      ]
    };
    return { ok: true, store: clone(next), errors: [] };
  } catch (error) {
    return blocked(store, [issue(error.code ?? "permission-grant.invalid", error.message)]);
  }
}

export function revokePermissionGrant(store, grantId, options = {}) {
  const now = isoNow(options);
  const errors = validateStore(store);
  if (errors.length > 0) return blocked(store, errors);
  const id = requireOpaqueId(grantId, "grantId");
  const grants = store.grants.map((entry) => (entry.id === id ? { ...entry, revoked: true, status: "revoked", revokedAt: now } : entry));
  const next = {
    ...clone(store),
    grants,
    audit: [...(store.audit ?? []), auditEvent("revoke", "permission.revoked", "Permission grant revoked.", { grantId: id }, now)]
  };
  return { ok: true, store: clone(next), errors: [] };
}

export function evaluateRunStartGrants(store, requirements = sampleRunPermissionRequirements, options = {}) {
  const now = isoNow(options);
  const errors = validateStore(store);
  if (!Array.isArray(requirements) || requirements.length === 0) {
    errors.push(issue("permission-grant.requirements", "Run start requirements must be a non-empty array."));
  }

  const decisions = [];
  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    const decision = evaluateRequirement(store, requirement, now);
    decisions.push(decision);
    if (decision.status !== "allowed") {
      errors.push(issue(decision.code, decision.message));
    }
  }

  const ok = errors.length === 0;
  const next = {
    ...clone(store),
    audit: [
      ...(store.audit ?? []),
      ...decisions.map((decision) =>
        auditEvent(
          decision.status,
          decision.code,
          decision.message,
          {
            family: decision.family,
            action: decision.action,
            target: decision.target,
            grantId: decision.grantId
          },
          now
        )
      ),
      auditEvent(
        ok ? "start-preflight-allowed" : "start-preflight-blocked",
        ok ? "permission.start-allowed" : "permission.start-blocked",
        ok ? "All required grants are present." : "Run start blocked by permission grants.",
        {
          runId: store?.runId,
          blocked: decisions.filter((decision) => decision.status !== "allowed").length
        },
        now
      )
    ]
  };

  return {
    schemaVersion: "agentique.permissionStartPreflight.v1",
    ok,
    status: ok ? "allowed" : "blocked",
    decisions,
    store: clone(next),
    audit: exportPermissionAudit(next),
    errors
  };
}

export function exportPermissionAudit(store) {
  const audit = Array.isArray(store?.audit) ? store.audit : [];
  return {
    schemaVersion: "agentique.permissionAuditExport.v1",
    runId: redactGrantText(store?.runId ?? ""),
    events: audit.map((entry) =>
      sanitizeForExport({
        ...entry,
        message: redactGrantText(entry.message),
        details: redactAuditDetails(entry.details ?? {})
      })
    )
  };
}

export function reviewPermissionGrantEnforcement() {
  const preflight = evaluateRunStartGrants(samplePermissionGrantStore, sampleRunPermissionRequirements, { now: fixedNow });
  const revoked = revokePermissionGrant(samplePermissionGrantStore, "grant.network", { now: fixedNow });
  const revokedPreflight = evaluateRunStartGrants(revoked.store, sampleRunPermissionRequirements, { now: fixedNow });
  const unsafePreflight = evaluateRunStartGrants(
    samplePermissionGrantStore,
    [
      { family: "browserData", action: "read", target: "browser:cookies" },
      { family: "envVault", action: "read", target: "env:PATH" },
      { family: "network", action: "connect", target: "http://192.0.2.10:8080/hidden" }
    ],
    { now: fixedNow }
  );
  return {
    schemaVersion: "agentique.permissionGrantReview.v1",
    ok: preflight.ok && revokedPreflight.ok === false && unsafePreflight.ok === false,
    families: [...permissionGrantFamilies],
    sampleAllowed: preflight.ok,
    revokedBlocked: revokedPreflight.ok === false,
    unsafeBlocked: unsafePreflight.ok === false,
    errors: [
      ...preflight.errors,
      ...(revokedPreflight.ok === false ? [] : [issue("permission-grant.revocation-test", "Revoked grant was not blocked.")]),
      ...(unsafePreflight.ok === false ? [] : [issue("permission-grant.unsafe-test", "Unsafe requirement was not blocked.")])
    ],
    summary: {
      families: permissionGrantFamilies.length,
      sampleDecisions: preflight.decisions.length,
      auditEvents: preflight.audit.events.length
    }
  };
}

function evaluateRequirement(store, requirement, now) {
  const normalized = normalizeRequirement(requirement);
  if (!normalized.ok) return normalized.decision;
  const unsafe = unsafeRequirement(normalized.requirement);
  if (unsafe) return unsafe;
  const grantMatch = (store?.grants ?? []).find((entry) => entry.family === normalized.requirement.family && coversTarget(entry, normalized.requirement.target));
  if (!grantMatch) {
    return decision("blocked", "permission-grant.missing", "Required explicit grant is missing.", normalized.requirement);
  }
  if (grantMatch.runId !== store.runId) {
    return decision("blocked", "permission-grant.wrong-run", "Grant is scoped to a different run.", normalized.requirement, grantMatch.id);
  }
  if (grantMatch.revoked || grantMatch.status !== "granted") {
    return decision("blocked", "permission-grant.revoked", "Grant is revoked.", normalized.requirement, grantMatch.id);
  }
  if (Date.parse(grantMatch.expiresAt) <= Date.parse(now)) {
    return decision("blocked", "permission-grant.expired", "Grant is expired.", normalized.requirement, grantMatch.id);
  }
  return decision("allowed", "permission-grant.allowed", "Required grant is present.", normalized.requirement, grantMatch.id);
}

function unsafeRequirement(requirement) {
  if (!grantFamilySet.has(requirement.family)) {
    return decision("blocked", "permission-grant.unsupported-family", "Permission family is unsupported.", requirement);
  }
  if (rawSecretPattern.test(requirement.target)) {
    return decision("blocked", "permission-grant.raw-secret", "Permission target contains a raw secret.", requirement);
  }
  if (requirement.family === "files" && (!requirement.target.startsWith("workspace:") || requirement.target.includes("..") || requirement.target.startsWith("workspace:hidden"))) {
    return decision("blocked", "permission-grant.hidden-file", "File grants require visible workspace-scoped references.", requirement);
  }
  if (requirement.family === "network" && !isLoopbackNetwork(requirement.target)) {
    return decision("blocked", "permission-grant.hidden-network", "Network grants require explicit loopback targets for local runner start.", requirement);
  }
  if (requirement.family === "envVault" && !requirement.target.startsWith("vault:")) {
    return decision("blocked", "permission-grant.ambient-env", "Ambient environment access is blocked; use vault references.", requirement);
  }
  if (requirement.family === "subprocess" && (!requirement.target.startsWith("adapter:") || genericShellPattern.test(requirement.target.replace(/^adapter:/u, "")))) {
    return decision("blocked", "permission-grant.generic-shell", "Subprocess grants are adapter-scoped and cannot be generic shell commands.", requirement);
  }
  if (requirement.family === "containers" && !requirement.target.startsWith("container:rootless:")) {
    return decision("blocked", "permission-grant.container-scope", "Container grants require rootless preflight scope.", requirement);
  }
  return null;
}

function coversTarget(grantEntry, target) {
  return grantEntry.targets.some((scope) => target === scope || target.startsWith(`${scope}/`));
}

function normalizeRequirement(requirement) {
  if (!requirement || typeof requirement !== "object") {
    return {
      ok: false,
      decision: decision("blocked", "permission-grant.invalid-requirement", "Requirement must be an object.", { family: "unknown", action: "unknown", target: "" })
    };
  }
  return {
    ok: true,
    requirement: {
      family: String(requirement.family ?? ""),
      action: String(requirement.action ?? ""),
      target: String(requirement.target ?? "")
    }
  };
}

function normalizeGrant(input, runId, now) {
  if (!input || typeof input !== "object") {
    throw error("permission-grant.invalid", "Grant must be an object.");
  }
  const family = String(input.family ?? "");
  if (!grantFamilySet.has(family)) {
    throw error("permission-grant.family", "Grant family is unsupported.");
  }
  const targets = Array.isArray(input.targets) ? input.targets.map((target) => String(target)) : [];
  if (targets.length === 0) {
    throw error("permission-grant.targets", "Grant requires at least one target.");
  }
  for (const target of targets) {
    if (rawSecretPattern.test(target)) {
      throw error("permission-grant.raw-secret", "Grant target contains a raw secret.");
    }
  }
  return {
    id: requireOpaqueId(input.id, "grantId"),
    runId: requireOpaqueId(input.runId ?? runId, "runId"),
    family,
    targets,
    status: input.revoked === true ? "revoked" : "granted",
    revoked: input.revoked === true,
    grantedAt: input.grantedAt ?? now,
    revokedAt: input.revokedAt ?? null,
    expiresAt: input.expiresAt ?? "2026-06-12T01:00:00.000Z"
  };
}

function validateStore(store) {
  const errors = [];
  if (!store || typeof store !== "object") {
    return [issue("permission-grant.invalid-store", "Permission grant store must be an object.")];
  }
  if (store.schemaVersion !== "agentique.permissionGrantStore.v1") {
    errors.push(issue("permission-grant.schema", "Permission grant store schema is unsupported."));
  }
  try {
    requireOpaqueId(store.runId, "runId");
  } catch (error) {
    errors.push(issue(error.code ?? "permission-grant.invalid-id", error.message));
  }
  return errors;
}

function grant(id, family, targets) {
  return { id, family, targets, expiresAt: "2026-06-12T01:00:00.000Z" };
}

function decision(status, code, message, requirement, grantId = null) {
  return {
    status,
    code,
    message: redactGrantText(message),
    family: requirement.family,
    action: requirement.action,
    target: redactGrantText(requirement.target),
    grantId
  };
}

function auditEvent(type, code, message, details, createdAt) {
  return {
    type,
    code,
    message: redactGrantText(message),
    details: redactAuditDetails(details),
    createdAt
  };
}

function redactAuditDetails(details) {
  return JSON.parse(JSON.stringify(details, (_key, value) => (typeof value === "string" ? redactGrantText(value) : value)));
}

function isLoopbackNetwork(target) {
  try {
    const parsed = new URL(target);
    return parsed.protocol === "http:" && new Set(["127.0.0.1", "localhost"]).has(parsed.hostname);
  } catch {
    return false;
  }
}

function isoNow(options = {}) {
  const value = options.now ?? fixedNow;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw error("permission-grant.invalid-time", "Timestamp must be a valid ISO date.");
  }
  return new Date(timestamp).toISOString();
}

function requireOpaqueId(value, fieldName) {
  const text = String(value ?? "");
  if (!idPattern.test(text) || text.includes("..") || text.includes("/") || text.includes("\\") || text.includes(":")) {
    throw error("permission-grant.invalid-id", `${fieldName} must be an opaque id.`);
  }
  return text;
}

function redactGrantText(value) {
  return redactText(String(value ?? "")).replace(/vault:[a-z][a-zA-Z0-9._-]{2,80}/gu, "redacted:vault-reference");
}

function blocked(store, errors) {
  return {
    ok: false,
    store: store ? clone(store) : null,
    errors
  };
}

function issue(code, message) {
  return { code, message: redactGrantText(message) };
}

/**
 * @returns {Error & { code: string }}
 */
function error(code, message) {
  const err = /** @type {Error & { code: string }} */ (new Error(redactGrantText(message)));
  err.code = code;
  return err;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
