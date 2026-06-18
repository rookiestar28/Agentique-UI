import { createPermissionGrantStore, evaluateRunStartGrants } from "./permission-grants.mjs";
import { assertNoInlineSecrets, redactText, sanitizeForExport } from "./secret-vault.mjs";

const schemaVersion = "agentique.rootlessContainerPreflightGate.v1";
const allowedLaneStates = new Set(["disabled", "preflight-only"]);
const supportedRuntimes = new Set(["podman", "docker"]);
const loopbackHosts = new Set(["127.0.0.1", "localhost"]);
const unsafePathPattern = /(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|(?:^|[\s"'(])~[\\/]|\/(?:home|Users|root)(?:\/|$)/u;
const forbiddenMountTargets = new Set(["/", "/host", "/var/run", "/var/run/docker.sock", "/run/podman/podman.sock"]);

export const sampleRootlessContainerPermissionStore = createPermissionGrantStore(
  {
    runId: "run.container.001",
    grants: [
      { id: "grant.container.files", family: "files", targets: ["workspace:containers", "workspace:runs"] },
      { id: "grant.container.adapter", family: "subprocess", targets: ["adapter:adapter.rootless-container"] },
      { id: "grant.container.runtime", family: "containers", targets: ["container:rootless:adapter.rootless-container"] },
      { id: "grant.container.retention", family: "artifactRetention", targets: ["artifact-retention:7d"] }
    ]
  },
  { now: "2026-06-12T00:00:00.000Z" }
);

export const sampleRootlessContainerPreflightRequest = Object.freeze({
  lane: {
    status: "preflight-only",
    startsContainer: false,
    deterministicPreflight: true
  },
  runId: "run.container.001",
  host: {
    platform: "linux",
    runtime: "podman",
    runtimeVersion: "5.2.0",
    rootless: true,
    userNamespace: true,
    daemonMode: "rootless",
    socketScope: "user",
    cgroupMode: "v2",
    security: {
      seccomp: "enabled",
      noNewPrivileges: true
    },
    platformSmoke: {
      status: "passed",
      checks: ["rootless-info", "user-namespace", "network-policy", "cleanup-dry-run"]
    }
  },
  image: {
    reference: `ghcr.io/agentique/adapter-rootless@sha256:${"f".repeat(64)}`,
    digest: "f".repeat(64),
    signature: "verified",
    signer: "agentique-adapter-release",
    provenance: "slsa-provenance",
    sbom: true,
    revocation: "active"
  },
  filesystem: {
    readOnlyRootFilesystem: true,
    privileged: false,
    daemonSocketMounted: false,
    capabilitiesDrop: ["ALL"],
    volumes: [
      { source: "workspace:containers/input", target: "/workspace/input", mode: "ro" },
      { source: "workspace:runs/run.container.001/artifacts", target: "/workspace/output", mode: "rw" }
    ]
  },
  network: {
    mode: "none",
    publish: []
  },
  resources: {
    memoryBytes: 268435456,
    cpus: 1,
    pidsLimit: 128,
    timeoutMs: 60000
  },
  cleanup: {
    removeContainer: true,
    removeAnonymousVolumes: true,
    receiptRequired: true,
    timeoutMs: 15000
  },
  permissionStore: sampleRootlessContainerPermissionStore,
  permissionRequirements: [
    { family: "files", action: "read", target: "workspace:containers/input" },
    { family: "files", action: "write", target: "workspace:runs/run.container.001/artifacts/result.json" },
    { family: "subprocess", action: "preflight", target: "adapter:adapter.rootless-container" },
    { family: "containers", action: "preflight", target: "container:rootless:adapter.rootless-container" },
    { family: "artifactRetention", action: "retain", target: "artifact-retention:7d" }
  ],
  claims: {
    containerExecutionAvailable: false,
    productionDesktopRuntime: false,
    installerUpdater: false,
    automaticExecution: false,
    privilegedHostAccess: false,
    universalContainerRuntime: false
  }
});

export function createRootlessContainerPreflightReview(request = sampleRootlessContainerPreflightRequest, options = {}) {
  const errors = [];
  const runId = sanitizeId(request?.runId ?? "run.container.001", "runId", errors);
  const lane = reviewLane(request?.lane, errors);
  const host = reviewHost(request?.host, errors);
  const image = reviewImage(request?.image, errors);
  const filesystem = reviewFilesystem(request?.filesystem, errors);
  const network = reviewNetwork(request?.network, errors);
  const resources = reviewResources(request?.resources, errors);
  const cleanup = reviewCleanup(request?.cleanup, errors);
  const permissions = reviewPermissions(request, runId, options, errors);
  const claims = reviewClaims(request?.claims, errors);
  const ok = errors.length === 0;

  return sanitizeForExport({
    schemaVersion,
    ok,
    status: ok ? "preflight-ready" : "blocked",
    startsContainer: false,
    executionDecision: "preflight-only-no-container-start",
    runId,
    lane,
    host,
    image,
    filesystem,
    network,
    resources,
    cleanup,
    permissions,
    claims,
    userActions: ok
      ? ["Review rootless runtime evidence.", "Confirm image trust and scoped volumes.", "Keep container start disabled until platform smoke is accepted."]
      : ["Resolve rootless container preflight blockers before enabling any container lane."],
    errors: errors.map((error) => ({ code: error.code, message: redactText(error.message) }))
  });
}

export function assertContainerPolicySafe(policy) {
  assertNoInlineSecrets(policy);
  const errors = [];
  reviewHost(policy?.host, errors);
  reviewImage(policy?.image, errors);
  reviewFilesystem(policy?.filesystem, errors);
  reviewNetwork(policy?.network, errors);
  reviewResources(policy?.resources, errors);
  reviewCleanup(policy?.cleanup, errors);
  reviewClaims(policy?.claims, errors);
  if (errors.length > 0) throw errors[0];
  return true;
}

export function reviewRootlessContainerPreflightGate() {
  const approved = createRootlessContainerPreflightReview();
  const rootful = createRootlessContainerPreflightReview({
    ...sampleRootlessContainerPreflightRequest,
    host: { ...sampleRootlessContainerPreflightRequest.host, rootless: false, daemonMode: "rootful" }
  });
  const untrustedImage = createRootlessContainerPreflightReview({
    ...sampleRootlessContainerPreflightRequest,
    image: { ...sampleRootlessContainerPreflightRequest.image, reference: "ghcr.io/agentique/adapter-rootless:latest", signature: "missing" }
  });
  const broadVolume = createRootlessContainerPreflightReview({
    ...sampleRootlessContainerPreflightRequest,
    filesystem: {
      ...sampleRootlessContainerPreflightRequest.filesystem,
      readOnlyRootFilesystem: false,
      privileged: true,
      volumes: [{ source: "/var/run/docker.sock", target: "/var/run/docker.sock", mode: "rw" }]
    }
  });
  const hostNetwork = createRootlessContainerPreflightReview({
    ...sampleRootlessContainerPreflightRequest,
    network: { mode: "host", publish: [{ host: "0.0.0.0", port: 8080, containerPort: 8080 }] }
  });
  return {
    schemaVersion: "agentique.rootlessContainerPreflightGateReview.v1",
    ok: approved.ok && !rootful.ok && !untrustedImage.ok && !broadVolume.ok && !hostNetwork.ok,
    approvedStatus: approved.status,
    startsContainer: approved.startsContainer,
    rootfulBlocked: rootful.errors.some((error) => error.code === "container.rootless-required"),
    untrustedImageBlocked: untrustedImage.errors.some((error) => error.code === "container.image-signature"),
    broadVolumeBlocked: broadVolume.errors.some((error) => error.code === "container.volume-source"),
    hostNetworkBlocked: hostNetwork.errors.some((error) => error.code === "container.network-mode"),
    summary: {
      runtime: approved.host.runtime,
      permissionStatus: approved.permissions.status,
      cleanup: approved.cleanup.status
    }
  };
}

function reviewLane(lane = {}, errors) {
  const status = String(lane.status ?? "disabled");
  if (!allowedLaneStates.has(status)) {
    errors.push(issue("container.lane-status", "Container lane must be disabled or preflight-only."));
  }
  if (lane.startsContainer === true) {
    errors.push(issue("container.start-disabled", "Container start must remain disabled until runtime evidence is accepted."));
  }
  if (lane.deterministicPreflight !== true) {
    errors.push(issue("container.preflight", "Deterministic container preflight evidence is required."));
  }
  return {
    status: allowedLaneStates.has(status) ? status : "blocked",
    startsContainer: false,
    deterministicPreflight: lane.deterministicPreflight === true
  };
}

function reviewHost(host = {}, errors) {
  if (!supportedRuntimes.has(host.runtime)) {
    errors.push(issue("container.runtime", "Container runtime must be Docker or Podman."));
  }
  if (host.rootless !== true || host.daemonMode !== "rootless") {
    errors.push(issue("container.rootless-required", "Container runtime must be rootless."));
  }
  if (host.userNamespace !== true) {
    errors.push(issue("container.user-namespace", "Rootless container preflight requires a user namespace."));
  }
  if (host.socketScope !== "user") {
    errors.push(issue("container.socket-scope", "Container runtime socket must be user-scoped."));
  }
  if (!["v2", "not-required"].includes(host.cgroupMode)) {
    errors.push(issue("container.cgroup", "Container runtime must report cgroup v2 or an explicit not-required platform state."));
  }
  if (host.security?.seccomp !== "enabled" || host.security?.noNewPrivileges !== true) {
    errors.push(issue("container.security", "Container runtime must enable seccomp and no-new-privileges."));
  }
  const smokeChecks = Array.isArray(host.platformSmoke?.checks) ? host.platformSmoke.checks.map(String) : [];
  for (const required of ["rootless-info", "user-namespace", "network-policy", "cleanup-dry-run"]) {
    if (!smokeChecks.includes(required)) {
      errors.push(issue("container.platform-smoke", "Container platform smoke evidence is incomplete."));
      break;
    }
  }
  if (host.platformSmoke?.status !== "passed") {
    errors.push(issue("container.platform-smoke", "Container platform smoke evidence must pass."));
  }
  return {
    platform: redactText(String(host.platform ?? "")),
    runtime: supportedRuntimes.has(host.runtime) ? host.runtime : "blocked",
    runtimeVersion: redactText(String(host.runtimeVersion ?? "")),
    rootless: host.rootless === true,
    userNamespace: host.userNamespace === true,
    daemonMode: host.daemonMode === "rootless" ? "rootless" : "blocked",
    socketScope: host.socketScope === "user" ? "user" : "blocked",
    cgroupMode: ["v2", "not-required"].includes(host.cgroupMode) ? host.cgroupMode : "blocked",
    security: {
      seccomp: host.security?.seccomp === "enabled" ? "enabled" : "blocked",
      noNewPrivileges: host.security?.noNewPrivileges === true
    },
    platformSmoke: {
      status: host.platformSmoke?.status === "passed" ? "passed" : "blocked",
      checks: smokeChecks
    }
  };
}

function reviewImage(image = {}, errors) {
  const reference = String(image.reference ?? "");
  const digest = String(image.digest ?? "");
  if (!reference.includes("@sha256:") || reference.includes(":latest")) {
    errors.push(issue("container.image-digest", "Container image reference must use an immutable SHA-256 digest and not latest."));
  }
  if (!/^[a-f0-9]{64}$/u.test(digest) || !reference.endsWith(digest)) {
    errors.push(issue("container.image-digest", "Container image digest must be a SHA-256 digest matching the reference."));
  }
  if (image.signature !== "verified" || image.signer !== "agentique-adapter-release") {
    errors.push(issue("container.image-signature", "Container image signature must be verified by a trusted signer."));
  }
  if (!image.provenance || image.sbom !== true) {
    errors.push(issue("container.image-provenance", "Container image provenance and SBOM evidence are required."));
  }
  if (image.revocation !== "active") {
    errors.push(issue("container.image-revocation", "Container image must not be revoked."));
  }
  return {
    reference: reference.includes("@sha256:") ? redactText(reference.replace(/sha256:[a-f0-9]{64}/u, "sha256:redacted-digest")) : "blocked",
    digest: digest.slice(0, 12),
    signature: image.signature === "verified" ? "verified" : "blocked",
    provenance: image.provenance ? redactText(String(image.provenance)) : "blocked",
    sbom: image.sbom === true,
    revocation: image.revocation === "active" ? "active" : "blocked"
  };
}

function reviewFilesystem(filesystem = {}, errors) {
  if (filesystem.readOnlyRootFilesystem !== true) {
    errors.push(issue("container.readonly-root", "Container root filesystem must be read-only."));
  }
  if (filesystem.privileged === true) {
    errors.push(issue("container.privileged", "Privileged containers are blocked."));
  }
  if (filesystem.daemonSocketMounted === true) {
    errors.push(issue("container.daemon-socket", "Container daemon socket mounts are blocked."));
  }
  if (!Array.isArray(filesystem.capabilitiesDrop) || !filesystem.capabilitiesDrop.includes("ALL")) {
    errors.push(issue("container.capabilities", "Container capabilities must be dropped by default."));
  }
  const volumeErrors = [];
  const volumes = Array.isArray(filesystem.volumes) ? filesystem.volumes.map((volume) => reviewVolume(volume, volumeErrors)) : [];
  if (volumes.length === 0) {
    errors.push(issue("container.volume-required", "Container preflight requires explicit scoped volumes."));
  }
  errors.push(...volumeErrors);
  return {
    readOnlyRootFilesystem: filesystem.readOnlyRootFilesystem === true,
    privileged: filesystem.privileged === true,
    daemonSocketMounted: filesystem.daemonSocketMounted === true,
    capabilitiesDrop: Array.isArray(filesystem.capabilitiesDrop) ? filesystem.capabilitiesDrop.map(String) : [],
    volumes
  };
}

function reviewVolume(volume = {}, errors) {
  const source = String(volume.source ?? "");
  const target = String(volume.target ?? "");
  const mode = String(volume.mode ?? "");
  if (!source.startsWith("workspace:") || source === "workspace:" || source.includes("..") || unsafePathPattern.test(source)) {
    errors.push(issue("container.volume-source", "Container volume source must be workspace-scoped and path-safe."));
  }
  if (!target.startsWith("/workspace/") || target.includes("..") || unsafePathPattern.test(target) || forbiddenMountTargets.has(target)) {
    errors.push(issue("container.volume-target", "Container volume target must stay under a bounded workspace path."));
  }
  if (!["ro", "rw"].includes(mode)) {
    errors.push(issue("container.volume-mode", "Container volume mode must be ro or rw."));
  }
  return {
    source: source.startsWith("workspace:") && !unsafePathPattern.test(source) ? redactText(source) : "blocked",
    target: target.startsWith("/workspace/") && !unsafePathPattern.test(target) ? target : "blocked",
    mode: ["ro", "rw"].includes(mode) ? mode : "blocked"
  };
}

function reviewNetwork(network = {}, errors) {
  const mode = String(network.mode ?? "none");
  const publish = Array.isArray(network.publish) ? network.publish : [];
  if (!["none", "loopback-only"].includes(mode)) {
    errors.push(issue("container.network-mode", "Container network must be none or loopback-only."));
  }
  if (mode === "none" && publish.length > 0) {
    errors.push(issue("container.network-publish", "Container network none cannot publish ports."));
  }
  const normalized = [];
  for (const entry of publish) {
    const host = String(entry.host ?? "");
    const port = Number(entry.port);
    const containerPort = Number(entry.containerPort);
    if (!loopbackHosts.has(host) || !validPort(port) || !validPort(containerPort)) {
      errors.push(issue("container.network-loopback", "Published container ports must bind to loopback only."));
    } else {
      normalized.push({ host, port, containerPort });
    }
  }
  return {
    mode: ["none", "loopback-only"].includes(mode) ? mode : "blocked",
    publish: normalized
  };
}

function reviewResources(resources = {}, errors) {
  const memoryBytes = Number(resources.memoryBytes);
  const cpus = Number(resources.cpus);
  const pidsLimit = Number(resources.pidsLimit);
  const timeoutMs = Number(resources.timeoutMs);
  if (!Number.isInteger(memoryBytes) || memoryBytes <= 0 || memoryBytes > 1073741824) {
    errors.push(issue("container.memory-limit", "Container memory limit must be positive and bounded."));
  }
  if (!Number.isFinite(cpus) || cpus <= 0 || cpus > 4) {
    errors.push(issue("container.cpu-limit", "Container CPU limit must be positive and bounded."));
  }
  if (!Number.isInteger(pidsLimit) || pidsLimit <= 0 || pidsLimit > 512) {
    errors.push(issue("container.pids-limit", "Container PID limit must be positive and bounded."));
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) {
    errors.push(issue("container.timeout", "Container timeout must be bounded."));
  }
  return { memoryBytes, cpus, pidsLimit, timeoutMs };
}

function reviewCleanup(cleanup = {}, errors) {
  const timeoutMs = Number(cleanup.timeoutMs);
  if (cleanup.removeContainer !== true || cleanup.removeAnonymousVolumes !== true || cleanup.receiptRequired !== true) {
    errors.push(issue("container.cleanup-required", "Container cleanup and cleanup receipt are required."));
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
    errors.push(issue("container.cleanup-timeout", "Container cleanup timeout must be bounded."));
  }
  return {
    removeContainer: cleanup.removeContainer === true,
    removeAnonymousVolumes: cleanup.removeAnonymousVolumes === true,
    receiptRequired: cleanup.receiptRequired === true,
    timeoutMs,
    status: cleanup.removeContainer === true && cleanup.removeAnonymousVolumes === true && cleanup.receiptRequired === true ? "ready" : "blocked"
  };
}

function reviewPermissions(request, runId, options, errors) {
  const store = request?.permissionStore;
  if (!store || store.runId !== runId) {
    errors.push(issue("container.permission-run", "Container permission grants must be scoped to the preflight run."));
  }
  const requirements = Array.isArray(request?.permissionRequirements) ? request.permissionRequirements : [];
  if (requirements.length === 0) {
    errors.push(issue("container.permission-requirements", "Container preflight requires explicit permission requirements."));
  }
  const preflight = evaluateRunStartGrants(store, requirements, { now: options.now ?? "2026-06-12T00:00:00.000Z" });
  if (!preflight.ok) {
    errors.push(issue("container.permission-preflight", "Container permission preflight failed."));
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
    containerExecutionAvailable: claims.containerExecutionAvailable === true,
    productionDesktopRuntime: claims.productionDesktopRuntime === true,
    installerUpdater: claims.installerUpdater === true,
    automaticExecution: claims.automaticExecution === true,
    privilegedHostAccess: claims.privilegedHostAccess === true,
    universalContainerRuntime: claims.universalContainerRuntime === true
  };
  for (const [claim, value] of Object.entries(normalized)) {
    if (value === true) {
      errors.push(issue("container.unsupported-claim", `${claim} is not supported by the rootless container preflight gate.`));
    }
  }
  return normalized;
}

function sanitizeId(value, fieldName, errors) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u.test(text) || text.includes("..") || text.includes("/") || text.includes("\\") || text.includes(":")) {
    errors.push(issue("container.invalid-id", `${fieldName} must be an opaque id.`));
    return "blocked";
  }
  return text;
}

function validPort(value) {
  return Number.isInteger(value) && value >= 1024 && value <= 65535;
}

function issue(code, message) {
  return Object.assign(new Error(redactText(message)), { code });
}
