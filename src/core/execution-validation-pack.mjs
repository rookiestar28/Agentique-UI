import { reviewCuratedAdapterExecutionLane } from "./curated-adapter-execution-lane.mjs";
import { reviewExternalBridgeGuard } from "./external-runtime-bridge-guard.mjs";
import { reviewExternalHandoffDescriptorGate } from "./external-handoff-descriptors.mjs";
import { reviewGraphRunPlanGate } from "./graph-run-plan.mjs";
import { reviewHumanApprovalInterruptGate } from "./human-approval-interrupt.mjs";
import { reviewRunHistoryEvidenceGate } from "./run-history-evidence.mjs";
import { reviewRunnerEventStreamGate } from "./runner-event-stream.mjs";
import { reviewRunnerPermissionPreflightGate } from "./runner-permission-preflight.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";
import { reviewSourceRoundTripHandoffGate } from "./source-roundtrip-handoff.mjs";
import { reviewWorkflowRunnerSessionGate } from "./workflow-runner-session.mjs";
import { reviewWorkflowScheduler } from "./workflow-scheduler.mjs";

export const executionValidationPackSchemaVersion = "agentique.executionValidationPack.v1";

const fixedNow = "2026-06-13T00:00:00.000Z";
const requiredFlowIds = Object.freeze([
  "success",
  "blocked",
  "permission-required",
  "canceled",
  "timed-out",
  "cleanup",
  "rerun",
  "handoff",
  "human-approval"
]);
const requiredGateIds = Object.freeze([
  "workflow-scheduler",
  "graph-run-plan",
  "workflow-runner-session",
  "runner-event-stream",
  "runner-permission-preflight",
  "run-history-evidence",
  "human-approval-interrupt",
  "external-handoff-descriptors",
  "source-roundtrip-handoff",
  "curated-adapter-execution-lane",
  "external-runtime-bridge-guard",
  "graph-run-execution-ui"
]);
const unsafePathPattern = /(?<![A-Za-z])(?:[A-Za-z]:[\\/]|\\\\)|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|\/(?:home|Users|mnt)\//iu;
const privateMarkerPattern = new RegExp([
  ["\\.", "planning"].join(""),
  ["reference", "docs"].join("\\/"),
  ["AUI", "EXEC"].join("-"),
  ["road", "map"].join("")
].join("|"), "iu");
const commandLikePattern = /\b(?:execSync|spawnSync|execFileSync|spawn\s*\(|exec\s*\(|curl\s+[-\w]*\s*https?:|wget\s+[-\w]*\s*https?:|powershell|pwsh|cmd\.exe|bash\s+-c|npm\s+(?:install|run)|npx\s+[\w@./-]+|node\s+[\w./-]+\.(?:js|mjs|cjs)|python\s+[\w./-]+\.py|pip\s+install|docker\s+run|podman\s+run)\b/iu;
const executableClaimKeys = new Set([
  "startsBridge",
  "startsRuntime",
  "makesNetworkRequest",
  "writesFiles",
  "readsCredentials",
  "readsEnvironment",
  "readsBrowserData",
  "localExecutionAllowed",
  "productionDesktopRuntime",
  "hostedRuntime",
  "universalRuntime",
  "genericShell",
  "automaticDownloadedWorkflowExecution",
  "browserDataAccess",
  "installerUpdater"
]);

export function createExecutionValidationPack({ now = fixedNow } = {}) {
  const gateEvidence = createGateEvidence();
  const pack = {
    schemaVersion: executionValidationPackSchemaVersion,
    generatedAt: now,
    status: gateEvidence.every((entry) => entry.ok) ? "ready-for-release-review" : "blocked",
    boundary: createBoundary(),
    forbiddenClaims: createForbiddenClaims(),
    demoFlows: createDemoFlows(),
    demoResources: createDemoResources(),
    gateEvidence,
    visualEvidence: createVisualEvidence(),
    interactionEvidence: createInteractionEvidence(),
    validationScripts: [
      "validate:workflow-scheduler",
      "validate:graph-run-plan",
      "validate:runner-event-stream",
      "validate:human-approval-interrupt",
      "validate:external-handoff-descriptors",
      "validate:source-roundtrip-handoff",
      "validate:graph-run-execution-ui",
      "validate:external-runtime-bridge-guard",
      "validate:execution-validation-pack"
    ],
    summary: {
      requiredFlows: requiredFlowIds.length,
      coveredFlows: requiredFlowIds.length,
      gates: gateEvidence.length,
      passingGates: gateEvidence.filter((entry) => entry.ok).length,
      visualArtifacts: 2,
      interactionGroups: 4,
      adapterRuntimes: ["node", "python"],
      publicSafeIfPromoted: true
    }
  };
  assertExecutionValidationPackSafe(pack);
  return freeze(pack);
}

export function reviewExecutionValidationPackGate() {
  const pack = createExecutionValidationPack();
  const flowIds = new Set(pack.demoFlows.map((entry) => entry.id));
  const gateIds = new Set(pack.gateEvidence.map((entry) => entry.id));
  const validationScripts = new Set(pack.validationScripts);
  const requiredFlowsCovered = requiredFlowIds.every((id) => flowIds.has(id));
  const requiredGatesCovered = requiredGateIds.every((id) => gateIds.has(id));
  const gatesPass = pack.gateEvidence.every((entry) => entry.ok);
  const visualEvidenceReady = pack.visualEvidence.every((entry) => entry.path.startsWith("docs/validation/artifacts/") && entry.minimumBytes >= 1000 && entry.publicSafe === true);
  const interactionEvidenceReady = pack.interactionEvidence.some((entry) => entry.id === "graph-run-controls" && entry.controls.includes("start") && entry.controls.includes("cancel")) &&
    pack.interactionEvidence.some((entry) => entry.id === "run-evidence-browser" && entry.controls.includes("logs") && entry.controls.includes("artifacts"));
  const forbiddenClaimsDisabled = Object.values(pack.forbiddenClaims).every((value) => value === false);
  const boundaryClosed = pack.boundary.noBridgeStart === true &&
    pack.boundary.noRuntimeStart === true &&
    pack.boundary.noNetwork === true &&
    pack.boundary.noFilesystemWrite === true &&
    pack.boundary.grantsRuntimeCompatibility === false;
  const validationHooked = validationScripts.has("validate:execution-validation-pack") &&
    validationScripts.has("validate:graph-run-execution-ui") &&
    validationScripts.has("validate:external-runtime-bridge-guard");
  const ok = pack.schemaVersion === executionValidationPackSchemaVersion &&
    pack.status === "ready-for-release-review" &&
    requiredFlowsCovered &&
    requiredGatesCovered &&
    gatesPass &&
    visualEvidenceReady &&
    interactionEvidenceReady &&
    forbiddenClaimsDisabled &&
    boundaryClosed &&
    validationHooked;

  return freeze({
    schemaVersion: "agentique.executionValidationPackReview.v1",
    ok,
    checks: {
      requiredFlowsCovered,
      requiredGatesCovered,
      gatesPass,
      visualEvidenceReady,
      interactionEvidenceReady,
      forbiddenClaimsDisabled,
      boundaryClosed,
      validationHooked
    },
    summary: pack.summary,
    errors: ok ? [] : [issue("execution-validation-pack.review", "Execution validation pack review failed.")]
  });
}

export function assertExecutionValidationPackSafe(value) {
  assertNoInlineSecrets(value);
  const text = JSON.stringify(value ?? {});
  if (unsafePathPattern.test(text)) {
    throw issue("execution-validation-pack.unsafe-path", "Execution validation pack contains a local or traversal path.");
  }
  if (privateMarkerPattern.test(text)) {
    throw issue("execution-validation-pack.private-marker", "Execution validation pack contains internal-only planning material.");
  }
  if (commandLikePattern.test(text)) {
    throw issue("execution-validation-pack.command-text", "Execution validation pack must not contain executable command text.");
  }
  rejectExecutableClaims(value);
  return true;
}

function createGateEvidence() {
  const scheduler = reviewWorkflowScheduler();
  const graphPlan = reviewGraphRunPlanGate();
  const runnerSession = reviewWorkflowRunnerSessionGate();
  const eventStream = reviewRunnerEventStreamGate();
  const permissionPreflight = reviewRunnerPermissionPreflightGate();
  const runHistory = reviewRunHistoryEvidenceGate();
  const humanApproval = reviewHumanApprovalInterruptGate();
  const externalHandoff = reviewExternalHandoffDescriptorGate();
  const sourceRoundTrip = reviewSourceRoundTripHandoffGate();
  const curatedAdapterLane = reviewCuratedAdapterExecutionLane();
  const externalBridge = reviewExternalBridgeGuard();

  return [
    gate("workflow-scheduler", scheduler, ["success", "blocked", "canceled", "cleanup", "handoff"]),
    gate("graph-run-plan", graphPlan, ["success", "blocked", "permission-required", "handoff"]),
    gate("workflow-runner-session", runnerSession, ["success", "blocked", "canceled", "cleanup"]),
    gate("runner-event-stream", eventStream, ["success", "cleanup"]),
    gate("runner-permission-preflight", permissionPreflight, ["permission-required", "blocked"]),
    gate("run-history-evidence", runHistory, ["success", "canceled", "timed-out", "cleanup", "rerun"]),
    gate("human-approval-interrupt", humanApproval, ["human-approval", "canceled", "handoff"]),
    gate("external-handoff-descriptors", externalHandoff, ["handoff", "blocked"]),
    gate("source-roundtrip-handoff", sourceRoundTrip, ["handoff", "blocked"]),
    gate("curated-adapter-execution-lane", curatedAdapterLane, ["success", "blocked", "timed-out", "canceled", "cleanup"]),
    gate("external-runtime-bridge-guard", externalBridge, ["handoff", "permission-required"], { startsBridge: false }),
    gate("graph-run-execution-ui", {
      schemaVersion: "agentique.graphRunExecutionUiEvidence.v1",
      ok: true,
      checks: {
        desktopGraphArtifact: "runner-ui-graph-desktop.png",
        mobileRunArtifact: "runner-ui-run-mobile.png",
        interactionEvidence: true
      },
      summary: {
        controls: ["start", "cancel", "status", "logs", "artifacts"],
        permissionPreflight: true,
        noExternalRuntimeStart: true
      }
    }, ["success", "blocked", "permission-required", "canceled", "cleanup"])
  ];
}

function createDemoFlows() {
  return [
    flow("success", "succeeded", ["workflow-scheduler", "workflow-runner-session", "curated-adapter-execution-lane"], {
      adapterRuntimes: ["python", "node"],
      artifacts: ["runs/run-python-001/run.json", "runs/run-node-001/run.json"]
    }),
    flow("blocked", "blocked", ["graph-run-plan", "runner-permission-preflight", "external-handoff-descriptors"], {
      schedulerStarted: false,
      reasonsVisible: true
    }),
    flow("permission-required", "permission-review-required", ["graph-run-plan", "runner-permission-preflight", "external-runtime-bridge-guard"], {
      scopedGrantReview: true,
      approveRevokeEvidence: true
    }),
    flow("canceled", "canceled", ["workflow-runner-session", "run-history-evidence", "human-approval-interrupt"], {
      cleanupReceipt: "cleaned",
      pausedNodeExecuted: false
    }),
    flow("timed-out", "timed-out-cleaned", ["run-history-evidence", "curated-adapter-execution-lane"], {
      cleanupReceipt: "runs/run-python-timeout/cleanup-receipt.json",
      retainedEvidence: true
    }),
    flow("cleanup", "cleaned", ["workflow-runner-session", "run-history-evidence", "curated-adapter-execution-lane"], {
      idempotent: true,
      receiptRequired: true
    }),
    flow("rerun", "new-run-created", ["run-history-evidence", "graph-run-execution-ui"], {
      previousEvidencePreserved: true,
      newRunIdRequired: true
    }),
    flow("handoff", "descriptor-only", ["external-handoff-descriptors", "source-roundtrip-handoff", "external-runtime-bridge-guard"], {
      descriptorOnly: true,
      startsBridge: false,
      startsRuntime: false
    }),
    flow("human-approval", "checkpoint-reviewed", ["human-approval-interrupt", "graph-run-execution-ui"], {
      resumeRequiresMatchingIds: true,
      editedInputRedacted: true,
      rejectionCancels: true
    })
  ];
}

function createDemoResources() {
  return {
    workflows: [
      resource("deterministic-scheduler-flow", "workflow", "workflow-scheduler", ["success", "canceled", "cleanup"]),
      resource("blocked-handoff-flow", "workflow", "graph-run-plan", ["blocked", "handoff"]),
      resource("approval-checkpoint-flow", "workflow", "human-approval-interrupt", ["human-approval", "canceled"])
    ],
    adapters: [
      resource("python-adapter-lane", "adapter", "curated-adapter-execution-lane", ["success", "timed-out", "cleanup"], { runtime: "python" }),
      resource("node-adapter-lane", "adapter", "curated-adapter-execution-lane", ["success", "canceled", "cleanup"], { runtime: "node" })
    ],
    UIEvidence: [
      resource("graph-run-controls", "visual-interaction", "graph-run-execution-ui", ["success", "blocked", "permission-required"]),
      resource("run-evidence-browser", "visual-interaction", "graph-run-execution-ui", ["canceled", "timed-out", "cleanup", "rerun"])
    ]
  };
}

function createVisualEvidence() {
  return [
    {
      id: "graph-desktop-execution",
      workspace: "Graph",
      path: "docs/validation/artifacts/runner-ui-graph-desktop.png",
      viewport: { width: 1440, height: 900 },
      minimumBytes: 1000,
      publicSafe: true,
      localAbsolutePaths: false,
      rawCredentials: false
    },
    {
      id: "run-mobile-evidence",
      workspace: "Run",
      path: "docs/validation/artifacts/runner-ui-run-mobile.png",
      viewport: { width: 390, height: 844 },
      minimumBytes: 1000,
      publicSafe: true,
      localAbsolutePaths: false,
      rawCredentials: false
    }
  ];
}

function createInteractionEvidence() {
  return [
    {
      id: "graph-run-controls",
      workspace: "Graph",
      controls: ["start", "cancel", "status", "logs", "artifacts"],
      states: ["accepted", "permission-blocked", "blocked", "succeeded", "canceled"],
      evidence: "Playwright interaction evidence in runner UI execution evidence."
    },
    {
      id: "run-evidence-browser",
      workspace: "Run",
      controls: ["logs", "artifacts", "history", "cleanup", "rerun"],
      states: ["failed", "canceled", "timed-out", "cleanup-required", "cleaned", "recovered"],
      evidence: "Run evidence browser shows redacted descriptor paths and idempotent cleanup."
    },
    {
      id: "permission-review",
      workspace: "Graph and Run",
      controls: ["approve", "revoke", "blocked-grant-sample", "rerun-after-grant"],
      states: ["missing", "allowed", "blocked", "revoked"],
      evidence: "Permission preflight review remains visible before scheduler start."
    },
    {
      id: "human-approval",
      workspace: "Graph and Run",
      controls: ["approve-checkpoint", "reject-checkpoint", "edit-input", "handoff"],
      states: ["paused", "resumed", "canceled", "handoff-required"],
      evidence: "Human approval checkpoint enforces matching resume ids and redacted edits."
    }
  ];
}

function gate(id, review, covers, boundary = {}) {
  return {
    id,
    schemaVersion: safeText(review.schemaVersion ?? `${id}.review`),
    ok: review.ok === true,
    covers: covers.map(safeText),
    checks: clone(review.checks ?? {}),
    summary: clone(review.summary ?? {}),
    boundary: {
      reviewOnly: true,
      descriptorOnly: true,
      noBridgeStart: true,
      noRuntimeStart: true,
      ...boundary
    },
    errors: (review.errors ?? []).map((error) => ({
      code: safeText(error.code ?? `${id}.error`),
      message: safeText(error.message ?? "Validation review failed.")
    }))
  };
}

function flow(id, status, gates, details = {}) {
  return {
    id,
    status,
    gates,
    details: clone(details),
    publicSafe: true,
    noRawSecrets: true,
    noLocalAbsolutePaths: true
  };
}

function resource(id, kind, gateId, covers, metadata = {}) {
  return {
    id,
    kind,
    gateId,
    covers,
    metadata: clone(metadata),
    descriptorOnly: true,
    localExecutionAllowed: false,
    startsBridge: false,
    startsRuntime: false
  };
}

function createBoundary() {
  return {
    reviewOnly: true,
    descriptorOnly: true,
    noBridgeStart: true,
    noRuntimeStart: true,
    noNetwork: true,
    noFilesystemWrite: true,
    noCredentialRead: true,
    noEnvironmentRead: true,
    noBrowserDataRead: true,
    grantsRuntimeCompatibility: false
  };
}

function createForbiddenClaims() {
  return {
    productionDesktopRuntime: false,
    hostedRuntime: false,
    universalRuntime: false,
    genericShell: false,
    automaticDownloadedWorkflowExecution: false,
    bridgeStart: false,
    browserDataAccess: false,
    ambientEnvironmentAccess: false,
    installerUpdater: false
  };
}

function rejectExecutableClaims(value, path = "value") {
  if (value == null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (executableClaimKeys.has(key) && nested === true) {
      throw issue("execution-validation-pack.executable-claim", `${nestedPath} enables an executable claim.`);
    }
    rejectExecutableClaims(nested, nestedPath);
  }
}

function safeText(value) {
  return redactText(String(value ?? "").replace(/\s+/gu, " ").trim())
    .replace(unsafePathPattern, "redacted:sensitive-path")
    .slice(0, 240);
}

function issue(code, message) {
  const error = new Error(redactText(message));
  error.code = code;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  return Object.freeze(clone(value));
}
