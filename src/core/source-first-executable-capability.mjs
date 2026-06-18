import { redactText } from "./secret-vault.mjs";

export const sourceFirstExecutableCapabilitySchemaVersion = "agentique.sourceFirstExecutableCapability.v1";

const requiredCapabilityOrder = Object.freeze([
  "source-first-posture-boundary",
  "native-event-transport",
  "revocation-cancel-controls",
  "durable-run-ledger-replay",
  "watchdog-heartbeat-cleanup",
  "artifact-receipt-safe-viewer",
  "runtime-prerequisite-readiness",
  "external-agent-client-handoff",
  "multi-lane-execution-readiness",
  "closeout-validation-claim-sync"
]);

const requiredValidationSteps = Object.freeze([
  "validate:source-first-executable-capability",
  "validate:runner-capability-closeout",
  "validate:desktop-runner-validation-gate",
  "validate:public",
  "npm test"
]);

const releaseClaimKeys = Object.freeze(["signedDesktopApp", "signedInstaller", "updaterPublication", "productionDesktopRuntime"]);

const forbiddenClaimKeys = Object.freeze([
  "hostedRuntime",
  "universalRuntime",
  "genericShell",
  "automaticDownloadedWorkflowExecution",
  "browserDataAccess",
  "ambientEnvironmentAccess",
  "packageLifecycleExecution",
  "installerUpdater",
  "productionDesktopRuntime"
]);

const acceptedCapabilityStates = new Set(["accepted", "planned", "parked", "blocked"]);
const pathNeutralReferencePattern = /^(docs\/contracts\/[A-Za-z0-9._/-]+|docs\/validation\/[A-Za-z0-9._/-]+|docs\/security\/[A-Za-z0-9._/-]+|evidence\/[A-Za-z0-9._/-]+)$/u;
const privatePlanMarker = "\\." + "planning";
const privateReferenceDocsMarker = ["reference", "docs"].join("\\/");
const internalItemCodePattern = "\\b" + "R" + "\\d{4}\\b";
const unsafeTextPattern = new RegExp(
  [
    "(?<![A-Za-z])[A-Za-z]:[\\\\/]",
    "\\\\\\\\",
    "(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)",
    "\\.\\.[\\\\/]",
    privatePlanMarker,
    privateReferenceDocsMarker,
    internalItemCodePattern,
    "bearer\\s+[A-Za-z0-9._-]{12,}",
    "sk-[A-Za-z0-9]{20,}",
    "ghp_[A-Za-z0-9_]{20,}",
    "github_pat_[A-Za-z0-9_]{20,}",
    "ya29\\."
  ].join("|"),
  "iu"
);

export const sampleSourceFirstExecutableCapability = Object.freeze({
  schemaVersion: sourceFirstExecutableCapabilitySchemaVersion,
  sourcePosture: {
    sourceUse: "source-checkout",
    runtimeScope: "supported-local-only",
    distributionScope: "source-first",
    startsFromWebLayer: false,
    nativeBackendRequiredForLocalRun: true,
    signedDistributionRequiredForPublicRuntimeClaim: true
  },
  acceptanceVocabulary: {
    acceptedTerms: ["source-first local workspace", "supported-local-only", "capability-gated local run", "descriptor-only handoff", "parked release claim"],
    forbiddenTerms: ["production desktop runtime", "hosted runtime", "universal workflow runtime", "generic shell", "automatic downloaded workflow execution"]
  },
  capabilityMatrix: [
    capability("source-first-posture-boundary", "Source-first posture boundary", "accepted", "Current accepted source-checkout workspace scope and no-overclaim vocabulary.", [
      "docs/contracts/source-first-executable-capability.md"
    ]),
    capability(
      "native-event-transport",
      "Active native event transport",
      "accepted",
      "Versioned bounded native event bridge with replay fallback is accepted for supported local runs.",
      ["docs/contracts/active-native-event-transport.md"]
    ),
    capability(
      "revocation-cancel-controls",
      "Revocation and cancel controls",
      "accepted",
      "User-visible revoke, cancel, and forced-stop controls have accepted local audit evidence.",
      ["docs/contracts/runner-revocation-cancel-controls.md"]
    ),
    capability("durable-run-ledger-replay", "Durable run ledger and replay", "accepted", "Restart-safe local ledger and bounded redacted export behavior are accepted.", [
      "docs/contracts/durable-run-ledger.md"
    ]),
    capability(
      "watchdog-heartbeat-cleanup",
      "Watchdog heartbeat and cleanup",
      "accepted",
      "Native-owned heartbeat, timeout, and cleanup supervision are accepted for supported local lanes.",
      ["docs/contracts/watchdog-heartbeat-supervisor.md"]
    ),
    capability("artifact-receipt-safe-viewer", "Artifact receipt and safe viewer", "accepted", "Digest-aware artifact receipt binding and preview-safe handling are accepted.", [
      "docs/contracts/artifact-receipt-binding.md"
    ]),
    capability(
      "runtime-prerequisite-readiness",
      "Runtime prerequisite readiness",
      "accepted",
      "Source-checkout diagnostics are accepted without package-manager installation or lifecycle execution.",
      ["docs/contracts/runtime-prerequisite-readiness.md"]
    ),
    capability("external-agent-client-handoff", "External agent-client handoff", "accepted", "User-driven descriptor export is accepted without automatic bridge execution.", [
      "docs/validation/runner-ui-execution-evidence.md"
    ]),
    capability(
      "multi-lane-execution-readiness",
      "Multi-lane execution readiness",
      "accepted",
      "Disabled-by-default readiness matrix is accepted for future adapter-family review without enabling those lanes.",
      ["docs/contracts/multi-lane-execution-readiness.md"]
    ),
    capability(
      "closeout-validation-claim-sync",
      "Closeout validation and claim sync",
      "accepted",
      "Aggregate validation and public claim synchronization are accepted for source-first local-only scope.",
      ["docs/validation/executable-capability-closeout-pack.md"]
    )
  ],
  releaseBoundary: {
    signedDesktopApp: "parked",
    signedInstaller: "parked",
    updaterPublication: "parked",
    productionDesktopRuntime: "parked"
  },
  forbiddenClaims: Object.fromEntries(forbiddenClaimKeys.map((key) => [key, false])),
  validation: {
    requiredSteps: [...requiredValidationSteps],
    coreGateRequiredWhenCoreContractsChange: true,
    publicBoundaryRequired: true
  },
  publicSafety: {
    publicBoundaryScan: "passed",
    noSecretScan: "passed",
    privateMarkersAbsent: true,
    evidenceRefsPathNeutral: true,
    notes: []
  }
});

export function reviewSourceFirstExecutableCapability(boundary = sampleSourceFirstExecutableCapability) {
  const errors = [];
  if (!boundary || typeof boundary !== "object") {
    return blockedReview([issue("source-first.invalid", "Source-first capability boundary must be an object.")]);
  }

  assertNoUnsafeText(boundary, errors);
  if (boundary.schemaVersion !== sourceFirstExecutableCapabilitySchemaVersion) {
    errors.push(issue("source-first.schema", "Source-first capability boundary schema is unsupported."));
  }

  const sourcePosture = reviewSourcePosture(boundary.sourcePosture, errors);
  const acceptanceVocabulary = reviewAcceptanceVocabulary(boundary.acceptanceVocabulary, errors);
  const capabilityMatrix = reviewCapabilityMatrix(boundary.capabilityMatrix, errors);
  const releaseBoundary = reviewReleaseBoundary(boundary.releaseBoundary, errors);
  const forbiddenClaims = reviewForbiddenClaims(boundary.forbiddenClaims, errors);
  const validation = reviewValidation(boundary.validation, errors);
  const publicSafety = reviewPublicSafety(boundary.publicSafety, errors);
  const ok = errors.length === 0;
  const nextCapability = capabilityMatrix.items.find((item) => item.state === "planned")?.id ?? null;

  return freeze({
    schemaVersion: "agentique.sourceFirstExecutableCapabilityReview.v1",
    ok,
    status: ok ? "accepted" : "blocked",
    sourcePosture,
    acceptanceVocabulary,
    capabilityMatrix,
    releaseBoundary,
    forbiddenClaims,
    validation,
    publicSafety,
    summary: {
      capabilityRows: capabilityMatrix.items.length,
      acceptedRows: capabilityMatrix.items.filter((item) => item.state === "accepted").length,
      plannedRows: capabilityMatrix.items.filter((item) => item.state === "planned").length,
      parkedReleaseClaims: Object.values(releaseBoundary).filter((value) => value === "parked").length,
      sourceUse: sourcePosture.sourceUse,
      runtimeScope: sourcePosture.runtimeScope,
      nextCapability
    },
    errors: errors.map((error) => ({ code: error.code, message: redactText(error.message) }))
  });
}

export function reviewSourceFirstExecutableCapabilityGate() {
  const accepted = reviewSourceFirstExecutableCapability();
  const missingCapability = reviewSourceFirstExecutableCapability({
    ...sampleSourceFirstExecutableCapability,
    capabilityMatrix: sampleSourceFirstExecutableCapability.capabilityMatrix.filter((item) => item.id !== "native-event-transport")
  });
  const releaseOverclaim = reviewSourceFirstExecutableCapability({
    ...sampleSourceFirstExecutableCapability,
    releaseBoundary: {
      ...sampleSourceFirstExecutableCapability.releaseBoundary,
      signedInstaller: "ready",
      productionDesktopRuntime: "ready"
    },
    forbiddenClaims: {
      ...sampleSourceFirstExecutableCapability.forbiddenClaims,
      universalRuntime: true,
      hostedRuntime: true
    }
  });
  const unsafeEvidence = reviewSourceFirstExecutableCapability({
    ...sampleSourceFirstExecutableCapability,
    capabilityMatrix: sampleSourceFirstExecutableCapability.capabilityMatrix.map((item, index) =>
      index === 0
        ? {
            ...item,
            evidenceRefs: [["C", ":\\private\\runner.log"].join("")]
          }
        : item
    )
  });

  return freeze({
    schemaVersion: "agentique.sourceFirstExecutableCapabilityGateReview.v1",
    ok: accepted.ok && !missingCapability.ok && !releaseOverclaim.ok && !unsafeEvidence.ok,
    acceptedStatus: accepted.status,
    missingCapabilityBlocked: missingCapability.errors.some((error) => error.code === "source-first.capability-matrix"),
    releaseOverclaimBlocked:
      releaseOverclaim.errors.some((error) => error.code === "source-first.release-boundary") &&
      releaseOverclaim.errors.some((error) => error.code === "source-first.forbidden-claim"),
    unsafeEvidenceBlocked:
      unsafeEvidence.errors.some((error) => error.code === "source-first.unsafe-text") && unsafeEvidence.errors.some((error) => error.code === "source-first.evidence-ref"),
    summary: accepted.summary
  });
}

function capability(id, label, state, acceptance, evidenceRefs = []) {
  return {
    id,
    label,
    state,
    acceptance,
    evidenceRefs,
    enablesNewRuntime: false,
    liveTransport: false,
    startsBridge: false,
    startsRuntime: false,
    widensPermissions: false,
    publicClaimAllowed: state === "accepted"
  };
}

function reviewSourcePosture(posture = {}, errors) {
  const normalized = {
    sourceUse: String(posture.sourceUse ?? ""),
    runtimeScope: String(posture.runtimeScope ?? ""),
    distributionScope: String(posture.distributionScope ?? ""),
    startsFromWebLayer: posture.startsFromWebLayer === true,
    nativeBackendRequiredForLocalRun: posture.nativeBackendRequiredForLocalRun === true,
    signedDistributionRequiredForPublicRuntimeClaim: posture.signedDistributionRequiredForPublicRuntimeClaim === true
  };
  if (normalized.sourceUse !== "source-checkout") {
    errors.push(issue("source-first.source-use", "Source-first posture must use source checkout."));
  }
  if (normalized.runtimeScope !== "supported-local-only") {
    errors.push(issue("source-first.runtime-scope", "Runtime scope must remain supported local only."));
  }
  if (normalized.distributionScope !== "source-first") {
    errors.push(issue("source-first.distribution-scope", "Distribution scope must remain source first."));
  }
  if (normalized.startsFromWebLayer) {
    errors.push(issue("source-first.web-layer-spawn", "Web layer must not start local runtime processes."));
  }
  if (!normalized.nativeBackendRequiredForLocalRun || !normalized.signedDistributionRequiredForPublicRuntimeClaim) {
    errors.push(issue("source-first.posture-evidence", "Native and signed-distribution boundaries must stay explicit."));
  }
  return normalized;
}

function reviewAcceptanceVocabulary(vocabulary = {}, errors) {
  const acceptedTerms = toStringArray(vocabulary.acceptedTerms);
  const forbiddenTerms = toStringArray(vocabulary.forbiddenTerms);
  for (const required of ["source-first local workspace", "supported-local-only", "capability-gated local run", "descriptor-only handoff"]) {
    if (!acceptedTerms.includes(required)) {
      errors.push(issue("source-first.acceptance-vocabulary", `Missing accepted term: ${required}.`));
    }
  }
  for (const forbidden of ["production desktop runtime", "hosted runtime", "universal workflow runtime", "generic shell"]) {
    if (!forbiddenTerms.includes(forbidden)) {
      errors.push(issue("source-first.forbidden-vocabulary", `Missing forbidden term: ${forbidden}.`));
    }
  }
  return {
    acceptedTerms,
    forbiddenTerms
  };
}

function reviewCapabilityMatrix(matrix, errors) {
  const items = Array.isArray(matrix) ? matrix.map(normalizeCapability) : [];
  const ids = items.map((item) => item.id);
  if (ids.length !== requiredCapabilityOrder.length || !requiredCapabilityOrder.every((id, index) => ids[index] === id)) {
    errors.push(issue("source-first.capability-matrix", "Capability matrix must include every required row in order."));
  }
  for (const item of items) {
    if (!acceptedCapabilityStates.has(item.state)) {
      errors.push(issue("source-first.capability-state", `${item.id} has unsupported state.`));
    }
    if (!item.label || !item.acceptance) {
      errors.push(issue("source-first.capability-description", `${item.id} must have a label and acceptance text.`));
    }
    for (const reference of item.evidenceRefs) {
      validateEvidenceRef(reference, errors);
    }
    if (item.state === "accepted" && item.evidenceRefs.length === 0) {
      errors.push(issue("source-first.evidence-ref", `${item.id} accepted state requires evidence reference.`));
    }
    if (item.enablesNewRuntime || item.liveTransport || item.startsBridge || item.startsRuntime || item.widensPermissions) {
      errors.push(issue("source-first.runtime-enable", `${item.id} cannot enable runtime behavior in the posture boundary.`));
    }
    if (item.state !== "accepted" && item.publicClaimAllowed) {
      errors.push(issue("source-first.public-claim", `${item.id} cannot allow public claims before acceptance.`));
    }
  }
  return {
    requiredOrder: [...requiredCapabilityOrder],
    items
  };
}

function normalizeCapability(item = {}) {
  return {
    id: String(item.id ?? ""),
    label: String(item.label ?? ""),
    state: String(item.state ?? ""),
    acceptance: String(item.acceptance ?? ""),
    evidenceRefs: toStringArray(item.evidenceRefs),
    enablesNewRuntime: item.enablesNewRuntime === true,
    liveTransport: item.liveTransport === true,
    startsBridge: item.startsBridge === true,
    startsRuntime: item.startsRuntime === true,
    widensPermissions: item.widensPermissions === true,
    publicClaimAllowed: item.publicClaimAllowed === true
  };
}

function reviewReleaseBoundary(boundary = {}, errors) {
  const output = {};
  for (const key of releaseClaimKeys) {
    const value = String(boundary[key] ?? "");
    if (value !== "parked") {
      errors.push(issue("source-first.release-boundary", `${key} must remain parked.`));
    }
    output[key] = value === "parked" ? "parked" : "unsafe";
  }
  return output;
}

function reviewForbiddenClaims(claims = {}, errors) {
  const output = {};
  for (const key of forbiddenClaimKeys) {
    const value = claims[key] === true;
    if (value) {
      errors.push(issue("source-first.forbidden-claim", `${key} must remain false.`));
    }
    output[key] = value;
  }
  return output;
}

function reviewValidation(validation = {}, errors) {
  const requiredSteps = toStringArray(validation.requiredSteps);
  for (const step of requiredValidationSteps) {
    if (!requiredSteps.includes(step)) {
      errors.push(issue("source-first.validation-step", `Missing required validation step: ${step}.`));
    }
  }
  if (validation.coreGateRequiredWhenCoreContractsChange !== true || validation.publicBoundaryRequired !== true) {
    errors.push(issue("source-first.validation-scope", "Core-gate and public-boundary requirements must stay explicit."));
  }
  return {
    requiredSteps,
    missing: requiredValidationSteps.filter((step) => !requiredSteps.includes(step)),
    coreGateRequiredWhenCoreContractsChange: validation.coreGateRequiredWhenCoreContractsChange === true,
    publicBoundaryRequired: validation.publicBoundaryRequired === true
  };
}

function reviewPublicSafety(safety = {}, errors) {
  const normalized = {
    publicBoundaryScan: safety.publicBoundaryScan === "passed" ? "passed" : "blocked",
    noSecretScan: safety.noSecretScan === "passed" ? "passed" : "blocked",
    privateMarkersAbsent: safety.privateMarkersAbsent === true,
    evidenceRefsPathNeutral: safety.evidenceRefsPathNeutral === true,
    notes: toStringArray(safety.notes)
  };
  if (normalized.publicBoundaryScan !== "passed" || normalized.noSecretScan !== "passed" || !normalized.privateMarkersAbsent || !normalized.evidenceRefsPathNeutral) {
    errors.push(issue("source-first.public-safety", "Public safety checks must pass."));
  }
  return normalized;
}

function validateEvidenceRef(reference, errors) {
  const text = String(reference ?? "");
  if (!pathNeutralReferencePattern.test(text) || text.includes("..") || unsafeTextPattern.test(text)) {
    errors.push(issue("source-first.evidence-ref", "Evidence references must be path-neutral and public-safe."));
  }
}

function assertNoUnsafeText(value, errors) {
  if (value == null) return;
  if (typeof value === "string") {
    if (unsafeTextPattern.test(value)) {
      errors.push(issue("source-first.unsafe-text", "Source-first capability boundary contains unsafe public text."));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertNoUnsafeText(entry, errors);
    return;
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value)) assertNoUnsafeText(entry, errors);
  }
}

function toStringArray(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function blockedReview(errors) {
  return freeze({
    schemaVersion: "agentique.sourceFirstExecutableCapabilityReview.v1",
    ok: false,
    status: "blocked",
    sourcePosture: {},
    acceptanceVocabulary: { acceptedTerms: [], forbiddenTerms: [] },
    capabilityMatrix: { requiredOrder: [...requiredCapabilityOrder], items: [] },
    releaseBoundary: {},
    forbiddenClaims: {},
    validation: { requiredSteps: [], missing: [...requiredValidationSteps] },
    publicSafety: { publicBoundaryScan: "blocked", noSecretScan: "blocked", privateMarkersAbsent: false, evidenceRefsPathNeutral: false, notes: [] },
    summary: {
      capabilityRows: 0,
      acceptedRows: 0,
      plannedRows: 0,
      parkedReleaseClaims: 0,
      sourceUse: "",
      runtimeScope: "",
      nextCapability: null
    },
    errors: errors.map((error) => ({ code: error.code, message: redactText(error.message) }))
  });
}

function issue(code, message) {
  return {
    code,
    message: redactText(message)
  };
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
