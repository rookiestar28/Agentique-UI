import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPermissionGrantStore, evaluateRunStartGrants } from "./permission-grants.mjs";
import { cleanupRunFolder, writeRunFolder } from "./run-folder-writer.mjs";
import { createRunFolderManifest } from "./run-folder.mjs";
import { reviewRunnerCapability } from "./runner-capability.mjs";
import { redactText } from "./secret-vault.mjs";

const fixedNow = "2026-06-12T00:00:00.000Z";
const defaultRunId = "run-node-001";
const defaultRootDir = ".tmp/node-adapter-runner";
const maxCaptureBytes = 262144;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const adapterScriptPath = path.resolve(moduleDir, "..", "..", "adapters", "node", "echo-adapter.mjs");
const blockedAmbientEnvKeys = Object.freeze(["PATH", "Path", "HOME", "USERPROFILE", "APPDATA", "TEMP", "TMP", "NODE_OPTIONS", "NPM_TOKEN", "npm_config_userconfig"]);
const localPathPattern = /(?<![A-Za-z])[A-Za-z]:[\\/][^\s)`"']+/gu;
const rawSecretPattern = /(bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/giu;

export const sampleNodeAdapterPack = Object.freeze({
  schemaVersion: "agentique.adapterPack.v1",
  adapter: {
    id: "adapter.local-node",
    version: "0.1.0",
    runtime: "node",
    entrypoint: "agentique-adapter-local-node",
    resourceTypes: ["locally-runnable"]
  },
  artifact: {
    digest: "e".repeat(64),
    sizeBytes: 262144
  },
  signature: {
    status: "verified",
    signer: "agentique-adapter-release",
    subjectDigest: "e".repeat(64)
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
    secrets: "deny",
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
    checkedAt: fixedNow
  },
  provenance: {
    source: "agentique-adapter-pack",
    builder: "github-actions",
    predicateType: "https://slsa.dev/provenance/v1"
  }
});

export const sampleNodeAdapterPolicy = Object.freeze({
  schemaVersion: "agentique.adapterPolicy.v1",
  trustedSigners: ["agentique-adapter-release"],
  revokedDigests: [],
  allowlist: [
    {
      adapterId: "adapter.local-node",
      version: "0.1.0",
      digest: "e".repeat(64),
      runtimes: ["node"],
      resourceTypes: ["locally-runnable"],
      maxPermissions: {
        files: "ask",
        network: "deny",
        shell: "deny",
        environment: "deny",
        gpu: "deny",
        containers: "deny",
        externalProviders: "deny",
        secrets: "deny",
        sidecars: "ask",
        browserData: "deny"
      }
    }
  ]
});

export const sampleNodePackagePolicy = Object.freeze({
  entryMode: "packaged-adapter",
  packageManager: "blocked",
  installAllowed: false,
  lifecycleScripts: "blocked",
  inlineScripts: false,
  broadSubprocess: false,
  allowAllEquivalent: false
});

export const sampleNodeRunnerCapabilityInput = Object.freeze({
  schemaVersion: "agentique.runnerCapability.v1",
  resource: {
    id: "example.node-workflow",
    version: "0.1.0",
    supportMode: "locally-runnable"
  },
  runner: {
    mode: "local-run",
    requiresNativeBackend: true,
    startsFromWebLayer: false,
    nativeCommand: "agentique.runner.start"
  },
  adapterPack: sampleNodeAdapterPack,
  adapterPolicy: sampleNodeAdapterPolicy,
  permissions: {
    files: "ask",
    network: "deny",
    shell: "deny",
    environment: "deny",
    gpu: "deny",
    containers: "deny",
    externalProviders: "deny",
    secrets: "deny",
    sidecars: "ask",
    browserData: "deny"
  },
  artifactContract: {
    contract: "agentique.artifactContract.v1",
    logRedaction: "required",
    maxLogBytes: 262144,
    maxArtifactBytes: 5242880,
    outputPaths: ["outputs/node-result.json", "artifacts/node-result.json"]
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

export const sampleNodeAdapterInput = Object.freeze({
  schemaVersion: "agentique.nodeAdapterRun.v1",
  runId: defaultRunId,
  mode: "success",
  sleepMs: 0,
  resource: {
    id: "example.node-workflow",
    version: "0.1.0",
    digest: "f".repeat(64),
    supportMode: "locally-runnable"
  },
  payload: {
    message: "node-adapter-ready"
  }
});

export const sampleNodePermissionRequirements = Object.freeze([
  { family: "files", action: "read", target: "workspace:inputs/node-adapter-request.json" },
  { family: "subprocess", action: "start", target: "adapter:adapter.local-node" },
  { family: "artifactRetention", action: "retain", target: "artifact-retention:7d" }
]);

export async function executeNodeAdapterRun(input = sampleNodeAdapterInput, options = {}) {
  return startNodeAdapterRun(input, options).promise;
}

export function startNodeAdapterRun(input = sampleNodeAdapterInput, options = {}) {
  const prepared = prepareNodeAdapterRun(input, options);
  if (!prepared.ok) {
    return {
      promise: Promise.resolve(prepared.result),
      cancel: () => false
    };
  }

  const child = spawn(process.execPath, [prepared.adapterScriptPath], {
    cwd: process.cwd(),
    env: buildMinimalEnv(prepared.input),
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });

  let stdout = "";
  let stderr = "";
  let settled = false;
  let canceled = false;
  let timedOut = false;
  let cancelReason = "";

  const promise = new Promise((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      terminateChild(child);
    }, prepared.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(finalizeNodeAdapterRun({
        ...prepared,
        stdout,
        stderr,
        exitCode: null,
        signal: null,
        processError: error,
        statusOverride: "failed",
        cleanupAfter: true
      }));
    });
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const statusOverride = timedOut ? "timed-out" : canceled ? "canceled" : null;
      resolve(finalizeNodeAdapterRun({
        ...prepared,
        stdout,
        stderr,
        exitCode,
        signal,
        cancelReason,
        statusOverride,
        cleanupAfter: statusOverride !== null || exitCode !== 0
      }));
    });

    child.stdin.end(`${JSON.stringify(buildAdapterRequest(prepared.input))}\n`, "utf8");
  });

  return {
    promise,
    cancel(reason = "cancelled") {
      if (settled || child.killed) return false;
      canceled = true;
      cancelReason = String(reason);
      terminateChild(child);
      return true;
    }
  };
}

export async function reviewNodeAdapterExecution(options = {}) {
  const rootDir = options.rootDir ?? ".tmp/node-adapter-runner-review";
  fs.rmSync(path.resolve(process.cwd(), rootDir), { recursive: true, force: true });

  const success = await executeNodeAdapterRun(sampleNodeAdapterInput, { ...options, rootDir, now: fixedNow });
  const unsigned = await executeNodeAdapterRun(sampleNodeAdapterInput, {
    ...options,
    rootDir,
    now: fixedNow,
    capabilityInput: mutateCapabilityInput((capability) => {
      capability.adapterPack.signature.status = "missing";
    })
  });
  const revoked = await executeNodeAdapterRun(sampleNodeAdapterInput, {
    ...options,
    rootDir,
    now: fixedNow,
    capabilityInput: mutateCapabilityInput((capability) => {
      capability.adapterPolicy.revokedDigests = [capability.adapterPack.artifact.digest];
    })
  });
  const unsafePolicy = await executeNodeAdapterRun(sampleNodeAdapterInput, {
    ...options,
    rootDir,
    now: fixedNow,
    packagePolicy: {
      entryMode: "source-folder",
      packageManager: "npm",
      installAllowed: true,
      lifecycleScripts: "enabled",
      inlineScripts: true,
      broadSubprocess: true,
      allowAllEquivalent: true
    }
  });
  const cancel = startNodeAdapterRun({ ...sampleNodeAdapterInput, runId: "run-node-cancel", mode: "sleep", sleepMs: 5000 }, {
    ...options,
    rootDir,
    now: fixedNow,
    timeoutMs: 10000
  });
  setTimeout(() => cancel.cancel("review cancellation"), 50);
  const canceled = await cancel.promise;
  const secret = await executeNodeAdapterRun({ ...sampleNodeAdapterInput, runId: "run-node-secret", mode: "secret" }, {
    ...options,
    rootDir,
    now: fixedNow
  });

  const redacted = !rawSecretPattern.test(JSON.stringify(secret));
  const environmentClean = success.environment.forwardedAmbient.length === 0;
  const ok = success.ok &&
    unsigned.launched === false &&
    revoked.launched === false &&
    unsafePolicy.launched === false &&
    canceled.status === "canceled" &&
    canceled.cleanup?.ok === true &&
    redacted &&
    environmentClean;

  return {
    schemaVersion: "agentique.nodeAdapterRunnerReview.v1",
    ok,
    checks: {
      success: success.ok,
      unsignedBlockedBeforeLaunch: unsigned.launched === false,
      revokedBlockedBeforeLaunch: revoked.launched === false,
      unsafePolicyBlockedBeforeLaunch: unsafePolicy.launched === false,
      cancellationCleanup: canceled.cleanup?.ok === true,
      redacted,
      environmentClean
    },
    summary: {
      runId: success.runId,
      files: success.write?.files?.length ?? 0,
      cancellationStatus: canceled.status,
      forwardedAmbient: success.environment.forwardedAmbient
    },
    errors: [
      ...(success.errors ?? []),
      ...(unsigned.launched === false ? [] : [issue("node-adapter.unsigned-test", "Unsigned adapter launched unexpectedly.")]),
      ...(revoked.launched === false ? [] : [issue("node-adapter.revoked-test", "Revoked adapter launched unexpectedly.")]),
      ...(unsafePolicy.launched === false ? [] : [issue("node-adapter.package-policy-test", "Unsafe package policy launched unexpectedly.")]),
      ...(canceled.cleanup?.ok === true ? [] : [issue("node-adapter.cancel-cleanup", "Cancellation cleanup receipt was not written.")]),
      ...(redacted ? [] : [issue("node-adapter.redaction-test", "Adapter logs contain unredacted sensitive material.")]),
      ...(environmentClean ? [] : [issue("node-adapter.environment-test", "Adapter received non-empty ambient environment values.")])
    ]
  };
}

export function createNodePermissionGrantStore(runId = defaultRunId, options = {}) {
  return createPermissionGrantStore({
    runId,
    grants: [
      { id: "grant.files", family: "files", targets: ["workspace:inputs", "workspace:outputs", "workspace:runs"], expiresAt: "2026-06-12T01:00:00.000Z" },
      { id: "grant.subprocess", family: "subprocess", targets: ["adapter:adapter.local-node"], expiresAt: "2026-06-12T01:00:00.000Z" },
      { id: "grant.artifact-retention", family: "artifactRetention", targets: ["artifact-retention:7d"], expiresAt: "2026-06-12T01:00:00.000Z" }
    ]
  }, { now: options.now ?? fixedNow });
}

export function reviewNodePackagePolicy(packagePolicy = sampleNodePackagePolicy) {
  const errors = [];
  if (packagePolicy.entryMode !== "packaged-adapter") {
    errors.push(issue("node-adapter.entry-mode", "Node adapters must use packaged adapter entry mode."));
  }
  if (packagePolicy.packageManager !== "blocked") {
    errors.push(issue("node-adapter.package-manager", "Node adapter runner must not invoke a package manager."));
  }
  if (packagePolicy.installAllowed === true) {
    errors.push(issue("node-adapter.install", "Node adapter runner must not install packages during launch."));
  }
  if (packagePolicy.lifecycleScripts !== "blocked") {
    errors.push(issue("node-adapter.lifecycle", "Node package lifecycle scripts must be blocked."));
  }
  if (packagePolicy.inlineScripts === true) {
    errors.push(issue("node-adapter.inline-script", "Inline Node scripts must be blocked."));
  }
  if (packagePolicy.broadSubprocess === true) {
    errors.push(issue("node-adapter.broad-subprocess", "Broad subprocess access is blocked."));
  }
  if (packagePolicy.allowAllEquivalent === true) {
    errors.push(issue("node-adapter.allow-all", "Allow-all equivalent runtime policy is blocked."));
  }
  return {
    schemaVersion: "agentique.nodePackagePolicyReview.v1",
    ok: errors.length === 0,
    packagePolicy: {
      entryMode: packagePolicy.entryMode ?? "missing",
      packageManager: packagePolicy.packageManager ?? "missing",
      installAllowed: packagePolicy.installAllowed === true,
      lifecycleScripts: packagePolicy.lifecycleScripts ?? "missing",
      inlineScripts: packagePolicy.inlineScripts === true,
      broadSubprocess: packagePolicy.broadSubprocess === true,
      allowAllEquivalent: packagePolicy.allowAllEquivalent === true
    },
    errors
  };
}

function prepareNodeAdapterRun(input, options) {
  const normalized = normalizeNodeAdapterInput(input);
  if (!normalized.ok) {
    return { ok: false, result: blockedResult({ input: normalized.input, errors: normalized.errors, code: "node-adapter.invalid-input" }) };
  }

  const capabilityInput = clone(options.capabilityInput ?? sampleNodeRunnerCapabilityInput);
  const capabilityReview = reviewRunnerCapability(capabilityInput);
  if (!capabilityReview.ok) {
    return {
      ok: false,
      result: blockedResult({
        input: normalized.input,
        capabilityReview,
        errors: capabilityReview.errors,
        code: "node-adapter.adapter-blocked"
      })
    };
  }
  if (capabilityReview.adapter.runtime !== "node" || capabilityReview.resource.supportMode !== "locally-runnable") {
    return {
      ok: false,
      result: blockedResult({
        input: normalized.input,
        capabilityReview,
        errors: [issue("node-adapter.unsupported-capability", "Node adapter runner requires a locally runnable Node capability.")],
        code: "node-adapter.unsupported-capability"
      })
    };
  }

  const packageReview = reviewNodePackagePolicy(options.packagePolicy ?? sampleNodePackagePolicy);
  if (!packageReview.ok) {
    return {
      ok: false,
      result: blockedResult({
        input: normalized.input,
        capabilityReview,
        packageReview,
        errors: packageReview.errors,
        code: "node-adapter.package-policy-blocked"
      })
    };
  }

  const permissionStore = options.permissionStore ?? createNodePermissionGrantStore(normalized.input.runId, { now: options.now ?? fixedNow });
  const permissionRequirements = options.permissionRequirements ?? sampleNodePermissionRequirements;
  const permissionPreflight = evaluateRunStartGrants(permissionStore, permissionRequirements, { now: options.now ?? fixedNow });
  if (!permissionPreflight.ok) {
    return {
      ok: false,
      result: blockedResult({
        input: normalized.input,
        capabilityReview,
        packageReview,
        permissionPreflight,
        errors: permissionPreflight.errors,
        code: "node-adapter.permission-blocked"
      })
    };
  }

  if (!process.execPath || !fs.existsSync(process.execPath)) {
    return {
      ok: false,
      result: blockedResult({
        input: normalized.input,
        capabilityReview,
        packageReview,
        permissionPreflight,
        errors: [issue("node-adapter.runtime-missing", "Node executable was not available for the adapter runner.")],
        code: "node-adapter.runtime-missing"
      })
    };
  }
  if (!fs.existsSync(adapterScriptPath)) {
    return {
      ok: false,
      result: blockedResult({
        input: normalized.input,
        capabilityReview,
        packageReview,
        permissionPreflight,
        errors: [issue("node-adapter.script-missing", "Repo-local Node adapter script is missing.")],
        code: "node-adapter.script-missing"
      })
    };
  }

  return {
    ok: true,
    input: normalized.input,
    capabilityInput,
    capabilityReview,
    packageReview,
    permissionPreflight,
    adapterScriptPath,
    rootDir: options.rootDir ?? defaultRootDir,
    timeoutMs: Number(options.timeoutMs ?? capabilityReview.lifecycle.timeoutMs),
    now: options.now ?? fixedNow
  };
}

function finalizeNodeAdapterRun(prepared) {
  const stdout = redactRunnerText(prepared.stdout);
  const stderr = redactRunnerText(prepared.stderr);
  const parsed = parseAdapterStdout(stdout);
  const status = determineRunStatus(prepared, parsed);
  const failure = buildFailure(status, prepared, parsed);
  const outputs = status === "succeeded" ? normalizeOutputs(parsed.result?.outputs) : [];
  const artifacts = status === "succeeded" ? normalizeArtifacts(parsed.result?.artifacts) : [];
  const manifest = createRunFolderManifest({
    runId: prepared.input.runId,
    createdAt: prepared.now,
    resource: {
      resourceId: prepared.input.resource.id,
      version: prepared.input.resource.version,
      digest: prepared.input.resource.digest,
      supportMode: prepared.input.resource.supportMode
    },
    adapterPack: prepared.capabilityInput.adapterPack,
    launchPlan: {
      ok: true,
      operationMode: "local-run",
      nativeCommand: "agentique.runner.start",
      adapter: prepared.capabilityReview.adapter,
      runtime: "node",
      network: { auth: "none" },
      cleanup: { status: "ready", processTreeCleanup: true },
      summary: { status: "ready" }
    },
    permissionAudit: permissionSummary(prepared.permissionPreflight),
    preview: { title: "Node adapter run", renderMode: "metadata" },
    logs: [
      { name: "stdout.log", text: stdout },
      { name: "stderr.log", text: stderr }
    ],
    outputs,
    artifacts,
    failure
  });
  const write = writeRunFolder(manifest, { rootDir: prepared.rootDir, now: prepared.now });
  const cleanup = prepared.cleanupAfter ? cleanupRunFolder({ runId: prepared.input.runId }, { rootDir: prepared.rootDir, now: prepared.now }) : null;
  const envKeys = Array.isArray(parsed.result?.payload?.envKeys) ? parsed.result.payload.envKeys : [];
  const forwardedAmbient = Array.isArray(parsed.result?.payload?.ambientEnvNonEmpty) ? parsed.result.payload.ambientEnvNonEmpty : [];
  const errors = [
    ...(!write.ok ? write.errors : []),
    ...(failure.status === "none" ? [] : [issue(failure.code, failure.message ?? failure.code)]),
    ...(parsed.ok ? [] : parsed.errors)
  ];

  return {
    schemaVersion: "agentique.nodeAdapterRunResult.v1",
    ok: status === "succeeded" && write.ok,
    status,
    launched: true,
    runId: prepared.input.runId,
    capability: {
      ok: prepared.capabilityReview.ok,
      adapterRuntime: prepared.capabilityReview.adapter.runtime,
      localRunAvailable: prepared.capabilityReview.summary.localRunAvailable
    },
    packagePolicy: {
      ok: prepared.packageReview.ok,
      entryMode: prepared.packageReview.packagePolicy.entryMode,
      packageManager: prepared.packageReview.packagePolicy.packageManager,
      lifecycleScripts: prepared.packageReview.packagePolicy.lifecycleScripts
    },
    permissionPreflight: {
      ok: prepared.permissionPreflight.ok,
      status: prepared.permissionPreflight.status,
      decisions: prepared.permissionPreflight.decisions.map((decision) => decision.code)
    },
    health: {
      ready: status === "succeeded" && parsed.result?.ready === true,
      adapterRuntime: "node"
    },
    environment: {
      adapterEnvKeys: envKeys,
      forwardedAmbient
    },
    stdout,
    stderr,
    exit: {
      code: prepared.exitCode,
      signal: prepared.signal
    },
    write,
    cleanup,
    errors
  };
}

function normalizeNodeAdapterInput(input) {
  const errors = [];
  if (!input || typeof input !== "object") {
    return { ok: false, input: clone(sampleNodeAdapterInput), errors: [issue("node-adapter.invalid-input", "Node adapter input must be an object.")] };
  }
  const normalized = {
    schemaVersion: String(input.schemaVersion ?? ""),
    runId: safeRunId(input.runId ?? defaultRunId, errors),
    mode: String(input.mode ?? "success"),
    sleepMs: Number(input.sleepMs ?? 0),
    resource: {
      id: String(input.resource?.id ?? ""),
      version: String(input.resource?.version ?? ""),
      digest: String(input.resource?.digest ?? ""),
      supportMode: String(input.resource?.supportMode ?? "")
    },
    payload: clone(input.payload ?? {})
  };
  if (normalized.schemaVersion !== "agentique.nodeAdapterRun.v1") {
    errors.push(issue("node-adapter.schema", "Node adapter run schema is unsupported."));
  }
  if (!["success", "sleep", "secret"].includes(normalized.mode)) {
    errors.push(issue("node-adapter.mode", "Node adapter mode is unsupported."));
  }
  if (normalized.sleepMs < 0 || normalized.sleepMs > 60000) {
    errors.push(issue("node-adapter.sleep", "Sleep duration must be bounded."));
  }
  if (normalized.resource.supportMode !== "locally-runnable") {
    errors.push(issue("node-adapter.resource-mode", "Node adapter runner only accepts locally runnable resources."));
  }
  return { ok: errors.length === 0, input: normalized, errors };
}

function buildMinimalEnv(input) {
  const env = {
    AGENTIQUE_RUN_ID: input.runId,
    AGENTIQUE_ADAPTER_RUNTIME: "node",
    AGENTIQUE_ADAPTER_MODE: input.mode,
    NODE_NO_WARNINGS: "1"
  };
  // SECURITY: do not forward process.env wholesale; high-risk ambient keys are explicitly cleared.
  for (const key of ["SystemRoot", "WINDIR"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  for (const key of blockedAmbientEnvKeys) {
    env[key] = "";
  }
  return env;
}

function buildAdapterRequest(input) {
  return {
    schemaVersion: input.schemaVersion,
    runId: input.runId,
    mode: input.mode,
    sleepMs: input.sleepMs,
    resource: input.resource,
    payload: input.payload
  };
}

function parseAdapterStdout(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) {
    return { ok: false, result: null, errors: [issue("node-adapter.empty-stdout", "Node adapter did not return JSON stdout.")] };
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed.schemaVersion !== "agentique.nodeAdapterResult.v1" || parsed.ok !== true) {
      return { ok: false, result: parsed, errors: [issue("node-adapter.result-schema", "Node adapter stdout did not match the result contract.")] };
    }
    return { ok: true, result: parsed, errors: [] };
  } catch {
    return { ok: false, result: null, errors: [issue("node-adapter.invalid-json", "Node adapter stdout must be valid JSON.")] };
  }
}

function determineRunStatus(prepared, parsed) {
  if (prepared.statusOverride) return prepared.statusOverride;
  if (prepared.processError) return "failed";
  if (prepared.exitCode !== 0) return "failed";
  if (!parsed.ok) return "failed";
  return "succeeded";
}

function buildFailure(status, prepared, parsed) {
  if (status === "succeeded") return { status: "none", code: null, message: null };
  if (status === "timed-out") {
    return { status: "timed-out", code: "node-adapter.timeout", message: "Node adapter exceeded its timeout and was terminated." };
  }
  if (status === "canceled") {
    return { status: "canceled", code: "node-adapter.canceled", message: `Node adapter was cancelled: ${redactRunnerText(prepared.cancelReason)}` };
  }
  if (prepared.processError) {
    return { status: "failed", code: "node-adapter.process-error", message: redactRunnerText(prepared.processError.message) };
  }
  if (!parsed.ok) {
    return { status: "failed", code: parsed.errors[0]?.code ?? "node-adapter.invalid-result", message: parsed.errors[0]?.message ?? "Node adapter returned an invalid result." };
  }
  return { status: "failed", code: "node-adapter.exit", message: `Node adapter exited with code ${prepared.exitCode}.` };
}

function normalizeOutputs(outputs = []) {
  return outputs.map((output) => ({
    path: String(output.path ?? "outputs/node-result.json"),
    mediaType: String(output.mediaType ?? "application/json"),
    bytes: Number(output.bytes ?? 0)
  }));
}

function normalizeArtifacts(artifacts = []) {
  return artifacts.map((artifact) => ({
    id: String(artifact.id ?? "artifact-node-result-json"),
    path: String(artifact.path ?? "artifacts/node-result.json"),
    viewer: String(artifact.viewer ?? "json"),
    redacted: artifact.redacted !== false
  }));
}

function permissionSummary(preflight) {
  const decisions = preflight.decisions ?? [];
  return {
    summary: {
      allowed: decisions.filter((decision) => decision.status === "allowed").length,
      blocked: decisions.filter((decision) => decision.status !== "allowed").length,
      promptRequired: 0
    }
  };
}

function blockedResult({ input = sampleNodeAdapterInput, capabilityReview = null, packageReview = null, permissionPreflight = null, errors = [], code }) {
  return {
    schemaVersion: "agentique.nodeAdapterRunResult.v1",
    ok: false,
    status: "blocked",
    launched: false,
    runId: input.runId ?? defaultRunId,
    capability: capabilityReview ? {
      ok: capabilityReview.ok,
      adapterRuntime: capabilityReview.adapter.runtime,
      localRunAvailable: capabilityReview.summary.localRunAvailable
    } : null,
    packagePolicy: packageReview ? {
      ok: packageReview.ok,
      entryMode: packageReview.packagePolicy.entryMode,
      packageManager: packageReview.packagePolicy.packageManager,
      lifecycleScripts: packageReview.packagePolicy.lifecycleScripts
    } : null,
    permissionPreflight: permissionPreflight ? {
      ok: permissionPreflight.ok,
      status: permissionPreflight.status,
      decisions: permissionPreflight.decisions.map((decision) => decision.code)
    } : null,
    health: { ready: false, adapterRuntime: "node" },
    environment: { adapterEnvKeys: [], forwardedAmbient: [] },
    stdout: "",
    stderr: "",
    exit: { code: null, signal: null },
    write: null,
    cleanup: null,
    errors: errors.length > 0 ? errors : [issue(code, "Node adapter run was blocked before launch.")]
  };
}

function terminateChild(child) {
  if (!child.killed) {
    child.kill("SIGTERM");
  }
  setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 250).unref();
}

function appendBounded(current, chunk) {
  const next = `${current}${chunk.toString("utf8")}`;
  return next.length > maxCaptureBytes ? next.slice(0, maxCaptureBytes) : next;
}

function redactRunnerText(value) {
  return redactText(String(value ?? ""))
    .replace(rawSecretPattern, "redacted:inline-sensitive-material")
    .replace(/vault:[a-z][a-zA-Z0-9._-]{2,80}/gu, "redacted:vault-reference")
    .replace(localPathPattern, "redacted:local-path")
    .slice(0, maxCaptureBytes);
}

function mutateCapabilityInput(mutator) {
  const capability = clone(sampleNodeRunnerCapabilityInput);
  mutator(capability);
  return capability;
}

function safeRunId(value, errors) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9:_-]{3,96}$/u.test(text)) {
    errors.push(issue("node-adapter.run-id", "Node adapter run id must be a stable identifier."));
    return defaultRunId;
  }
  return text;
}

function issue(code, message) {
  return { code, message: redactRunnerText(message) };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
