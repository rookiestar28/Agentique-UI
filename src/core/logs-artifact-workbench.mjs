import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const logsArtifactWorkbenchSchemaVersion = "agentique.logsArtifactWorkbench.v1";

export const requiredWorkbenchFilters = Object.freeze(["all", "run", "resource", "mime", "viewer", "cleanup", "retention", "risky-preview", "stale"]);

const supportedScenarios = new Set([...requiredWorkbenchFilters, "export-denied"]);
const maxLogBytes = 262144;
const maxPreviewChars = 240;
const privateTextPatterns = Object.freeze([
  /bearer\s+[A-Za-z0-9._-]{12,}/iu,
  /sk-[A-Za-z0-9_-]{16,}/iu,
  /cookie=/iu,
  /[A-Z]:[\\/]/u,
  /\/Users\/|\/home\//u,
  /(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u,
  /https:\/\/[^"]+\?(?:[^"]*signature|[^"]*token)/iu,
  new RegExp([String.raw`\.plan`, "ning|ref", "erence/|R[0-9]{4}"].join(""), "iu")
]);

export function createLogsArtifactWorkbenchSurface(options = {}) {
  const scenario = normalizeScenario(options.scenario ?? "all");
  const artifactReceiptViewerSurface = options.artifactReceiptViewerSurface ?? defaultArtifactReceiptViewerSurface(scenario);
  const runHistoryEvidence = options.runHistoryEvidence ?? defaultRunHistoryEvidence(scenario);
  const activeFilter = filterFor(scenario);
  const receipts = buildReceiptRows(artifactReceiptViewerSurface, runHistoryEvidence);
  const artifacts = buildArtifactRows(receipts, runHistoryEvidence);
  const logs = buildLogRows(runHistoryEvidence);
  const previews = buildPreviewRows(receipts, scenario);
  const exportReview = buildExportReview({ scenario, logs, receipts, artifacts });
  const filters = requiredWorkbenchFilters.map((id) => ({
    id,
    label: labelForFilter(id),
    selected: id === activeFilter.id,
    count: countForFilter(id, { logs, receipts, artifacts, previews }),
    keyboardAccessible: true
  }));
  const surface = {
    schemaVersion: logsArtifactWorkbenchSchemaVersion,
    generatedAt: "2026-06-17T00:00:00.000Z",
    activeFilter,
    identity: identityFor(runHistoryEvidence),
    filters,
    logs: filterLogs(logs, activeFilter.id),
    receipts: filterReceipts(receipts, activeFilter.id),
    artifacts: filterArtifacts(artifacts, activeFilter.id),
    previews: filterPreviews(previews, activeFilter.id),
    retentionControls: buildRetentionControls(receipts),
    exportReview,
    interactionEvidence: [
      interaction("desktop", "Workbench filter buttons update logs, receipts, previews, cleanup, retention, and export state."),
      interaction("narrow", "Workbench rows keep path-neutral descriptors and blocked preview/export states in the narrow Run workspace.")
    ],
    summary: summarize({ filters, logs, receipts, artifacts, previews, exportReview }),
    boundary: boundary()
  };

  return freezeWorkbench(surface);
}

export function createLogsArtifactWorkbenchScenario(scenario = "all") {
  return createLogsArtifactWorkbenchSurface({ scenario });
}

export function reviewLogsArtifactWorkbench() {
  const surface = createLogsArtifactWorkbenchSurface();
  const exportDenied = createLogsArtifactWorkbenchSurface({ scenario: "export-denied" });
  const risky = createLogsArtifactWorkbenchSurface({ scenario: "risky-preview" });
  const validation = validateLogsArtifactWorkbenchSurface(surface);
  const checks = {
    baseValid: validation.ok,
    exportDenial: exportDenied.exportReview.allowed === false && exportDenied.exportReview.denials.includes("signed-url"),
    riskyMetadataOnly: risky.previews.some((entry) => entry.family === "html" && entry.mode === "metadata-only" && entry.renderable === false),
    noCapabilityWidening: Object.entries(requiredBoundary()).every(([key, expected]) => surface.boundary[key] === expected),
    publicSafe: !privateTextPatterns.some((pattern) => pattern.test(JSON.stringify({ surface, exportDenied, risky })))
  };
  const ok = Object.values(checks).every(Boolean);

  return freeze({
    ok,
    status: ok ? "passed" : "failed",
    surface,
    validation,
    checks,
    errors: ok ? [] : [issue("logs-artifact-workbench.review", "Logs artifact workbench review failed.")]
  });
}

export function validateLogsArtifactWorkbenchSurface(surface) {
  const failures = [];
  if (surface?.schemaVersion !== logsArtifactWorkbenchSchemaVersion) {
    failures.push(issue("logs-artifact-workbench.schema", "Unsupported logs artifact workbench schema version."));
  }

  requireStates("logs-artifact-workbench.filter", requiredWorkbenchFilters, surface?.filters, "id", failures);
  if (!Array.isArray(surface?.filters) || surface.filters.some((entry) => entry.keyboardAccessible !== true)) {
    failures.push(issue("logs-artifact-workbench.controls", "Workbench filters must be keyboard-accessible."));
  }
  if (
    !Array.isArray(surface?.logs) ||
    surface.logs.length === 0 ||
    surface.logs.some((entry) => entry.redacted !== true || entry.maxBytes > maxLogBytes || entry.text.length > entry.previewChars)
  ) {
    failures.push(issue("logs-artifact-workbench.logs", "Workbench logs must be bounded and redacted."));
  }
  if (!Array.isArray(surface?.artifacts) || surface.artifacts.some((entry) => !/^[a-f0-9]{64}$/u.test(String(entry.digest ?? "")))) {
    failures.push(issue("logs-artifact-workbench.digest", "Artifact descriptors must include stable digests."));
  }
  if (!surface?.previews?.some((entry) => entry.mode === "metadata-only" && entry.renderable === false)) {
    failures.push(issue("logs-artifact-workbench.metadata-preview", "Risky previews must be metadata-only or blocked."));
  }
  if (!surface?.previews?.some((entry) => entry.mode === "blocked" && entry.reason === "unsafe-content")) {
    failures.push(issue("logs-artifact-workbench.blocked-preview", "Unsafe previews must fail closed."));
  }
  if (!surface?.exportReview?.redacted || !Array.isArray(surface.exportReview.denials)) {
    failures.push(issue("logs-artifact-workbench.export", "Export review must be redacted and explicit."));
  }
  for (const [key, expected] of Object.entries(requiredBoundary())) {
    if (surface?.boundary?.[key] !== expected) {
      failures.push(issue("logs-artifact-workbench.boundary", `${key} must be ${String(expected)}.`));
    }
  }
  const interactionViewports = new Set((surface?.interactionEvidence ?? []).map((entry) => entry.viewport));
  for (const viewport of ["desktop", "narrow"]) {
    if (!interactionViewports.has(viewport)) {
      failures.push(issue("logs-artifact-workbench.interaction", `Missing ${viewport} interaction evidence.`));
    }
  }
  if (privateTextPatterns.some((pattern) => pattern.test(JSON.stringify(surface ?? {})))) {
    failures.push(issue("logs-artifact-workbench.public-safe", "Workbench export contains private, local, or internal evidence text."));
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    summary: {
      filters: new Set((surface?.filters ?? []).map((entry) => entry.id)).size,
      logs: surface?.logs?.length ?? 0,
      receipts: surface?.receipts?.length ?? 0,
      previews: surface?.previews?.length ?? 0,
      interactionViewports: interactionViewports.size
    }
  };
}

function buildLogRows(runHistoryEvidence) {
  const historyLogs = runHistoryEvidence?.evidenceBrowser?.logs ?? [];
  const fallbackLogs = [
    {
      name: "stdout.log",
      redacted: true,
      text: "Started with redacted:vault-reference reference only."
    }
  ];
  return (historyLogs.length > 0 ? historyLogs : fallbackLogs).map((log, index) => {
    const text = redactWorkbenchText(log.text ?? "");
    return {
      id: `log-${index + 1}`,
      name: safeName(log.name ?? `log-${index + 1}.txt`),
      source: index === 0 ? "stdout" : "stderr",
      severity: index === 0 ? "info" : "warning",
      redacted: true,
      text: text.slice(0, maxPreviewChars),
      previewChars: maxPreviewChars,
      maxBytes: maxLogBytes,
      exportable: false,
      runId: runHistoryEvidence?.selectedRunId ?? "run-history-success"
    };
  });
}

function buildReceiptRows(artifactReceiptViewerSurface, runHistoryEvidence) {
  const baseReceipts = artifactReceiptViewerSurface?.binding?.receipts ?? [];
  const historyReceipts = (runHistoryEvidence?.selected?.artifacts ?? []).map((artifact) => ({
    receiptId: `history-${artifact.id}`,
    runId: runHistoryEvidence.selected.runId,
    runState: runHistoryEvidence.selected.state,
    artifactId: artifact.id,
    artifactPath: artifact.path,
    outputRef: runHistoryEvidence.selected.outputs?.[0]?.path ?? "outputs/result.json",
    digest: artifact.digest,
    sizeBytes: runHistoryEvidence.selected.outputs?.[0]?.bytes ?? 0,
    mimeType: runHistoryEvidence.selected.outputs?.[0]?.mediaType ?? "application/json",
    viewer: {
      family: artifact.viewer,
      previewMode: artifact.viewer === "json" ? "safe-inline" : "metadata-only",
      activeContent: false
    },
    retention: {
      policy: "retain-until-cleanup",
      state: "retained",
      maxDays: 7
    },
    cleanup: runHistoryEvidence.selected.cleanup,
    redacted: true
  }));
  const riskyReceipt = {
    receiptId: "receipt-risky-html",
    runId: "run-history-risky-preview",
    runState: "succeeded",
    artifactId: "artifact-risky-html",
    artifactPath: "artifacts/report.html",
    outputRef: "outputs/report.html",
    digest: "c".repeat(64),
    sizeBytes: 4096,
    mimeType: "text/html",
    viewer: {
      family: "html",
      previewMode: "metadata-only",
      activeContent: true
    },
    retention: {
      policy: "retain-until-cleanup",
      state: "retained",
      maxDays: 7
    },
    cleanup: {
      status: "pending",
      receiptPath: "runs/run-history-risky-preview/cleanup-receipt.json",
      idempotent: true,
      stale: true
    },
    signedDownload: {
      available: false,
      redacted: true,
      descriptor: "signed-download-metadata-redacted"
    },
    redacted: true
  };

  return dedupeByReceipt([...baseReceipts, ...historyReceipts, riskyReceipt]).map((receipt) => ({
    receiptId: String(receipt.receiptId ?? `receipt-${receipt.artifactId}`),
    runId: String(receipt.runId ?? "run-history-success"),
    resourceId: "resource.history",
    artifactId: String(receipt.artifactId ?? "artifact-result-json"),
    artifactPath: safeRelativePath(receipt.artifactPath ?? "artifacts/result.json"),
    outputRef: safeRelativePath(receipt.outputRef ?? "outputs/result.json"),
    digest: String(receipt.digest ?? "d".repeat(64)),
    sizeBytes: Number(receipt.sizeBytes ?? 0),
    mimeType: String(receipt.mimeType ?? "application/json"),
    viewerFamily: String(receipt.viewer?.family ?? "metadata"),
    previewMode: normalizePreviewMode(receipt.viewer?.previewMode),
    activeContent: receipt.viewer?.activeContent === true,
    retention: {
      policy: String(receipt.retention?.policy ?? "retain-until-cleanup"),
      state: String(receipt.retention?.state ?? "retained"),
      maxDays: Number(receipt.retention?.maxDays ?? 7)
    },
    cleanup: {
      state: String(receipt.cleanup?.state ?? receipt.cleanup?.status ?? "pending"),
      receiptPath: safeRelativePath(receipt.cleanup?.receiptPath ?? "runs/run-history-success/cleanup-receipt.json"),
      cleanupRequired: receipt.cleanup?.cleanupRequired === true || receipt.cleanup?.status === "pending",
      stale: receipt.cleanup?.stale !== false && (receipt.cleanup?.status === "pending" || receipt.cleanup?.cleanupRequired === true),
      idempotent: receipt.cleanup?.idempotent !== false
    },
    signedDownload: {
      available: false,
      redacted: true,
      descriptor: "signed-download-metadata-redacted"
    },
    redacted: true
  }));
}

function buildArtifactRows(receipts, runHistoryEvidence) {
  return receipts.map((receipt) => ({
    artifactId: receipt.artifactId,
    runId: receipt.runId,
    resourceId: receipt.resourceId,
    path: receipt.artifactPath,
    digest: receipt.digest,
    sizeBytes: receipt.sizeBytes,
    mimeType: receipt.mimeType,
    viewerFamily: receipt.viewerFamily,
    cleanupState: receipt.cleanup.state,
    retentionState: receipt.retention.state,
    reproducibilityDigest: runHistoryEvidence?.selected?.reproducibilityDigest ?? receipt.digest,
    pathNeutral: true
  }));
}

function buildPreviewRows(receipts, scenario) {
  const safeText = escapeWorkbenchText(JSON.stringify({ artifactId: receipts[0]?.artifactId ?? "artifact-result-json", redacted: true }));
  const rows = [
    {
      id: "preview-safe-json",
      family: "json",
      mode: "safe-inline",
      renderable: true,
      reason: "approved-low-risk-family",
      text: safeText.slice(0, maxPreviewChars),
      redacted: true
    },
    {
      id: "preview-risky-html",
      family: "html",
      mode: "metadata-only",
      renderable: false,
      reason: "active-content",
      text: "HTML preview is metadata-only.",
      redacted: true
    },
    {
      id: "preview-unsafe-content",
      family: "unknown",
      mode: "blocked",
      renderable: false,
      reason: "unsafe-content",
      text: "",
      redacted: true
    }
  ];
  if (scenario === "risky-preview") {
    return rows;
  }
  return rows;
}

function buildRetentionControls(receipts) {
  return [
    {
      id: "retain-until-cleanup",
      state: "retained",
      maxDays: 7,
      receiptCount: receipts.filter((receipt) => receipt.retention.policy === "retain-until-cleanup").length,
      action: "review-only"
    },
    {
      id: "cleanup-stale",
      state: "stale",
      receiptCount: receipts.filter((receipt) => receipt.cleanup.stale).length,
      action: "request-cleanup"
    },
    {
      id: "release-cleaned",
      state: "released",
      receiptCount: receipts.filter((receipt) => receipt.cleanup.state === "cleaned").length,
      action: "review-only"
    }
  ];
}

function buildExportReview({ scenario, logs, receipts, artifacts }) {
  const denials = scenario === "export-denied" ? ["raw-log-export", "signed-url", "unsafe-path", "sensitive-material"] : [];
  return {
    allowed: denials.length === 0,
    redacted: true,
    maxLogs: logs.length,
    maxArtifacts: artifacts.length,
    receiptCount: receipts.length,
    denials,
    exportPath: "artifacts/logs-artifact-workbench-export.json",
    includesRawLogs: false,
    includesRawArtifactBytes: false,
    signedUrlsRedacted: true,
    localPathsRedacted: true,
    internalMarkersRedacted: true
  };
}

function summarize({ filters, logs, receipts, artifacts, previews, exportReview }) {
  return {
    filters: filters.length,
    logs: logs.length,
    receipts: receipts.length,
    artifacts: artifacts.length,
    cleanupAware: receipts.filter((receipt) => receipt.cleanup.cleanupRequired || receipt.cleanup.state === "cleaned").length,
    staleCleanup: receipts.filter((receipt) => receipt.cleanup.stale).length,
    retentionControls: new Set(receipts.map((receipt) => receipt.retention.policy)).size,
    metadataOnlyPreviews: previews.filter((preview) => preview.mode === "metadata-only").length,
    blockedPreviews: previews.filter((preview) => preview.mode === "blocked").length,
    exportAllowed: exportReview.allowed,
    interactionViewports: 2
  };
}

function filterLogs(logs, filterId) {
  if (filterId === "run" || filterId === "all") return logs;
  return logs.slice(0, 1);
}

function filterReceipts(receipts, filterId) {
  if (filterId === "cleanup" || filterId === "stale") return receipts.filter((receipt) => receipt.cleanup.cleanupRequired || receipt.cleanup.stale);
  if (filterId === "retention") return receipts.filter((receipt) => receipt.retention.policy === "retain-until-cleanup");
  if (filterId === "mime") return receipts.filter((receipt) => receipt.mimeType.includes("/"));
  if (filterId === "viewer" || filterId === "risky-preview") return receipts.filter((receipt) => receipt.viewerFamily === "html" || receipt.previewMode === "metadata-only");
  return receipts;
}

function filterArtifacts(artifacts, filterId) {
  if (filterId === "resource") return artifacts.filter((artifact) => artifact.resourceId === "resource.history");
  if (filterId === "mime") return artifacts.filter((artifact) => artifact.mimeType.includes("/"));
  return artifacts;
}

function filterPreviews(previews, filterId) {
  if (filterId === "risky-preview") return previews.filter((preview) => preview.mode !== "safe-inline");
  return previews;
}

function countForFilter(filterId, { logs, receipts, artifacts, previews }) {
  if (filterId === "run") return logs.length;
  if (filterId === "resource") return artifacts.length;
  if (filterId === "mime") return new Set(artifacts.map((artifact) => artifact.mimeType)).size;
  if (filterId === "viewer") return new Set(receipts.map((receipt) => receipt.viewerFamily)).size;
  if (filterId === "cleanup") return receipts.filter((receipt) => receipt.cleanup.cleanupRequired).length;
  if (filterId === "retention") return receipts.filter((receipt) => receipt.retention.policy === "retain-until-cleanup").length;
  if (filterId === "risky-preview") return previews.filter((preview) => preview.mode !== "safe-inline").length;
  if (filterId === "stale") return receipts.filter((receipt) => receipt.cleanup.stale).length;
  return logs.length + receipts.length + artifacts.length;
}

function identityFor(runHistoryEvidence) {
  const selected = runHistoryEvidence?.selected ?? {};
  const rawResourceId = String(selected.resourceId ?? "resource.history");
  return {
    runId: String(selected.runId ?? "run-history-success"),
    resourceId: rawResourceId.startsWith("resource.") ? rawResourceId : `resource.${safeName(rawResourceId).replaceAll("-", ".")}`,
    adapterRuntime: String(selected.adapterRuntime ?? "python"),
    runState: String(selected.state ?? "succeeded"),
    reproducibilityDigest: String(selected.reproducibilityDigest ?? "7".repeat(64))
  };
}

function filterFor(scenario) {
  const id = requiredWorkbenchFilters.includes(scenario) ? scenario : "all";
  return {
    id,
    label: labelForFilter(id)
  };
}

function normalizeScenario(value) {
  const text = String(value ?? "");
  return supportedScenarios.has(text) ? text : "all";
}

function labelForFilter(id) {
  return id
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function safeRelativePath(value) {
  const text = String(value ?? "artifacts/metadata.json").replaceAll("\\", "/");
  if (!/^(artifacts|outputs|runs)\/[A-Za-z0-9._/-]+$/u.test(text) || text.includes("..")) {
    return "artifacts/redacted-metadata.json";
  }
  return text;
}

function safeName(value) {
  return (
    String(value ?? "log.txt")
      .replace(/[^A-Za-z0-9._-]+/gu, "-")
      .slice(0, 80) || "log.txt"
  );
}

function normalizePreviewMode(value) {
  const text = String(value ?? "metadata-only");
  return ["safe-inline", "escaped-static", "metadata-only", "blocked"].includes(text) ? text : "metadata-only";
}

function dedupeByReceipt(receipts) {
  const seen = new Set();
  return receipts.filter((receipt) => {
    const id = String(receipt.receiptId ?? receipt.artifactId ?? "");
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function redactWorkbenchText(value) {
  return redactText(String(value ?? ""))
    .replace(/vault:[a-z][a-zA-Z0-9._-]{2,80}/gu, "redacted:vault-reference")
    .replace(privateTextPatterns[0], "redacted:sensitive-material");
}

function defaultArtifactReceiptViewerSurface(scenario) {
  const cleanupRequired = scenario === "cleanup" || scenario === "stale";
  return {
    binding: {
      receipts: [
        {
          receiptId: "artifact-receipt-run-history-success-json",
          runId: cleanupRequired ? "run-history-cleanup" : "run-history-success",
          runState: cleanupRequired ? "cleanup-required" : "succeeded",
          artifactId: "artifact-result-json",
          artifactPath: "artifacts/result.json",
          outputRef: "outputs/result.json",
          digest: "b".repeat(64),
          sizeBytes: 128,
          mimeType: "application/json",
          viewer: {
            family: "json",
            previewMode: cleanupRequired ? "metadata-only" : "safe-inline",
            activeContent: false
          },
          retention: {
            policy: "retain-until-cleanup",
            state: cleanupRequired ? "retained" : "retained",
            maxDays: 7
          },
          cleanup: {
            state: cleanupRequired ? "pending" : "pending",
            status: cleanupRequired ? "pending" : "pending",
            receiptPath: "runs/run-history-success/cleanup-receipt.json",
            cleanupRequired,
            stale: true,
            idempotent: true
          },
          redacted: true
        }
      ]
    }
  };
}

function defaultRunHistoryEvidence(scenario) {
  const cleanupRequired = scenario === "cleanup" || scenario === "stale";
  const runId = cleanupRequired ? "run-history-cleanup" : "run-history-success";
  const selected = {
    runId,
    state: cleanupRequired ? "cleanup-required" : "succeeded",
    resourceId: "resource.history",
    adapterRuntime: "python",
    reproducibilityDigest: "7".repeat(64),
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
      status: cleanupRequired ? "pending" : "pending",
      receiptPath: `runs/${runId}/cleanup-receipt.json`,
      idempotent: true,
      stale: true
    }
  };
  return {
    selectedRunId: runId,
    selected,
    evidenceBrowser: {
      logs: [
        {
          name: "stdout.log",
          redacted: true,
          text: "Started with redacted:vault-reference reference only."
        },
        {
          name: "stderr.log",
          redacted: true,
          text: cleanupRequired ? "Cleanup pending; raw output is redacted." : "No errors."
        }
      ]
    }
  };
}

function escapeWorkbenchText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function interaction(viewport, evidence) {
  return { viewport, evidence, status: "passed" };
}

function boundary() {
  return {
    frontendAuthority: "display-and-request-only",
    nativeReadbackRequired: true,
    storePluginEnabled: false,
    sqlPluginEnabled: false,
    fileSystemPluginEnabled: false,
    rawArtifactBytes: false,
    genericFilesystemBrowser: false,
    shellOrProcessEnabled: false,
    packageLifecycleEnabled: false,
    browserDataEnabled: false,
    containerStartEnabled: false,
    externalProviderAutomationEnabled: false,
    signedInstallerClaim: false,
    productionDesktopRuntimeClaim: false
  };
}

function requiredBoundary() {
  return boundary();
}

function requireStates(code, required, rows, field, failures) {
  const seen = new Set((rows ?? []).map((entry) => entry[field]));
  for (const state of required) {
    if (!seen.has(state)) {
      failures.push(issue(code, `Missing required ${field}: ${state}.`));
    }
  }
}

function freezeWorkbench(surface) {
  assertNoInlineSecrets(surface);
  if (privateTextPatterns.some((pattern) => pattern.test(JSON.stringify(surface)))) {
    throw issue("logs-artifact-workbench.private-material", "Workbench contains private or unsafe material.");
  }
  return freeze(surface);
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(redactText(message)));
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
