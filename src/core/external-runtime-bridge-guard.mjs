import { createPermissionGrantStore, evaluateRunStartGrants } from "./permission-grants.mjs";
import { assertNoInlineSecrets, redactText, sanitizeForExport } from "./secret-vault.mjs";

const schemaVersion = "agentique.externalRuntimeBridgeGuard.v1";
const loopbackHosts = new Set(["127.0.0.1", "localhost"]);
const allowedSources = new Set(["explicit-user-action"]);
const blockedAutoStartSources = new Set(["deep-link", "public-readback", "descriptor-view"]);
const unsafePathPattern = /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\)|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u;
const executableCommandPattern = /\b(?:spawn|exec)(?:\s|$)|\b(?:curl|powershell|bash|sh|cmd|npm\s+run|node\s+|python\s+|npx\s+|docker\s+|podman\s+)/iu;
const rawAuthPattern = /(bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|ya29\.)/iu;

export const sampleExternalBridgePermissionStore = createPermissionGrantStore({
  runId: "run.bridge.001",
  grants: [
    { id: "grant.bridge.network", family: "network", targets: ["http://127.0.0.1:49153"] },
    { id: "grant.bridge.external", family: "externalProviders", targets: ["vault:externalRuntimeCredential"] }
  ]
}, { now: "2026-06-12T00:00:00.000Z" });

export const sampleExternalBridgeRequest = Object.freeze({
  bridgeId: "bridge.n8n.local",
  runId: "run.bridge.001",
  source: "explicit-user-action",
  userOptIn: true,
  target: "n8n",
  network: {
    mode: "localhost-only",
    bindHost: "127.0.0.1",
    port: 49153,
    auth: "per-launch-token",
    authMaterialRef: "ephemeral:bridge-token",
    allowedHosts: ["127.0.0.1", "localhost"]
  },
  payload: {
    schemaVersion: "agentique.externalBridgeDescriptor.v1",
    descriptorOnly: true,
    target: "n8n",
    workflowId: "scheduler-branch-merge-flow",
    handoffMode: "user-owned-runtime"
  },
  permissionStore: sampleExternalBridgePermissionStore,
  permissionRequirements: [
    { family: "network", action: "connect", target: "http://127.0.0.1:49153/health" },
    { family: "externalProviders", action: "connect", target: "vault:externalRuntimeCredential" }
  ],
  shutdown: {
    required: true,
    mode: "graceful",
    timeoutMs: 5000,
    userVisible: true
  },
  cleanup: {
    required: true,
    receiptRequired: true,
    removes: ["bridge descriptor", "ephemeral auth token"]
  }
});

export function createExternalBridgeReview(request = sampleExternalBridgeRequest, options = {}) {
  const errors = [];
  const source = String(request?.source ?? "");
  const runId = sanitizeId(request?.runId ?? "run.bridge.001", "runId", errors);
  const bridgeId = sanitizeId(request?.bridgeId ?? "bridge.local", "bridgeId", errors);

  if (!allowedSources.has(source)) {
    errors.push(issue(blockedAutoStartSources.has(source) ? "external-bridge.autostart-source" : "external-bridge.source", "Bridge launch must originate from explicit user action."));
  }
  if (request?.userOptIn !== true) {
    errors.push(issue("external-bridge.opt-in", "Bridge launch requires explicit user opt-in."));
  }

  const network = reviewNetwork(request?.network, errors);
  const payload = reviewPayload(request?.payload, errors);
  const permissions = reviewPermissions(request, runId, options, errors);
  const shutdown = reviewShutdown(request?.shutdown, errors);
  const cleanup = reviewCleanup(request?.cleanup, errors);
  const ok = errors.length === 0;

  return sanitizeForExport({
    schemaVersion,
    ok,
    status: ok ? "approved" : "blocked",
    approvedForLaunch: ok,
    startsBridge: false,
    bridgeId,
    runId,
    source: redactText(source),
    target: redactText(String(request?.target ?? "unknown")),
    network,
    payload,
    permissions,
    shutdown,
    cleanup,
    userActions: ok
      ? ["Review bridge descriptor.", "Confirm user-owned runtime is ready.", "Launch through approved native boundary.", "Use shutdown control before cleanup."]
      : ["Resolve bridge guard blockers before launch."],
    errors: errors.map((error) => ({ code: error.code, message: redactText(error.message) }))
  });
}

export function assertExternalBridgePayloadSafe(payload) {
  assertNoInlineSecrets(payload);
  const text = JSON.stringify(payload ?? {});
  if (unsafePathPattern.test(text)) {
    throw issue("external-bridge.unsafe-path", "Bridge descriptor payload contains local path material.");
  }
  if (executableCommandPattern.test(text)) {
    throw issue("external-bridge.command-payload", "Bridge descriptor payload must not contain executable commands.");
  }
  if (rawAuthPattern.test(text)) {
    throw issue("external-bridge.raw-auth", "Bridge descriptor payload must not contain raw auth material.");
  }
  if (text.includes([".", "planning"].join("")) || text.includes(["reference", "docs"].join("/"))) {
    throw issue("external-bridge.private-marker", "Bridge descriptor payload contains private planning material.");
  }
  for (const value of collectStrings(payload)) {
    if (looksLikeUrl(value) && !isLoopbackUrl(value)) {
      throw issue("external-bridge.hidden-network", "Bridge descriptor payload must not contain hidden non-loopback network targets.");
    }
  }
  return true;
}

export function reviewExternalBridgeGuard() {
  const approved = createExternalBridgeReview();
  const deepLink = createExternalBridgeReview({ ...sampleExternalBridgeRequest, source: "deep-link" });
  const publicBind = createExternalBridgeReview({
    ...sampleExternalBridgeRequest,
    network: { ...sampleExternalBridgeRequest.network, bindHost: "0.0.0.0" }
  });
  const unsafePayload = createExternalBridgeReview({
    ...sampleExternalBridgeRequest,
    payload: { ...sampleExternalBridgeRequest.payload, command: "npm run external-runtime" }
  });
  return {
    schemaVersion: "agentique.externalRuntimeBridgeGuardReview.v1",
    ok: approved.ok && !deepLink.ok && !publicBind.ok && !unsafePayload.ok,
    approvedStatus: approved.status,
    blockedSources: deepLink.errors.map((error) => error.code),
    publicBindBlocked: publicBind.errors.some((error) => error.code === "external-bridge.public-bind"),
    unsafePayloadBlocked: unsafePayload.errors.some((error) => error.code === "external-bridge.command-payload"),
    summary: {
      startsBridge: approved.startsBridge,
      permissionStatus: approved.permissions.status,
      cleanup: approved.cleanup.status
    }
  };
}

function reviewNetwork(network = {}, errors) {
  const bindHost = String(network.bindHost ?? "");
  const port = Number(network.port);
  const allowedHosts = Array.isArray(network.allowedHosts) ? network.allowedHosts.map((host) => String(host)) : [];
  if (network.mode !== "localhost-only") {
    errors.push(issue("external-bridge.network-mode", "Bridge network mode must be localhost-only."));
  }
  if (!loopbackHosts.has(bindHost)) {
    errors.push(issue("external-bridge.public-bind", "Bridge bind host must be localhost or 127.0.0.1."));
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    errors.push(issue("external-bridge.port", "Bridge port must be an unprivileged local TCP port."));
  }
  if (network.auth !== "per-launch-token") {
    errors.push(issue("external-bridge.auth", "Bridge requires per-launch authentication."));
  }
  if (typeof network.authMaterialRef !== "string" || !network.authMaterialRef.startsWith("ephemeral:")) {
    errors.push(issue("external-bridge.auth-material", "Bridge auth material must be ephemeral and referenced, not embedded."));
  }
  if (rawAuthPattern.test(String(network.authMaterialRef ?? ""))) {
    errors.push(issue("external-bridge.raw-auth", "Bridge auth material must not expose raw tokens."));
  }
  if (allowedHosts.length === 0 || allowedHosts.some((host) => !loopbackHosts.has(host))) {
    errors.push(issue("external-bridge.host-allowlist", "Bridge allowed hosts must be loopback-only."));
  }
  return {
    mode: redactText(String(network.mode ?? "missing")),
    bindHost: loopbackHosts.has(bindHost) ? bindHost : "blocked",
    port: Number.isInteger(port) ? port : "blocked",
    auth: network.auth === "per-launch-token" ? "per-launch-token" : "blocked",
    authMaterial: "redacted:ephemeral-reference",
    allowedHosts: allowedHosts.filter((host) => loopbackHosts.has(host))
  };
}

function reviewPayload(payload, errors) {
  try {
    assertExternalBridgePayloadSafe(payload);
  } catch (error) {
    const code = String(error.code ?? "");
    errors.push(issue(code.startsWith("external-bridge.") ? code : "external-bridge.payload-secret", error.message));
  }
  return {
    safe: errors.every((error) => !error.code.startsWith("external-bridge.") || !["external-bridge.unsafe-path", "external-bridge.command-payload", "external-bridge.raw-auth", "external-bridge.private-marker", "external-bridge.hidden-network"].includes(error.code)),
    descriptorOnly: payload?.descriptorOnly === true,
    schemaVersion: redactText(String(payload?.schemaVersion ?? "missing")),
    summary: redactText(String(payload?.target ?? "unknown"))
  };
}

function reviewPermissions(request, runId, options, errors) {
  const store = request?.permissionStore;
  if (!store || store.runId !== runId) {
    errors.push(issue("external-bridge.permission-run", "Permission grants must be scoped to the bridge run."));
  }
  const requirements = Array.isArray(request?.permissionRequirements) ? request.permissionRequirements : [];
  if (requirements.length === 0) {
    errors.push(issue("external-bridge.permission-requirements", "Bridge launch requires explicit permission requirements."));
  }
  const preflight = evaluateRunStartGrants(store, requirements, { now: options.now ?? "2026-06-12T00:00:00.000Z" });
  if (!preflight.ok) {
    errors.push(issue("external-bridge.permission-preflight", "Bridge permission preflight failed."));
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

function reviewShutdown(shutdown = {}, errors) {
  if (shutdown.required !== true || shutdown.userVisible !== true) {
    errors.push(issue("external-bridge.shutdown-required", "Bridge shutdown must be required and user-visible."));
  }
  if (!["graceful", "user-controlled"].includes(shutdown.mode)) {
    errors.push(issue("external-bridge.shutdown-mode", "Bridge shutdown mode must be graceful or user-controlled."));
  }
  const timeoutMs = Number(shutdown.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    errors.push(issue("external-bridge.shutdown-timeout", "Bridge shutdown timeout must be bounded."));
  }
  return {
    required: shutdown.required === true,
    userVisible: shutdown.userVisible === true,
    mode: ["graceful", "user-controlled"].includes(shutdown.mode) ? shutdown.mode : "blocked",
    timeoutMs: Number.isInteger(timeoutMs) ? timeoutMs : "blocked",
    status: shutdown.required === true && shutdown.userVisible === true ? "ready" : "blocked"
  };
}

function reviewCleanup(cleanup = {}, errors) {
  const removes = Array.isArray(cleanup.removes) ? cleanup.removes.map((entry) => redactText(String(entry))) : [];
  if (cleanup.required !== true || cleanup.receiptRequired !== true) {
    errors.push(issue("external-bridge.cleanup-required", "Bridge cleanup and receipt are required."));
  }
  if (removes.length === 0 || removes.some((entry) => unsafePathPattern.test(entry))) {
    errors.push(issue("external-bridge.cleanup-scope", "Bridge cleanup scope must be explicit and path-free."));
  }
  return {
    required: cleanup.required === true,
    receiptRequired: cleanup.receiptRequired === true,
    removes,
    status: cleanup.required === true && cleanup.receiptRequired === true && removes.length > 0 ? "ready" : "blocked"
  };
}

function collectStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, output);
    return output;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectStrings(entry, output);
  }
  return output;
}

function looksLikeUrl(value) {
  return /^https?:\/\//iu.test(String(value));
}

function isLoopbackUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" && loopbackHosts.has(parsed.hostname);
  } catch {
    return false;
  }
}

function sanitizeId(value, fieldName, errors) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u.test(text) || text.includes("..") || text.includes("/") || text.includes("\\") || text.includes(":")) {
    errors.push(issue("external-bridge.invalid-id", `${fieldName} must be an opaque id.`));
    return "blocked";
  }
  return text;
}

function issue(code, message) {
  const error = new Error(redactText(message));
  error.code = code;
  return error;
}
