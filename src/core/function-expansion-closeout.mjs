import { reviewDiagnosticsSupportBundleGate } from "./diagnostics-support-bundle.mjs";
import { reviewExecutableCapabilityCloseoutGate } from "./executable-capability-closeout-pack.mjs";
import { redactText } from "./secret-vault.mjs";

export const functionExpansionCloseoutSchemaVersion = "agentique.functionExpansionCloseout.v1";

const generatedAt = "2026-06-18T00:00:00.000Z";
const requiredFeatureOrder = Object.freeze([
  "function-expansion-roadmap-filing",
  "release-packaging-preflight",
  "first-run-bootstrap-diagnostics",
  "local-library-update-lifecycle",
  "permission-center-policy-diff",
  "run-dashboard-queue-monitor",
  "logs-artifact-workbench",
  "workflow-template-run-plan-builder",
  "human-approval-resume-rerun",
  "adapter-registry-trust-policy",
  "python-node-adapter-pack-expansion",
  "repo-local-task-runner-lane",
  "external-agent-client-pack-expansion",
  "mcp-bridge-readiness",
  "wasm-wasi-sandbox-gate",
  "rootless-container-preflight",
  "browser-automation-consent-gate",
  "local-vault-secrets-redaction",
  "diagnostics-support-bundle"
]);
const requiredPortabilityOrder = Object.freeze([
  "portable-profile-taxonomy",
  "generated-adapter-drift-status",
  "repo-local-task-lane-profile",
  "external-client-pack-portability",
  "support-bundle-profile-diagnostics"
]);
const requiredGraphBlockOrder = Object.freeze([
  "graph-block-ir-readback",
  "schema-driven-block-forms",
  "run-ledger-queue-events",
  "artifact-lifecycle",
  "credential-reference-boundary",
  "library-import-export-lifecycle",
  "diagnostics-observability"
]);
const requiredValidationEvidence = Object.freeze([
  "agentiqueUiFullValidation",
  "coreFullGate",
  "publicBoundaryScan",
  "noSecretScan",
  "noOverclaimScan",
  "desktopNarrowInteractionEvidence",
  "statusDocsSynced",
  "publicSafeCommitReview",
  "coreContractHandoffReview"
]);
const noGoClaimKeys = Object.freeze([
  "signedDesktopApp",
  "signedInstaller",
  "updater",
  "productionDesktopRuntime",
  "hostedRuntime",
  "universalRuntime",
  "genericShell",
  "arbitraryWorkflowExecution",
  "browserDataAccess",
  "ambientEnvironmentAccess",
  "packageLifecycleExecution",
  "automaticPluginInstall",
  "lifecycleHookTrust",
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
    "sk-[A-Za-z0-9_-]{16,}",
    "ghp_[A-Za-z0-9_]{16,}",
    "github_pat_[A-Za-z0-9_]{16,}",
    "cookie\\s*=",
    "storageState\\s*[:(]",
    "process\\.env",
    "signed\\s+url",
    "token\\s+exchange"
  ].join("|"),
  "iu"
);

export function createFunctionExpansionCloseoutReview({
  featureOverrides = {},
  portabilityOverrides = {},
  graphBlockOverrides = {},
  validationOverrides = {},
  publicSafetyOverrides = {},
  interactionOverrides = {},
  claimSyncOverrides = {},
  noGoOverrides = {}
} = {}) {
  const errors = [];
  const diagnosticsGate = reviewDiagnosticsSupportBundleGate();
  const executableGate = reviewExecutableCapabilityCloseoutGate();
  const descriptor = {
    schemaVersion: functionExpansionCloseoutSchemaVersion,
    generatedAt,
    status: "accepted-local-only",
    sourceScope: {
      sourceUse: "source-checkout",
      runtimeScope: "supported-local-only",
      distributionScope: "source-first",
      webLayerStartsRuntime: false,
      reviewOnly: true
    },
    featureFamilies: featureRows().map((feature) => ({
      ...feature,
      ...(featureOverrides[feature.id] ?? {})
    })),
    portabilityMapping: portabilityRows().map((requirement) => ({
      ...requirement,
      ...(portabilityOverrides[requirement.id] ?? {})
    })),
    graphBlockHandoff: graphBlockRows().map((requirement) => ({
      ...requirement,
      ...(graphBlockOverrides[requirement.id] ?? {})
    })),
    validationEvidence: {
      agentiqueUiFullValidation: "passed",
      coreFullGate: "passed",
      publicBoundaryScan: "passed",
      noSecretScan: "passed",
      noOverclaimScan: "passed",
      desktopNarrowInteractionEvidence: "passed",
      statusDocsSynced: "passed",
      publicSafeCommitReview: "passed",
      coreContractHandoffReview: "passed",
      ...validationOverrides
    },
    interactionEvidence: {
      desktopViewport: "passed",
      narrowViewport: "passed",
      affectedPanels: ["Run workspace"],
      evidenceRefs: ["docs/validation/function-expansion-closeout.md", "docs/validation/runner-ui-execution-evidence.md"],
      ...interactionOverrides
    },
    publicSafety: {
      publicBoundaryScan: "passed",
      noSecretScan: "passed",
      noOverclaimScan: "passed",
      privateMarkersAbsent: true,
      evidenceRefsPathNeutral: true,
      ...publicSafetyOverrides
    },
    dependentGates: {
      diagnosticsSupportBundle: diagnosticsGate.ok ? "passed" : "blocked",
      executableCapabilityCloseout: executableGate.ok ? "passed" : "blocked"
    },
    claimSync: {
      featureEvidenceMapped: "synced",
      portabilityRequirementsMapped: "synced",
      graphBlockRequirementsMapped: "synced",
      publicVocabulary: "source-first supported-local-only",
      noGoClaimsReviewed: "synced",
      statusIndex: "synced",
      privatePlanningRefsInPublicFiles: false,
      ...claimSyncOverrides
    },
    noGoClaims: {
      ...Object.fromEntries(noGoClaimKeys.map((key) => [key, "blocked"])),
      ...noGoOverrides
    }
  };

  const review = reviewFunctionExpansionCloseoutDescriptor(descriptor, errors);
  return freeze(review);
}

export function reviewFunctionExpansionCloseoutDescriptor(descriptor, inheritedErrors = []) {
  const errors = [...inheritedErrors];
  if (!descriptor || typeof descriptor !== "object") {
    return blockedReview([issue("function-closeout.invalid", "Function expansion closeout descriptor must be an object.")]);
  }

  assertNoUnsafeText(descriptor, errors);
  if (descriptor.schemaVersion !== functionExpansionCloseoutSchemaVersion) {
    errors.push(issue("function-closeout.schema", "Function expansion closeout schema is unsupported."));
  }

  const sourceScope = reviewSourceScope(descriptor.sourceScope, errors);
  const featureFamilies = reviewFeatureFamilies(descriptor.featureFamilies, errors);
  const portabilityMapping = reviewPortabilityMapping(descriptor.portabilityMapping, errors);
  const graphBlockHandoff = reviewGraphBlockHandoff(descriptor.graphBlockHandoff, errors);
  const validationEvidence = reviewValidationEvidence(descriptor.validationEvidence, errors);
  const interactionEvidence = reviewInteractionEvidence(descriptor.interactionEvidence, errors);
  const publicSafety = reviewPublicSafety(descriptor.publicSafety, errors);
  const dependentGates = reviewDependentGates(descriptor.dependentGates, errors);
  const claimSync = reviewClaimSync(descriptor.claimSync, errors);
  const noGoClaims = reviewNoGoClaims(descriptor.noGoClaims, errors);
  const ok = errors.length === 0;

  return freeze({
    schemaVersion: "agentique.functionExpansionCloseoutReview.v1",
    ok,
    status: ok ? "accepted" : "blocked",
    sourceScope,
    featureFamilies,
    portabilityMapping,
    graphBlockHandoff,
    validationEvidence,
    interactionEvidence,
    publicSafety,
    dependentGates,
    claimSync,
    noGoClaims,
    summary: {
      featureFamilies: featureFamilies.items.length,
      acceptedFeatureFamilies: featureFamilies.accepted,
      portabilityRows: portabilityMapping.items.length,
      graphBlockRows: graphBlockHandoff.items.length,
      validationEvidence: validationEvidence.status,
      publicSafety: publicSafety.status,
      desktopNarrowEvidence: interactionEvidence.status,
      noGoClaimsBlocked: noGoClaims.allBlocked,
      releaseRuntimeClaimsBlocked: noGoClaims.allBlocked && sourceScope.webLayerStartsRuntime === false
    },
    errors: serializeErrors(errors)
  });
}

export function reviewFunctionExpansionCloseoutGate() {
  const accepted = createFunctionExpansionCloseoutReview();
  const missingFeature = createFunctionExpansionCloseoutReview({
    featureOverrides: {
      "diagnostics-support-bundle": { status: "missing" }
    }
  });
  const missingPortability = createFunctionExpansionCloseoutReview({
    portabilityOverrides: {
      "generated-adapter-drift-status": { status: "missing" }
    }
  });
  const missingGraphBlock = createFunctionExpansionCloseoutReview({
    graphBlockOverrides: {
      "run-ledger-queue-events": { status: "missing" }
    }
  });
  const missingValidation = createFunctionExpansionCloseoutReview({
    validationOverrides: {
      agentiqueUiFullValidation: "missing",
      desktopNarrowInteractionEvidence: "missing"
    }
  });
  const overclaim = createFunctionExpansionCloseoutReview({
    noGoOverrides: {
      signedInstaller: "ready",
      updater: "ready",
      productionDesktopRuntime: "ready",
      genericShell: "ready",
      packageLifecycleExecution: "ready",
      containerStart: "ready",
      imagePull: "ready",
      externalProviderAutomation: "ready"
    },
    claimSyncOverrides: {
      noGoClaimsReviewed: "stale"
    }
  });
  const unsafeReference = createFunctionExpansionCloseoutReview({
    featureOverrides: {
      "function-expansion-roadmap-filing": {
        label: ["private item ", "R", "9999"].join(""),
        evidenceRefs: [["C", ":\\private\\closeout.log"].join("")]
      }
    }
  });

  return freeze({
    schemaVersion: "agentique.functionExpansionCloseoutGate.v1",
    ok: accepted.ok && !missingFeature.ok && !missingPortability.ok && !missingGraphBlock.ok && !missingValidation.ok && !overclaim.ok && !unsafeReference.ok,
    acceptedStatus: accepted.status,
    missingFeatureBlocked: missingFeature.errors.some((error) => error.code === "function-closeout.feature-status"),
    missingPortabilityBlocked: missingPortability.errors.some((error) => error.code === "function-closeout.portability-status"),
    missingGraphBlockBlocked: missingGraphBlock.errors.some((error) => error.code === "function-closeout.graph-status"),
    validationEvidenceBlocked: missingValidation.errors.some((error) => error.code === "function-closeout.validation-evidence"),
    overclaimBlocked: overclaim.errors.some((error) => error.code === "function-closeout.no-go"),
    unsafeReferenceBlocked:
      unsafeReference.errors.some((error) => error.code === "function-closeout.evidence-ref") &&
      unsafeReference.errors.some((error) => error.code === "function-closeout.unsafe-text"),
    summary: accepted.summary
  });
}

export function assertFunctionExpansionCloseoutSafe(options = {}) {
  const review = createFunctionExpansionCloseoutReview(options);
  if (!review.ok) {
    const first = review.errors[0] ?? { code: "function-closeout.failed", message: "Function expansion closeout review failed." };
    throw issue(first.code, first.message);
  }
  return true;
}

function featureRows() {
  return [
    feature("function-expansion-roadmap-filing", "Function expansion roadmap filing", ["docs/validation/function-expansion-closeout.md"]),
    feature("release-packaging-preflight", "Release packaging preflight", ["docs/validation/distribution-readiness.md"]),
    feature("first-run-bootstrap-diagnostics", "First-run bootstrap diagnostics", ["docs/contracts/runtime-prerequisite-readiness.md"]),
    feature("local-library-update-lifecycle", "Local library update lifecycle", ["docs/contracts/resource-bundle.md"]),
    feature("permission-center-policy-diff", "Permission center and policy diff", ["docs/contracts/permission-grants.md"]),
    feature("run-dashboard-queue-monitor", "Run dashboard and queue monitor", ["docs/contracts/workflow-scheduler.md"]),
    feature("logs-artifact-workbench", "Logs and artifact workbench", ["docs/contracts/artifact-receipt-binding.md"]),
    feature("workflow-template-run-plan-builder", "Workflow template and run-plan builder", ["docs/contracts/workflow-scheduler.md"]),
    feature("human-approval-resume-rerun", "Human approval resume and rerun", ["docs/contracts/runner-revocation-cancel-controls.md"]),
    feature("adapter-registry-trust-policy", "Adapter registry trust policy", ["docs/contracts/companion-capability-boundary.md"]),
    feature("python-node-adapter-pack-expansion", "Python and Node adapter pack expansion", ["docs/contracts/python-adapter-runner.md", "docs/contracts/node-adapter-runner.md"]),
    feature("repo-local-task-runner-lane", "Repo-local task runner lane", ["docs/contracts/local-run-state-machine.md"]),
    feature("external-agent-client-pack-expansion", "External agent-client pack expansion", ["docs/contracts/companion-capability-boundary.md"]),
    feature("mcp-bridge-readiness", "MCP bridge readiness descriptor", ["docs/validation/function-expansion-closeout.md"]),
    feature("wasm-wasi-sandbox-gate", "WASM/WASI sandbox prototype gate", ["docs/contracts/wasm-wasi-sandbox-gate.md"]),
    feature("rootless-container-preflight", "Rootless container preflight", ["docs/contracts/rootless-container-preflight-gate.md"]),
    feature("browser-automation-consent-gate", "Browser automation strict consent gate", ["docs/contracts/browser-automation-consent-gate.md"]),
    feature("local-vault-secrets-redaction", "Local vault secrets and redaction evidence", ["docs/contracts/local-vault-secrets-ux.md"]),
    feature("diagnostics-support-bundle", "Diagnostics support bundle", ["docs/contracts/diagnostics-support-bundle.md"])
  ];
}

function feature(id, label, evidenceRefs) {
  return {
    id,
    label,
    status: "accepted",
    evidenceRefs,
    localOnly: true,
    reviewOnly: true,
    widensAuthority: false,
    releaseClaimAllowed: false
  };
}

function portabilityRows() {
  return [
    portability("portable-profile-taxonomy", "Adapter registry profile and mode taxonomy", "adapter-registry-trust-policy", ["docs/contracts/companion-capability-boundary.md"]),
    portability("generated-adapter-drift-status", "Generated adapter drift summary", "adapter-registry-trust-policy", ["docs/contracts/diagnostics-support-bundle.md"]),
    portability("repo-local-task-lane-profile", "Repo-local task lane profile boundary", "repo-local-task-runner-lane", ["docs/contracts/local-run-state-machine.md"]),
    portability("external-client-pack-portability", "External client pack portability", "external-agent-client-pack-expansion", [
      "docs/contracts/companion-capability-boundary.md"
    ]),
    portability("support-bundle-profile-diagnostics", "Profile and drift diagnostics summary", "diagnostics-support-bundle", ["docs/contracts/diagnostics-support-bundle.md"])
  ];
}

function portability(id, label, mappedFeatureId, evidenceRefs) {
  return {
    id,
    label,
    mappedFeatureId,
    status: "mapped",
    evidenceRefs,
    scriptExecution: false,
    automaticInstall: false,
    lifecycleHooksTrusted: false,
    generatedCodeCopied: false
  };
}

function graphBlockRows() {
  return [
    graphBlock("graph-block-ir-readback", "Graph and block IR readback", "graph-block-ir-contracts", "Graph workspace", ["docs/validation/function-expansion-closeout.md"]),
    graphBlock("schema-driven-block-forms", "Schema-driven block forms and redaction", "typed-block-manifest-contracts", "Graph workspace", [
      "docs/validation/function-expansion-closeout.md"
    ]),
    graphBlock("run-ledger-queue-events", "Run ledger queue and event states", "execution-ledger-event-contracts", "Run workspace", ["docs/contracts/workflow-scheduler.md"]),
    graphBlock("artifact-lifecycle", "Workspace and artifact lifecycle", "workspace-artifact-contracts", "Run workspace", ["docs/contracts/artifact-receipt-binding.md"]),
    graphBlock("credential-reference-boundary", "Credential OAuth and webhook trust boundary", "credential-webhook-trust-contracts", "Settings workspace", [
      "docs/contracts/local-vault-secrets-ux.md"
    ]),
    graphBlock("library-import-export-lifecycle", "Library import export lifecycle", "bundle-library-lifecycle-contracts", "Library and Import workspaces", [
      "docs/contracts/resource-bundle.md"
    ]),
    graphBlock("diagnostics-observability", "Diagnostics and observability summaries", "observability-diagnostics-contracts", "Run workspace", [
      "docs/contracts/diagnostics-support-bundle.md"
    ])
  ];
}

function graphBlock(id, label, coreContractAlias, uiSurface, evidenceRefs) {
  return {
    id,
    label,
    coreContractAlias,
    uiSurface,
    status: "mapped",
    evidenceRefs,
    typedIrOnly: true,
    referenceOnlyCredentials: true,
    runtimeAuthority: false,
    rawExecutableFieldsStored: false
  };
}

function reviewFeatureFamilies(input, errors) {
  const items = Array.isArray(input) ? input.map(normalizeFeature) : [];
  const ids = items.map((item) => item.id);
  if (ids.length !== requiredFeatureOrder.length || !requiredFeatureOrder.every((id, index) => ids[index] === id)) {
    errors.push(issue("function-closeout.feature-order", "Function expansion closeout must include every accepted feature family in order."));
  }
  let accepted = 0;
  for (const item of items) {
    if (item.status !== "accepted") {
      errors.push(issue("function-closeout.feature-status", `${item.id} must be accepted.`));
    } else {
      accepted += 1;
    }
    if (!item.localOnly || !item.reviewOnly || item.widensAuthority || item.releaseClaimAllowed) {
      errors.push(issue("function-closeout.feature-boundary", `${item.id} must stay local-only, review-only, and no-release-claim.`));
    }
    requireRefs(item.id, item.evidenceRefs, errors);
  }
  return { accepted, required: requiredFeatureOrder.length, items };
}

function normalizeFeature(item = {}) {
  return {
    id: String(item.id ?? ""),
    label: String(item.label ?? ""),
    status: String(item.status ?? ""),
    evidenceRefs: Array.isArray(item.evidenceRefs) ? item.evidenceRefs.map(String) : [],
    localOnly: item.localOnly === true,
    reviewOnly: item.reviewOnly === true,
    widensAuthority: item.widensAuthority === true,
    releaseClaimAllowed: item.releaseClaimAllowed === true
  };
}

function reviewPortabilityMapping(input, errors) {
  const items = Array.isArray(input) ? input.map(normalizePortability) : [];
  const ids = items.map((item) => item.id);
  if (ids.length !== requiredPortabilityOrder.length || !requiredPortabilityOrder.every((id, index) => ids[index] === id)) {
    errors.push(issue("function-closeout.portability-order", "Function expansion closeout must include every portability, drift, and profile mapping row."));
  }
  let mapped = 0;
  for (const item of items) {
    if (item.status !== "mapped") {
      errors.push(issue("function-closeout.portability-status", `${item.id} must be mapped.`));
    } else {
      mapped += 1;
    }
    if (item.scriptExecution || item.automaticInstall || item.lifecycleHooksTrusted || item.generatedCodeCopied) {
      errors.push(issue("function-closeout.portability-boundary", `${item.id} must not execute scripts, trust lifecycle hooks, install automatically, or copy generated code.`));
    }
    if (!requiredFeatureOrder.includes(item.mappedFeatureId)) {
      errors.push(issue("function-closeout.portability-feature", `${item.id} maps to an unknown feature family.`));
    }
    requireRefs(item.id, item.evidenceRefs, errors);
  }
  return { mapped, required: requiredPortabilityOrder.length, items };
}

function normalizePortability(item = {}) {
  return {
    id: String(item.id ?? ""),
    label: String(item.label ?? ""),
    mappedFeatureId: String(item.mappedFeatureId ?? ""),
    status: String(item.status ?? ""),
    evidenceRefs: Array.isArray(item.evidenceRefs) ? item.evidenceRefs.map(String) : [],
    scriptExecution: item.scriptExecution === true,
    automaticInstall: item.automaticInstall === true,
    lifecycleHooksTrusted: item.lifecycleHooksTrusted === true,
    generatedCodeCopied: item.generatedCodeCopied === true
  };
}

function reviewGraphBlockHandoff(input, errors) {
  const items = Array.isArray(input) ? input.map(normalizeGraphBlock) : [];
  const ids = items.map((item) => item.id);
  if (ids.length !== requiredGraphBlockOrder.length || !requiredGraphBlockOrder.every((id, index) => ids[index] === id)) {
    errors.push(issue("function-closeout.graph-order", "Function expansion closeout must include every graph, block, run, workspace, credential, and diagnostics handoff row."));
  }
  let mapped = 0;
  for (const item of items) {
    if (item.status !== "mapped") {
      errors.push(issue("function-closeout.graph-status", `${item.id} must be mapped.`));
    } else {
      mapped += 1;
    }
    if (!item.typedIrOnly || !item.referenceOnlyCredentials || item.runtimeAuthority || item.rawExecutableFieldsStored) {
      errors.push(issue("function-closeout.graph-boundary", `${item.id} must stay typed-IR-only, reference-only, and no-runtime-authority.`));
    }
    requireRefs(item.id, item.evidenceRefs, errors);
  }
  return { mapped, required: requiredGraphBlockOrder.length, items };
}

function normalizeGraphBlock(item = {}) {
  return {
    id: String(item.id ?? ""),
    label: String(item.label ?? ""),
    coreContractAlias: String(item.coreContractAlias ?? ""),
    uiSurface: String(item.uiSurface ?? ""),
    status: String(item.status ?? ""),
    evidenceRefs: Array.isArray(item.evidenceRefs) ? item.evidenceRefs.map(String) : [],
    typedIrOnly: item.typedIrOnly === true,
    referenceOnlyCredentials: item.referenceOnlyCredentials === true,
    runtimeAuthority: item.runtimeAuthority === true,
    rawExecutableFieldsStored: item.rawExecutableFieldsStored === true
  };
}

function reviewValidationEvidence(evidence = {}, errors) {
  const output = {};
  for (const key of requiredValidationEvidence) {
    const status = String(evidence[key] ?? "");
    if (status !== "passed") {
      errors.push(issue("function-closeout.validation-evidence", `${key} validation evidence must be passed.`));
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
    errors.push(issue("function-closeout.interaction-evidence", "Desktop and narrow interaction evidence must be passed with public-safe refs."));
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
  if (
    safety.publicBoundaryScan !== "passed" ||
    safety.noSecretScan !== "passed" ||
    safety.noOverclaimScan !== "passed" ||
    safety.privateMarkersAbsent !== true ||
    safety.evidenceRefsPathNeutral !== true
  ) {
    errors.push(issue("function-closeout.public-safety", "Function expansion closeout public-safety checks must pass."));
  }
  return {
    publicBoundaryScan: safety.publicBoundaryScan === "passed" ? "passed" : "blocked",
    noSecretScan: safety.noSecretScan === "passed" ? "passed" : "blocked",
    noOverclaimScan: safety.noOverclaimScan === "passed" ? "passed" : "blocked",
    privateMarkersAbsent: safety.privateMarkersAbsent === true,
    evidenceRefsPathNeutral: safety.evidenceRefsPathNeutral === true,
    status:
      safety.publicBoundaryScan === "passed" &&
      safety.noSecretScan === "passed" &&
      safety.noOverclaimScan === "passed" &&
      safety.privateMarkersAbsent === true &&
      safety.evidenceRefsPathNeutral === true
        ? "passed"
        : "blocked"
  };
}

function reviewDependentGates(gates = {}, errors) {
  const output = {
    diagnosticsSupportBundle: gates.diagnosticsSupportBundle === "passed" ? "passed" : "blocked",
    executableCapabilityCloseout: gates.executableCapabilityCloseout === "passed" ? "passed" : "blocked"
  };
  if (output.diagnosticsSupportBundle !== "passed" || output.executableCapabilityCloseout !== "passed") {
    errors.push(issue("function-closeout.dependent-gate", "Prior diagnostics and executable closeout gates must pass before function-expansion closeout."));
  }
  output.status = output.diagnosticsSupportBundle === "passed" && output.executableCapabilityCloseout === "passed" ? "passed" : "blocked";
  return output;
}

function reviewClaimSync(claimSync = {}, errors) {
  const output = {
    featureEvidenceMapped: String(claimSync.featureEvidenceMapped ?? ""),
    portabilityRequirementsMapped: String(claimSync.portabilityRequirementsMapped ?? ""),
    graphBlockRequirementsMapped: String(claimSync.graphBlockRequirementsMapped ?? ""),
    publicVocabulary: String(claimSync.publicVocabulary ?? ""),
    noGoClaimsReviewed: String(claimSync.noGoClaimsReviewed ?? ""),
    statusIndex: String(claimSync.statusIndex ?? ""),
    privatePlanningRefsInPublicFiles: claimSync.privatePlanningRefsInPublicFiles === true
  };
  if (
    output.featureEvidenceMapped !== "synced" ||
    output.portabilityRequirementsMapped !== "synced" ||
    output.graphBlockRequirementsMapped !== "synced" ||
    output.publicVocabulary !== "source-first supported-local-only" ||
    output.noGoClaimsReviewed !== "synced" ||
    output.statusIndex !== "synced" ||
    output.privatePlanningRefsInPublicFiles
  ) {
    errors.push(issue("function-closeout.claim-sync", "Function expansion claim and status synchronization must be recorded without private planning references."));
  }
  output.status = errors.some((error) => error.code === "function-closeout.claim-sync") ? "blocked" : "synced";
  return output;
}

function reviewNoGoClaims(noGoClaims = {}, errors) {
  const output = {};
  for (const key of noGoClaimKeys) {
    const value = String(noGoClaims[key] ?? "");
    if (value !== "blocked") {
      errors.push(issue("function-closeout.no-go", `${key} must remain blocked.`));
    }
    output[key] = value === "blocked" ? "blocked" : "unsafe";
  }
  output.allBlocked = noGoClaimKeys.every((key) => output[key] === "blocked");
  return output;
}

function reviewSourceScope(scope = {}, errors) {
  const output = {
    sourceUse: String(scope.sourceUse ?? ""),
    runtimeScope: String(scope.runtimeScope ?? ""),
    distributionScope: String(scope.distributionScope ?? ""),
    webLayerStartsRuntime: scope.webLayerStartsRuntime === true,
    reviewOnly: scope.reviewOnly === true
  };
  if (
    output.sourceUse !== "source-checkout" ||
    output.runtimeScope !== "supported-local-only" ||
    output.distributionScope !== "source-first" ||
    output.webLayerStartsRuntime ||
    !output.reviewOnly
  ) {
    errors.push(issue("function-closeout.source-scope", "Function expansion closeout must remain source-first, supported-local-only, and review-only."));
  }
  return output;
}

function requireRefs(id, evidenceRefs, errors) {
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
    errors.push(issue("function-closeout.evidence-ref", `${id} must include public-safe evidence refs.`));
    return;
  }
  for (const reference of evidenceRefs) validateEvidenceRef(reference, errors);
}

function validateEvidenceRef(reference, errors) {
  const text = String(reference ?? "");
  if (!pathNeutralReferencePattern.test(text) || text.includes("..") || unsafeTextPattern.test(text)) {
    errors.push(issue("function-closeout.evidence-ref", "Function expansion closeout evidence references must be path-neutral and public-safe."));
  }
}

function assertNoUnsafeText(value, errors) {
  if (value == null) return;
  if (typeof value === "string") {
    if (unsafeTextPattern.test(value)) {
      errors.push(issue("function-closeout.unsafe-text", "Function expansion closeout contains unsafe public text."));
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
    schemaVersion: "agentique.functionExpansionCloseoutReview.v1",
    ok: false,
    status: "blocked",
    sourceScope: {},
    featureFamilies: { accepted: 0, required: requiredFeatureOrder.length, items: [] },
    portabilityMapping: { mapped: 0, required: requiredPortabilityOrder.length, items: [] },
    graphBlockHandoff: { mapped: 0, required: requiredGraphBlockOrder.length, items: [] },
    validationEvidence: { status: "blocked" },
    interactionEvidence: { status: "blocked" },
    publicSafety: { status: "blocked" },
    dependentGates: { status: "blocked" },
    claimSync: { status: "blocked" },
    noGoClaims: { allBlocked: false },
    summary: {
      featureFamilies: 0,
      acceptedFeatureFamilies: 0,
      portabilityRows: 0,
      graphBlockRows: 0,
      validationEvidence: "blocked",
      publicSafety: "blocked",
      desktopNarrowEvidence: "blocked",
      noGoClaimsBlocked: false,
      releaseRuntimeClaimsBlocked: false
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
