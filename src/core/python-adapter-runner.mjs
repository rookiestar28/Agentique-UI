import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPermissionGrantStore, evaluateRunStartGrants } from "./permission-grants.mjs";
import { cleanupRunFolder, writeRunFolder } from "./run-folder-writer.mjs";
import { createRunFolderManifest } from "./run-folder.mjs";
import { reviewRunnerCapability, sampleRunnerCapabilityInput } from "./runner-capability.mjs";
import { redactText } from "./secret-vault.mjs";

const fixedNow = "2026-06-12T00:00:00.000Z";
const defaultRunId = "run-python-001";
const defaultRootDir = ".tmp/python-adapter-runner";
const maxCaptureBytes = 262144;
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const adapterScriptPath = path.resolve(moduleDir, "..", "..", "adapters", "python", "echo_adapter.py");
const blockedAmbientEnvKeys = Object.freeze(["PATH", "Path", "HOME", "USERPROFILE", "APPDATA", "TEMP", "TMP", "PYTHONPATH", "CONDA_PREFIX"]);
const localPathPattern = /(?<![A-Za-z])[A-Za-z]:[\\/][^\s)`"']+/gu;
const rawSecretPattern = /(bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/giu;

export const samplePythonAdapterInput = Object.freeze({
  schemaVersion: "agentique.pythonAdapterRun.v1",
  runId: defaultRunId,
  mode: "success",
  sleepMs: 0,
  resource: {
    id: "example.visual-guide",
    version: "0.1.0",
    digest: "c".repeat(64),
    supportMode: "locally-runnable"
  },
  payload: {
    message: "adapter-ready"
  }
});

export const samplePythonPermissionRequirements = Object.freeze([
  { family: "files", action: "read", target: "workspace:inputs/python-adapter-request.json" },
  { family: "subprocess", action: "start", target: "adapter:adapter.local-python" },
  { family: "artifactRetention", action: "retain", target: "artifact-retention:7d" }
]);

export async function executePythonAdapterRun(input = samplePythonAdapterInput, options = {}) {
  return startPythonAdapterRun(input, options).promise;
}

export function startPythonAdapterRun(input = samplePythonAdapterInput, options = {}) {
  const prepared = preparePythonAdapterRun(input, options);
  if (!prepared.ok) {
    return {
      promise: Promise.resolve(prepared.result),
      cancel: () => false
    };
  }

  const child = spawn(prepared.pythonExecutable, [prepared.adapterScriptPath], {
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
      resolve(finalizePythonAdapterRun({
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
      resolve(finalizePythonAdapterRun({
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

export async function reviewPythonAdapterExecution(options = {}) {
  const rootDir = options.rootDir ?? ".tmp/python-adapter-runner-review";
  fs.rmSync(path.resolve(process.cwd(), rootDir), { recursive: true, force: true });

  const success = await executePythonAdapterRun(samplePythonAdapterInput, { ...options, rootDir, now: fixedNow });
  const unsigned = await executePythonAdapterRun(samplePythonAdapterInput, {
    ...options,
    rootDir,
    now: fixedNow,
    capabilityInput: mutateCapabilityInput((capability) => {
      capability.adapterPack.signature.status = "missing";
    })
  });
  const revoked = await executePythonAdapterRun(samplePythonAdapterInput, {
    ...options,
    rootDir,
    now: fixedNow,
    capabilityInput: mutateCapabilityInput((capability) => {
      capability.adapterPolicy.revokedDigests = [capability.adapterPack.artifact.digest];
    })
  });
  const timeout = await executePythonAdapterRun({ ...samplePythonAdapterInput, runId: "run-python-timeout", mode: "sleep", sleepMs: 5000 }, {
    ...options,
    rootDir,
    now: fixedNow,
    timeoutMs: 50
  });
  const secret = await executePythonAdapterRun({ ...samplePythonAdapterInput, runId: "run-python-secret", mode: "secret" }, {
    ...options,
    rootDir,
    now: fixedNow
  });

  const environmentClean = success.environment.forwardedAmbient.length === 0;
  const redacted = !rawSecretPattern.test(JSON.stringify(secret));
  const ok = success.ok &&
    unsigned.launched === false &&
    revoked.launched === false &&
    timeout.status === "timed-out" &&
    timeout.cleanup?.ok === true &&
    redacted &&
    environmentClean;

  return {
    schemaVersion: "agentique.pythonAdapterRunnerReview.v1",
    ok,
    checks: {
      success: success.ok,
      unsignedBlockedBeforeLaunch: unsigned.launched === false,
      revokedBlockedBeforeLaunch: revoked.launched === false,
      timeoutCleanup: timeout.cleanup?.ok === true,
      redacted,
      environmentClean
    },
    summary: {
      runId: success.runId,
      files: success.write?.files?.length ?? 0,
      timeoutStatus: timeout.status,
      forwardedAmbient: success.environment.forwardedAmbient
    },
    errors: [
      ...(success.errors ?? []),
      ...(unsigned.launched === false ? [] : [issue("python-adapter.unsigned-test", "Unsigned adapter launched unexpectedly.")]),
      ...(revoked.launched === false ? [] : [issue("python-adapter.revoked-test", "Revoked adapter launched unexpectedly.")]),
      ...(timeout.cleanup?.ok === true ? [] : [issue("python-adapter.timeout-cleanup", "Timeout cleanup receipt was not written.")]),
      ...(redacted ? [] : [issue("python-adapter.redaction-test", "Adapter logs contain unredacted sensitive material.")]),
      ...(environmentClean ? [] : [issue("python-adapter.environment-test", "Adapter received ambient environment variables.")])
    ]
  };
}

export function createPythonPermissionGrantStore(runId = defaultRunId, options = {}) {
  return createPermissionGrantStore({
    runId,
    grants: [
      { id: "grant.files", family: "files", targets: ["workspace:inputs", "workspace:outputs", "workspace:runs"], expiresAt: "2026-06-12T01:00:00.000Z" },
      { id: "grant.subprocess", family: "subprocess", targets: ["adapter:adapter.local-python"], expiresAt: "2026-06-12T01:00:00.000Z" },
      { id: "grant.artifact-retention", family: "artifactRetention", targets: ["artifact-retention:7d"], expiresAt: "2026-06-12T01:00:00.000Z" }
    ]
  }, { now: options.now ?? fixedNow });
}

function preparePythonAdapterRun(input, options) {
  const normalized = normalizePythonAdapterInput(input);
  if (!normalized.ok) {
    return { ok: false, result: blockedResult({ input: normalized.input, errors: normalized.errors, code: "python-adapter.invalid-input" }) };
  }

  const capabilityInput = clone(options.capabilityInput ?? sampleRunnerCapabilityInput);
  const capabilityReview = reviewRunnerCapability(capabilityInput);
  if (!capabilityReview.ok) {
    return {
      ok: false,
      result: blockedResult({
        input: normalized.input,
        capabilityReview,
        errors: capabilityReview.errors,
        code: "python-adapter.adapter-blocked"
      })
    };
  }
  if (capabilityReview.adapter.runtime !== "python" || capabilityReview.resource.supportMode !== "locally-runnable") {
    return {
      ok: false,
      result: blockedResult({
        input: normalized.input,
        capabilityReview,
        errors: [issue("python-adapter.unsupported-capability", "Python adapter runner requires a locally runnable Python capability.")],
        code: "python-adapter.unsupported-capability"
      })
    };
  }

  const permissionStore = options.permissionStore ?? createPythonPermissionGrantStore(normalized.input.runId, { now: options.now ?? fixedNow });
  const permissionRequirements = options.permissionRequirements ?? samplePythonPermissionRequirements;
  const permissionPreflight = evaluateRunStartGrants(permissionStore, permissionRequirements, { now: options.now ?? fixedNow });
  if (!permissionPreflight.ok) {
    return {
      ok: false,
      result: blockedResult({
        input: normalized.input,
        capabilityReview,
        permissionPreflight,
        errors: permissionPreflight.errors,
        code: "python-adapter.permission-blocked"
      })
    };
  }

  const python = resolvePythonExecutable(options);
  if (!python.ok) {
    return {
      ok: false,
      result: blockedResult({
        input: normalized.input,
        capabilityReview,
        permissionPreflight,
        errors: python.errors,
        code: "python-adapter.python-missing"
      })
    };
  }

  if (!fs.existsSync(adapterScriptPath)) {
    return {
      ok: false,
      result: blockedResult({
        input: normalized.input,
        capabilityReview,
        permissionPreflight,
        errors: [issue("python-adapter.script-missing", "Repo-local Python adapter script is missing.")],
        code: "python-adapter.script-missing"
      })
    };
  }

  return {
    ok: true,
    input: normalized.input,
    capabilityInput,
    capabilityReview,
    permissionPreflight,
    pythonExecutable: python.executable,
    adapterScriptPath,
    rootDir: options.rootDir ?? defaultRootDir,
    timeoutMs: Number(options.timeoutMs ?? capabilityReview.lifecycle.timeoutMs),
    now: options.now ?? fixedNow
  };
}

function finalizePythonAdapterRun(prepared) {
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
      nativeCommand: prepared.capabilityReview.summary.localRunAvailable ? "agentique.runner.start" : "",
      adapter: prepared.capabilityReview.adapter,
      runtime: "python",
      network: { auth: "none" },
      cleanup: { status: "ready", processTreeCleanup: true },
      summary: { status: "ready" }
    },
    permissionAudit: permissionSummary(prepared.permissionPreflight),
    preview: { title: "Python adapter run", renderMode: "metadata" },
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
    schemaVersion: "agentique.pythonAdapterRunResult.v1",
    ok: status === "succeeded" && write.ok,
    status,
    launched: true,
    runId: prepared.input.runId,
    capability: {
      ok: prepared.capabilityReview.ok,
      adapterRuntime: prepared.capabilityReview.adapter.runtime,
      localRunAvailable: prepared.capabilityReview.summary.localRunAvailable
    },
    permissionPreflight: {
      ok: prepared.permissionPreflight.ok,
      status: prepared.permissionPreflight.status,
      decisions: prepared.permissionPreflight.decisions.map((decision) => decision.code)
    },
    health: {
      ready: status === "succeeded" && parsed.result?.ready === true,
      adapterRuntime: "python"
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

function normalizePythonAdapterInput(input) {
  const errors = [];
  if (!input || typeof input !== "object") {
    return { ok: false, input: clone(samplePythonAdapterInput), errors: [issue("python-adapter.invalid-input", "Python adapter input must be an object.")] };
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
  if (normalized.schemaVersion !== "agentique.pythonAdapterRun.v1") {
    errors.push(issue("python-adapter.schema", "Python adapter run schema is unsupported."));
  }
  if (!["success", "sleep", "secret"].includes(normalized.mode)) {
    errors.push(issue("python-adapter.mode", "Python adapter mode is unsupported."));
  }
  if (normalized.sleepMs < 0 || normalized.sleepMs > 60000) {
    errors.push(issue("python-adapter.sleep", "Sleep duration must be bounded."));
  }
  if (normalized.resource.supportMode !== "locally-runnable") {
    errors.push(issue("python-adapter.resource-mode", "Python adapter runner only accepts locally runnable resources."));
  }
  return { ok: errors.length === 0, input: normalized, errors };
}

function resolvePythonExecutable(options = {}) {
  const candidates = Array.isArray(options.pythonCandidates) && options.pythonCandidates.length > 0 ? options.pythonCandidates : ["python", "python3"];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["-c", "import sys; print(sys.executable)"], {
      encoding: "utf8",
      shell: false,
      windowsHide: true
    });
    if (result.status === 0 && String(result.stdout ?? "").trim()) {
      return { ok: true, executable: String(result.stdout).trim(), errors: [] };
    }
  }
  return { ok: false, executable: "", errors: [issue("python-adapter.python-missing", "Python interpreter was not available for the adapter runner.")] };
}

function buildMinimalEnv(input) {
  const env = {
    AGENTIQUE_RUN_ID: input.runId,
    AGENTIQUE_ADAPTER_RUNTIME: "python",
    AGENTIQUE_ADAPTER_MODE: input.mode,
    PYTHONNOUSERSITE: "1"
  };
  // SECURITY: do not forward process.env wholesale; only OS keys needed to start the fixed interpreter are allowed.
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
    return { ok: false, result: null, errors: [issue("python-adapter.empty-stdout", "Python adapter did not return JSON stdout.")] };
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed.schemaVersion !== "agentique.pythonAdapterResult.v1" || parsed.ok !== true) {
      return { ok: false, result: parsed, errors: [issue("python-adapter.result-schema", "Python adapter stdout did not match the result contract.")] };
    }
    return { ok: true, result: parsed, errors: [] };
  } catch {
    return { ok: false, result: null, errors: [issue("python-adapter.invalid-json", "Python adapter stdout must be valid JSON.")] };
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
    return { status: "timed-out", code: "python-adapter.timeout", message: "Python adapter exceeded its timeout and was terminated." };
  }
  if (status === "canceled") {
    return { status: "canceled", code: "python-adapter.canceled", message: `Python adapter was cancelled: ${redactRunnerText(prepared.cancelReason)}` };
  }
  if (prepared.processError) {
    return { status: "failed", code: "python-adapter.process-error", message: redactRunnerText(prepared.processError.message) };
  }
  if (!parsed.ok) {
    return { status: "failed", code: parsed.errors[0]?.code ?? "python-adapter.invalid-result", message: parsed.errors[0]?.message ?? "Python adapter returned an invalid result." };
  }
  return { status: "failed", code: "python-adapter.exit", message: `Python adapter exited with code ${prepared.exitCode}.` };
}

function normalizeOutputs(outputs = []) {
  return outputs.map((output) => ({
    path: String(output.path ?? "outputs/python-result.json"),
    mediaType: String(output.mediaType ?? "application/json"),
    bytes: Number(output.bytes ?? 0)
  }));
}

function normalizeArtifacts(artifacts = []) {
  return artifacts.map((artifact) => ({
    id: String(artifact.id ?? "artifact-python-result-json"),
    path: String(artifact.path ?? "artifacts/python-result.json"),
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

function blockedResult({ input = samplePythonAdapterInput, capabilityReview = null, permissionPreflight = null, errors = [], code }) {
  return {
    schemaVersion: "agentique.pythonAdapterRunResult.v1",
    ok: false,
    status: "blocked",
    launched: false,
    runId: input.runId ?? defaultRunId,
    capability: capabilityReview ? {
      ok: capabilityReview.ok,
      adapterRuntime: capabilityReview.adapter.runtime,
      localRunAvailable: capabilityReview.summary.localRunAvailable
    } : null,
    permissionPreflight: permissionPreflight ? {
      ok: permissionPreflight.ok,
      status: permissionPreflight.status,
      decisions: permissionPreflight.decisions.map((decision) => decision.code)
    } : null,
    health: { ready: false, adapterRuntime: "python" },
    environment: { adapterEnvKeys: [], forwardedAmbient: [] },
    stdout: "",
    stderr: "",
    exit: { code: null, signal: null },
    write: null,
    cleanup: null,
    errors: errors.length > 0 ? errors : [issue(code, "Python adapter run was blocked before launch.")]
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
  const capability = clone(sampleRunnerCapabilityInput);
  mutator(capability);
  return capability;
}

function safeRunId(value, errors) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9:_-]{3,96}$/u.test(text)) {
    errors.push(issue("python-adapter.run-id", "Python adapter run id must be a stable identifier."));
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
