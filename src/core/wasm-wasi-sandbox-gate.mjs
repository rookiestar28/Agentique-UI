import { createPermissionGrantStore, evaluateRunStartGrants } from "./permission-grants.mjs";
import { assertNoInlineSecrets, redactText, sanitizeForExport } from "./secret-vault.mjs";

const schemaVersion = "agentique.wasmWasiSandboxGate.v1";
const loopbackHosts = new Set(["127.0.0.1", "localhost"]);
const allowedLaneStates = new Set(["disabled", "preflight-only"]);
const unsafePathPattern = /(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|(?:^|[\s"'(])~[\\/]|\/(?:home|Users|root)(?:\/|$)/u;
const rawSecretPattern = /(bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|ya29\.)/iu;

export const sampleWasmWasiPermissionStore = createPermissionGrantStore(
  {
    runId: "run.wasm.001",
    grants: [
      { id: "grant.wasm.files", family: "files", targets: ["workspace:wasm", "workspace:runs"] },
      { id: "grant.wasm.network", family: "network", targets: ["http://127.0.0.1:49154"] },
      { id: "grant.wasm.env", family: "envVault", targets: ["vault:wasmRuntimeConfig"] },
      { id: "grant.wasm.adapter", family: "subprocess", targets: ["adapter:adapter.wasm-wasi"] },
      { id: "grant.wasm.retention", family: "artifactRetention", targets: ["artifact-retention:7d"] }
    ]
  },
  { now: "2026-06-12T00:00:00.000Z" }
);

export const sampleWasmWasiSandboxRequest = Object.freeze({
  lane: {
    status: "preflight-only",
    enabledForExecution: false,
    deterministicPreflight: true
  },
  runId: "run.wasm.001",
  adapter: {
    id: "adapter.wasm-wasi",
    runtime: "wasm-wasi",
    version: "0.1.0",
    digest: "e".repeat(64),
    signature: "verified",
    signer: "agentique-adapter-release",
    revocation: "active"
  },
  limits: {
    memoryBytes: 67108864,
    maxExecutionMs: 15000,
    instructionMetering: {
      mode: "fuel",
      maxUnits: 5000000,
      refill: false
    },
    maxStdoutBytes: 65536,
    maxStderrBytes: 65536,
    maxArtifacts: 4,
    maxArtifactBytes: 1048576
  },
  wasi: {
    files: [
      { access: "read", path: "workspace:wasm/module.wasm" },
      { access: "write", path: "workspace:runs/run.wasm.001/artifacts/result.json" }
    ],
    network: {
      mode: "loopback-only",
      allow: [{ protocol: "http", host: "127.0.0.1", port: 49154 }]
    },
    environment: {
      mode: "vault-references-only",
      variables: ["vault:wasmRuntimeConfig"]
    },
    clocks: "deterministic",
    random: "seeded",
    subprocess: "deny",
    shell: "deny",
    browserData: "deny"
  },
  artifacts: {
    contract: "agentique.artifactContract.v1",
    outputPaths: ["artifacts/result.json", "logs/stdout.txt"],
    cleanupRequired: true,
    cleanupReceiptRequired: true,
    redaction: "required"
  },
  permissionStore: sampleWasmWasiPermissionStore,
  permissionRequirements: [
    { family: "files", action: "read", target: "workspace:wasm/module.wasm" },
    { family: "files", action: "write", target: "workspace:runs/run.wasm.001/artifacts/result.json" },
    { family: "network", action: "connect", target: "http://127.0.0.1:49154/health" },
    { family: "envVault", action: "read", target: "vault:wasmRuntimeConfig" },
    { family: "subprocess", action: "preflight", target: "adapter:adapter.wasm-wasi" },
    { family: "artifactRetention", action: "retain", target: "artifact-retention:7d" }
  ],
  claims: {
    wasmExecutionAvailable: false,
    universalWasmRuntime: false,
    productionDesktopRuntime: false,
    installerUpdater: false,
    automaticExecution: false,
    ambientHostAccess: false
  }
});

export function createWasmWasiSandboxReview(request = sampleWasmWasiSandboxRequest, options = {}) {
  const errors = [];
  const runId = sanitizeId(request?.runId ?? "run.wasm.001", "runId", errors);
  const lane = reviewLane(request?.lane, errors);
  const adapter = reviewAdapter(request?.adapter, errors);
  const limits = reviewLimits(request?.limits, errors);
  const wasi = reviewCapabilities(request?.wasi, errors);
  const artifacts = reviewArtifacts(request?.artifacts, errors);
  const permissions = reviewPermissions(request, runId, options, errors);
  const claims = reviewClaims(request?.claims, errors);
  const ok = errors.length === 0;

  return sanitizeForExport({
    schemaVersion,
    ok,
    status: ok ? "preflight-ready" : "blocked",
    enabledForExecution: false,
    executionDecision: "disabled-pending-runtime-evidence",
    runId,
    lane,
    adapter,
    limits,
    wasi,
    artifacts,
    permissions,
    claims,
    userActions: ok
      ? ["Review WASM adapter manifest.", "Confirm sandbox limits.", "Keep execution disabled until runtime evidence is validated."]
      : ["Resolve WASM/WASI sandbox blockers before enabling any runtime lane."],
    errors: errors.map((error) => ({ code: error.code, message: redactText(error.message) }))
  });
}

export function assertWasiCapabilitiesSafe(capabilities) {
  assertNoInlineSecrets(capabilities);
  const text = JSON.stringify(capabilities ?? {});
  if (rawSecretPattern.test(text)) {
    throw issue("wasm-wasi.raw-secret", "WASI capability declaration contains raw sensitive material.");
  }

  const fileEntries = Array.isArray(capabilities?.files) ? capabilities.files : [];
  for (const entry of fileEntries) {
    const fileErrors = [];
    reviewFileCapability(entry, fileErrors);
    if (fileErrors.length > 0) throw fileErrors[0];
  }

  const networkErrors = [];
  reviewNetworkCapability(capabilities?.network, networkErrors);
  if (networkErrors.length > 0) throw networkErrors[0];

  const environmentErrors = [];
  reviewEnvironmentCapability(capabilities?.environment, environmentErrors);
  if (environmentErrors.length > 0) throw environmentErrors[0];

  if (!["deterministic", "disabled"].includes(capabilities?.clocks)) {
    throw issue("wasm-wasi.clock", "WASI clocks must be deterministic or disabled.");
  }
  if (!["seeded", "disabled"].includes(capabilities?.random)) {
    throw issue("wasm-wasi.random", "WASI random source must be seeded or disabled.");
  }
  if (capabilities?.subprocess !== "deny" || capabilities?.shell !== "deny" || capabilities?.browserData !== "deny") {
    throw issue("wasm-wasi.host-execution", "WASI subprocess, shell, and browser data capabilities must be denied.");
  }
  return true;
}

export function reviewWasmWasiSandboxGate() {
  const approved = createWasmWasiSandboxReview();
  const broadFile = createWasmWasiSandboxReview({
    ...sampleWasmWasiSandboxRequest,
    wasi: {
      ...sampleWasmWasiSandboxRequest.wasi,
      files: [{ access: "read", path: ["C", ":\\host\\module.wasm"].join("") }]
    }
  });
  const missingMetering = createWasmWasiSandboxReview({
    ...sampleWasmWasiSandboxRequest,
    limits: {
      ...sampleWasmWasiSandboxRequest.limits,
      instructionMetering: { mode: "wall-clock-only", maxUnits: 0, refill: true }
    }
  });
  const publicNetwork = createWasmWasiSandboxReview({
    ...sampleWasmWasiSandboxRequest,
    wasi: {
      ...sampleWasmWasiSandboxRequest.wasi,
      network: { mode: "public", allow: [{ protocol: "https", host: "example.com", port: 443 }] }
    }
  });
  return {
    schemaVersion: "agentique.wasmWasiSandboxGateReview.v1",
    ok: approved.ok && !broadFile.ok && !missingMetering.ok && !publicNetwork.ok,
    approvedStatus: approved.status,
    executionEnabled: approved.enabledForExecution,
    broadHostAccessBlocked: broadFile.errors.some((error) => error.code === "wasm-wasi.file-scope"),
    missingMeteringBlocked: missingMetering.errors.some((error) => error.code === "wasm-wasi.instruction-metering"),
    publicNetworkBlocked: publicNetwork.errors.some((error) => error.code === "wasm-wasi.network-mode"),
    summary: {
      memoryBytes: approved.limits.memoryBytes,
      permissionStatus: approved.permissions.status,
      cleanup: approved.artifacts.cleanupStatus
    }
  };
}

function reviewLane(lane = {}, errors) {
  const status = String(lane.status ?? "disabled");
  if (!allowedLaneStates.has(status)) {
    errors.push(issue("wasm-wasi.lane-status", "WASM/WASI lane must be disabled or preflight-only."));
  }
  if (lane.enabledForExecution === true) {
    errors.push(issue("wasm-wasi.execution-disabled", "WASM/WASI execution must remain disabled until runtime evidence is accepted."));
  }
  if (lane.deterministicPreflight !== true) {
    errors.push(issue("wasm-wasi.preflight", "Deterministic sandbox preflight evidence is required."));
  }
  return {
    status: allowedLaneStates.has(status) ? status : "blocked",
    enabledForExecution: false,
    deterministicPreflight: lane.deterministicPreflight === true
  };
}

function reviewAdapter(adapter = {}, errors) {
  const digest = String(adapter.digest ?? "");
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    errors.push(issue("wasm-wasi.adapter-digest", "WASM adapter digest must be a SHA-256 digest."));
  }
  if (adapter.runtime !== "wasm-wasi") {
    errors.push(issue("wasm-wasi.adapter-runtime", "Adapter runtime must be wasm-wasi."));
  }
  if (adapter.signature !== "verified" || adapter.signer !== "agentique-adapter-release") {
    errors.push(issue("wasm-wasi.adapter-signature", "WASM adapter signature must be verified by a trusted signer."));
  }
  if (adapter.revocation !== "active") {
    errors.push(issue("wasm-wasi.adapter-revocation", "WASM adapter must not be revoked."));
  }
  return {
    id: sanitizeAdapterId(adapter.id, errors),
    runtime: adapter.runtime === "wasm-wasi" ? "wasm-wasi" : "blocked",
    version: redactText(String(adapter.version ?? "")),
    digest: digest.slice(0, 12),
    signature: adapter.signature === "verified" ? "verified" : "blocked",
    revocation: adapter.revocation === "active" ? "active" : "blocked"
  };
}

function reviewLimits(limits = {}, errors) {
  const memoryBytes = Number(limits.memoryBytes);
  const maxExecutionMs = Number(limits.maxExecutionMs);
  const maxStdoutBytes = Number(limits.maxStdoutBytes);
  const maxStderrBytes = Number(limits.maxStderrBytes);
  const maxArtifacts = Number(limits.maxArtifacts);
  const maxArtifactBytes = Number(limits.maxArtifactBytes);
  const metering = limits.instructionMetering ?? {};
  const maxUnits = Number(metering.maxUnits);

  if (!Number.isInteger(memoryBytes) || memoryBytes < 65536 || memoryBytes > 268435456) {
    errors.push(issue("wasm-wasi.memory-limit", "WASM memory must be bounded between 64 KiB and 256 MiB."));
  }
  if (!Number.isInteger(maxExecutionMs) || maxExecutionMs <= 0 || maxExecutionMs > 60000) {
    errors.push(issue("wasm-wasi.time-limit", "WASM execution time must be positive and bounded."));
  }
  if (!["fuel", "instruction-metering"].includes(metering.mode) || !Number.isInteger(maxUnits) || maxUnits <= 0 || maxUnits > 100000000 || metering.refill !== false) {
    errors.push(issue("wasm-wasi.instruction-metering", "WASM execution requires fuel or equivalent deterministic instruction metering."));
  }
  if (!boundedByteLimit(maxStdoutBytes, 262144) || !boundedByteLimit(maxStderrBytes, 262144)) {
    errors.push(issue("wasm-wasi.stream-limit", "WASM stdout and stderr byte limits are required."));
  }
  if (!Number.isInteger(maxArtifacts) || maxArtifacts <= 0 || maxArtifacts > 16 || !boundedByteLimit(maxArtifactBytes, 10485760)) {
    errors.push(issue("wasm-wasi.artifact-limit", "WASM artifact count and byte limits are required."));
  }
  return {
    memoryBytes,
    maxExecutionMs,
    instructionMetering: {
      mode: ["fuel", "instruction-metering"].includes(metering.mode) ? metering.mode : "blocked",
      maxUnits: Number.isInteger(maxUnits) ? maxUnits : 0,
      refill: metering.refill === false
    },
    maxStdoutBytes,
    maxStderrBytes,
    maxArtifacts,
    maxArtifactBytes
  };
}

function reviewCapabilities(capabilities = {}, errors) {
  try {
    assertWasiCapabilitiesSafe(capabilities);
  } catch (error) {
    errors.push(issue(error.code ?? "wasm-wasi.capability", error.message));
  }

  const fileErrors = [];
  const files = Array.isArray(capabilities.files) ? capabilities.files.map((entry) => reviewFileCapability(entry, fileErrors)) : [];
  errors.push(...fileErrors);
  const networkErrors = [];
  const network = reviewNetworkCapability(capabilities.network, networkErrors);
  errors.push(...networkErrors);
  const envErrors = [];
  const environment = reviewEnvironmentCapability(capabilities.environment, envErrors);
  errors.push(...envErrors);
  if (!["deterministic", "disabled"].includes(capabilities.clocks)) {
    errors.push(issue("wasm-wasi.clock", "WASI clocks must be deterministic or disabled."));
  }
  if (!["seeded", "disabled"].includes(capabilities.random)) {
    errors.push(issue("wasm-wasi.random", "WASI random source must be seeded or disabled."));
  }
  if (capabilities.subprocess !== "deny" || capabilities.shell !== "deny" || capabilities.browserData !== "deny") {
    errors.push(issue("wasm-wasi.host-execution", "WASI subprocess, shell, and browser data capabilities must be denied."));
  }

  return {
    files,
    network,
    environment,
    clocks: ["deterministic", "disabled"].includes(capabilities.clocks) ? capabilities.clocks : "blocked",
    random: ["seeded", "disabled"].includes(capabilities.random) ? capabilities.random : "blocked",
    subprocess: capabilities.subprocess === "deny" ? "deny" : "blocked",
    shell: capabilities.shell === "deny" ? "deny" : "blocked",
    browserData: capabilities.browserData === "deny" ? "deny" : "blocked"
  };
}

function reviewFileCapability(entry = {}, errors) {
  const access = String(entry.access ?? "");
  const filePath = String(entry.path ?? "");
  if (!["read", "write", "read-write"].includes(access)) {
    errors.push(issue("wasm-wasi.file-access", "WASI file access must be read, write, or read-write."));
  }
  if (!filePath.startsWith("workspace:") || filePath === "workspace:" || filePath.includes("..") || unsafePathPattern.test(filePath)) {
    errors.push(issue("wasm-wasi.file-scope", "WASI file access must be workspace-scoped and path-safe."));
  }
  return {
    access: ["read", "write", "read-write"].includes(access) ? access : "blocked",
    path: filePath.startsWith("workspace:") && !unsafePathPattern.test(filePath) ? redactText(filePath) : "blocked"
  };
}

function reviewNetworkCapability(network = {}, errors) {
  const mode = String(network.mode ?? "disabled");
  const allow = Array.isArray(network.allow) ? network.allow : [];
  if (!["disabled", "loopback-only"].includes(mode)) {
    errors.push(issue("wasm-wasi.network-mode", "WASI network mode must be disabled or loopback-only."));
  }
  if (mode === "disabled" && allow.length > 0) {
    errors.push(issue("wasm-wasi.network-disabled", "Disabled WASI network mode cannot include allowed hosts."));
  }
  const normalized = [];
  for (const entry of allow) {
    const protocol = String(entry.protocol ?? "");
    const host = String(entry.host ?? "");
    const port = Number(entry.port);
    if (protocol !== "http" || !loopbackHosts.has(host) || !Number.isInteger(port) || port < 1024 || port > 65535) {
      errors.push(issue("wasm-wasi.network-loopback", "WASI network allowlist must be explicit loopback HTTP with an unprivileged port."));
    } else {
      normalized.push({ protocol, host, port });
    }
  }
  return {
    mode: ["disabled", "loopback-only"].includes(mode) ? mode : "blocked",
    allow: normalized
  };
}

function reviewEnvironmentCapability(environment = {}, errors) {
  const mode = String(environment.mode ?? "empty");
  const variables = Array.isArray(environment.variables) ? environment.variables.map(String) : [];
  if (!["empty", "vault-references-only"].includes(mode)) {
    errors.push(issue("wasm-wasi.environment-mode", "WASI environment must be empty or vault-reference only."));
  }
  if (mode === "empty" && variables.length > 0) {
    errors.push(issue("wasm-wasi.environment-empty", "Empty WASI environment cannot include variables."));
  }
  for (const variable of variables) {
    if (!variable.startsWith("vault:") || rawSecretPattern.test(variable)) {
      errors.push(issue("wasm-wasi.environment-vault", "WASI environment variables must be vault references."));
    }
  }
  return {
    mode: ["empty", "vault-references-only"].includes(mode) ? mode : "blocked",
    variables: variables.map((value) => (value.startsWith("vault:") ? redactText(value) : "blocked"))
  };
}

function reviewArtifacts(artifacts = {}, errors) {
  const outputPaths = Array.isArray(artifacts.outputPaths) ? artifacts.outputPaths.map(String) : [];
  if (artifacts.contract !== "agentique.artifactContract.v1") {
    errors.push(issue("wasm-wasi.artifact-contract", "WASM artifacts require the Agentique artifact contract."));
  }
  if (artifacts.cleanupRequired !== true || artifacts.cleanupReceiptRequired !== true) {
    errors.push(issue("wasm-wasi.cleanup-required", "WASM sandbox cleanup and cleanup receipt are required."));
  }
  if (artifacts.redaction !== "required") {
    errors.push(issue("wasm-wasi.artifact-redaction", "WASM artifact and log redaction is required."));
  }
  if (outputPaths.length === 0 || outputPaths.some((outputPath) => !/^(artifacts|logs|outputs)\/[A-Za-z0-9._/-]+$/u.test(outputPath) || outputPath.includes(".."))) {
    errors.push(issue("wasm-wasi.artifact-path", "WASM artifact output paths must be bounded relative paths."));
  }
  return {
    contract: redactText(String(artifacts.contract ?? "")),
    outputPaths: outputPaths.filter((outputPath) => /^(artifacts|logs|outputs)\/[A-Za-z0-9._/-]+$/u.test(outputPath) && !outputPath.includes("..")),
    cleanupRequired: artifacts.cleanupRequired === true,
    cleanupReceiptRequired: artifacts.cleanupReceiptRequired === true,
    redaction: artifacts.redaction === "required" ? "required" : "blocked",
    cleanupStatus: artifacts.cleanupRequired === true && artifacts.cleanupReceiptRequired === true ? "ready" : "blocked"
  };
}

function reviewPermissions(request, runId, options, errors) {
  const store = request?.permissionStore;
  if (!store || store.runId !== runId) {
    errors.push(issue("wasm-wasi.permission-run", "WASM permission grants must be scoped to the sandbox run."));
  }
  const requirements = Array.isArray(request?.permissionRequirements) ? request.permissionRequirements : [];
  if (requirements.length === 0) {
    errors.push(issue("wasm-wasi.permission-requirements", "WASM sandbox preflight requires explicit permission requirements."));
  }
  const preflight = evaluateRunStartGrants(store, requirements, { now: options.now ?? "2026-06-12T00:00:00.000Z" });
  if (!preflight.ok) {
    errors.push(issue("wasm-wasi.permission-preflight", "WASM sandbox permission preflight failed."));
  }
  return {
    status: preflight.status,
    decisions: preflight.decisions.map((decision) => ({
      family: decision.family,
      action: decision.action,
      target: decision.target,
      status: decision.status,
      code: decision.code
    })),
    auditEvents: preflight.audit?.events?.length ?? 0
  };
}

function reviewClaims(claims = {}, errors) {
  const normalized = {
    wasmExecutionAvailable: claims.wasmExecutionAvailable === true,
    universalWasmRuntime: claims.universalWasmRuntime === true,
    productionDesktopRuntime: claims.productionDesktopRuntime === true,
    installerUpdater: claims.installerUpdater === true,
    automaticExecution: claims.automaticExecution === true,
    ambientHostAccess: claims.ambientHostAccess === true
  };
  for (const [claim, value] of Object.entries(normalized)) {
    if (value === true) {
      errors.push(issue("wasm-wasi.unsupported-claim", `${claim} is not supported by the WASM/WASI sandbox gate.`));
    }
  }
  return normalized;
}

function sanitizeId(value, fieldName, errors) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u.test(text) || text.includes("..") || text.includes("/") || text.includes("\\") || text.includes(":")) {
    errors.push(issue("wasm-wasi.invalid-id", `${fieldName} must be an opaque id.`));
    return "blocked";
  }
  return text;
}

function sanitizeAdapterId(value, errors) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u.test(text) || !text.startsWith("adapter.")) {
    errors.push(issue("wasm-wasi.adapter-id", "WASM adapter id must be an opaque adapter id."));
    return "blocked";
  }
  return text;
}

function boundedByteLimit(value, max) {
  return Number.isInteger(value) && value > 0 && value <= max;
}

function issue(code, message) {
  return Object.assign(new Error(redactText(message)), { code });
}
