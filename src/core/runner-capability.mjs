import { reviewAdapterPack } from "./adapter-pack-policy.mjs";
import { redactText } from "./secret-vault.mjs";

const supportModes = new Set([
  "catalog-only",
  "visualizable",
  "editable",
  "dry-runnable",
  "locally-runnable",
  "external-handoff",
  "unsupported"
]);
const runnerModes = new Set(["disabled", "dry-run", "local-run", "external-handoff"]);
const decisionRank = Object.freeze({ deny: 0, ask: 1, allow: 2 });
const permissionFamilies = Object.freeze([
  "files",
  "network",
  "shell",
  "environment",
  "gpu",
  "containers",
  "externalProviders",
  "secrets",
  "sidecars",
  "browserData"
]);
const internalPlanMarker = "\\." + "planning";
const internalResearchMarker = "(?:" + "ref" + "erence|" + "REF" + "ERENCE" + ")[\\\\/]";
const unsafePublicTextPattern = new RegExp(
  `(${internalPlanMarker}|${internalResearchMarker}|(?<![A-Za-z])[A-Za-z]:[\\\\/]|(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)|bearer\\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|https:\\/\\/[^"'\\s?]+[?&](?:token|signature|X-Amz-Signature)=)`,
  "iu"
);
const relativeArtifactPathPattern = /^(outputs|artifacts|logs)\/[A-Za-z0-9._/-]+$/u;

export const sampleRunnerAdapterPolicy = Object.freeze({
  schemaVersion: "agentique.adapterPolicy.v1",
  trustedSigners: ["agentique-adapter-release"],
  revokedDigests: [],
  allowlist: [
    {
      adapterId: "adapter.local-python",
      version: "0.1.0",
      digest: "b".repeat(64),
      runtimes: ["python"],
      resourceTypes: ["locally-runnable"],
      maxPermissions: {
        files: "ask",
        network: "ask",
        shell: "deny",
        environment: "deny",
        gpu: "deny",
        containers: "deny",
        externalProviders: "ask",
        secrets: "ask",
        sidecars: "ask",
        browserData: "deny"
      }
    }
  ]
});

export const sampleRunnerAdapterPack = Object.freeze({
  schemaVersion: "agentique.adapterPack.v1",
  adapter: {
    id: "adapter.local-python",
    version: "0.1.0",
    runtime: "python",
    entrypoint: "agentique-adapter-local-python",
    resourceTypes: ["locally-runnable"]
  },
  artifact: {
    digest: "b".repeat(64),
    sizeBytes: 262144
  },
  signature: {
    status: "verified",
    signer: "agentique-adapter-release",
    subjectDigest: "b".repeat(64)
  },
  compatibility: {
    agentiqueUi: ">=0.1.0",
    platforms: ["windows", "macos", "linux"],
    resourceTypes: ["locally-runnable"]
  },
  permissions: {
    files: "ask",
    network: "deny",
    shell: "deny",
    environment: "deny",
    gpu: "deny",
    containers: "deny",
    externalProviders: "deny",
    secrets: "ask",
    sidecars: "ask",
    browserData: "deny"
  },
  updatePolicy: {
    channel: "stable",
    rollback: "supported",
    minimumVersion: "0.1.0"
  },
  revocation: {
    status: "active",
    checkedAt: "2026-06-12T00:00:00.000Z"
  },
  provenance: {
    source: "agentique-adapter-pack",
    builder: "github-actions",
    predicateType: "https://slsa.dev/provenance/v1"
  }
});

export const sampleRunnerCapabilityInput = Object.freeze({
  schemaVersion: "agentique.runnerCapability.v1",
  resource: {
    id: "example.visual-guide",
    version: "0.1.0",
    supportMode: "locally-runnable"
  },
  runner: {
    mode: "local-run",
    requiresNativeBackend: true,
    startsFromWebLayer: false,
    nativeCommand: "agentique.runner.start"
  },
  adapterPack: sampleRunnerAdapterPack,
  adapterPolicy: sampleRunnerAdapterPolicy,
  permissions: {
    files: "ask",
    network: "deny",
    shell: "deny",
    environment: "deny",
    gpu: "deny",
    containers: "deny",
    externalProviders: "deny",
    secrets: "ask",
    sidecars: "ask",
    browserData: "deny"
  },
  artifactContract: {
    contract: "agentique.artifactContract.v1",
    logRedaction: "required",
    maxLogBytes: 262144,
    maxArtifactBytes: 5242880,
    outputPaths: ["outputs/result.json", "artifacts/result.json"]
  },
  lifecycle: {
    timeoutMs: 60000,
    cancel: "graceful",
    cleanup: "process-tree",
    retry: { maxAttempts: 0 }
  },
  claims: {
    localRunAvailable: true,
    universalRuntime: false,
    automaticExecution: false,
    hostedRuntime: false,
    genericShell: false,
    ambientEnvironment: false,
    browserData: false,
    packageLifecycle: false,
    installerUpdater: false
  }
});

export function reviewRunnerCapability(input = sampleRunnerCapabilityInput) {
  const errors = [];
  if (!input || typeof input !== "object") {
    return blockedReview("runner.invalid", "Runner capability input must be an object.");
  }

  assertNoUnsafePublicText(input, "runnerCapability", errors);

  if (input.schemaVersion !== "agentique.runnerCapability.v1") {
    errors.push(issue("runner.schema", "Runner capability schema is unsupported."));
  }

  const resource = normalizeResource(input.resource, errors);
  const runner = normalizeRunner(input.runner, errors);
  const permissions = normalizePermissions(input.permissions, errors);
  const artifactContract = normalizeArtifactContract(input.artifactContract, errors);
  const lifecycle = normalizeLifecycle(input.lifecycle, errors);
  const claims = normalizeClaims(input.claims, errors);

  const adapterReview = reviewAdapterPack(input.adapterPack, input.adapterPolicy, {
    supportMode: resource.supportMode
  });
  if (!adapterReview.ok) {
    errors.push(issue("runner.adapter-blocked", "Adapter review failed; local-run capability is blocked."));
  }
  if (input.adapterPack?.artifact?.digest && input.adapterPack.artifact.digest !== adapterReview.artifact.digest) {
    errors.push(issue("runner.adapter-digest", "Adapter digest does not match review output."));
  }

  validateModeCompatibility(resource, runner, claims, errors);
  validatePermissionBoundary(permissions, runner, errors);
  validateAdapterPermissionBoundary(permissions, adapterReview.permissions, errors);

  const ok = errors.length === 0;
  const localRunAvailable = ok && runner.mode === "local-run" && claims.localRunAvailable === true;

  return clone({
    schemaVersion: "agentique.runnerCapabilityReview.v1",
    ok,
    state: ok ? "accepted" : "blocked",
    operationMode: runner.mode,
    requiresNativeBackend: runner.requiresNativeBackend,
    willSpawnProcessFromWebLayer: false,
    resource,
    adapter: adapterReview.adapter,
    permissions,
    artifactContract,
    lifecycle,
    claims: {
      ...claims,
      localRunAvailable
    },
    adapterReview: {
      ok: adapterReview.ok,
      signature: adapterReview.trust.signature,
      allowlisted: adapterReview.trust.allowlisted,
      revocation: adapterReview.trust.revocation,
      errors: adapterReview.errors.map((error) => error.code)
    },
    errors,
    summary: {
      status: ok ? "ready" : "blocked",
      blockerCount: errors.length,
      localRunAvailable,
      adapterRuntime: adapterReview.adapter.runtime,
      permissionAsks: Object.values(permissions).filter((decision) => decision === "ask").length
    }
  });
}

function normalizeResource(resource = {}, errors) {
  const supportMode = String(resource.supportMode ?? "");
  if (!supportModes.has(supportMode)) {
    errors.push(issue("runner.support-mode", "Resource support mode is unsupported."));
  }
  return {
    id: String(resource.id ?? ""),
    version: String(resource.version ?? ""),
    supportMode
  };
}

function normalizeRunner(runner = {}, errors) {
  const mode = String(runner.mode ?? "");
  if (!runnerModes.has(mode)) {
    errors.push(issue("runner.mode", "Runner mode is unsupported."));
  }
  if (runner.startsFromWebLayer !== false) {
    errors.push(issue("runner.web-layer-spawn", "Runner must not start from the web layer."));
  }
  if (mode === "local-run" && runner.requiresNativeBackend !== true) {
    errors.push(issue("runner.native-backend", "Local-run requires the native backend."));
  }
  return {
    mode,
    requiresNativeBackend: runner.requiresNativeBackend === true,
    startsFromWebLayer: runner.startsFromWebLayer === true,
    nativeCommand: String(runner.nativeCommand ?? "")
  };
}

function normalizePermissions(permissions = {}, errors) {
  const normalized = Object.fromEntries(permissionFamilies.map((family) => {
    const value = permissions[family] ?? "deny";
    if (!Object.prototype.hasOwnProperty.call(decisionRank, value)) {
      errors.push(issue("runner.permission-decision", `${family} permission decision is unsupported.`));
      return [family, "deny"];
    }
    return [family, value];
  }));
  return normalized;
}

function normalizeArtifactContract(artifactContract = {}, errors) {
  const outputPaths = Array.isArray(artifactContract.outputPaths) ? artifactContract.outputPaths : [];
  if (artifactContract.contract !== "agentique.artifactContract.v1") {
    errors.push(issue("runner.artifact-contract", "Artifact contract is required before local-run."));
  }
  if (artifactContract.logRedaction !== "required") {
    errors.push(issue("runner.log-redaction", "Log redaction must be required."));
  }
  if (Number(artifactContract.maxLogBytes ?? 0) <= 0 || Number(artifactContract.maxArtifactBytes ?? 0) <= 0) {
    errors.push(issue("runner.artifact-limits", "Artifact and log byte limits are required."));
  }
  if (outputPaths.length === 0) {
    errors.push(issue("runner.artifact-output", "At least one output path is required."));
  }
  for (const outputPath of outputPaths) {
    if (!relativeArtifactPathPattern.test(String(outputPath)) || String(outputPath).includes("..")) {
      errors.push(issue("runner.artifact-path", "Artifact output paths must be bounded relative paths."));
    }
  }
  return {
    contract: String(artifactContract.contract ?? ""),
    logRedaction: String(artifactContract.logRedaction ?? ""),
    maxLogBytes: Number(artifactContract.maxLogBytes ?? 0),
    maxArtifactBytes: Number(artifactContract.maxArtifactBytes ?? 0),
    outputPaths: outputPaths.map(String)
  };
}

function normalizeLifecycle(lifecycle = {}, errors) {
  const timeoutMs = Number(lifecycle.timeoutMs ?? 0);
  const maxAttempts = Number(lifecycle.retry?.maxAttempts ?? 0);
  if (timeoutMs <= 0 || timeoutMs > 3600000) {
    errors.push(issue("runner.timeout", "Runner timeout must be positive and bounded."));
  }
  if (lifecycle.cancel !== "graceful") {
    errors.push(issue("runner.cancel", "Local-run requires graceful cancellation."));
  }
  if (lifecycle.cleanup !== "process-tree") {
    errors.push(issue("runner.cleanup", "Local-run requires process-tree cleanup policy."));
  }
  if (maxAttempts < 0 || maxAttempts > 3) {
    errors.push(issue("runner.retry", "Retry policy must be bounded."));
  }
  return {
    timeoutMs,
    cancel: String(lifecycle.cancel ?? ""),
    cleanup: String(lifecycle.cleanup ?? ""),
    retry: { maxAttempts }
  };
}

function normalizeClaims(claims = {}, errors) {
  const normalized = {
    localRunAvailable: claims.localRunAvailable === true,
    universalRuntime: claims.universalRuntime === true,
    automaticExecution: claims.automaticExecution === true,
    hostedRuntime: claims.hostedRuntime === true,
    genericShell: claims.genericShell === true,
    ambientEnvironment: claims.ambientEnvironment === true,
    browserData: claims.browserData === true,
    packageLifecycle: claims.packageLifecycle === true,
    installerUpdater: claims.installerUpdater === true
  };
  for (const [claim, value] of Object.entries(normalized)) {
    if (claim !== "localRunAvailable" && value === true) {
      errors.push(issue("runner.unsupported-claim", `${claim} is not supported by runner capability.`));
    }
  }
  return normalized;
}

function validateModeCompatibility(resource, runner, claims, errors) {
  if (runner.mode === "local-run" && resource.supportMode !== "locally-runnable") {
    errors.push(issue("runner.local-run-support", "Local-run requires locally-runnable resource support mode."));
  }
  if (runner.mode !== "local-run" && claims.localRunAvailable === true) {
    errors.push(issue("runner.local-run-overclaim", "Local-run availability cannot be claimed for non-local-run modes."));
  }
}

function validatePermissionBoundary(permissions, runner, errors) {
  if (permissions.shell !== "deny") {
    errors.push(issue("runner.shell-blocked", "Generic shell execution must stay blocked."));
  }
  if (permissions.browserData !== "deny") {
    errors.push(issue("runner.browser-data-blocked", "Browser data access must stay blocked."));
  }
  if (runner.mode === "local-run" && decisionRank[permissions.sidecars] < decisionRank.ask) {
    errors.push(issue("runner.sidecar-permission", "Local-run requires an explicit sidecar permission prompt."));
  }
}

function validateAdapterPermissionBoundary(requested, adapterPermissions, errors) {
  for (const [family, decision] of Object.entries(requested)) {
    const adapterDecision = adapterPermissions?.[family] ?? "deny";
    if (decisionRank[decision] > decisionRank[adapterDecision]) {
      errors.push(issue("runner.permission-exceeds-adapter", `${family} exceeds adapter-reviewed permissions.`));
    }
  }
}

function assertNoUnsafePublicText(value, path, errors) {
  if (value == null) return;
  if (typeof value === "string") {
    if (unsafePublicTextPattern.test(value)) {
      errors.push(issue("runner.unsafe-public-text", `${path} contains unsafe public text.`));
    }
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    assertNoUnsafePublicText(nested, `${path}.${key}`, errors);
  }
}

function blockedReview(code, message) {
  return {
    schemaVersion: "agentique.runnerCapabilityReview.v1",
    ok: false,
    state: "blocked",
    operationMode: "disabled",
    requiresNativeBackend: false,
    willSpawnProcessFromWebLayer: false,
    resource: { id: "", version: "", supportMode: "unsupported" },
    adapter: { id: "", version: "", runtime: "", entrypoint: "" },
    permissions: Object.fromEntries(permissionFamilies.map((family) => [family, "deny"])),
    artifactContract: { contract: "", logRedaction: "", maxLogBytes: 0, maxArtifactBytes: 0, outputPaths: [] },
    lifecycle: { timeoutMs: 0, cancel: "", cleanup: "", retry: { maxAttempts: 0 } },
    claims: {
      localRunAvailable: false,
      universalRuntime: false,
      automaticExecution: false,
      hostedRuntime: false,
      genericShell: false,
      ambientEnvironment: false,
      browserData: false,
      packageLifecycle: false,
      installerUpdater: false
    },
    adapterReview: { ok: false, signature: "blocked", allowlisted: false, revocation: "unknown", errors: [] },
    errors: [issue(code, message)],
    summary: { status: "blocked", blockerCount: 1, localRunAvailable: false, adapterRuntime: "", permissionAsks: 0 }
  };
}

function issue(code, message) {
  return { code, message: redactText(message) };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
