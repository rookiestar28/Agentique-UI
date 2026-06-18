import { redactText } from "./secret-vault.mjs";

export const executableCapabilityCloseoutPackSchemaVersion = "agentique.executableCapabilityCloseoutPack.v1";

const generatedAt = "2026-06-16T15:00:00.000Z";
const requiredCapabilityOrder = Object.freeze([
  "source-first-posture-boundary",
  "active-native-event-transport",
  "revocation-cancel-controls",
  "durable-run-ledger-replay",
  "watchdog-heartbeat-cleanup",
  "artifact-receipt-safe-viewer",
  "runtime-prerequisite-readiness",
  "external-agent-client-handoff",
  "multi-lane-execution-readiness",
  "closeout-validation-claim-sync"
]);
const requiredValidationEvidence = Object.freeze([
  "agentiqueUiFullValidation",
  "coreFullGate",
  "publicBoundaryScan",
  "noSecretScan",
  "noOverclaimScan",
  "desktopNarrowInteractionEvidence"
]);
const noGoClaimKeys = Object.freeze(["signedDesktopApp", "signedInstaller", "updater", "productionDesktopRuntime"]);
const forbiddenRuntimeClaimKeys = Object.freeze([
  "hostedRuntime",
  "universalRuntime",
  "genericShell",
  "automaticDownloadedWorkflowExecution",
  "browserDataAccess",
  "ambientEnvironmentAccess",
  "packageLifecycleExecution",
  "containerStart",
  "imagePull",
  "externalProviderAutomation"
]);
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

export function createExecutableCapabilityCloseoutPack({ capabilityOverrides = {} } = {}) {
  const capabilities = capabilityRows().map((capability) => ({
    ...capability,
    ...(capabilityOverrides[capability.id] ?? {})
  }));
  return freeze({
    schemaVersion: executableCapabilityCloseoutPackSchemaVersion,
    generatedAt,
    status: "accepted-local-only",
    sourceScope: {
      sourceUse: "source-checkout",
      runtimeScope: "supported-local-only",
      distributionScope: "source-first",
      webLayerStartsRuntime: false
    },
    capabilities,
    validationEvidence: {
      agentiqueUiFullValidation: "passed",
      coreFullGate: "passed",
      publicBoundaryScan: "passed",
      noSecretScan: "passed",
      noOverclaimScan: "passed",
      desktopNarrowInteractionEvidence: "passed"
    },
    interactionEvidence: {
      desktopViewport: "passed",
      narrowViewport: "passed",
      affectedPanels: ["Run workspace", "Graph workspace", "Settings workspace"],
      evidenceRefs: ["docs/validation/runner-ui-execution-evidence.md", "docs/validation/visual-regression-evidence.md"]
    },
    publicSafety: {
      publicBoundaryScan: "passed",
      noSecretScan: "passed",
      privateMarkersAbsent: true,
      evidenceRefsPathNeutral: true
    },
    claimSync: {
      sourceFirstDocs: "synced",
      runnerCloseoutDocs: "synced",
      releaseClaimDocs: "blocked",
      publicVocabulary: "source-first supported-local-only"
    },
    roadmapSync: {
      traceabilityMapping: "recorded",
      statusIndex: "synced",
      closeoutEvidence: "recorded"
    },
    noGoClaims: Object.fromEntries(noGoClaimKeys.map((key) => [key, "blocked"])),
    forbiddenRuntimeClaims: Object.fromEntries(forbiddenRuntimeClaimKeys.map((key) => [key, false]))
  });
}

export function reviewExecutableCapabilityCloseoutPack(pack = createExecutableCapabilityCloseoutPack()) {
  const errors = [];
  if (!pack || typeof pack !== "object") {
    return blockedReview([issue("executable-closeout.invalid", "Executable capability closeout pack must be an object.")]);
  }
  assertNoUnsafeText(pack, errors);
  if (pack.schemaVersion !== executableCapabilityCloseoutPackSchemaVersion) {
    errors.push(issue("executable-closeout.schema", "Executable capability closeout pack schema is unsupported."));
  }

  const capabilities = reviewCapabilities(pack.capabilities, errors);
  const validationEvidence = reviewValidationEvidence(pack.validationEvidence, errors);
  const interactionEvidence = reviewInteractionEvidence(pack.interactionEvidence, errors);
  const publicSafety = reviewPublicSafety(pack.publicSafety, errors);
  const claimSync = reviewClaimSync(pack.claimSync, pack.roadmapSync, errors);
  const noGoClaims = reviewNoGoClaims(pack.noGoClaims, errors);
  const forbiddenRuntimeClaims = reviewForbiddenRuntimeClaims(pack.forbiddenRuntimeClaims, errors);
  const sourceScope = reviewSourceScope(pack.sourceScope, errors);
  const ok = errors.length === 0;

  return freeze({
    schemaVersion: "agentique.executableCapabilityCloseoutPackReview.v1",
    ok,
    status: ok ? "accepted" : "blocked",
    sourceScope,
    capabilities,
    validationEvidence,
    interactionEvidence,
    publicSafety,
    claimSync,
    noGoClaims,
    forbiddenRuntimeClaims,
    summary: {
      capabilityRows: capabilities.items.length,
      acceptedCapabilities: capabilities.accepted,
      validationEvidence: validationEvidence.status,
      releaseRuntimeClaimsBlocked: noGoClaims.allBlocked && forbiddenRuntimeClaims.allFalse,
      publicSafety: publicSafety.status,
      desktopNarrowEvidence: interactionEvidence.status
    },
    errors: serializeErrors(errors)
  });
}

export function reviewExecutableCapabilityCloseoutGate() {
  const accepted = reviewExecutableCapabilityCloseoutPack();
  const missingCapability = reviewExecutableCapabilityCloseoutPack({
    ...createExecutableCapabilityCloseoutPack(),
    capabilities: createExecutableCapabilityCloseoutPack().capabilities.filter((capability) => capability.id !== "multi-lane-execution-readiness")
  });
  const missingValidation = reviewExecutableCapabilityCloseoutPack({
    ...createExecutableCapabilityCloseoutPack(),
    validationEvidence: {
      ...createExecutableCapabilityCloseoutPack().validationEvidence,
      coreFullGate: "missing"
    }
  });
  const overclaim = reviewExecutableCapabilityCloseoutPack({
    ...createExecutableCapabilityCloseoutPack(),
    noGoClaims: {
      ...createExecutableCapabilityCloseoutPack().noGoClaims,
      signedInstaller: "ready",
      productionDesktopRuntime: "ready"
    },
    forbiddenRuntimeClaims: {
      ...createExecutableCapabilityCloseoutPack().forbiddenRuntimeClaims,
      universalRuntime: true,
      externalProviderAutomation: true
    }
  });
  const unsafeReference = reviewExecutableCapabilityCloseoutPack({
    ...createExecutableCapabilityCloseoutPack(),
    capabilities: createExecutableCapabilityCloseoutPack().capabilities.map((capability, index) =>
      index === 0
        ? {
            ...capability,
            evidenceRefs: [["C", ":\\private\\closeout.log"].join("")]
          }
        : capability
    )
  });

  return freeze({
    schemaVersion: "agentique.executableCapabilityCloseoutPackGateReview.v1",
    ok: accepted.ok && !missingCapability.ok && !missingValidation.ok && !overclaim.ok && !unsafeReference.ok,
    acceptedStatus: accepted.status,
    missingCapabilityBlocked: missingCapability.errors.some((error) => error.code === "executable-closeout.capability-order"),
    validationEvidenceBlocked: missingValidation.errors.some((error) => error.code === "executable-closeout.validation-evidence"),
    overclaimBlocked:
      overclaim.errors.some((error) => error.code === "executable-closeout.no-go") && overclaim.errors.some((error) => error.code === "executable-closeout.forbidden-runtime"),
    unsafeReferenceBlocked: unsafeReference.errors.some((error) => error.code === "executable-closeout.evidence-ref"),
    summary: accepted.summary
  });
}

function capabilityRows() {
  return [
    capability("source-first-posture-boundary", "Source-first posture boundary", ["docs/contracts/source-first-executable-capability.md"]),
    capability("active-native-event-transport", "Active native event transport", ["docs/contracts/active-native-event-transport.md"]),
    capability("revocation-cancel-controls", "Revocation and cancel controls", ["docs/contracts/runner-revocation-cancel-controls.md"]),
    capability("durable-run-ledger-replay", "Durable run ledger and replay", ["docs/contracts/durable-run-ledger.md"]),
    capability("watchdog-heartbeat-cleanup", "Watchdog heartbeat and cleanup", ["docs/contracts/watchdog-heartbeat-supervisor.md"]),
    capability("artifact-receipt-safe-viewer", "Artifact receipt and safe viewer", ["docs/contracts/artifact-receipt-binding.md"]),
    capability("runtime-prerequisite-readiness", "Runtime prerequisite readiness", ["docs/contracts/runtime-prerequisite-readiness.md"]),
    capability("external-agent-client-handoff", "External agent-client handoff", ["docs/validation/runner-ui-execution-evidence.md"]),
    capability("multi-lane-execution-readiness", "Multi-lane execution readiness", ["docs/contracts/multi-lane-execution-readiness.md"]),
    capability("closeout-validation-claim-sync", "Closeout validation and claim sync", ["docs/validation/executable-capability-closeout-pack.md"])
  ];
}

function capability(id, label, evidenceRefs) {
  return {
    id,
    label,
    status: "accepted",
    evidenceRefs,
    localOnly: true,
    enablesNewRuntime: false,
    widensPermissions: false,
    releaseClaimAllowed: false
  };
}

function reviewCapabilities(input, errors) {
  const items = Array.isArray(input) ? input.map(normalizeCapability) : [];
  const ids = items.map((item) => item.id);
  if (ids.length !== requiredCapabilityOrder.length || !requiredCapabilityOrder.every((id, index) => ids[index] === id)) {
    errors.push(issue("executable-closeout.capability-order", "Executable closeout pack must include every capability row in order."));
  }
  let accepted = 0;
  for (const item of items) {
    if (item.status !== "accepted") {
      errors.push(issue("executable-closeout.capability-status", `${item.id} must be accepted.`));
    } else {
      accepted += 1;
    }
    if (!item.localOnly || item.enablesNewRuntime || item.widensPermissions || item.releaseClaimAllowed) {
      errors.push(issue("executable-closeout.capability-boundary", `${item.id} must stay local-only and must not widen runtime or release claims.`));
    }
    if (item.evidenceRefs.length === 0) {
      errors.push(issue("executable-closeout.evidence-ref", `${item.id} must include public-safe evidence refs.`));
    }
    for (const reference of item.evidenceRefs) validateEvidenceRef(reference, errors);
  }
  return { accepted, required: requiredCapabilityOrder.length, items };
}

function normalizeCapability(item = {}) {
  return {
    id: String(item.id ?? ""),
    label: String(item.label ?? ""),
    status: String(item.status ?? ""),
    evidenceRefs: Array.isArray(item.evidenceRefs) ? item.evidenceRefs.map(String) : [],
    localOnly: item.localOnly === true,
    enablesNewRuntime: item.enablesNewRuntime === true,
    widensPermissions: item.widensPermissions === true,
    releaseClaimAllowed: item.releaseClaimAllowed === true
  };
}

function reviewValidationEvidence(evidence = {}, errors) {
  const output = {};
  for (const key of requiredValidationEvidence) {
    const status = String(evidence[key] ?? "");
    if (status !== "passed") {
      errors.push(issue("executable-closeout.validation-evidence", `${key} validation evidence must be passed.`));
    }
    output[key] = status === "passed" ? "passed" : "blocked";
  }
  output.status = requiredValidationEvidence.every((key) => output[key] === "passed") ? "passed" : "blocked";
  return output;
}

function reviewInteractionEvidence(evidence = {}, errors) {
  const desktopViewport = evidence.desktopViewport === "passed" ? "passed" : "blocked";
  const narrowViewport = evidence.narrowViewport === "passed" ? "passed" : "blocked";
  const evidenceRefs = Array.isArray(evidence.evidenceRefs) ? evidence.evidenceRefs.map(String) : [];
  for (const reference of evidenceRefs) validateEvidenceRef(reference, errors);
  if (desktopViewport !== "passed" || narrowViewport !== "passed" || evidenceRefs.length === 0) {
    errors.push(issue("executable-closeout.interaction-evidence", "Desktop and narrow interaction evidence must be passed with public-safe refs."));
  }
  return {
    desktopViewport,
    narrowViewport,
    affectedPanels: Array.isArray(evidence.affectedPanels) ? evidence.affectedPanels.map(String) : [],
    evidenceRefs,
    status: desktopViewport === "passed" && narrowViewport === "passed" && evidenceRefs.length > 0 ? "passed" : "blocked"
  };
}

function reviewPublicSafety(safety = {}, errors) {
  if (safety.publicBoundaryScan !== "passed" || safety.noSecretScan !== "passed" || safety.privateMarkersAbsent !== true || safety.evidenceRefsPathNeutral !== true) {
    errors.push(issue("executable-closeout.public-safety", "Executable closeout public-safety checks must pass."));
  }
  return {
    publicBoundaryScan: safety.publicBoundaryScan === "passed" ? "passed" : "blocked",
    noSecretScan: safety.noSecretScan === "passed" ? "passed" : "blocked",
    privateMarkersAbsent: safety.privateMarkersAbsent === true,
    evidenceRefsPathNeutral: safety.evidenceRefsPathNeutral === true,
    status:
      safety.publicBoundaryScan === "passed" && safety.noSecretScan === "passed" && safety.privateMarkersAbsent === true && safety.evidenceRefsPathNeutral === true
        ? "passed"
        : "blocked"
  };
}

function reviewClaimSync(claimSync = {}, roadmapSync = {}, errors) {
  const output = {
    sourceFirstDocs: String(claimSync.sourceFirstDocs ?? ""),
    runnerCloseoutDocs: String(claimSync.runnerCloseoutDocs ?? ""),
    releaseClaimDocs: String(claimSync.releaseClaimDocs ?? ""),
    publicVocabulary: String(claimSync.publicVocabulary ?? ""),
    traceabilityMapping: String(roadmapSync.traceabilityMapping ?? ""),
    statusIndex: String(roadmapSync.statusIndex ?? ""),
    closeoutEvidence: String(roadmapSync.closeoutEvidence ?? "")
  };
  if (
    output.sourceFirstDocs !== "synced" ||
    output.runnerCloseoutDocs !== "synced" ||
    output.releaseClaimDocs !== "blocked" ||
    output.publicVocabulary !== "source-first supported-local-only" ||
    output.traceabilityMapping !== "recorded" ||
    output.statusIndex !== "synced" ||
    output.closeoutEvidence !== "recorded"
  ) {
    errors.push(issue("executable-closeout.claim-sync", "Closeout claim and status synchronization must be recorded."));
  }
  output.status = errors.some((error) => error.code === "executable-closeout.claim-sync") ? "blocked" : "synced";
  return output;
}

function reviewNoGoClaims(noGoClaims = {}, errors) {
  const output = {};
  for (const key of noGoClaimKeys) {
    const value = String(noGoClaims[key] ?? "");
    if (value !== "blocked") {
      errors.push(issue("executable-closeout.no-go", `${key} must remain blocked.`));
    }
    output[key] = value === "blocked" ? "blocked" : "unsafe";
  }
  output.allBlocked = noGoClaimKeys.every((key) => output[key] === "blocked");
  return output;
}

function reviewForbiddenRuntimeClaims(claims = {}, errors) {
  const output = {};
  for (const key of forbiddenRuntimeClaimKeys) {
    const value = claims[key] === true;
    if (value) {
      errors.push(issue("executable-closeout.forbidden-runtime", `${key} must remain false.`));
    }
    output[key] = value;
  }
  output.allFalse = forbiddenRuntimeClaimKeys.every((key) => output[key] === false);
  return output;
}

function reviewSourceScope(scope = {}, errors) {
  const output = {
    sourceUse: String(scope.sourceUse ?? ""),
    runtimeScope: String(scope.runtimeScope ?? ""),
    distributionScope: String(scope.distributionScope ?? ""),
    webLayerStartsRuntime: scope.webLayerStartsRuntime === true
  };
  if (output.sourceUse !== "source-checkout" || output.runtimeScope !== "supported-local-only" || output.distributionScope !== "source-first" || output.webLayerStartsRuntime) {
    errors.push(issue("executable-closeout.source-scope", "Executable closeout must remain source-first supported-local-only."));
  }
  return output;
}

function validateEvidenceRef(reference, errors) {
  const text = String(reference ?? "");
  if (!pathNeutralReferencePattern.test(text) || text.includes("..") || unsafeTextPattern.test(text)) {
    errors.push(issue("executable-closeout.evidence-ref", "Executable closeout evidence references must be path-neutral and public-safe."));
  }
}

function assertNoUnsafeText(value, errors) {
  if (value == null) return;
  if (typeof value === "string") {
    if (unsafeTextPattern.test(value)) {
      errors.push(issue("executable-closeout.unsafe-text", "Executable closeout contains unsafe public text."));
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

function blockedReview(errors) {
  return freeze({
    schemaVersion: "agentique.executableCapabilityCloseoutPackReview.v1",
    ok: false,
    status: "blocked",
    sourceScope: {},
    capabilities: { accepted: 0, required: requiredCapabilityOrder.length, items: [] },
    validationEvidence: { status: "blocked" },
    interactionEvidence: { status: "blocked" },
    publicSafety: { status: "blocked" },
    claimSync: { status: "blocked" },
    noGoClaims: { allBlocked: false },
    forbiddenRuntimeClaims: { allFalse: false },
    summary: {
      capabilityRows: 0,
      acceptedCapabilities: 0,
      validationEvidence: "blocked",
      releaseRuntimeClaimsBlocked: false,
      publicSafety: "blocked",
      desktopNarrowEvidence: "blocked"
    },
    errors: serializeErrors(errors)
  });
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(redactText(message)));
  error.code = code;
  return error;
}

function serializeErrors(errors) {
  return errors.map((error) => {
    const codedError = /** @type {Error & {code?: string}} */ (error);
    return { code: codedError.code, message: redactText(codedError.message) };
  });
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
