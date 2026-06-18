import { reviewNativeRunnerArtifactReadback } from "./native-runner-artifact-readback.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const artifactReceiptBindingSchemaVersion = "agentique.artifactReceiptBinding.v1";

const supportedScenarios = new Set(["success", "failure", "canceled", "cleanup-required", "risky-family", "stale-cleaned", "matrix"]);
const unsafeArtifactPattern =
  /(?<![A-Za-z])[A-Za-z]:[\\/]|(^|[\\/])\.\.([\\/]|$)|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9_-]{16,}|cookie=|vault:[a-z]|processId|pid\b|browserProfile|localPath/iu;
const safeArtifactPathPattern = /^artifacts\/[A-Za-z0-9._/-]+$/u;
const fixedNow = "2026-06-16T12:30:00.000Z";

export function createArtifactReceiptBinding({ scenario = "success", overrideReceipt = {} } = {}) {
  const normalizedScenario = supportedScenarios.has(scenario) ? scenario : "success";
  const run = runForScenario(normalizedScenario);
  const nativeReview = reviewNativeRunnerArtifactReadback();
  const receipt = buildReceipt({
    run,
    nativeReview,
    scenario: normalizedScenario,
    overrideReceipt
  });
  const binding = {
    schemaVersion: artifactReceiptBindingSchemaVersion,
    scenario: normalizedScenario,
    generatedAt: fixedNow,
    nativeReadback: {
      schemaVersion: nativeReview.schemaVersion,
      nativeBacked: nativeReview.readback.nativeBacked,
      descriptorOnly: nativeReview.readback.descriptorOnly,
      artifactsCommandReadsFolder: nativeReview.readback.artifactsCommandReadsFolder,
      cleanupReceipt: nativeReview.readback.cleanupReceipt,
      viewerMetadata: nativeReview.readback.viewerMetadata
    },
    run: {
      runId: run.runId,
      state: run.state,
      resourceId: run.resourceId,
      reproducibilityDigest: run.reproducibilityDigest,
      failureStatus: run.failure.status
    },
    receipts: [receipt],
    viewerPolicy: viewerPolicyTable(),
    logs: run.logs.map((log) => ({
      name: log.name,
      redacted: true,
      text: redactArtifactText(log.text),
      maxBytes: 262144
    })),
    boundary: boundary()
  };

  return freezeBinding(binding);
}

export function createArtifactReceiptViewerSurface({ scenario = "success" } = {}) {
  const binding = createArtifactReceiptBinding({ scenario });

  return freeze({
    schemaVersion: "agentique.artifactReceiptViewerSurface.v1",
    scenario: binding.scenario,
    controls: [
      { scenario: "success", label: "Success artifact" },
      { scenario: "failure", label: "Failure artifact" },
      { scenario: "canceled", label: "Canceled artifact" },
      { scenario: "cleanup-required", label: "Cleanup required" },
      { scenario: "risky-family", label: "Risky viewer" },
      { scenario: "matrix", label: "State matrix" }
    ],
    binding,
    stateMatrix: createStateMatrix(),
    summary: {
      receipts: binding.receipts.length,
      safePreviewReceipts: binding.receipts.filter((receipt) => receipt.preview.renderable).length,
      riskyReceipts: binding.receipts.filter((receipt) => receipt.viewer.activeContent).length,
      cleanupRequired: binding.receipts.filter((receipt) => receipt.cleanup.cleanupRequired).length,
      nativeBacked: binding.nativeReadback.nativeBacked
    },
    boundary: binding.boundary
  });
}

export function reviewArtifactReceiptBindingGate() {
  const success = createArtifactReceiptBinding({ scenario: "success" });
  const risky = createArtifactReceiptBinding({ scenario: "risky-family" });
  const cleanupRequired = createArtifactReceiptBinding({ scenario: "cleanup-required" });
  const surface = createArtifactReceiptViewerSurface({ scenario: "matrix" });
  const unsafeReceiptsRejected = rejectsUnsafeReceipts();
  const successReceipt = success.receipts[0];
  const riskyReceipt = risky.receipts[0];
  const checks = {
    runIdentityBound: successReceipt.runId === "run-history-success" && successReceipt.artifactId === "artifact-result-json" && success.nativeReadback.nativeBacked === true,
    digestSizeMimeRetention:
      /^[a-f0-9]{64}$/u.test(successReceipt.digest) &&
      successReceipt.sizeBytes === 128 &&
      successReceipt.mimeType === "application/json" &&
      successReceipt.retention.policy === "retain-until-cleanup",
    safePreviewPolicy:
      successReceipt.viewer.family === "json" &&
      successReceipt.viewer.previewMode === "safe-inline" &&
      successReceipt.viewer.activeContent === false &&
      successReceipt.preview.renderable === true &&
      successReceipt.preview.redacted === true,
    riskyFamiliesRestricted: riskyReceipt.viewer.family === "html" && riskyReceipt.viewer.previewMode === "sandbox-required" && riskyReceipt.preview.renderable === false,
    cleanupAwareStates:
      cleanupRequired.receipts[0].cleanup.cleanupRequired === true &&
      surface.stateMatrix.some((entry) => entry.runState === "failed") &&
      surface.stateMatrix.some((entry) => entry.runState === "canceled" && entry.previewMode === "metadata-only") &&
      surface.stateMatrix.some((entry) => entry.runState === "cleanup-required" && entry.cleanupRequired === true),
    unsafeReceiptsRejected,
    noCapabilityWidening: [success, risky, cleanupRequired].every(
      (binding) =>
        binding.boundary.noGenericFilesystemBrowser === true &&
        binding.boundary.noRawArtifactBytes === true &&
        binding.boundary.noScriptExecution === true &&
        binding.boundary.noBrowserDataAccess === true &&
        binding.boundary.noAmbientEnvironmentForwarding === true &&
        !unsafeArtifactPattern.test(JSON.stringify(binding))
    )
  };
  const ok = Object.values(checks).every(Boolean);

  return freeze({
    schemaVersion: "agentique.artifactReceiptBindingReview.v1",
    ok,
    checks,
    summary: {
      receipts: success.receipts.length,
      viewerFamilies: success.viewerPolicy.length,
      stateMatrixRows: surface.stateMatrix.length,
      nativeBacked: success.nativeReadback.nativeBacked
    },
    errors: ok ? [] : [issue("artifact-receipt-binding.review", "Artifact receipt binding review failed.")]
  });
}

function buildReceipt({ run, nativeReview, scenario, overrideReceipt }) {
  if (unsafeArtifactPattern.test(JSON.stringify(overrideReceipt ?? {}))) {
    throw issue("artifact-receipt.unsafe", "Artifact receipt contains unsafe artifact receipt material.");
  }
  const artifact = run.artifacts[0] ?? {};
  const output = run.outputs[0] ?? {};
  const viewerFamily = String(overrideReceipt.viewerFamily ?? (scenario === "risky-family" ? "html" : (artifact.viewer ?? "metadata")));
  const mimeType = String(overrideReceipt.mimeType ?? mimeTypeForViewer(viewerFamily, output.mediaType));
  const artifactPath = String(overrideReceipt.artifactPath ?? (scenario === "risky-family" ? "artifacts/report.html" : (artifact.path ?? "artifacts/metadata.json")));
  const viewer = viewerPolicyFor(viewerFamily, run.state);
  const previewText = String(overrideReceipt.previewText ?? previewTextFor(run, viewerFamily));
  const receipt = {
    schemaVersion: "agentique.artifactReceipt.v1",
    receiptId: `artifact-receipt-${run.runId}-${safePathPart(viewerFamily)}`,
    runId: run.runId,
    runState: run.state,
    artifactId: String(overrideReceipt.artifactId ?? artifact.id ?? `artifact-${safePathPart(run.runId)}`),
    artifactPath,
    outputRef: String(overrideReceipt.outputRef ?? output.path ?? "outputs/result.json"),
    digest: String(overrideReceipt.digest ?? artifact.digest ?? run.reproducibilityDigest),
    sizeBytes: Number(overrideReceipt.sizeBytes ?? output.bytes ?? 0),
    mimeType,
    viewer,
    retention: retentionFor(run),
    cleanup: cleanupFor(run),
    preview: previewFor(viewer, previewText),
    nativeBinding: {
      readbackSchemaVersion: nativeReview.schemaVersion,
      nativeBacked: nativeReview.readback.nativeBacked,
      descriptorOnly: nativeReview.readback.descriptorOnly,
      artifactsCommandReadsFolder: nativeReview.readback.artifactsCommandReadsFolder,
      viewerMetadata: nativeReview.readback.viewerMetadata,
      cleanupReceipt: nativeReview.readback.cleanupReceipt
    },
    redacted: true
  };

  validateReceipt(receipt);
  return receipt;
}

function validateReceipt(receipt) {
  if (!safeArtifactPathPattern.test(receipt.artifactPath) || receipt.artifactPath.includes("..")) {
    throw issue("artifact-receipt.safe-path", "Artifact receipts require a safe relative artifact path.");
  }
  if (!/^[a-f0-9]{64}$/u.test(String(receipt.digest))) {
    throw issue("artifact-receipt.digest", "Artifact receipts require a stable digest.");
  }
  if (!Number.isFinite(receipt.sizeBytes) || receipt.sizeBytes < 0 || receipt.sizeBytes > 10485760) {
    throw issue("artifact-receipt.size", "Artifact receipts require a bounded byte size.");
  }
  if (unsafeArtifactPattern.test(JSON.stringify(receipt))) {
    throw issue("artifact-receipt.unsafe", "Artifact receipt contains unsafe artifact receipt material.");
  }
}

function createStateMatrix() {
  return ["success", "failure", "canceled", "cleanup-required"].map((scenario) => {
    const binding = createArtifactReceiptBinding({ scenario });
    const receipt = binding.receipts[0];
    return {
      scenario,
      runId: receipt.runId,
      runState: receipt.runState,
      artifactId: receipt.artifactId,
      previewMode: receipt.viewer.previewMode,
      cleanupState: receipt.cleanup.state,
      cleanupRequired: receipt.cleanup.cleanupRequired,
      stale: receipt.cleanup.stale
    };
  });
}

function viewerPolicyTable() {
  return [
    { family: "json", mimeTypes: ["application/json"], previewMode: "safe-inline", approved: true, activeContent: false },
    { family: "text", mimeTypes: ["text/plain"], previewMode: "safe-inline", approved: true, activeContent: false },
    { family: "csv", mimeTypes: ["text/csv"], previewMode: "safe-inline", approved: true, activeContent: false },
    { family: "markdown", mimeTypes: ["text/markdown"], previewMode: "escaped-static", approved: true, activeContent: false },
    { family: "html", mimeTypes: ["text/html"], previewMode: "sandbox-required", approved: false, activeContent: true },
    { family: "pdf", mimeTypes: ["application/pdf"], previewMode: "metadata-only", approved: false, activeContent: false },
    { family: "media", mimeTypes: ["image/*", "video/*", "audio/*"], previewMode: "metadata-only", approved: false, activeContent: false }
  ];
}

function viewerPolicyFor(family, runState) {
  const policy = viewerPolicyTable().find((entry) => entry.family === family) ?? {
    family: "metadata",
    mimeTypes: ["application/octet-stream"],
    previewMode: "metadata-only",
    approved: false,
    activeContent: false
  };
  if (runState !== "succeeded" && policy.previewMode === "safe-inline") {
    return {
      ...policy,
      previewMode: "metadata-only",
      approved: false
    };
  }
  return policy;
}

function previewFor(viewer, text) {
  const renderable = viewer.approved === true && viewer.activeContent === false && ["safe-inline", "escaped-static"].includes(viewer.previewMode);
  return {
    mode: viewer.previewMode,
    renderable,
    redacted: true,
    reason: renderable ? "approved-low-risk-family" : viewer.previewMode,
    text: renderable ? redactArtifactText(text).slice(0, 240) : "metadata-only"
  };
}

function retentionFor(run) {
  const cleaned = run.cleanup.status === "cleaned" && run.state === "cleaned";
  return {
    policy: "retain-until-cleanup",
    maxDays: 7,
    state: cleaned ? "released" : "retained",
    cleanupReceiptRequired: true
  };
}

function cleanupFor(run) {
  const cleanupRequired = run.state === "cleanup-required" || run.state === "recovered";
  return {
    state: run.cleanup.status,
    cleanupRequired,
    stale: cleanupRequired || run.cleanup.status === "pending",
    receiptPath: run.cleanup.receiptPath,
    idempotent: run.cleanup.idempotent === true
  };
}

function runForScenario(scenario) {
  if (scenario === "failure") {
    return runSample({
      runId: "run-history-failed",
      state: "failed",
      failureStatus: "failed",
      cleanupStatus: "pending",
      removed: ["runs/run-history-failed/logs"]
    });
  }
  if (scenario === "canceled") {
    return runSample({
      runId: "run-history-canceled",
      state: "canceled",
      failureStatus: "canceled",
      cleanupStatus: "cleaned",
      removed: ["runs/run-history-canceled/logs", "runs/run-history-canceled/outputs"]
    });
  }
  if (scenario === "cleanup-required") {
    return runSample({
      runId: "run-history-cleanup",
      state: "cleanup-required",
      failureStatus: "none",
      cleanupStatus: "pending",
      removed: ["runs/run-history-cleanup/logs", "runs/run-history-cleanup/artifacts"]
    });
  }
  if (scenario === "stale-cleaned") {
    return runSample({
      runId: "run-history-cleaned",
      state: "cleaned",
      failureStatus: "none",
      cleanupStatus: "cleaned",
      removed: []
    });
  }
  return runSample({
    runId: "run-history-success",
    state: "succeeded",
    failureStatus: "none",
    cleanupStatus: "pending",
    removed: ["runs/run-history-success/logs", "runs/run-history-success/outputs", "runs/run-history-success/artifacts"]
  });
}

function runSample({ runId, state, failureStatus, cleanupStatus, removed }) {
  return {
    runId,
    state,
    resourceId: "resource.history",
    reproducibilityDigest: "7".repeat(64),
    failure: {
      status: failureStatus,
      code: failureStatus === "none" ? null : `artifact.${failureStatus}`
    },
    logs: [
      {
        name: "stdout.log",
        redacted: true,
        text: "Started with redacted:vault-reference reference only."
      }
    ],
    outputs: [
      {
        path: "outputs/result.json",
        mediaType: "application/json",
        bytes: 128,
        digest: "a".repeat(64)
      }
    ],
    artifacts: [
      {
        id: "artifact-result-json",
        path: "artifacts/result.json",
        viewer: "json",
        redacted: true,
        digest: "b".repeat(64)
      }
    ],
    cleanup: {
      status: cleanupStatus,
      receiptPath: `runs/${runId}/cleanup-receipt.json`,
      idempotent: true,
      removed
    }
  };
}

function mimeTypeForViewer(family, fallback) {
  if (family === "html") return "text/html";
  if (family === "markdown") return "text/markdown";
  if (family === "csv") return "text/csv";
  if (family === "text") return "text/plain";
  if (family === "pdf") return "application/pdf";
  return String(fallback ?? "application/json");
}

function previewTextFor(run, viewerFamily) {
  if (viewerFamily === "json") {
    return JSON.stringify({
      runId: run.runId,
      state: run.state,
      artifactCount: run.artifacts.length
    });
  }
  if (viewerFamily === "html") {
    return "HTML preview requires a sandbox and is not rendered inline.";
  }
  return `${run.runId} ${run.state} artifact metadata`;
}

function rejectsUnsafeReceipts() {
  try {
    createArtifactReceiptBinding({
      scenario: "success",
      overrideReceipt: { artifactPath: "../outside/raw.html" }
    });
    return false;
  } catch {
    // expected
  }
  try {
    createArtifactReceiptBinding({
      scenario: "success",
      overrideReceipt: { previewText: "bearer abcdefghijklmnop cookie=secret" }
    });
    return false;
  } catch {
    return true;
  }
}

function boundary() {
  return {
    sourceFirstOnly: true,
    nativeReadbackRequired: true,
    noGenericFilesystemBrowser: true,
    noRawArtifactBytes: true,
    noScriptExecution: true,
    noShellPlugin: true,
    noPackageLifecycleExecution: true,
    noBrowserDataAccess: true,
    noAmbientEnvironmentForwarding: true,
    noSignedInstallerDependency: true,
    noPackagedRuntimeDependency: true
  };
}

function freezeBinding(binding) {
  assertNoInlineSecrets(binding);
  if (unsafeArtifactPattern.test(JSON.stringify(binding))) {
    throw issue("artifact-receipt.unsafe", "Artifact binding contains unsafe artifact receipt material.");
  }
  return freeze(binding);
}

function redactArtifactText(value) {
  return redactText(String(value ?? ""))
    .replace(/vault:[a-z][a-zA-Z0-9._-]{2,80}/gu, "redacted:vault-reference")
    .replace(unsafeArtifactPattern, "redacted:sensitive-artifact-material");
}

function safePathPart(value) {
  return (
    String(value ?? "artifact")
      .replace(/[^A-Za-z0-9_-]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "artifact"
  );
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(redactText(message)));
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
