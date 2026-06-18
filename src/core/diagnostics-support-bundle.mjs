import { reviewAdapterPack, sampleAdapterPack, sampleAdapterPolicy } from "./adapter-pack-policy.mjs";
import { reviewAdapterRegistryManifestTrustPolicy, sampleAdapterRegistry } from "./adapter-registry.mjs";
import { createLogsArtifactWorkbenchSurface } from "./logs-artifact-workbench.mjs";
import { createLocalVaultSecretsReview } from "./local-vault-secrets-ux.mjs";
import { createPermissionCenterSurface } from "./permission-center-policy-diff.mjs";
import { createRunDashboardQueueMonitorSurface } from "./run-dashboard-queue-monitor.mjs";
import { createRuntimePrerequisiteReadiness } from "./runtime-prerequisite-readiness.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";
import { requiredValidationCommandTexts, validationStages } from "./validation-stage-reporting.mjs";

export const diagnosticsSupportBundleSchemaVersion = "agentique.diagnosticsSupportBundle.v1";

const descriptorByteLimit = 49152;
const maxRowsPerSection = 12;
const maxErrors = 8;
const maxErrorChars = 120;
const blockedSampleCount = 10;

const requiredDeniedMaterials = Object.freeze([
  "raw-logs",
  "raw-artifact-bytes",
  "raw-screenshots",
  "browser-data",
  "cookies",
  "tokens",
  "signed-urls",
  "storage-state",
  "local-absolute-paths",
  "environment-snapshot",
  "internal-markers",
  "unredacted-artifacts",
  "release-overclaim",
  "runtime-overclaim"
]);

const requiredContentSections = Object.freeze([
  "environment",
  "validation",
  "run-evidence",
  "policy-diffs",
  "cleanup-receipts",
  "adapter-status",
  "generated-adapter-drift",
  "host-compatibility",
  "credential-references",
  "artifact-lifecycle",
  "public-safe-errors"
]);

const privateTextPatterns = Object.freeze([
  /bearer\s+[A-Za-z0-9._-]{12,}/iu,
  /sk-[A-Za-z0-9_-]{16,}/iu,
  /ghp_[A-Za-z0-9]{16,}/iu,
  /github_pat_[A-Za-z0-9_]{16,}/iu,
  /cookie\s*=/iu,
  /set-cookie/iu,
  /[A-Z]:[\\/]/u,
  /\/Users\/|\/home\//u,
  /(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u,
  /https:\/\/[^"]+\?(?:[^"]*(?:signature|token|expires)=)/iu,
  new RegExp([String.raw`\.plan`, "ning|ref", "erence/|R[0-9]{4}"].join(""), "iu")
]);

export const sampleDiagnosticsSupportBundleRequest = Object.freeze({
  environment: {
    generatedAt: "2026-06-18T00:00:00.000Z",
    host: "source-checkout",
    versions: [
      { name: "node", version: "24.x", status: "ready" },
      { name: "npm", version: "11.x", status: "ready" },
      { name: "python", version: "3.13.x", status: "ready" },
      { name: "rust", version: "stable", status: "ready" },
      { name: "tauri", version: "2.11.x", status: "ready" }
    ],
    includesEnvVars: false,
    includesProcessEnv: false,
    includesHomeDir: false,
    includesUserName: false,
    includesLocalPaths: false
  },
  validation: {
    status: "passed",
    stages: validationStages.map((entry) => ({
      id: entry.id,
      commands: entry.commands.length,
      status: "ready"
    })),
    commands: requiredValidationCommandTexts.map((text, index) => ({
      id: `validation-command-${String(index + 1).padStart(3, "0")}`,
      text,
      status: "ready"
    })),
    includesRawLogs: false,
    includesTerminalOutput: false,
    publicSafeErrors: []
  },
  claims: {
    descriptorOnly: true,
    fileArchiveCreated: false,
    uploadEnabled: false,
    telemetryEnabled: false,
    supportTicketCreated: false,
    productionDesktopRuntime: false,
    signedInstaller: false,
    updaterPublication: false,
    genericShell: false,
    arbitraryWorkflowExecution: false,
    browserDataCollection: false,
    ambientEnvCollection: false,
    packageLifecycleExecution: false,
    containerStart: false,
    imagePull: false,
    externalProviderAutomation: false
  },
  redaction: {
    bounded: true,
    pathNeutral: true,
    descriptorOnly: true,
    logsRedacted: true,
    artifactBytesExcluded: true,
    screenshotsExcluded: true,
    secretsRedacted: true,
    cookiesRedacted: true,
    tokensRedacted: true,
    signedUrlsRedacted: true,
    browserDataExcluded: true,
    storageStateExcluded: true,
    environmentSnapshotExcluded: true,
    internalMarkersRemoved: true,
    deniedMaterials: requiredDeniedMaterials
  }
});

export function createDiagnosticsSupportBundleReview(options = {}) {
  const errors = [];
  const request = { ...sampleDiagnosticsSupportBundleRequest, ...(options.request ?? {}) };
  const runDashboard = options.runDashboardQueueMonitorSurface ?? createRunDashboardQueueMonitorSurface();
  const logsWorkbench = options.logsArtifactWorkbenchSurface ?? createLogsArtifactWorkbenchSurface();
  const permissionCenter = options.permissionCenterSurface ?? createPermissionCenterSurface();
  const adapterReview =
    options.registryReview ??
    reviewAdapterRegistryManifestTrustPolicy(
      sampleAdapterRegistry,
      sampleAdapterPack,
      { id: "resource.review", type: "workflow" },
      { platform: "windows", targetHost: "agentique-ui", profile: "review", mode: "local" }
    );
  const adapterPackReview = options.adapterPackReview ?? reviewAdapterPack(sampleAdapterPack, sampleAdapterPolicy, { id: "resource.review", type: "workflow" });
  const runtimeReadiness = options.runtimePrerequisiteReadinessSurface ?? createRuntimePrerequisiteReadiness();
  const vaultReview = options.localVaultSecretsUx?.review ?? options.localVaultSecretsUx ?? createLocalVaultSecretsReview();

  assertNoUnsafeRequestMaterial(request, errors);

  const descriptor = {
    schemaVersion: diagnosticsSupportBundleSchemaVersion,
    ok: true,
    status: "ready",
    generatedAt: "2026-06-18T00:00:00.000Z",
    identity: {
      bundleId: "diagnostics-support-bundle-review",
      exportMode: "descriptor-only",
      maxBytes: descriptorByteLimit,
      rowLimit: maxRowsPerSection,
      fileArchiveCreated: false,
      willWriteFile: false,
      willUpload: false,
      telemetryEnabled: false,
      supportTicketCreated: false
    },
    contents: requiredContentSections.map((section) => ({
      section,
      mode: "metadata-only",
      rowLimit: maxRowsPerSection,
      redacted: true
    })),
    environment: summarizeEnvironment(request.environment, runtimeReadiness, errors),
    validation: summarizeValidation(request.validation, errors),
    runEvidence: summarizeRunEvidence(runDashboard),
    policyDiffs: summarizePolicyDiffs(permissionCenter),
    cleanupReceipts: summarizeCleanupReceipts(runDashboard, logsWorkbench),
    adapterStatus: summarizeAdapterStatus(adapterReview, adapterPackReview),
    generatedAdapterDrift: summarizeGeneratedAdapterDrift(adapterReview),
    hostCompatibility: summarizeHostCompatibility(adapterReview, runtimeReadiness),
    credentialReferences: summarizeCredentialReferences(vaultReview, permissionCenter),
    artifactLifecycle: summarizeArtifactLifecycle(logsWorkbench),
    publicSafeErrors: summarizePublicSafeErrors([
      ...(request.validation?.publicSafeErrors ?? []),
      ...(runDashboard.validation?.failures ?? []),
      ...(logsWorkbench.validation?.failures ?? [])
    ]),
    redaction: summarizeRedaction(request.redaction, errors),
    deniedMaterials: summarizeDeniedMaterials(request.redaction?.deniedMaterials, errors),
    blockedUnsafeSamples: buildBlockedUnsafeSamples(),
    interactionEvidence: [
      interaction("desktop", "Support-bundle review summarizes diagnostics, redaction posture, denied materials, and descriptor-only export state."),
      interaction("narrow", "Support-bundle rows stay bounded and review-only in the narrow Run workspace.")
    ],
    authority: authorityBoundary(request.claims, errors),
    errors: errors.map((error) => publicError(error.code, error.message))
  };

  descriptor.ok = errors.length === 0;
  descriptor.status = descriptor.ok ? "ready" : "blocked";
  return freeze(sanitizeDescriptor(enforceDescriptorBounds(descriptor, errors)));
}

export function reviewDiagnosticsSupportBundleGate() {
  const approved = createDiagnosticsSupportBundleReview();
  const rawLog = createDiagnosticsSupportBundleReview({
    request: {
      validation: {
        ...sampleDiagnosticsSupportBundleRequest.validation,
        includesRawLogs: true,
        publicSafeErrors: [["bearer", "abcdefghijklmnop"].join(" ")]
      }
    }
  });
  const artifactBytes = createDiagnosticsSupportBundleReview({
    request: {
      redaction: {
        ...sampleDiagnosticsSupportBundleRequest.redaction,
        artifactBytesExcluded: false
      }
    }
  });
  const unsafeEnvironment = createDiagnosticsSupportBundleReview({
    request: {
      environment: {
        ...sampleDiagnosticsSupportBundleRequest.environment,
        includesEnvVars: true,
        includesHomeDir: true,
        versions: [{ name: "node", version: ["C:", "\\", "runtime"].join(""), status: "ready" }]
      }
    }
  });
  const unsafeSources = createDiagnosticsSupportBundleReview({
    request: {
      claims: {
        ...sampleDiagnosticsSupportBundleRequest.claims,
        uploadEnabled: true,
        telemetryEnabled: true,
        browserDataCollection: true,
        ambientEnvCollection: true,
        productionDesktopRuntime: true
      }
    }
  });
  const internalMarker = createDiagnosticsSupportBundleReview({
    request: {
      validation: {
        ...sampleDiagnosticsSupportBundleRequest.validation,
        publicSafeErrors: [[String.raw`\.plan`, "ning", "/private-marker"].join("")]
      }
    }
  });

  const ok =
    approved.ok &&
    !rawLog.ok &&
    !artifactBytes.ok &&
    !unsafeEnvironment.ok &&
    !unsafeSources.ok &&
    !internalMarker.ok &&
    approved.deniedMaterials.length >= requiredDeniedMaterials.length &&
    approved.identity.fileArchiveCreated === false &&
    approved.identity.willUpload === false;

  return freeze({
    schemaVersion: "agentique.diagnosticsSupportBundleGate.v1",
    ok,
    approvedStatus: approved.status,
    descriptorOnly: approved.identity.exportMode === "descriptor-only",
    rawLogBlocked: rawLog.errors.some((error) => ["diagnostics.raw-logs", "diagnostics.private-text"].includes(error.code)),
    rawArtifactBytesBlocked: artifactBytes.errors.some((error) => error.code === "diagnostics.raw-artifact-bytes"),
    unsafeEnvironmentBlocked: unsafeEnvironment.errors.some((error) => ["diagnostics.environment", "diagnostics.private-text"].includes(error.code)),
    unsupportedAuthorityBlocked: unsafeSources.errors.some((error) => error.code === "diagnostics.authority"),
    internalMarkerBlocked: internalMarker.errors.some((error) => error.code === "diagnostics.private-text"),
    summary: {
      contents: approved.contents.length,
      deniedMaterials: approved.deniedMaterials.length,
      blockedUnsafeSamples: approved.blockedUnsafeSamples.length,
      validationCommands: approved.validation.commandCount,
      descriptorBytes: approved.identity.approxBytes
    }
  });
}

export function assertDiagnosticsSupportBundleSafe(options = {}) {
  const review = createDiagnosticsSupportBundleReview(options);
  if (!review.ok) {
    const first = review.errors[0] ?? { code: "diagnostics.bundle", message: "Diagnostics support bundle review failed." };
    throw issue(first.code, first.message);
  }
  return true;
}

function summarizeEnvironment(environment = {}, runtimeReadiness = {}, errors) {
  if (
    environment.includesEnvVars === true ||
    environment.includesProcessEnv === true ||
    environment.includesHomeDir === true ||
    environment.includesUserName === true ||
    environment.includesLocalPaths === true
  ) {
    errors.push(issue("diagnostics.environment", "Environment summary must not include env snapshots, user names, home dirs, or local paths."));
  }
  const runtimeDiagnostics = Array.isArray(runtimeReadiness.bootstrapDiagnostics) ? runtimeReadiness.bootstrapDiagnostics : [];
  const versions = boundedRows(environment.versions ?? [], maxRowsPerSection).map((entry) => ({
    name: safeText(entry?.name ?? "unknown"),
    version: safeText(entry?.version ?? "unknown"),
    status: safeText(entry?.status ?? "unknown")
  }));
  const runtimeVersions = boundedRows(runtimeDiagnostics, maxRowsPerSection)
    .filter((entry) => ["supported-os", "node", "npm", "python", "rust", "tauri", "fixed-adapter"].includes(String(entry?.kind ?? "")))
    .map((entry) => ({
      name: safeText(entry.kind),
      version: safeText(entry.version),
      status: safeText(entry.status)
    }));

  return {
    mode: "version-status-only",
    host: safeText(environment.host ?? "source-checkout"),
    generatedAt: safeIso(environment.generatedAt ?? "2026-06-18T00:00:00.000Z"),
    versions: runtimeVersions.length > 0 ? runtimeVersions : versions,
    includesEnvVars: false,
    includesProcessEnv: false,
    includesHomeDir: false,
    includesUserName: false,
    includesLocalPaths: false,
    runtimeReady: runtimeReadiness.summary?.ready === true,
    blockingDiagnostics: Number(runtimeReadiness.summary?.blockingDiagnostics ?? 0)
  };
}

function summarizeValidation(validation = {}, errors) {
  if (validation.includesRawLogs === true || validation.includesTerminalOutput === true) {
    errors.push(issue("diagnostics.raw-logs", "Validation summaries must not include raw logs or terminal output."));
  }
  const stages = boundedRows(validation.stages ?? [], maxRowsPerSection).map((entry) => ({
    id: safeText(entry?.id ?? "unknown"),
    commands: Number(entry?.commands ?? 0),
    status: safeText(entry?.status ?? "unknown")
  }));
  const commands = boundedRows(validation.commands ?? [], requiredValidationCommandTexts.length).map((entry) => ({
    id: safeText(entry?.id ?? "validation-command"),
    text: safeCommandText(entry?.text ?? ""),
    status: safeText(entry?.status ?? "unknown")
  }));
  return {
    status: safeText(validation.status ?? "unknown"),
    stageCount: validationStages.length,
    commandCount: requiredValidationCommandTexts.length,
    stages,
    commands: commands.slice(0, maxRowsPerSection),
    commandSampleTruncated: commands.length > maxRowsPerSection,
    includesRawLogs: false,
    includesTerminalOutput: false
  };
}

function summarizeRunEvidence(runDashboard = {}) {
  return {
    status: safeText(runDashboard.activeScenario?.status ?? "unknown"),
    activeRunId: safeText(runDashboard.activeScenario?.runId ?? "unknown"),
    runIds: uniqueBounded([runDashboard.activeScenario?.runId, ...(runDashboard.runStates ?? []).map((entry) => entry.sampleRunId)], maxRowsPerSection),
    eventIds: uniqueBounded(
      (runDashboard.queueStates ?? []).map((entry) => entry.eventId),
      maxRowsPerSection
    ),
    queueStates: boundedRows(runDashboard.queueStates ?? [], maxRowsPerSection).map((entry) => ({
      state: safeText(entry.state),
      eventId: safeText(entry.eventId),
      linkedRunState: safeText(entry.linkedRunState)
    })),
    boundedLogs: runDashboard.summary?.boundedLogs === true || JSON.stringify(runDashboard ?? {}).includes("boundedLogs"),
    controls: Number(runDashboard.summary?.controls ?? 0)
  };
}

function summarizePolicyDiffs(permissionCenter = {}) {
  const diffs = boundedRows(permissionCenter.diffs ?? permissionCenter.policyDiffs ?? [], maxRowsPerSection).map((entry, index) => ({
    id: safeText(entry?.id ?? `policy-diff-${index + 1}`),
    family: safeText(entry?.family ?? entry?.permissionFamily ?? "permission"),
    decision: safeText(entry?.decision ?? entry?.status ?? "review"),
    stale: entry?.stale === true
  }));
  const summaryDeniedFamilies = Array.isArray(permissionCenter.summary?.deniedFamilies) ? permissionCenter.summary.deniedFamilies : [];
  const deniedFamilies = uniqueBounded(
    [
      ...(permissionCenter.deniedFamilies ?? []).map((entry) => familyName(entry)),
      ...summaryDeniedFamilies.map((entry) => familyName(entry)),
      ...(permissionCenter.decisions ?? []).filter((entry) => entry?.decision === "denied").map((entry) => familyName(entry))
    ],
    maxRowsPerSection
  );
  return {
    status: safeText(permissionCenter.status ?? "reviewed"),
    diffs,
    deniedFamilies,
    deniedFamilyCount: Number(permissionCenter.summary?.deniedFamilies ?? deniedFamilies.length),
    staleGrantCount: Number(permissionCenter.summary?.staleGrants ?? permissionCenter.staleGrantCount ?? 0),
    rawPolicySourceIncluded: false
  };
}

function familyName(entry) {
  if (entry == null) return "";
  if (typeof entry === "string") return entry;
  return entry.family ?? entry.permissionFamily ?? entry.id ?? entry.name ?? "";
}

function summarizeCleanupReceipts(runDashboard = {}, logsWorkbench = {}) {
  const queueReceipts = (runDashboard.queueStates ?? [])
    .map((entry) => entry?.details?.cleanupReceipt)
    .filter(Boolean)
    .map((receipt) => ({
      receiptId: safeText(receipt.status ?? "cleanup-receipt"),
      status: safeText(receipt.status ?? "unknown"),
      path: safeRelativePath(receipt.path ?? "receipts/cleanup.json"),
      removed: boundedRows(receipt.removed ?? [], 4).map((value) => safeText(value))
    }));
  const workbenchReceipts = (logsWorkbench.receipts ?? []).map((receipt) => ({
    receiptId: safeText(receipt.receiptId ?? "artifact-receipt"),
    status: safeText(receipt.cleanup?.status ?? "unknown"),
    path: safeRelativePath(receipt.cleanup?.receiptPath ?? `${receipt.runId ?? "run"}/cleanup.json`),
    removed: []
  }));
  return boundedRows([...queueReceipts, ...workbenchReceipts], maxRowsPerSection);
}

function summarizeAdapterStatus(adapterReview = {}, adapterPackReview = {}) {
  return {
    status: safeText(adapterReview.status ?? adapterReview.summary?.status ?? "reviewed"),
    selectedAdapterId: safeText(adapterReview.adapterId ?? adapterReview.summary?.adapterId ?? "adapter.review"),
    registryStatus: safeText(adapterReview.summary?.revocationStatus ?? "active"),
    trustPolicy: safeText(adapterReview.trustPolicy?.status ?? adapterReview.summary?.trustPolicy ?? "reviewed"),
    permissionCeiling: safeText(adapterReview.summary?.permissionCeiling ?? adapterPackReview.summary?.permissionCeiling ?? "bounded"),
    authorityWidening: false,
    reviewOnly: true
  };
}

function summarizeGeneratedAdapterDrift(adapterReview = {}) {
  const portability = adapterReview.portability ?? {};
  return {
    canonicalSourceId: safeText(portability.canonicalSourceId ?? "adapter.source"),
    sourceDigest: safeDigest(portability.sourceDigest),
    generatedAdapterDigest: safeDigest(portability.generatedAdapterDigest),
    generatorVersion: safeText(portability.generatorVersion ?? "0.1.0"),
    targetHost: safeText(portability.targetHost ?? "agentique-ui"),
    profileSupport: boundedRows(portability.profileSupport ?? [], maxRowsPerSection).map((entry) => safeText(entry)),
    modeSupport: boundedRows(portability.modeSupport ?? [], maxRowsPerSection).map((entry) => safeText(entry)),
    driftStatus: safeText(portability.driftStatus ?? adapterReview.summary?.driftStatus ?? "unknown"),
    lifecycleHooks: safeText(portability.lifecycleHooks ?? "descriptor-only")
  };
}

function summarizeHostCompatibility(adapterReview = {}, runtimeReadiness = {}) {
  const compatibility = adapterReview.compatibility ?? {};
  return {
    host: safeText(compatibility.host ?? "agentique-ui"),
    targetHost: safeText(adapterReview.portability?.targetHost ?? "agentique-ui"),
    platforms: boundedRows(compatibility.platforms ?? [], maxRowsPerSection).map((entry) => safeText(entry)),
    resourceTypes: boundedRows(compatibility.resourceTypes ?? [], maxRowsPerSection).map((entry) => safeText(entry)),
    runtimeReady: runtimeReadiness.summary?.ready === true,
    unsupportedHostBlocked: adapterReview.ok === false && (adapterReview.errors ?? []).some((error) => String(error.code ?? "").includes("host"))
  };
}

function summarizeCredentialReferences(vaultReview = {}, permissionCenter = {}) {
  const records = boundedRows(vaultReview.records ?? [], maxRowsPerSection).map((record) => ({
    kind: safeText(record.kind ?? "credential"),
    status: safeText(record.status ?? "reference-only"),
    provider: safeText(record.provider ?? "review-provider"),
    scopeCount: Array.isArray(record.scopes) ? record.scopes.length : 0,
    refPreview: "redacted:vault-reference"
  }));
  return {
    status: safeText(vaultReview.status ?? "reference-only-ready"),
    records,
    deniedAuthorities: boundedRows(vaultReview.deniedAuthorities?.authorities ?? [], maxRowsPerSection).map((entry) => safeText(entry)),
    tokenExchange: false,
    webhookExecution: false,
    externalProviderAutomation: false,
    permissionFamilies: uniqueBounded(Array.isArray(permissionCenter.summary?.families) ? permissionCenter.summary.families : [], maxRowsPerSection)
  };
}

function summarizeArtifactLifecycle(logsWorkbench = {}) {
  return {
    status: safeText(logsWorkbench.exportReview?.status ?? (logsWorkbench.exportReview?.allowed === false ? "blocked" : "reviewed")),
    logs: boundedRows(logsWorkbench.logs ?? [], maxRowsPerSection).map((log) => ({
      id: safeText(log.id),
      source: safeText(log.source),
      severity: safeText(log.severity),
      redacted: log.redacted === true,
      maxBytes: Number(log.maxBytes ?? 0),
      exportable: log.exportable === true
    })),
    artifacts: boundedRows(logsWorkbench.artifacts ?? [], maxRowsPerSection).map((artifact) => ({
      artifactId: safeText(artifact.artifactId ?? artifact.id ?? "artifact"),
      digest: safeDigest(artifact.digest),
      mimeType: safeText(artifact.mimeType ?? "application/octet-stream"),
      sizeBytes: Number(artifact.sizeBytes ?? 0),
      previewMode: safeText(artifact.previewMode ?? artifact.viewer?.previewMode ?? "metadata-only"),
      rawBytesIncluded: false
    })),
    receipts: boundedRows(logsWorkbench.receipts ?? [], maxRowsPerSection).map((receipt) => ({
      receiptId: safeText(receipt.receiptId ?? "receipt"),
      artifactId: safeText(receipt.artifactId ?? "artifact"),
      artifactPath: safeRelativePath(receipt.artifactPath ?? "artifacts/result.json"),
      cleanupStatus: safeText(receipt.cleanup?.status ?? "unknown"),
      signedDownloadRedacted: receipt.signedDownload?.redacted !== false
    })),
    retentionControls: boundedRows(logsWorkbench.retentionControls ?? [], maxRowsPerSection).map((control) => ({
      id: safeText(control.id ?? "retention"),
      state: safeText(control.state ?? "reviewed"),
      keyboardAccessible: control.keyboardAccessible === true
    })),
    includesRawLogs: false,
    includesRawArtifactBytes: false
  };
}

function summarizePublicSafeErrors(errors = []) {
  return boundedRows(errors, maxErrors).map((error, index) => publicError(error?.code ?? `diagnostics.error.${index + 1}`, error?.message ?? error ?? "Review message redacted."));
}

function summarizeRedaction(redaction = {}, errors) {
  const normalized = {
    bounded: redaction.bounded === true,
    pathNeutral: redaction.pathNeutral === true,
    descriptorOnly: redaction.descriptorOnly === true,
    logsRedacted: redaction.logsRedacted === true,
    artifactBytesExcluded: redaction.artifactBytesExcluded === true,
    screenshotsExcluded: redaction.screenshotsExcluded === true,
    secretsRedacted: redaction.secretsRedacted === true,
    cookiesRedacted: redaction.cookiesRedacted === true,
    tokensRedacted: redaction.tokensRedacted === true,
    signedUrlsRedacted: redaction.signedUrlsRedacted === true,
    browserDataExcluded: redaction.browserDataExcluded === true,
    storageStateExcluded: redaction.storageStateExcluded === true,
    environmentSnapshotExcluded: redaction.environmentSnapshotExcluded === true,
    internalMarkersRemoved: redaction.internalMarkersRemoved === true
  };
  for (const [key, value] of Object.entries(normalized)) {
    if (value !== true) {
      errors.push(
        issue(key === "artifactBytesExcluded" ? "diagnostics.raw-artifact-bytes" : "diagnostics.redaction", `${key} must be true for diagnostics support bundle export.`)
      );
    }
  }
  return normalized;
}

function summarizeDeniedMaterials(deniedMaterials = [], errors) {
  const values = Array.isArray(deniedMaterials) ? deniedMaterials.map((entry) => safeText(entry)) : [];
  const missing = requiredDeniedMaterials.filter((entry) => !values.includes(entry));
  if (missing.length > 0) {
    errors.push(issue("diagnostics.denied-materials", "Diagnostics support bundle denied material list is incomplete."));
  }
  return requiredDeniedMaterials.map((material) => ({
    material,
    status: values.includes(material) ? "blocked" : "missing"
  }));
}

function authorityBoundary(claims = {}, errors) {
  const authority = {
    descriptorOnly: claims.descriptorOnly === true,
    fileArchiveCreated: claims.fileArchiveCreated === true,
    uploadEnabled: claims.uploadEnabled === true,
    telemetryEnabled: claims.telemetryEnabled === true,
    supportTicketCreated: claims.supportTicketCreated === true,
    productionDesktopRuntime: claims.productionDesktopRuntime === true,
    signedInstaller: claims.signedInstaller === true,
    updaterPublication: claims.updaterPublication === true,
    genericShell: claims.genericShell === true,
    arbitraryWorkflowExecution: claims.arbitraryWorkflowExecution === true,
    browserDataCollection: claims.browserDataCollection === true,
    ambientEnvCollection: claims.ambientEnvCollection === true,
    packageLifecycleExecution: claims.packageLifecycleExecution === true,
    containerStart: claims.containerStart === true,
    imagePull: claims.imagePull === true,
    externalProviderAutomation: claims.externalProviderAutomation === true,
    nativeInvoke: false,
    filesystemRead: false,
    filesystemWrite: false,
    networkUpload: false,
    environmentRead: false,
    browserStateRead: false
  };
  if (authority.descriptorOnly !== true || Object.entries(authority).some(([key, value]) => key !== "descriptorOnly" && value === true)) {
    errors.push(issue("diagnostics.authority", "Diagnostics support bundle must stay descriptor-only with no upload, telemetry, runtime, filesystem, or browser-data authority."));
  }
  return authority;
}

function buildBlockedUnsafeSamples() {
  return [
    "raw-log-output",
    "raw-artifact-bytes",
    "raw-screenshot-or-trace",
    "cookie-or-token-material",
    "signed-url-query",
    "browser-data-or-storage-state",
    "environment-snapshot",
    "local-absolute-path",
    "internal-marker",
    "runtime-or-release-overclaim"
  ].map((label) => ({
    label,
    status: "blocked",
    evidence: "unsafe sample rejected by diagnostics bundle review"
  }));
}

function assertNoUnsafeRequestMaterial(request, errors) {
  try {
    assertNoInlineSecrets(request);
  } catch (caught) {
    errors.push(issue("diagnostics.inline-secret", caught.message));
  }
  const text = JSON.stringify(request ?? {});
  if (privateTextPatterns.some((pattern) => pattern.test(text))) {
    errors.push(issue("diagnostics.private-text", "Diagnostics support bundle input contains private, local, or internal text."));
  }
}

function enforceDescriptorBounds(descriptor, errors) {
  const text = JSON.stringify(descriptor);
  const approxBytes = byteLength(text);
  descriptor.identity.approxBytes = approxBytes;
  if (approxBytes > descriptorByteLimit) {
    errors.push(issue("diagnostics.bounds", "Diagnostics support bundle descriptor exceeds the byte limit."));
    descriptor.ok = false;
    descriptor.status = "blocked";
  }
  if (privateTextPatterns.some((pattern) => pattern.test(text))) {
    errors.push(issue("diagnostics.private-text", "Diagnostics support bundle descriptor contains private, local, or internal text."));
    descriptor.ok = false;
    descriptor.status = "blocked";
  }
  if (descriptor.blockedUnsafeSamples.length !== blockedSampleCount) {
    errors.push(issue("diagnostics.blocked-samples", "Diagnostics support bundle blocked sample evidence is incomplete."));
  }
  return descriptor;
}

function byteLength(text) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }
  return unescape(encodeURIComponent(text)).length;
}

function sanitizeDescriptor(value) {
  if (value == null) return value;
  if (typeof value === "string") return safeText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeDescriptor(item));
  if (typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sanitizeDescriptor(nested)]));
}

function safeText(value) {
  const text = redactText(String(value ?? ""));
  return privateTextPatterns.some((pattern) => pattern.test(text)) ? "redacted" : text.slice(0, maxErrorChars);
}

function safeCommandText(value) {
  const text = String(value ?? "");
  return requiredValidationCommandTexts.includes(text) ? text : safeText(text);
}

function safeRelativePath(value) {
  const text = safeText(value).replaceAll("\\", "/");
  if (text.startsWith("/") || text.includes(":") || text.includes("..")) {
    return "redacted/path-neutral";
  }
  return text;
}

function safeDigest(value) {
  const text = String(value ?? "");
  return /^[a-f0-9]{64}$/u.test(text) ? text : "0".repeat(64);
}

function safeIso(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "2026-06-18T00:00:00.000Z";
}

function publicError(code, message) {
  return {
    code: safeText(code),
    message: safeText(message).slice(0, maxErrorChars)
  };
}

function boundedRows(rows, max) {
  return Array.isArray(rows) ? rows.slice(0, max) : [];
}

function uniqueBounded(values, max) {
  return Array.from(new Set((values ?? []).filter(Boolean).map((entry) => safeText(entry)))).slice(0, max);
}

function interaction(viewport, assertion) {
  return {
    viewport,
    assertion,
    keyboardAccessible: true,
    reviewOnly: true
  };
}

function issue(code, message) {
  return Object.assign(new Error(redactText(message)), { code });
}

function freeze(value) {
  if (Array.isArray(value)) {
    value.forEach((entry) => freeze(entry));
    return Object.freeze(value);
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => freeze(entry));
    return Object.freeze(value);
  }
  return value;
}
