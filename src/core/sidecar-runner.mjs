import { reviewAdapterPack, sampleAdapterPack, sampleAdapterPolicy, sampleNodeAdapterPack } from "./adapter-pack-policy.mjs";
import { sampleLibraryState } from "./library-store.mjs";
import { redactText } from "./secret-vault.mjs";

const localhostHosts = new Set(["127.0.0.1", "localhost"]);
const supportedRuntimes = new Set(["python", "node"]);
const workspaceRefPattern = /^workspace:[a-z0-9][a-z0-9._/-]{0,120}$/u;

export const samplePythonSidecarRequest = Object.freeze({
  schemaVersion: "agentique.sidecarLaunchRequest.v1",
  runtime: "python",
  requestedAt: "2026-06-11T00:45:00.000Z",
  resource: sampleLibraryState.resources[0],
  adapterPack: sampleAdapterPack,
  adapterPolicy: sampleAdapterPolicy,
  workspace: {
    runRoot: "workspace:runs/example-visual-guide",
    inputDirs: ["workspace:inputs/example-visual-guide"],
    outputDir: "workspace:outputs/example-visual-guide"
  },
  network: {
    mode: "localhost-only",
    listenHost: "127.0.0.1",
    port: "ephemeral",
    auth: "per-launch-token",
    allowedHosts: ["127.0.0.1"]
  },
  environment: {
    forwardAmbient: false,
    variables: {
      AGENTIQUE_RUN_ID: "run-local-001",
      AGENTIQUE_MODE: "controlled"
    }
  },
  healthCheck: {
    path: "/health",
    intervalMs: 1000,
    timeoutMs: 5000,
    requiredBeforeReady: true
  },
  logging: {
    stdout: "redacted",
    stderr: "redacted",
    maxBytes: 262144
  },
  shutdown: {
    graceful: "stdin-sentinel",
    timeoutMs: 5000,
    processTreeCleanup: true
  }
});

export const sampleNodeSidecarRequest = Object.freeze({
  ...samplePythonSidecarRequest,
  runtime: "node",
  resource: {
    ...sampleLibraryState.resources[0],
    supportMode: "dry-runnable"
  },
  adapterPack: sampleNodeAdapterPack,
  workspace: {
    runRoot: "workspace:runs/example-node-workflow",
    inputDirs: ["workspace:inputs/example-node-workflow"],
    outputDir: "workspace:outputs/example-node-workflow"
  },
  packagePolicy: {
    entryMode: "packaged-binary",
    packageManager: "blocked",
    installAllowed: false,
    lifecycleScripts: "blocked",
    inlineScripts: false
  }
});

export function createSidecarLaunchPlan(input) {
  const request = input ?? samplePythonSidecarRequest;
  const errors = [];
  if (!request || typeof request !== "object") {
    return blockedPlan("sidecar.invalid-request", "Sidecar launch request must be an object.");
  }
  if (request.schemaVersion !== "agentique.sidecarLaunchRequest.v1") {
    errors.push(issue("sidecar.invalid-schema", "Sidecar launch request schema is unsupported."));
  }
  if (!supportedRuntimes.has(request.runtime)) {
    errors.push(issue("sidecar.unsupported-runtime", "Sidecar runtime is not supported by this launch planner."));
  }

  const adapterReview = reviewAdapterPack(request.adapterPack, request.adapterPolicy, request.resource);
  if (!adapterReview.ok) {
    errors.push(issue("sidecar.adapter-blocked", "Adapter review failed; sidecar launch is blocked."));
  }
  if (adapterReview.adapter.runtime && adapterReview.adapter.runtime !== request.runtime) {
    errors.push(issue("sidecar.runtime-mismatch", "Adapter runtime does not match launch request runtime."));
  }

  errors.push(...validateWorkspaceScope(request.workspace));
  errors.push(...validateNetwork(request.network));
  errors.push(...validateEnvironment(request.environment));
  errors.push(...validateHealthCheck(request.healthCheck));
  errors.push(...validateLogging(request.logging));
  errors.push(...validateShutdown(request.shutdown));
  if (request.runtime === "node") {
    errors.push(...validateNodePackagePolicy(request.packagePolicy));
  }

  const ok = errors.length === 0;
  return {
    schemaVersion: "agentique.sidecarLaunchPlan.v1",
    ok,
    operationMode: "controlled-launch-plan",
    nativeCommand: "agentique.sidecar.start",
    requiresNativeBackend: true,
    willSpawnProcessFromWebLayer: false,
    runtime: request.runtime,
    adapter: adapterReview.adapter,
    resource: {
      id: String(request.resource?.resourceId ?? ""),
      version: String(request.resource?.version ?? ""),
      supportMode: String(request.resource?.supportMode ?? "")
    },
    workspace: normalizeWorkspace(request.workspace),
    network: {
      mode: request.network?.mode ?? "blocked",
      listenHost: request.network?.listenHost ?? "",
      port: request.network?.port ?? "blocked",
      auth: request.network?.auth ?? "missing",
      allowedHosts: request.network?.allowedHosts ?? []
    },
    environment: {
      forwardAmbient: request.environment?.forwardAmbient === true,
      variableNames: Object.keys(request.environment?.variables ?? {}).sort()
    },
    healthCheck: request.healthCheck ?? null,
    logging: {
      stdout: request.logging?.stdout ?? "missing",
      stderr: request.logging?.stderr ?? "missing",
      maxBytes: Number(request.logging?.maxBytes ?? 0)
    },
    shutdown: request.shutdown ?? {},
    packagePolicy: request.runtime === "node" ? normalizeNodePackagePolicy(request.packagePolicy) : null,
    sideEffects: [],
    cleanup: {
      processTreeCleanup: request.shutdown?.processTreeCleanup === true,
      graceful: request.shutdown?.graceful ?? "missing",
      status: ok ? "ready" : "blocked"
    },
    errors,
    summary: {
      status: ok ? "ready" : "blocked",
      blockerCount: errors.length,
      auth: request.network?.auth ?? "missing",
      healthCheck: request.healthCheck?.requiredBeforeReady === true ? "required" : "missing",
      cleanup: request.shutdown?.processTreeCleanup === true ? "process-tree" : "missing"
    }
  };
}

function validateNodePackagePolicy(packagePolicy = {}) {
  const errors = [];
  if (packagePolicy.entryMode !== "packaged-binary") {
    errors.push(issue("sidecar.node-entry-mode", "Node sidecars must use a packaged adapter binary."));
  }
  if (packagePolicy.packageManager !== "blocked") {
    errors.push(issue("sidecar.node-package-manager", "Node sidecars must not invoke an ambient package manager."));
  }
  if (packagePolicy.installAllowed === true) {
    errors.push(issue("sidecar.node-install", "Node sidecars must not install packages during launch."));
  }
  if (packagePolicy.lifecycleScripts !== "blocked") {
    errors.push(issue("sidecar.node-lifecycle", "Node package lifecycle scripts must be blocked."));
  }
  if (packagePolicy.inlineScripts === true) {
    errors.push(issue("sidecar.node-inline-script", "Inline Node scripts must be blocked."));
  }
  return errors;
}

function normalizeNodePackagePolicy(packagePolicy = {}) {
  return {
    entryMode: packagePolicy.entryMode ?? "missing",
    packageManager: packagePolicy.packageManager ?? "missing",
    installAllowed: packagePolicy.installAllowed === true,
    lifecycleScripts: packagePolicy.lifecycleScripts ?? "missing",
    inlineScripts: packagePolicy.inlineScripts === true
  };
}

function validateWorkspaceScope(workspace = {}) {
  const errors = [];
  for (const [field, value] of Object.entries({
    runRoot: workspace.runRoot,
    outputDir: workspace.outputDir
  })) {
    if (!isWorkspaceRef(value)) {
      errors.push(issue("sidecar.workspace-scope", `${field} must use a workspace-scoped reference.`));
    }
  }
  const inputDirs = Array.isArray(workspace.inputDirs) ? workspace.inputDirs : [];
  if (inputDirs.length === 0) {
    errors.push(issue("sidecar.workspace-scope", "At least one input workspace scope is required."));
  }
  for (const dir of inputDirs) {
    if (!isWorkspaceRef(dir)) {
      errors.push(issue("sidecar.workspace-scope", "Input directories must use workspace-scoped references."));
    }
  }
  return errors;
}

function validateNetwork(network = {}) {
  const errors = [];
  if (network.mode !== "localhost-only") {
    errors.push(issue("sidecar.network-scope", "Sidecar network mode must be localhost-only."));
  }
  if (!localhostHosts.has(network.listenHost)) {
    errors.push(issue("sidecar.public-bind", "Sidecar listen host must be localhost."));
  }
  if (network.auth !== "per-launch-token") {
    errors.push(issue("sidecar.auth", "Sidecar requires per-launch localhost authentication."));
  }
  const allowedHosts = Array.isArray(network.allowedHosts) ? network.allowedHosts : [];
  if (allowedHosts.length === 0 || allowedHosts.some((host) => !localhostHosts.has(host))) {
    errors.push(issue("sidecar.host-allowlist", "Allowed hosts must be localhost-only."));
  }
  return errors;
}

function validateEnvironment(environment = {}) {
  const errors = [];
  if (environment.forwardAmbient === true) {
    errors.push(issue("sidecar.ambient-env", "Ambient environment variables must not be forwarded."));
  }
  for (const [name, value] of Object.entries(environment.variables ?? {})) {
    if (!/^AGENTIQUE_[A-Z0-9_]{2,40}$/u.test(name)) {
      errors.push(issue("sidecar.env-name", `Environment variable ${name} is not allowlisted.`));
    }
    if (/(inline-secret-value|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,})/iu.test(String(value))) {
      errors.push(issue("sidecar.env-secret", `Environment variable ${name} contains inline sensitive material.`));
    }
  }
  return errors;
}

function validateHealthCheck(healthCheck = {}) {
  const errors = [];
  if (healthCheck.requiredBeforeReady !== true || typeof healthCheck.path !== "string" || !healthCheck.path.startsWith("/")) {
    errors.push(issue("sidecar.health-check", "Sidecar health check is required before ready state."));
  }
  if (Number(healthCheck.timeoutMs ?? 0) <= 0) {
    errors.push(issue("sidecar.health-timeout", "Sidecar health check timeout must be positive."));
  }
  return errors;
}

function validateLogging(logging = {}) {
  const errors = [];
  if (logging.stdout !== "redacted" || logging.stderr !== "redacted") {
    errors.push(issue("sidecar.log-redaction", "Sidecar stdout and stderr must be redacted."));
  }
  if (Number(logging.maxBytes ?? 0) <= 0) {
    errors.push(issue("sidecar.log-limit", "Sidecar log byte limit is required."));
  }
  return errors;
}

function validateShutdown(shutdown = {}) {
  const errors = [];
  if (!shutdown.graceful) {
    errors.push(issue("sidecar.shutdown", "Graceful shutdown strategy is required."));
  }
  if (shutdown.processTreeCleanup !== true) {
    errors.push(issue("sidecar.cleanup", "Process-tree cleanup is required."));
  }
  if (Number(shutdown.timeoutMs ?? 0) <= 0) {
    errors.push(issue("sidecar.shutdown-timeout", "Shutdown timeout must be positive."));
  }
  return errors;
}

function normalizeWorkspace(workspace = {}) {
  return {
    runRoot: workspace.runRoot ?? "",
    inputDirs: Array.isArray(workspace.inputDirs) ? [...workspace.inputDirs] : [],
    outputDir: workspace.outputDir ?? ""
  };
}

function isWorkspaceRef(value) {
  return typeof value === "string" && workspaceRefPattern.test(value) && !value.includes("..");
}

function blockedPlan(code, message) {
  return {
    schemaVersion: "agentique.sidecarLaunchPlan.v1",
    ok: false,
    operationMode: "controlled-launch-plan",
    nativeCommand: "agentique.sidecar.start",
    requiresNativeBackend: true,
    willSpawnProcessFromWebLayer: false,
    runtime: "unknown",
    adapter: { id: "", version: "", runtime: "", entrypoint: "" },
    resource: { id: "", version: "", supportMode: "" },
    workspace: normalizeWorkspace(),
    network: { mode: "blocked", listenHost: "", port: "blocked", auth: "missing", allowedHosts: [] },
    environment: { forwardAmbient: false, variableNames: [] },
    healthCheck: null,
    logging: { stdout: "missing", stderr: "missing", maxBytes: 0 },
    shutdown: {},
    packagePolicy: null,
    sideEffects: [],
    cleanup: { processTreeCleanup: false, graceful: "missing", status: "blocked" },
    errors: [issue(code, message)],
    summary: { status: "blocked", blockerCount: 1, auth: "missing", healthCheck: "missing", cleanup: "missing" }
  };
}

function issue(code, message) {
  return { code, message: redactText(message) };
}
