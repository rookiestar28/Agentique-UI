const exactModuleDigest = "32e9891ae7d3cedff10d21cea1ae3a989d4fb5424b89b9c2f93328535cf30af7";
const exactFeatures = Object.freeze(["std", "validate", "prefer-btree-collections", "extra-checks"]);
const nativeCommands = Object.freeze([
  "agentique_runner_prepare",
  "agentique_runner_approval_proposal",
  "agentique_runner_decide_approval",
  "agentique_runner_start",
  "agentique_runner_revoke_permission",
  "agentique_runner_cancel",
  "agentique_runner_status",
  "agentique_runner_logs",
  "agentique_runner_artifacts",
  "agentique_runner_cleanup",
  "agentique_runner_checkpoint_history",
  "agentique_runner_time_travel_prepare",
  "agentique_native_dag_prepare",
  "agentique_native_dag_start_ready",
  "agentique_native_dag_status",
  "agentique_native_dag_cancel"
]);
const deniedAmbientKeys = Object.freeze(["filesystem", "network", "environment", "clock", "random", "subprocess", "shell", "browser", "provider", "packages", "hostFunctions"]);
const allowedRequestFields = Object.freeze(["resourceId", "sessionId", "runId", "commandId", "adapterId", "approvalId", "permissionProfileId", "permissionGrantId"]);

export const sampleNativeWasmSandbox = Object.freeze({
  schemaVersion: "agentique.nativeWasmSandbox.v1",
  adapterId: "adapter.local-wasm",
  permissionProfileId: "permission.local-wasm.sandboxed",
  runtime: Object.freeze({
    kind: "wasm",
    engine: "wasmi",
    version: "=2.0.0",
    features: exactFeatures,
    jit: false,
    engineLimits: "strict",
    floatingPoint: false
  }),
  module: Object.freeze({
    bytes: 36,
    digestAlgorithm: "sha256",
    digest: exactModuleDigest,
    imports: Object.freeze([]),
    exportSignature: "run:()->i32",
    deterministicResult: 42
  }),
  resources: Object.freeze({
    fuelMetered: true,
    fuelBudget: 10_000,
    moduleBytes: 4_096,
    memoryBytes: 65_536,
    stackBytes: 65_536,
    maxInstances: 1,
    maxTables: 0,
    maxMemories: 0,
    maxOutputBytes: 65_536
  }),
  permissionCeiling: Object.freeze(["artifact-retention:7d"]),
  ambient: Object.freeze(Object.fromEntries(deniedAmbientKeys.map((key) => [key, "deny"]))),
  requestFields: allowedRequestFields,
  execution: Object.freeze({
    inProcess: true,
    callerSelectedModule: false,
    wasiLinked: false,
    hostImports: 0,
    fuelRefill: false,
    cleanupEvidence: "in-process-wasm-zero-handles"
  }),
  evidence: Object.freeze({
    outputs: Object.freeze(["outputs/wasm-result.json"]),
    artifacts: Object.freeze(["artifacts/wasm-result.json"]),
    rootRef: "native-wasm-runner",
    atomic: true,
    redacted: true,
    pathNeutral: true,
    sha256Bound: true
  }),
  nativeCommands,
  tauriCapabilities: Object.freeze(["core:event:allow-listen", "core:event:allow-unlisten"]),
  platforms: Object.freeze({
    windows: Object.freeze({ verified: true, authority: "repository-full-gate" }),
    linux: Object.freeze({ claimed: false }),
    macos: Object.freeze({ verified: false, skipped: true, supported: false })
  }),
  claims: Object.freeze({
    genericWasm: false,
    wasiApplications: false,
    releaseReady: false,
    published: false,
    deployed: false,
    liveHost: false
  })
});

export function reviewNativeWasmSandbox(input) {
  const errors = [];
  if (!input || typeof input !== "object") return failed("native-wasm.input", "Sandbox evidence must be an object.");
  requireEqual(input.schemaVersion, "agentique.nativeWasmSandbox.v1", "schema", errors);
  requireEqual(input.adapterId, "adapter.local-wasm", "adapter", errors);
  requireEqual(input.permissionProfileId, "permission.local-wasm.sandboxed", "permission-profile", errors);
  requireEqual(input.runtime?.engine, "wasmi", "engine", errors);
  requireEqual(input.runtime?.kind, "wasm", "runtime-kind", errors);
  requireEqual(input.runtime?.version, "=2.0.0", "version", errors);
  requireArrayEqual(input.runtime?.features, exactFeatures, "features", errors);
  requireEqual(input.runtime?.jit, false, "jit", errors);
  requireEqual(input.runtime?.engineLimits, "strict", "engine-limits", errors);
  requireEqual(input.runtime?.floatingPoint, false, "floating-point", errors);
  requireEqual(input.module?.bytes, 36, "module-bytes", errors);
  requireEqual(input.module?.digestAlgorithm, "sha256", "module-digest-algorithm", errors);
  requireEqual(input.module?.digest, exactModuleDigest, "module-digest", errors);
  requireArrayEqual(input.module?.imports, [], "module-imports", errors);
  requireEqual(input.module?.exportSignature, "run:()->i32", "module-export", errors);
  requireEqual(input.module?.deterministicResult, 42, "module-result", errors);
  requireEqual(input.resources?.fuelMetered, true, "fuel-metering", errors);
  for (const field of ["fuelBudget", "moduleBytes", "memoryBytes", "stackBytes", "maxOutputBytes"]) {
    if (!Number.isSafeInteger(input.resources?.[field]) || input.resources[field] <= 0) errors.push(issue(`native-wasm.${field}`, `${field} must be a positive fixed bound.`));
  }
  requireEqual(input.resources?.maxInstances, 1, "instance-limit", errors);
  requireEqual(input.resources?.maxTables, 0, "table-limit", errors);
  requireEqual(input.resources?.maxMemories, 0, "memory-count-limit", errors);
  requireArrayEqual(input.permissionCeiling, ["artifact-retention:7d"], "permission-ceiling", errors);
  for (const key of deniedAmbientKeys) requireEqual(input.ambient?.[key], "deny", `ambient-${key}`, errors);
  requireArrayEqual(input.requestFields, allowedRequestFields, "request-fields", errors);
  requireEqual(input.execution?.inProcess, true, "in-process", errors);
  requireEqual(input.execution?.callerSelectedModule, false, "caller-module", errors);
  requireEqual(input.execution?.wasiLinked, false, "wasi-link", errors);
  requireEqual(input.execution?.hostImports, 0, "host-imports", errors);
  requireEqual(input.execution?.fuelRefill, false, "fuel-refill", errors);
  requireEqual(input.execution?.cleanupEvidence, "in-process-wasm-zero-handles", "cleanup", errors);
  requireArrayEqual(input.evidence?.outputs, ["outputs/wasm-result.json"], "outputs", errors);
  requireArrayEqual(input.evidence?.artifacts, ["artifacts/wasm-result.json"], "artifacts", errors);
  requireEqual(input.evidence?.rootRef, "native-wasm-runner", "root-ref", errors);
  for (const field of ["atomic", "redacted", "pathNeutral", "sha256Bound"]) requireEqual(input.evidence?.[field], true, `evidence-${field}`, errors);
  requireArrayEqual(input.nativeCommands, nativeCommands, "native-commands", errors);
  requireArrayEqual(input.tauriCapabilities, ["core:event:allow-listen", "core:event:allow-unlisten"], "tauri-capabilities", errors);
  requireEqual(input.platforms?.windows?.verified, true, "windows-evidence", errors);
  requireEqual(input.platforms?.linux?.claimed, false, "linux-claim", errors);
  requireEqual(input.platforms?.macos?.verified, false, "macos-evidence", errors);
  requireEqual(input.platforms?.macos?.skipped, true, "macos-skip", errors);
  requireEqual(input.platforms?.macos?.supported, false, "macos-support", errors);
  for (const field of ["genericWasm", "wasiApplications", "releaseReady", "published", "deployed", "liveHost"])
    requireEqual(input.claims?.[field], false, `claim-${field}`, errors);

  return Object.freeze({
    ok: errors.length === 0,
    errors,
    summary: Object.freeze({
      adapterId: input.adapterId,
      runtime: input.runtime?.kind,
      moduleBytes: input.module?.bytes,
      moduleDigest: input.module?.digest,
      importCount: Array.isArray(input.module?.imports) ? input.module.imports.length : -1,
      exportSignature: input.module?.exportSignature,
      fuelMetered: input.resources?.fuelMetered === true,
      permissionCount: Array.isArray(input.permissionCeiling) ? input.permissionCeiling.length : -1,
      deniedAmbientCapabilities: deniedAmbientKeys.filter((key) => input.ambient?.[key] === "deny").length,
      nativeCommands: Array.isArray(input.nativeCommands) ? input.nativeCommands.length : -1,
      tauriCapabilities: Array.isArray(input.tauriCapabilities) ? input.tauriCapabilities.length : -1,
      windowsVerified: input.platforms?.windows?.verified === true,
      macosVerified: input.platforms?.macos?.verified === true
    })
  });
}

function requireEqual(actual, expected, field, errors) {
  if (actual !== expected) errors.push(issue(`native-wasm.${field}`, `${field} does not match the fixed sandbox contract.`));
}

function requireArrayEqual(actual, expected, field, errors) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected))
    errors.push(issue(`native-wasm.${field}`, `${field} does not match the fixed sandbox contract.`));
}

function issue(code, message) {
  return Object.freeze({ code, message });
}

function failed(code, message) {
  return Object.freeze({ ok: false, errors: [issue(code, message)], summary: Object.freeze({}) });
}
