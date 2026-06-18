import { sampleAdapterPack, sampleAdapterPolicy } from "./adapter-pack-policy.mjs";
import { sampleLibraryState } from "./library-store.mjs";
import { evaluatePermissionBatch, samplePermissionPolicy, samplePermissionRequests } from "./permission-engine.mjs";
import { samplePreview } from "./safe-preview.mjs";
import { redactText } from "./secret-vault.mjs";
import { samplePythonSidecarRequest, createSidecarLaunchPlan } from "./sidecar-runner.mjs";

const unsafePathPattern = /(^[A-Za-z]:[\\/]|^\/|(^|[\\/])\.\.([\\/]|$))/u;

export const sampleRunFolderInput = Object.freeze({
  runId: "run-local-001",
  createdAt: "2026-06-11T00:55:00.000Z",
  resource: sampleLibraryState.resources[0],
  adapterPack: sampleAdapterPack,
  adapterPolicy: sampleAdapterPolicy,
  launchPlan: createSidecarLaunchPlan(samplePythonSidecarRequest),
  permissionAudit: evaluatePermissionBatch(samplePermissionPolicy, samplePermissionRequests),
  preview: samplePreview,
  logs: [
    { name: "stdout.log", text: "Started with vault:providerCredential reference only." },
    { name: "stderr.log", text: "No errors." }
  ],
  outputs: [
    { path: "outputs/result.json", mediaType: "application/json", bytes: 128 }
  ],
  artifacts: [
    { id: "artifact:result-json", path: "artifacts/result.json", viewer: "json", redacted: true }
  ],
  failure: {
    status: "none",
    code: null,
    message: null
  }
});

export function createRunFolderManifest(input = sampleRunFolderInput) {
  const errors = [];
  const launchPlan = input.launchPlan ?? createSidecarLaunchPlan(samplePythonSidecarRequest);
  const permissionAudit = input.permissionAudit ?? evaluatePermissionBatch(samplePermissionPolicy, samplePermissionRequests);
  const runId = safeName(input.runId ?? "run-local-001", "runId", errors);
  const runRoot = `runs/${runId}`;
  const logs = normalizeLogs(input.logs ?? [], errors);
  const outputs = normalizeOutputs(input.outputs ?? [], errors);
  const artifacts = normalizeArtifacts(input.artifacts ?? [], errors);
  const failureState = normalizeFailure(input.failure);

  const runJson = {
    schemaVersion: "agentique.runJson.v1",
    runId,
    createdAt: input.createdAt ?? "2026-06-11T00:55:00.000Z",
    operationMode: launchPlan.operationMode ?? "controlled-launch-plan",
    nativeCommand: launchPlan.nativeCommand ?? "agentique.sidecar.start",
    willSpawnProcessFromWebLayer: false,
    resource: {
      id: String(input.resource?.resourceId ?? ""),
      version: String(input.resource?.version ?? ""),
      digest: String(input.resource?.digest ?? ""),
      supportMode: String(input.resource?.supportMode ?? "")
    },
    adapter: {
      id: launchPlan.adapter?.id ?? input.adapterPack?.adapter?.id ?? "",
      version: launchPlan.adapter?.version ?? input.adapterPack?.adapter?.version ?? "",
      runtime: launchPlan.runtime ?? input.adapterPack?.adapter?.runtime ?? ""
    },
    versions: {
      agentiqueUi: "0.0.0",
      adapter: launchPlan.adapter?.version ?? input.adapterPack?.adapter?.version ?? "",
      manifest: "agentique.runJson.v1"
    },
    paths: {
      root: runRoot,
      runJson: `${runRoot}/run.json`,
      logs: `${runRoot}/logs`,
      outputs: `${runRoot}/outputs`,
      artifacts: `${runRoot}/artifacts`
    },
    permissions: permissionAudit.summary ?? { allowed: 0, blocked: 0, promptRequired: 0 },
    launchPlan: {
      runtime: launchPlan.runtime,
      status: launchPlan.summary?.status ?? "unknown",
      auth: launchPlan.network?.auth ?? "missing",
      cleanup: launchPlan.cleanup?.status ?? "unknown"
    },
    logs,
    outputs,
    artifacts,
    viewerMetadata: {
      previewTitle: input.preview?.title ?? "",
      previewMode: input.preview?.renderMode ?? "metadata",
      artifactViewers: artifacts.map((artifact) => artifact.viewer)
    },
    cleanup: {
      status: launchPlan.cleanup?.status === "ready" ? "pending" : "blocked",
      reversible: true,
      processTreeCleanup: launchPlan.cleanup?.processTreeCleanup === true,
      removes: [`${runRoot}/logs`, `${runRoot}/outputs`, `${runRoot}/artifacts`]
    },
    failureState,
    reproducibility: {
      deterministic: true,
      rerunSupported: launchPlan.ok === true,
      inputDigest: ""
    },
    sideEffects: []
  };

  runJson.reproducibility.inputDigest = stableDigest(JSON.stringify({
    resource: runJson.resource,
    adapter: runJson.adapter,
    permissions: runJson.permissions,
    outputs,
    artifacts,
    failureState
  }));

  const manifest = {
    schemaVersion: "agentique.runFolderManifest.v1",
    ok: errors.length === 0,
    runJson,
    errors,
    summary: {
      runId,
      logs: logs.length,
      outputs: outputs.length,
      artifacts: artifacts.length,
      cleanup: runJson.cleanup.status,
      failure: failureState.status,
      reproducibilityDigest: runJson.reproducibility.inputDigest
    }
  };
  return manifest;
}

export function validateRunFolderManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, errors: [issue("run-folder.invalid", "Run folder manifest must be an object.")] };
  }
  if (manifest.schemaVersion !== "agentique.runFolderManifest.v1") {
    errors.push(issue("run-folder.schema", "Run folder manifest schema is unsupported."));
  }
  const runJson = manifest.runJson ?? {};
  for (const field of ["runId", "createdAt", "operationMode", "nativeCommand"]) {
    if (!runJson[field]) errors.push(issue("run-folder.missing-field", `${field} is required.`));
  }
  for (const value of Object.values(runJson.paths ?? {})) {
    if (unsafePathPattern.test(String(value ?? ""))) {
      errors.push(issue("run-folder.unsafe-path", "Run folder paths must be relative and traversal-free."));
    }
  }
  if (!runJson.cleanup || runJson.cleanup.processTreeCleanup !== true) {
    errors.push(issue("run-folder.cleanup", "Cleanup state must include process-tree cleanup."));
  }
  if (!runJson.reproducibility?.inputDigest) {
    errors.push(issue("run-folder.reproducibility", "Reproducibility digest is required."));
  }
  if (runJson.sideEffects?.length !== 0) {
    errors.push(issue("run-folder.side-effects", "Run folder manifest builder must not record direct side effects."));
  }
  return { ok: errors.length === 0, errors };
}

function normalizeLogs(logs, errors) {
  if (!Array.isArray(logs)) {
    errors.push(issue("run-folder.logs", "Logs must be an array."));
    return [];
  }
  return logs.map((log, index) => ({
    name: safeRelativePath(log.name ?? `log-${index}.log`, "log.name", errors),
    redacted: true,
    text: redactRunText(log.text ?? ""),
    maxBytes: 262144
  }));
}

function normalizeOutputs(outputs, errors) {
  if (!Array.isArray(outputs)) {
    errors.push(issue("run-folder.outputs", "Outputs must be an array."));
    return [];
  }
  return outputs.map((output, index) => ({
    path: safeRelativePath(output.path ?? `outputs/output-${index}.json`, "output.path", errors),
    mediaType: String(output.mediaType ?? "application/octet-stream"),
    bytes: Number(output.bytes ?? 0),
    digest: stableDigest(`${output.path ?? index}:${output.bytes ?? 0}`)
  }));
}

function normalizeArtifacts(artifacts, errors) {
  if (!Array.isArray(artifacts)) {
    errors.push(issue("run-folder.artifacts", "Artifacts must be an array."));
    return [];
  }
  return artifacts.map((artifact, index) => ({
    id: safeName(artifact.id ?? `artifact-${index}`, "artifact.id", errors),
    path: safeRelativePath(artifact.path ?? `artifacts/artifact-${index}.json`, "artifact.path", errors),
    viewer: String(artifact.viewer ?? "metadata"),
    redacted: artifact.redacted !== false,
    digest: stableDigest(`${artifact.id ?? index}:${artifact.path ?? index}`)
  }));
}

function normalizeFailure(failure = {}) {
  return {
    status: failure.status ?? "none",
    code: failure.code ?? null,
    message: failure.message ? redactRunText(failure.message) : null
  };
}

function safeName(value, label, errors) {
  const text = String(value ?? "");
  if (!/^[a-zA-Z0-9:_-]{3,96}$/u.test(text)) {
    errors.push(issue("run-folder.invalid-name", `${label} must be a stable identifier.`));
    return "invalid-name";
  }
  return text;
}

function safeRelativePath(value, label, errors) {
  const text = String(value ?? "");
  if (unsafePathPattern.test(text) || text.length === 0) {
    errors.push(issue("run-folder.unsafe-path", `${label} must be a relative path without traversal.`));
    return "blocked-path";
  }
  return text.replaceAll("\\", "/");
}

function stableDigest(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return Array.from({ length: 8 }, (_, index) => ((hash + index * 2654435761) >>> 0).toString(16).padStart(8, "0")).join("");
}

function issue(code, message) {
  return { code, message: redactText(message) };
}

function redactRunText(value) {
  return redactText(value).replace(/vault:[a-z][a-zA-Z0-9._-]{2,80}/gu, "redacted:vault-reference");
}
