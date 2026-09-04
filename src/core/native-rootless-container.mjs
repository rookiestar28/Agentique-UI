const imageDigest = "sha256:b18992999dbe963a45a8a4da40ac2b1975be1a776d939d098c647482bcad5cba";
const imageReference = `docker.io/library/python@${imageDigest}`;
const imageId = "sha256:7e666cfcc7bd4c47b26b7a5ec0116d80e9bc5415ea06c0dc0bd117a50e9fa6c6";
const configuredEnvironment = Object.freeze([
  "PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  "LANG=C.UTF-8",
  "GPG_KEY=A035C8C19219BA821ECEA86B64E628F8D684696D",
  "PYTHON_VERSION=3.11.15",
  "PYTHON_SHA256=272179ddd9a2e41a0fc8e42e33dfbdca0b3711aa5abf372d3f2d51543d09b625"
]);
const allowedRequestFields = Object.freeze(["resourceId", "sessionId", "runId", "commandId", "adapterId", "approvalId", "permissionProfileId", "permissionGrantId"]);
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

export const sampleNativeRootlessContainer = Object.freeze({
  schemaVersion: "agentique.nativeRootlessContainer.v1",
  adapterId: "adapter.local-container",
  permissionProfileId: "permission.local-container.rootless",
  runtimePreference: Object.freeze([Object.freeze({ kind: "podman", executable: "/usr/bin/podman" }), Object.freeze({ kind: "docker", executable: "/usr/bin/docker" })]),
  image: Object.freeze({
    reference: imageReference,
    digest: imageDigest,
    id: imageId,
    configuredEnvironment,
    pullPolicy: "never",
    preprovisioned: true,
    provenanceRequired: true,
    sbomRequired: true,
    revocationCheckRequired: true
  }),
  command: Object.freeze(["python", "--version"]),
  expected: Object.freeze({ exitCode: 0, stdout: "Python 3.11.15" }),
  sandbox: Object.freeze({
    network: "none",
    readOnlyRoot: true,
    capabilities: Object.freeze([]),
    noNewPrivileges: true,
    user: "65532:65532",
    pidNamespace: "private",
    ipcNamespace: "private",
    cgroupNamespace: "private",
    devices: Object.freeze([]),
    ports: Object.freeze([]),
    workdir: "/workspace"
  }),
  resources: Object.freeze({
    memoryBytes: 67_108_864,
    memorySwapBytes: 67_108_864,
    cpus: 0.5,
    pids: 32,
    maxOutputBytes: 65_536,
    runTimeoutSeconds: 30,
    stopGraceSeconds: 2,
    cleanupTimeoutSeconds: 10
  }),
  mounts: Object.freeze([]),
  environment: Object.freeze([]),
  requestFields: allowedRequestFields,
  evidence: Object.freeze({
    outputs: Object.freeze(["outputs/container-result.json"]),
    artifacts: Object.freeze(["artifacts/container-result.json"]),
    rootRef: "native-rootless-container-runner",
    atomic: true,
    redacted: true,
    pathNeutral: true,
    sha256Bound: true,
    cleanupRequiredForTerminal: true
  }),
  nativeCommands,
  tauriCapabilities: Object.freeze(["core:event:allow-listen", "core:event:allow-unlisten"]),
  platforms: Object.freeze({
    linux: Object.freeze({ executable: true, hostProof: "pending" }),
    windows: Object.freeze({ executable: false, failClosed: true }),
    macos: Object.freeze({ verified: false, skipped: true, supported: false })
  }),
  productEffects: Object.freeze({
    installRuntime: false,
    startDaemon: false,
    mutateContext: false,
    pullImage: false,
    buildImage: false,
    importImage: false,
    registryLogin: false
  }),
  claims: Object.freeze({
    genericContainers: false,
    windowsContainerExecution: false,
    macosContainerExecution: false,
    productionReady: false,
    released: false,
    published: false,
    deployed: false,
    liveHost: false
  })
});

/** @param {{ runtime?: string, containerName?: string }} [input] */
export function buildFixedContainerRunArgs(input = {}) {
  const { runtime, containerName } = input;
  if (!new Set(["docker", "podman"]).has(runtime)) {
    throw issue("native-container.runtime", "Container runtime is not in the fixed native allowlist.");
  }
  if (!/^agentique-[a-f0-9]{16}$/u.test(containerName ?? "")) {
    throw issue("native-container.name", "Product-owned container name is invalid.");
  }
  return Object.freeze([
    "run",
    "--rm",
    "--pull=never",
    `--name=${containerName}`,
    "--label=com.agentique.fixed-rootless=true",
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--user=65532:65532",
    // CRITICAL: Docker's private PID namespace is the no-flag default; the
    // Podman spelling makes Docker reject the run before container creation.
    ...(runtime === "podman" ? ["--pid=private"] : []),
    "--ipc=private",
    "--cgroupns=private",
    "--memory=64m",
    "--memory-swap=64m",
    "--cpus=0.5",
    "--pids-limit=32",
    "--workdir=/workspace",
    imageId,
    "python",
    "--version"
  ]);
}

/** @param {{ runtime?: string, uid?: number }} [input] */
export function buildMinimalRootlessEnvironment(input = {}) {
  const { runtime, uid } = input;
  if (!Number.isSafeInteger(uid) || uid <= 0) throw issue("native-container.uid", "Rootless uid must be a positive integer.");
  const runtimeDir = `/run/user/${uid}`;
  if (runtime === "docker") {
    return Object.freeze({ XDG_RUNTIME_DIR: runtimeDir, DOCKER_HOST: `unix://${runtimeDir}/docker.sock` });
  }
  if (runtime === "podman") {
    return Object.freeze({ XDG_RUNTIME_DIR: runtimeDir, CONTAINER_HOST: `unix://${runtimeDir}/podman/podman.sock` });
  }
  throw issue("native-container.runtime", "Container runtime is not in the fixed native allowlist.");
}

export function reviewRootlessRuntimeProbe(input) {
  const errors = [];
  const runtime = input?.runtime;
  const uid = input?.uid;
  if (!new Set(["docker", "podman"]).has(runtime)) errors.push(issue("native-container.probe-runtime", "Runtime kind is not allowlisted."));
  if (!Number.isSafeInteger(uid) || uid <= 0) errors.push(issue("native-container.probe-uid", "Rootless runtime uid is invalid."));
  const expectedExecutable = runtime === "podman" ? "/usr/bin/podman" : "/usr/bin/docker";
  const expectedSocket = runtime === "podman" ? `/run/user/${uid}/podman/podman.sock` : `/run/user/${uid}/docker.sock`;
  if (input?.executable !== expectedExecutable) errors.push(issue("native-container.probe-executable", "Runtime executable is not the native fixed path."));
  if (input?.socketPath !== expectedSocket) errors.push(issue("native-container.probe-socket", "Runtime socket is not the fixed user-scoped Unix socket."));
  if (!input?.info || typeof input.info !== "object") {
    errors.push(issue("native-container.probe-info", "Runtime info must be machine-readable JSON."));
  } else if (runtime === "docker") {
    reviewDockerProbe(input.info, errors);
  } else if (runtime === "podman") {
    reviewPodmanProbe(input.info, expectedSocket, errors);
  }
  return Object.freeze({
    ok: errors.length === 0,
    errors,
    summary: Object.freeze({ runtime, executable: input?.executable, socketPath: input?.socketPath, rootless: errors.length === 0 })
  });
}

export function reviewNativeRootlessContainer(input) {
  const errors = [];
  if (!input || typeof input !== "object") return failed("native-container.input", "Container evidence must be an object.");
  requireEqual(input.schemaVersion, "agentique.nativeRootlessContainer.v1", "schema", errors);
  requireEqual(input.adapterId, "adapter.local-container", "adapter", errors);
  requireEqual(input.permissionProfileId, "permission.local-container.rootless", "permission-profile", errors);
  requireArrayEqual(
    input.runtimePreference,
    [
      { kind: "podman", executable: "/usr/bin/podman" },
      { kind: "docker", executable: "/usr/bin/docker" }
    ],
    "runtime-preference",
    errors
  );
  for (const [field, expected] of Object.entries({
    reference: imageReference,
    digest: imageDigest,
    id: imageId,
    pullPolicy: "never",
    preprovisioned: true,
    provenanceRequired: true,
    sbomRequired: true,
    revocationCheckRequired: true
  }))
    requireEqual(input.image?.[field], expected, `image-${field}`, errors);
  requireArrayEqual(input.image?.configuredEnvironment, configuredEnvironment, "image-configured-environment", errors);
  requireArrayEqual(input.command, ["python", "--version"], "command", errors);
  requireEqual(input.expected?.exitCode, 0, "expected-exit", errors);
  requireEqual(input.expected?.stdout, "Python 3.11.15", "expected-stdout", errors);
  for (const [field, expected] of Object.entries({
    network: "none",
    readOnlyRoot: true,
    noNewPrivileges: true,
    user: "65532:65532",
    pidNamespace: "private",
    ipcNamespace: "private",
    cgroupNamespace: "private",
    workdir: "/workspace"
  }))
    requireEqual(input.sandbox?.[field], expected, `sandbox-${field}`, errors);
  for (const field of ["capabilities", "devices", "ports"]) requireArrayEqual(input.sandbox?.[field], [], `sandbox-${field}`, errors);
  for (const [field, expected] of Object.entries({
    memoryBytes: 67_108_864,
    memorySwapBytes: 67_108_864,
    cpus: 0.5,
    pids: 32,
    maxOutputBytes: 65_536,
    runTimeoutSeconds: 30,
    stopGraceSeconds: 2,
    cleanupTimeoutSeconds: 10
  }))
    requireEqual(input.resources?.[field], expected, `resources-${field}`, errors);
  requireArrayEqual(input.mounts, [], "mounts", errors);
  requireArrayEqual(input.environment, [], "environment", errors);
  requireArrayEqual(input.requestFields, allowedRequestFields, "request-fields", errors);
  requireArrayEqual(input.evidence?.outputs, ["outputs/container-result.json"], "outputs", errors);
  requireArrayEqual(input.evidence?.artifacts, ["artifacts/container-result.json"], "artifacts", errors);
  requireEqual(input.evidence?.rootRef, "native-rootless-container-runner", "root-ref", errors);
  for (const field of ["atomic", "redacted", "pathNeutral", "sha256Bound", "cleanupRequiredForTerminal"]) requireEqual(input.evidence?.[field], true, `evidence-${field}`, errors);
  requireArrayEqual(input.nativeCommands, nativeCommands, "native-commands", errors);
  requireArrayEqual(input.tauriCapabilities, ["core:event:allow-listen", "core:event:allow-unlisten"], "tauri-capabilities", errors);
  requireEqual(input.platforms?.linux?.executable, true, "linux-executable", errors);
  requireEqual(input.platforms?.linux?.hostProof, "pending", "linux-host-proof", errors);
  requireEqual(input.platforms?.windows?.executable, false, "windows-executable", errors);
  requireEqual(input.platforms?.windows?.failClosed, true, "windows-fail-closed", errors);
  requireEqual(input.platforms?.macos?.verified, false, "macos-verified", errors);
  requireEqual(input.platforms?.macos?.skipped, true, "macos-skipped", errors);
  requireEqual(input.platforms?.macos?.supported, false, "macos-supported", errors);
  for (const field of ["installRuntime", "startDaemon", "mutateContext", "pullImage", "buildImage", "importImage", "registryLogin"])
    requireEqual(input.productEffects?.[field], false, `effect-${field}`, errors);
  for (const field of ["genericContainers", "windowsContainerExecution", "macosContainerExecution", "productionReady", "released", "published", "deployed", "liveHost"])
    requireEqual(input.claims?.[field], false, `claim-${field}`, errors);
  return Object.freeze({
    ok: errors.length === 0,
    errors,
    summary: Object.freeze({
      adapterId: input.adapterId,
      permissionProfileId: input.permissionProfileId,
      imageDigest: input.image?.digest,
      mounts: Array.isArray(input.mounts) ? input.mounts.length : -1,
      environmentEntries: Array.isArray(input.environment) ? input.environment.length : -1,
      nativeCommands: Array.isArray(input.nativeCommands) ? input.nativeCommands.length : -1,
      tauriCapabilities: Array.isArray(input.tauriCapabilities) ? input.tauriCapabilities.length : -1,
      linuxHostProof: input.platforms?.linux?.hostProof,
      windowsExecution: input.platforms?.windows?.executable === true,
      macosVerified: input.platforms?.macos?.verified === true
    })
  });
}

function reviewDockerProbe(info, errors) {
  requireEqual(info.OSType, "linux", "probe-docker-os", errors);
  requireEqual(info.CgroupVersion, "2", "probe-docker-cgroup", errors);
  const security = Array.isArray(info.SecurityOptions) ? info.SecurityOptions : [];
  if (!security.some((value) => value === "name=rootless" || value === "rootless"))
    errors.push(issue("native-container.probe-docker-rootless", "Docker info does not explicitly prove rootless mode."));
  if (!security.some((value) => typeof value === "string" && value.includes("seccomp")))
    errors.push(issue("native-container.probe-docker-seccomp", "Docker info does not prove seccomp."));
  if (typeof info.DockerRootDir !== "string" || !/^\/home\/[^/]+\/\.local\/share\/docker$/u.test(info.DockerRootDir))
    errors.push(issue("native-container.probe-docker-storage", "Docker storage is not user-scoped."));
}

function reviewPodmanProbe(info, expectedSocket, errors) {
  requireEqual(info.host?.security?.rootless, true, "probe-podman-rootless", errors);
  requireEqual(info.host?.security?.seccompEnabled, true, "probe-podman-seccomp", errors);
  requireEqual(info.host?.cgroupVersion, "v2", "probe-podman-cgroup", errors);
  requireEqual(info.host?.remoteSocket?.path, expectedSocket, "probe-podman-socket", errors);
  if (typeof info.store?.graphRoot !== "string" || !/^\/home\/[^/]+\/\.local\/share\/containers\/storage$/u.test(info.store.graphRoot))
    errors.push(issue("native-container.probe-podman-storage", "Podman storage is not user-scoped."));
}

function requireEqual(actual, expected, field, errors) {
  if (actual !== expected) errors.push(issue(`native-container.${field}`, `${field} does not match the fixed rootless container contract.`));
}

function requireArrayEqual(actual, expected, field, errors) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected))
    errors.push(issue(`native-container.${field}`, `${field} does not match the fixed rootless container contract.`));
}

function issue(code, message) {
  return Object.freeze({ code, message });
}

function failed(code, message) {
  return Object.freeze({ ok: false, errors: [issue(code, message)], summary: Object.freeze({}) });
}
