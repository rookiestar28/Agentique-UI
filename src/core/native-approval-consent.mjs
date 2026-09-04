import { sha256HexSync } from "./sha256-sync.mjs";

export const nativeApprovalConsentSchemaVersion = "agentique.nativeApprovalConsent.v1";

const allowedFamilies = new Set(["files", "network", "envVault", "subprocess", "containers", "gpu", "externalProviders", "artifactRetention", "model", "tools", "mcp"]);
const allowedDecisions = new Set(["approved", "denied"]);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const secretPrefix = ["s", "k", "-"].join("");
const unsafeTextPattern = new RegExp(
  String.raw`(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|bearer\s+[A-Za-z0-9._-]{12,}|${secretPrefix}[A-Za-z0-9_-]{16,}|cookie\s*=`,
  "iu"
);
const proposalTtlMs = 15 * 60 * 1000;
const grantTtlMs = 60 * 60 * 1000;
const fixedNow = "2026-09-04T00:00:00.000Z";

const defaultEffect = Object.freeze({
  address: Object.freeze({
    productId: "agentique-ui",
    resourceId: "resource.native-consent-001",
    sessionId: "session.native-consent-001",
    runId: "run.native-consent-001"
  }),
  adapterId: "adapter.local-python",
  runtimeId: "agentique-fixed-engine",
  manifestDigest: "c".repeat(64),
  actionId: "adapter.run",
  targetRefs: Object.freeze(["workspace:inputs", "workspace:runs"]),
  risk: "medium",
  capabilityCeiling: Object.freeze(["files", "subprocess", "artifactRetention"]),
  capabilities: Object.freeze([
    Object.freeze({ family: "files", action: "read", target: "workspace:inputs" }),
    Object.freeze({ family: "files", action: "write", target: "workspace:runs" }),
    Object.freeze({ family: "subprocess", action: "start", target: "adapter:adapter.local-python" }),
    Object.freeze({ family: "artifactRetention", action: "retain", target: "artifact-retention:7d" })
  ]),
  credentialNames: Object.freeze([]),
  distributionMode: "bundled-fixed",
  abortPath: "agentique-runner-cancel",
  hidden: false
});

export function createNativeApprovalStore(input = {}) {
  return clone({
    schemaVersion: "agentique.nativeApprovalStore.v1",
    proposals: input.proposals ?? [],
    decisions: input.decisions ?? [],
    grants: input.grants ?? [],
    legacyEvidence: input.legacyEvidence ?? [],
    audit: input.audit ?? []
  });
}

export function prepareNativeApproval(store, input = {}, options = {}) {
  const now = isoNow(options.now);
  const current = normalizeStore(store);
  const effect = mergeEffect(input.effect ?? {});
  const errors = validateEffect(effect);
  if (errors.length > 0) return blocked(current, errors);

  const proposalDigest = digest(effect);
  const proposalId = `proposal.${proposalDigest.slice(0, 24)}`;
  const proposal = {
    schemaVersion: nativeApprovalConsentSchemaVersion,
    proposalId,
    proposalDigest,
    status: "pending",
    policyOwner: "agentique-native-host",
    presentationOwner: "agentique-ui",
    requestedBy: safeId(input.requestedBy ?? "agentique-fixed-engine", "requestedBy"),
    createdAt: now,
    expiresAt: addMilliseconds(now, proposalTtlMs),
    effect
  };
  const next = clone(current);
  next.proposals = [...next.proposals.filter((entry) => entry.proposalId !== proposalId), proposal];
  next.audit.push(audit("proposal-pending", proposalId, now));
  return freeze({ ok: true, status: "pending", store: next, proposal, decision: null, grant: null, errors: [] });
}

export function decideNativeApproval(store, input = {}, options = {}) {
  const now = isoNow(options.now);
  const current = normalizeStore(store);
  const proposalId = safeId(input.proposalId, "proposalId");
  const actorId = safeId(input.actorId, "actorId");
  const proposal = current.proposals.find((entry) => entry.proposalId === proposalId);
  if (!proposal) return blocked(current, [issue("native-consent.proposal-missing", "Pending proposal was not found.")]);
  if (!allowedDecisions.has(input.decision)) return blocked(current, [issue("native-consent.decision", "Decision must be explicitly approved or denied.")]);
  if (proposal.status !== "pending") return blocked(current, [issue("native-consent.decision-replay", "Proposal already has a decision.")]);
  if (Date.parse(proposal.expiresAt) <= Date.parse(now)) return blocked(current, [issue("native-consent.proposal-expired", "Proposal expired before the user decision.")]);
  if (!digestPattern.test(input.proposalDigest ?? "") || input.proposalDigest !== proposal.proposalDigest || digest(proposal.effect) !== proposal.proposalDigest) {
    return blocked(current, [issue("native-consent.proposal-digest", "Displayed proposal digest does not match the native-owned proposal.")]);
  }

  const decision = {
    schemaVersion: "agentique.nativeApprovalDecision.v1",
    decisionId: `decision.${digest({ proposalId, actorId, decision: input.decision, now }).slice(0, 24)}`,
    proposalId,
    proposalDigest: proposal.proposalDigest,
    decision: input.decision,
    actorId,
    decidedAt: now,
    explicitUserAction: true
  };
  const next = clone(current);
  next.proposals = next.proposals.map((entry) => (entry.proposalId === proposalId ? { ...entry, status: input.decision } : entry));
  next.decisions.push(decision);
  next.audit.push(audit(`decision-${input.decision}`, proposalId, now));

  let grant = null;
  if (input.decision === "approved") {
    grant = {
      schemaVersion: "agentique.nativeApprovalGrant.v1",
      grantId: `grant.${digest(decision).slice(0, 24)}`,
      proposalId,
      proposalDigest: proposal.proposalDigest,
      decisionId: decision.decisionId,
      actorId,
      status: "active",
      issuedAt: now,
      expiresAt: addMilliseconds(now, grantTtlMs),
      revokedAt: null,
      consumedAt: null
    };
    next.grants.push(grant);
    next.audit.push(audit("grant-active", grant.grantId, now));
  }

  return freeze({ ok: true, status: input.decision, store: next, proposal, decision, grant, errors: [] });
}

export function consumeNativeApproval(store, input = {}, options = {}) {
  const now = isoNow(options.now);
  const current = normalizeStore(store);
  if (current.legacyEvidence.some((entry) => entry.permissionGrantId === input.grantId || entry.approvalId === input.proposalId)) {
    return blocked(current, [issue("native-consent.legacy-non-authorizing", "Legacy approval identifiers are evidence only and cannot authorize an effect.")]);
  }
  const grant = current.grants.find((entry) => entry.grantId === input.grantId);
  if (!grant) return blocked(current, [issue("native-consent.grant-missing", "An active explicit-decision grant is required before effect.")]);
  if (grant.status === "revoked") return blocked(current, [issue("native-consent.grant-revoked", "Grant was revoked before effect.")]);
  if (grant.status === "consumed") return blocked(current, [issue("native-consent.grant-consumed", "Grant was already consumed by an effect.")]);
  if (Date.parse(grant.expiresAt) <= Date.parse(now)) return blocked(current, [issue("native-consent.grant-expired", "Grant expired before effect.")]);

  const proposal = current.proposals.find((entry) => entry.proposalId === grant.proposalId);
  const decision = current.decisions.find((entry) => entry.decisionId === grant.decisionId);
  if (!proposal || !decision || decision.decision !== "approved" || decision.explicitUserAction !== true) {
    return blocked(current, [issue("native-consent.decision-missing", "Native-owned explicit approval decision is missing.")]);
  }
  if (input.proposalId !== proposal.proposalId || input.proposalDigest !== proposal.proposalDigest || grant.proposalDigest !== proposal.proposalDigest) {
    return blocked(current, [issue("native-consent.proposal-digest", "Effect does not match the approved proposal identity and digest.")]);
  }

  const effect = stripAuthorizationFields(input);
  if (input.actorId !== decision.actorId || digest(effect) !== proposal.proposalDigest || canonical(effect) !== canonical(proposal.effect)) {
    return blocked(current, [issue("native-consent.effect-mismatch", "Effect scope changed after explicit approval.")]);
  }

  const next = clone(current);
  next.grants = next.grants.map((entry) => (entry.grantId === grant.grantId ? { ...entry, status: "consumed", consumedAt: now } : entry));
  next.audit.push(audit("grant-consumed", grant.grantId, now));
  return freeze({ ok: true, status: "consumed", store: next, proposal, decision, grant: next.grants.find((entry) => entry.grantId === grant.grantId), errors: [] });
}

export function revokeNativeApproval(store, grantId, options = {}) {
  const now = isoNow(options.now);
  const current = normalizeStore(store);
  const id = safeId(grantId, "grantId");
  if (!current.grants.some((entry) => entry.grantId === id)) return blocked(current, [issue("native-consent.grant-missing", "Grant was not found for revocation.")]);
  const next = clone(current);
  next.grants = next.grants.map((entry) => (entry.grantId === id && entry.status === "active" ? { ...entry, status: "revoked", revokedAt: now } : entry));
  next.audit.push(audit("grant-revoked", id, now));
  return freeze({ ok: true, status: "revoked", store: next, errors: [] });
}

export function translateRuntimeApprovalRequest(request = {}, options = {}) {
  const familyTargets = {
    files: { action: "read", target: "workspace:inputs" },
    subprocess: { action: "start", target: "adapter:adapter.local-python" },
    artifactRetention: { action: "retain", target: "artifact-retention:7d" }
  };
  const families = Array.isArray(request.capabilities) ? request.capabilities : [];
  const capabilities = families.map((family) => ({ family, ...(familyTargets[family] ?? { action: "unsupported", target: "unsupported" }) }));
  const prepared = prepareNativeApproval(
    createNativeApprovalStore(),
    {
      requestedBy: request.requestId ?? "runtime.request",
      effect: {
        actionId: request.action,
        targetRefs: request.targets,
        capabilityCeiling: families,
        capabilities
      }
    },
    { now: options.now ?? fixedNow }
  );
  return freeze({ ...prepared, translationOwner: "agentique", runtimeHasPolicyAuthority: false });
}

export function createNativeApprovalConsentSurface(scenario = "pending") {
  const prepared = prepareNativeApproval(createNativeApprovalStore(), {}, { now: fixedNow });
  let current = prepared;
  if (scenario === "approved" || scenario === "expired" || scenario === "revoked" || scenario === "consumed" || scenario === "mismatched") {
    current = decideNativeApproval(
      prepared.store,
      {
        proposalId: prepared.proposal.proposalId,
        proposalDigest: prepared.proposal.proposalDigest,
        decision: "approved",
        actorId: "actor.local-user"
      },
      { now: "2026-09-04T00:01:00.000Z" }
    );
  } else if (scenario === "denied") {
    current = decideNativeApproval(
      prepared.store,
      {
        proposalId: prepared.proposal.proposalId,
        proposalDigest: prepared.proposal.proposalDigest,
        decision: "denied",
        actorId: "actor.local-user"
      },
      { now: "2026-09-04T00:01:00.000Z" }
    );
  }

  if (scenario === "revoked") current = revokeNativeApproval(current.store, current.grant.grantId, { now: "2026-09-04T00:02:00.000Z" });
  if (scenario === "consumed") {
    current = consumeNativeApproval(
      current.store,
      {
        ...prepared.proposal.effect,
        proposalId: prepared.proposal.proposalId,
        proposalDigest: prepared.proposal.proposalDigest,
        grantId: current.grant.grantId,
        actorId: current.decision.actorId
      },
      { now: "2026-09-04T00:02:00.000Z" }
    );
  }
  if (scenario === "expired") {
    current = consumeNativeApproval(
      current.store,
      {
        ...prepared.proposal.effect,
        proposalId: prepared.proposal.proposalId,
        proposalDigest: prepared.proposal.proposalDigest,
        grantId: current.grant.grantId,
        actorId: current.decision.actorId
      },
      { now: "2026-09-04T02:00:00.000Z" }
    );
  }
  if (scenario === "mismatched") {
    current = consumeNativeApproval(
      current.store,
      {
        ...prepared.proposal.effect,
        runId: "run.other",
        proposalId: prepared.proposal.proposalId,
        proposalDigest: prepared.proposal.proposalDigest,
        grantId: current.grant.grantId,
        actorId: current.decision.actorId
      },
      { now: "2026-09-04T00:02:00.000Z" }
    );
  }

  const proposal = prepared.proposal;
  const grant = current.grant ?? current.store.grants.at(-1) ?? null;
  const decision = current.decision ?? current.store.decisions.at(-1) ?? null;
  return freeze({
    schemaVersion: "agentique.nativeApprovalConsentSurface.v1",
    scenario,
    status: current.status,
    startAllowed: scenario === "approved" && current.ok === true && grant?.status === "active",
    proposal,
    decision,
    grant,
    errors: current.errors,
    summary: {
      explicitUserAction: decision?.explicitUserAction === true,
      capabilities: proposal.effect.capabilities.length,
      targets: proposal.effect.targetRefs.length,
      actor: decision?.actorId ?? "decision-required",
      credentialValuesPresent: false,
      packageAdopted: false
    }
  });
}

export function reviewNativeApprovalConsentGate() {
  const prepared = prepareNativeApproval(createNativeApprovalStore(), {}, { now: fixedNow });
  const approved = decideNativeApproval(
    prepared.store,
    {
      proposalId: prepared.proposal.proposalId,
      proposalDigest: prepared.proposal.proposalDigest,
      decision: "approved",
      actorId: "actor.local-user"
    },
    { now: "2026-09-04T00:01:00.000Z" }
  );
  const consumed = consumeNativeApproval(
    approved.store,
    {
      ...approved.proposal.effect,
      proposalId: approved.proposal.proposalId,
      proposalDigest: approved.proposal.proposalDigest,
      grantId: approved.grant.grantId,
      actorId: approved.decision.actorId
    },
    { now: "2026-09-04T00:02:00.000Z" }
  );
  const replay = consumeNativeApproval(consumed.store, {
    ...approved.proposal.effect,
    proposalId: approved.proposal.proposalId,
    proposalDigest: approved.proposal.proposalDigest,
    grantId: approved.grant.grantId,
    actorId: approved.decision.actorId
  });
  const translated = translateRuntimeApprovalRequest({
    requestId: "runtime.request-001",
    action: "adapter.run",
    targets: ["workspace:inputs"],
    capabilities: ["files", "subprocess"]
  });
  const checks = {
    preparePending: prepared.ok && prepared.status === "pending" && prepared.grant === null,
    explicitApprove: approved.ok && approved.decision.explicitUserAction === true,
    singleUse: consumed.ok && replay.ok === false,
    runtimeTranslationPending: translated.ok && translated.status === "pending" && translated.runtimeHasPolicyAuthority === false,
    noPackageAdoption: true
  };
  const ok = Object.values(checks).every(Boolean);
  return freeze({
    schemaVersion: "agentique.nativeApprovalConsentReview.v1",
    ok,
    checks,
    errors: ok ? [] : [issue("native-consent.review", "Native approval consent review failed.")]
  });
}

function mergeEffect(override) {
  return clone({
    ...defaultEffect,
    ...override,
    address: { ...defaultEffect.address, ...(override.address ?? {}) },
    targetRefs: override.targetRefs ?? defaultEffect.targetRefs,
    capabilityCeiling: override.capabilityCeiling ?? defaultEffect.capabilityCeiling,
    capabilities: override.capabilities ?? defaultEffect.capabilities,
    credentialNames: override.credentialNames ?? defaultEffect.credentialNames
  });
}

function validateEffect(effect) {
  const errors = [];
  for (const [name, value] of Object.entries(effect.address ?? {})) {
    if (!idPattern.test(value ?? "")) errors.push(issue("native-consent.address", `Run address ${name} must be an opaque id.`));
  }
  for (const field of ["adapterId", "runtimeId", "actionId"]) {
    if (!idPattern.test(effect[field] ?? "")) errors.push(issue("native-consent.identity", `${field} must be an opaque id.`));
  }
  if (!digestPattern.test(effect.manifestDigest ?? "")) errors.push(issue("native-consent.manifest", "Manifest digest must be an exact SHA-256 value."));
  if (!new Set(["low", "medium", "high"]).has(effect.risk)) errors.push(issue("native-consent.risk", "Risk must be explicit."));
  if (effect.distributionMode !== "bundled-fixed") errors.push(issue("native-consent.distribution", "Only the reviewed bundled fixed lane can be proposed."));
  if (effect.abortPath !== "agentique-runner-cancel") errors.push(issue("native-consent.abort", "A native cancel abort path is mandatory."));
  if (effect.hidden !== false) errors.push(issue("native-consent.hidden", "Approval capabilities may not be hidden."));
  if (Object.hasOwn(effect, "credentialValues")) errors.push(issue("native-consent.credential-value", "Credential values may not enter a proposal."));
  if (!Array.isArray(effect.capabilities) || effect.capabilities.length === 0) errors.push(issue("native-consent.capabilities", "At least one exact capability is required."));
  const ceiling = new Set(effect.capabilityCeiling ?? []);
  for (const capability of effect.capabilities ?? []) {
    if (!allowedFamilies.has(capability.family) || !ceiling.has(capability.family))
      errors.push(issue("native-consent.capability-family", "Capability is unsupported or exceeds the declared ceiling."));
    const target = String(capability.target ?? "");
    if (target.includes("*") || target.includes("..") || unsafeTextPattern.test(target))
      errors.push(issue("native-consent.target", "Capability target must be exact and path-neutral."));
    if (capability.family === "files" && (!target.startsWith("workspace:") || target.startsWith("workspace:hidden")))
      errors.push(issue("native-consent.file-target", "File target must be a visible logical workspace reference."));
    if (capability.family === "network" && !isLoopback(target)) errors.push(issue("native-consent.network-target", "Network approval is limited to an exact loopback origin."));
    if (capability.family === "envVault" && !target.startsWith("credential:")) errors.push(issue("native-consent.ambient-env", "Ambient environment access is forbidden."));
    if (capability.family === "subprocess" && target !== "adapter:adapter.local-python")
      errors.push(issue("native-consent.generic-process", "Generic command and process targets are forbidden."));
  }
  if (unsafeTextPattern.test(JSON.stringify(effect))) errors.push(issue("native-consent.unsafe-material", "Proposal contains unsafe local or secret material."));
  return errors;
}

function isLoopback(value) {
  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.origin === value;
  } catch {
    return false;
  }
}

function stripAuthorizationFields(input) {
  const value = clone(input);
  delete value.grantId;
  delete value.proposalId;
  delete value.proposalDigest;
  delete value.actorId;
  return value;
}

function normalizeStore(store) {
  return createNativeApprovalStore(store ?? {});
}

function safeId(value, field) {
  if (!idPattern.test(String(value ?? ""))) throw Object.assign(new Error(`${field} must be an opaque id.`), { code: "native-consent.id" });
  return String(value);
}

function isoNow(value = fixedNow) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Approval time must be a valid ISO timestamp.");
  return date.toISOString();
}

function addMilliseconds(value, milliseconds) {
  return new Date(Date.parse(value) + milliseconds).toISOString();
}

function audit(type, subjectId, at) {
  return { type, subjectId, at, redacted: true };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return sha256HexSync(canonical(value));
}

function issue(code, message) {
  return { code, message };
}

function blocked(store, errors) {
  return freeze({ ok: false, status: "blocked", store, proposal: null, decision: null, grant: null, errors });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  return Object.freeze(clone(value));
}
