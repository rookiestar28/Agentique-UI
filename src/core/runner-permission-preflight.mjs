import {
  createPermissionGrantStore,
  evaluateRunStartGrants,
  grantPermission,
  revokePermissionGrant,
  sampleRunPermissionRequirements
} from "./permission-grants.mjs";
import { redactText } from "./secret-vault.mjs";

export const runnerPermissionPreflightSchemaVersion = "agentique.runnerPermissionPreflightReview.v1";
export const runnerPermissionRunId = "run.local-001";
export const runnerPermissionRequirements = Object.freeze([...sampleRunPermissionRequirements]);

const fixedNow = "2026-06-12T00:00:00.000Z";
const approvalExpiry = "2026-06-12T01:00:00.000Z";
const auditArtifactPath = "artifacts/permission-audit.json";

export function createInitialRunnerPermissionStore(options = {}) {
  return createPermissionGrantStore({
    runId: options.runId ?? runnerPermissionRunId,
    grants: []
  }, { now: options.now ?? fixedNow });
}

export function approveRunnerPermissionGrants(store = createInitialRunnerPermissionStore(), requirements = runnerPermissionRequirements, options = {}) {
  const now = options.now ?? fixedNow;
  let nextStore = clone(store);
  for (const requirement of requirements) {
    const grant = grantInputForRequirement(requirement);
    const result = grantPermission(nextStore, grant, { now });
    if (!result.ok) {
      const review = createRunnerPermissionReview({ store: nextStore, requirements, now });
      return withStore({
        ...review,
        ok: false,
        errors: [...review.errors, ...result.errors]
      }, nextStore);
    }
    nextStore = result.store;
  }
  return withStore(createRunnerPermissionReview({ store: nextStore, requirements, now }), nextStore);
}

export function revokeRunnerPermissionGrant(store, grantId = "grant.network-connect", options = {}) {
  const now = options.now ?? fixedNow;
  const result = revokePermissionGrant(store, grantId, { now });
  const nextStore = result.ok ? result.store : store;
  const review = createRunnerPermissionReview({ store: nextStore, requirements: runnerPermissionRequirements, now });
  return withStore({
    ...review,
    operationErrors: result.ok ? [] : result.errors
  }, nextStore);
}

export function createBlockedRunnerPermissionScenario(options = {}) {
  const now = options.now ?? fixedNow;
  const store = createPermissionGrantStore({
    runId: runnerPermissionRunId,
    grants: [
      {
        id: "grant.expired-files",
        family: "files",
        targets: ["workspace:inputs"],
        expiresAt: "2026-06-11T23:59:59.000Z"
      },
      {
        id: "grant.wrong-run-network",
        runId: "run.other",
        family: "network",
        targets: ["http://127.0.0.1:49152"],
        expiresAt: approvalExpiry
      }
    ]
  }, { now });
  return createRunnerPermissionReview({
    store,
    requirements: blockedRunnerPermissionRequirements(),
    now,
    label: "Blocked grant samples"
  });
}

export function createAllowedRunnerPermissionPreflight(options = {}) {
  return approveRunnerPermissionGrants(createInitialRunnerPermissionStore(options), runnerPermissionRequirements, options).preflight;
}

export function createRunnerPermissionReview({ store = createInitialRunnerPermissionStore(), requirements = runnerPermissionRequirements, now = fixedNow, label = "Runner permission preflight" } = {}) {
  const preflight = evaluateRunStartGrants(store, requirements, { now });
  const decisions = preflight.decisions ?? [];
  const grants = Array.isArray(preflight.store?.grants) ? preflight.store.grants : [];
  const errors = preflight.errors ?? [];
  const review = {
    schemaVersion: runnerPermissionPreflightSchemaVersion,
    label,
    ok: preflight.ok,
    status: preflight.status,
    runId: redactPermissionText(preflight.store?.runId ?? store?.runId ?? ""),
    preflight: sanitizePreflight(preflight),
    requirements: decisions.map((decision) => ({
      family: redactPermissionText(decision.family),
      action: redactPermissionText(decision.action),
      target: redactPermissionText(decision.target),
      status: redactPermissionText(decision.status),
      code: redactPermissionText(decision.code),
      grantId: decision.grantId ? redactPermissionText(decision.grantId) : "missing",
      message: redactPermissionText(decision.message)
    })),
    grants: grants.map((grant) => ({
      id: redactPermissionText(grant.id),
      family: redactPermissionText(grant.family),
      status: redactPermissionText(grant.status),
      revoked: Boolean(grant.revoked),
      expiresAt: redactPermissionText(grant.expiresAt),
      targets: grant.targets.map(redactPermissionText)
    })),
    audit: preflight.audit,
    auditArtifact: {
      path: auditArtifactPath,
      events: preflight.audit?.events?.length ?? 0,
      redacted: true
    },
    summary: {
      required: decisions.length,
      allowed: decisions.filter((decision) => decision.status === "allowed").length,
      blocked: decisions.filter((decision) => decision.status !== "allowed").length,
      currentGrants: grants.length,
      revoked: grants.filter((grant) => grant.revoked || grant.status === "revoked").length,
      expired: errors.filter((error) => error.code === "permission-grant.expired").length,
      wrongRun: errors.filter((error) => error.code === "permission-grant.wrong-run").length,
      unsafe: errors.filter((error) => [
        "permission-grant.hidden-file",
        "permission-grant.hidden-network",
        "permission-grant.ambient-env",
        "permission-grant.unsupported-family",
        "permission-grant.generic-shell"
      ].includes(error.code)).length,
      auditEvents: preflight.audit?.events?.length ?? 0
    },
    errors: errors.map((error) => ({
      code: redactPermissionText(error.code),
      message: redactPermissionText(error.message)
    }))
  };
  return freeze(review);
}

function sanitizePreflight(preflight) {
  return {
    schemaVersion: preflight.schemaVersion,
    ok: preflight.ok,
    status: redactPermissionText(preflight.status),
    decisions: (preflight.decisions ?? []).map((decision) => ({
      status: redactPermissionText(decision.status),
      code: redactPermissionText(decision.code),
      message: redactPermissionText(decision.message),
      family: redactPermissionText(decision.family),
      action: redactPermissionText(decision.action),
      target: redactPermissionText(decision.target),
      grantId: decision.grantId ? redactPermissionText(decision.grantId) : null
    })),
    audit: preflight.audit,
    errors: (preflight.errors ?? []).map((error) => ({
      code: redactPermissionText(error.code),
      message: redactPermissionText(error.message)
    }))
  };
}

export function summarizePermissionPreflight(preflight) {
  if (!preflight || typeof preflight !== "object") {
    return freeze({
      schemaVersion: "agentique.runnerPermissionPreflightSummary.v1",
      ok: false,
      status: "missing",
      required: 0,
      allowed: 0,
      blocked: 0,
      auditEvents: 0,
      artifactPath: auditArtifactPath,
      redacted: true
    });
  }
  const decisions = preflight.decisions ?? [];
  return freeze({
    schemaVersion: "agentique.runnerPermissionPreflightSummary.v1",
    ok: preflight.ok === true,
    status: redactPermissionText(preflight.status ?? "blocked"),
    required: decisions.length,
    allowed: decisions.filter((decision) => decision.status === "allowed").length,
    blocked: decisions.filter((decision) => decision.status !== "allowed").length,
    auditEvents: preflight.audit?.events?.length ?? 0,
    artifactPath: auditArtifactPath,
    redacted: true
  });
}

export function reviewRunnerPermissionPreflightGate() {
  const missing = createRunnerPermissionReview({ store: createInitialRunnerPermissionStore() });
  const approved = approveRunnerPermissionGrants(createInitialRunnerPermissionStore());
  const revoked = revokeRunnerPermissionGrant(approved.store, "grant.network-connect");
  const blocked = createBlockedRunnerPermissionScenario();
  const allowedPreflight = createAllowedRunnerPermissionPreflight();
  const auditText = JSON.stringify({
    approved: approved.audit,
    blocked: blocked.audit,
    allowedSummary: summarizePermissionPreflight(allowedPreflight)
  });
  const requiredCodes = new Set(blocked.errors.map((error) => error.code));
  const ok = missing.ok === false &&
    approved.ok === true &&
    revoked.ok === false &&
    blocked.ok === false &&
    allowedPreflight.ok === true &&
    requiredCodes.has("permission-grant.expired") &&
    requiredCodes.has("permission-grant.wrong-run") &&
    requiredCodes.has("permission-grant.hidden-file") &&
    requiredCodes.has("permission-grant.hidden-network") &&
    requiredCodes.has("permission-grant.ambient-env") &&
    requiredCodes.has("permission-grant.unsupported-family") &&
    requiredCodes.has("permission-grant.generic-shell") &&
    !/vault:providerCredential|bearer\s+[A-Za-z0-9._-]+/iu.test(auditText);

  return freeze({
    schemaVersion: "agentique.runnerPermissionPreflightGateReview.v1",
    ok,
    checks: {
      missing: missing.status,
      approved: approved.status,
      revoked: revoked.status,
      blocked: blocked.status
    },
    summary: {
      required: approved.summary.required,
      approvedAuditEvents: approved.summary.auditEvents,
      blockedReasons: blocked.errors.length,
      auditArtifact: auditArtifactPath
    },
    errors: ok ? [] : [issue("runner-permission-preflight.review", "Runner permission preflight review failed.")]
  });
}

function blockedRunnerPermissionRequirements() {
  return [
    { family: "files", action: "read", target: "workspace:inputs/example.json" },
    { family: "network", action: "connect", target: "http://127.0.0.1:49152/health" },
    { family: "files", action: "read", target: "workspace:hidden/secrets.json" },
    { family: "network", action: "connect", target: "http://192.0.2.10:8080/hidden" },
    { family: "envVault", action: "read", target: "env:PATH" },
    { family: "browserData", action: "read", target: "browser:session" },
    { family: "subprocess", action: "start", target: "adapter:shell" }
  ];
}

function grantInputForRequirement(requirement) {
  return {
    id: grantIdForRequirement(requirement),
    family: requirement.family,
    targets: [scopeForRequirement(requirement)],
    expiresAt: approvalExpiry
  };
}

function grantIdForRequirement(requirement) {
  return `grant.${String(requirement.family).replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}-${String(requirement.action).replace(/[^a-z0-9]+/giu, "-").toLowerCase()}`;
}

function scopeForRequirement(requirement) {
  const target = String(requirement.target ?? "");
  if (requirement.family === "files") {
    const index = target.lastIndexOf("/");
    return index > -1 ? target.slice(0, index) : target;
  }
  if (requirement.family === "network") {
    try {
      return new URL(target).origin;
    } catch {
      return target;
    }
  }
  return target;
}

function redactPermissionText(value) {
  return redactText(String(value ?? "")).replace(/vault:[a-z][a-zA-Z0-9._-]{2,80}/gu, "redacted:vault-reference");
}

function issue(code, message) {
  return { code, message: redactPermissionText(message) };
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withStore(review, store) {
  const next = { ...review };
  Object.defineProperty(next, "store", {
    value: clone(store),
    enumerable: false,
    configurable: false,
    writable: false
  });
  return Object.freeze(next);
}
