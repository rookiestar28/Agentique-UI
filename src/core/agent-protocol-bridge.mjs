import { createRunAddress, createRunProtocolConsumer, createRunProtocolProducer, validateRunProtocolEvent } from "./run-protocol.mjs";
import { sha256HexSync } from "./sha256-sync.mjs";

export const agentProtocolBridgeSchemaVersion = "agentique.agentProtocolBridge.v1";
export const agentExtensionDescriptorSchemaVersion = "agentique.agentExtensionDescriptor.v1";
export const agentPermissionReceiptSchemaVersion = "agentique.agentPermissionReceipt.v1";

export const agentProtocolBridgeOperations = Object.freeze(["initialize", "permission", "prepare", "start", "cancel", "event", "artifact", "cleanup"]);
export const allowedAgentBridgeCapabilities = Object.freeze(["runner.fixed-python", "runner.fixed-node", "run.events", "run.artifacts", "run.cleanup"]);

export const sampleAgentBridgeAddress = Object.freeze(
  createRunAddress({
    productScopeId: "product.agentique-ui",
    sessionId: "session.bridge-demo",
    resourceId: "resource.bridge-demo",
    runId: "run.bridge-demo"
  })
);

const operationSet = new Set(agentProtocolBridgeOperations);
const capabilitySet = new Set(allowedAgentBridgeCapabilities);
const runnerCapabilitySet = new Set(["runner.fixed-python", "runner.fixed-node"]);
const trustedSignerSet = new Set(["agentique-extension-release"]);
const tokenPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|[._:-](?=[A-Za-z0-9])){0,127}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const maxMessageBytes = 16384;
const maxArtifactBytes = 64 * 1024 * 1024;
const unsafeTextPattern = new RegExp(
  String.raw`(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|(?:^|[\\/])\.${["plan", "ning"].join("")}(?:[\\/]|$)|(?:^|[\\/])reference(?:[\\/]|$)|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|cookie\s*=|client_secret|access_token|refresh_token|authorization\s*:`,
  "iu"
);

const deniedAuthority = Object.freeze({
  genericShell: false,
  genericProcess: false,
  subprocessSelection: false,
  packageLifecycle: false,
  ambientEnvironment: false,
  browserData: false,
  broadFilesystem: false,
  broadNetwork: false,
  containers: false,
  externalProviders: false,
  sidecars: false
});

const hostOperationByProtocolOperation = Object.freeze({
  prepare: "prepare-fixed-run",
  start: "start-fixed-run",
  cancel: "cancel-fixed-run",
  event: "observe-run",
  cleanup: "finalize-cleanup"
});

export function createSampleAgentExtensionDescriptor(overrides = {}) {
  const descriptor = {
    schemaVersion: agentExtensionDescriptorSchemaVersion,
    extensionId: "extension.agent-protocol-demo",
    version: "1.0.0",
    digest: "a".repeat(64),
    signature: "verified",
    signer: "agentique-extension-release",
    reviewStatus: "accepted",
    revoked: false,
    host: "agentique-ui",
    driftStatus: "in-sync",
    capabilities: [...allowedAgentBridgeCapabilities],
    authority: { ...deniedAuthority },
    ...structuredClone(overrides)
  };
  return freeze(descriptor);
}

/** @param {{ descriptor?: any, bridgeSessionId?: string, address?: any, now?: string }} [options] */
export function createSampleAgentPermissionReceipts({ descriptor, bridgeSessionId, address, now } = {}) {
  const checkedAddress = createRunAddress(address);
  const issuedAt = requiredTimestamp(now, "issuedAt");
  const expiresAt = new Date(Date.parse(issuedAt) + 60 * 60 * 1000).toISOString();
  return (descriptor?.capabilities ?? []).map((capability, index) => ({
    schemaVersion: agentPermissionReceiptSchemaVersion,
    receiptId: `permission.receipt-${index + 1}`,
    issuer: "agentique-ui",
    extensionId: descriptor.extensionId,
    bridgeSessionId: requiredToken(bridgeSessionId, "bridgeSessionId"),
    address: checkedAddress,
    capability,
    status: "granted",
    revoked: false,
    issuedAt,
    expiresAt
  }));
}

/** @param {{ bridgeSessionId?: string, messageId?: string, sequence?: number, operation?: string, address?: any, payload?: any }} [options] */
export function createAgentProtocolBridgeMessage({ bridgeSessionId, messageId, sequence, operation, address, payload } = {}) {
  return structuredClone({
    schemaVersion: agentProtocolBridgeSchemaVersion,
    bridgeSessionId,
    messageId,
    sequence,
    operation,
    address,
    payload
  });
}

/** @param {{ bridgeSessionId?: string, address?: any, now?: () => string }} [options] */
export function createAgentProtocolBridgeSession({ bridgeSessionId, address, now = () => new Date().toISOString() } = {}) {
  const sessionId = requiredToken(bridgeSessionId, "bridgeSessionId");
  const runAddress = createRunAddress(address);
  if (typeof now !== "function") throw problem("agent-bridge.clock", "Bridge clock must be a function.");

  const runConsumer = createRunProtocolConsumer({ expectedAddress: runAddress });
  const messageDigests = new Map();
  const messageIds = new Map();
  const dispositions = [];
  const artifacts = new Map();
  let cursor = 0;
  let status = "new";
  let failure = null;
  let descriptor = null;
  let permissions = new Map();
  let selectedRunnerCapability = null;

  return Object.freeze({
    accept(message) {
      if (failure) return receipt(false, "failed", failure.code);
      if (status === "cleaned") return fail("agent-bridge.session-terminal", "No message may follow completed cleanup.");

      const validation = validateEnvelope(message, { sessionId, runAddress });
      if (!validation.ok) return fail(validation.errors[0].code, validation.errors[0].message);
      const digest = canonicalMessageDigest(message);
      if (message.sequence <= cursor) {
        if (messageDigests.get(message.sequence) === digest && messageIds.get(message.messageId) === digest) {
          return receipt(true, "duplicate", null);
        }
        return fail("agent-bridge.conflicting-duplicate", "A repeated bridge message conflicts with accepted content.");
      }
      if (messageIds.has(message.messageId)) {
        return fail("agent-bridge.conflicting-message-id", "A bridge message id cannot identify different sequence content.");
      }
      if (message.sequence !== cursor + 1) return fail("agent-bridge.sequence-gap", "Bridge sequence must be exactly contiguous.");

      const transition = applyOperation(message);
      if (!transition.ok) return fail(transition.code, transition.message);
      cursor = message.sequence;
      messageDigests.set(cursor, digest);
      messageIds.set(message.messageId, digest);
      if (transition.disposition) dispositions.push(transition.disposition);
      return receipt(true, "accepted", null, transition.disposition);
    },
    snapshot() {
      return freeze({
        schemaVersion: "agentique.agentProtocolBridgeSnapshot.v1",
        bridgeSessionId: sessionId,
        address: runAddress,
        status,
        cursor,
        extensionId: descriptor?.extensionId ?? null,
        capabilities: descriptor ? [...descriptor.capabilities] : [],
        permittedCapabilities: [...permissions.keys()].sort(),
        selectedRunnerCapability,
        runTerminal: runConsumer.snapshot().terminal,
        artifacts: [...artifacts.values()],
        dispositions,
        failure
      });
    }
  });

  function applyOperation(message) {
    const { operation, payload } = message;
    if (operation === "initialize") {
      if (status !== "new") return rejectedTransition(operation);
      const descriptorValidation = validateDescriptor(payload.descriptor);
      if (!descriptorValidation.ok) return rejection(descriptorValidation.errors[0]);
      descriptor = freeze(payload.descriptor);
      status = "initialized";
      return accepted();
    }
    if (operation === "permission") {
      if (status !== "initialized") return rejectedTransition(operation);
      const permissionValidation = validatePermissionReceipts(payload.receipts, {
        descriptor,
        bridgeSessionId: sessionId,
        address: runAddress,
        now: requiredTimestamp(now(), "now")
      });
      if (!permissionValidation.ok) return rejection(permissionValidation.errors[0]);
      permissions = new Map(payload.receipts.map((entry) => [entry.capability, freeze(entry)]));
      status = "authorized";
      return accepted();
    }
    if (operation === "prepare") {
      if (status !== "authorized") return rejectedTransition(operation);
      if (!runnerCapabilitySet.has(payload.capability) || !descriptor.capabilities.includes(payload.capability) || !permissions.has(payload.capability)) {
        return rejected("agent-bridge.runner-capability", "Prepare requires one declared and permitted fixed runner capability.");
      }
      selectedRunnerCapability = payload.capability;
      status = "prepared";
      return accepted(dispositionFor(operation));
    }
    if (operation === "start") {
      if (status !== "prepared") return rejectedTransition(operation);
      if (!selectedRunnerCapability || !permissions.has(selectedRunnerCapability)) {
        return rejected("agent-bridge.permission-required", "Start requires a current fixed-runner permission.");
      }
      status = "running";
      return accepted(dispositionFor(operation));
    }
    if (operation === "cancel") {
      if (status !== "running") return rejectedTransition(operation);
      status = "cancel-requested";
      return accepted(dispositionFor(operation));
    }
    if (operation === "event") {
      if (!new Set(["running", "cancel-requested"]).has(status)) return rejectedTransition(operation);
      if (!permissions.has("run.events")) return rejected("agent-bridge.permission-required", "Event projection requires explicit permission.");
      const eventValidation = validateRunProtocolEvent(payload.event);
      if (!eventValidation.ok) return rejected("agent-bridge.invalid-event", eventValidation.errors[0].message);
      if (!sameAddress(runAddress, payload.event.address)) return rejected("agent-bridge.address-mismatch", "Event address does not match the bridge session.");
      if (payload.event.kind === "result" && payload.event.payload.artifactIds.some((id) => !artifacts.has(id))) {
        return rejected("agent-bridge.artifact-unbound", "Result event references an artifact not accepted by this bridge session.");
      }
      const eventReceipt = runConsumer.accept(payload.event);
      if (!eventReceipt.ok) return rejected(eventReceipt.code, "Accepted run protocol rejected the event.");
      if (runConsumer.snapshot().terminal) status = "terminal";
      return accepted(dispositionFor(operation));
    }
    if (operation === "artifact") {
      if (!new Set(["running", "terminal"]).has(status)) return rejectedTransition(operation);
      if (!permissions.has("run.artifacts")) return rejected("agent-bridge.permission-required", "Artifact receipt requires explicit permission.");
      artifacts.set(payload.artifactId, freeze(payload));
      return accepted();
    }
    if (operation === "cleanup") {
      if (status !== "terminal") return rejectedTransition(operation);
      if (!permissions.has("run.cleanup")) return rejected("agent-bridge.permission-required", "Cleanup receipt requires explicit permission.");
      if (payload.status !== "completed" || payload.orphanCount !== 0 || payload.handlesRemaining !== 0) {
        return rejected("agent-bridge.cleanup-incomplete", "Cleanup completion requires zero orphan processes and zero remaining handles.");
      }
      status = "cleaned";
      return accepted(dispositionFor(operation));
    }
    return rejected("agent-bridge.operation", "Unsupported bridge operation.");
  }

  function dispositionFor(operation) {
    return freeze({
      schemaVersion: "agentique.agentProtocolHostDisposition.v1",
      operation: hostOperationByProtocolOperation[operation],
      hostOwned: true,
      bridgeSessionId: sessionId,
      runId: runAddress.runId,
      runnerCapability: selectedRunnerCapability,
      extensionSelectableCommand: false,
      executableDetailsIncluded: false
    });
  }

  function receipt(ok, receiptStatus, code, disposition = undefined) {
    return freeze({
      schemaVersion: "agentique.agentProtocolBridgeReceipt.v1",
      ok,
      status: receiptStatus,
      code,
      cursor,
      sessionStatus: status,
      disposition
    });
  }

  function fail(code, message) {
    failure = { code, message: safeText(message) };
    status = "failed";
    return receipt(false, "failed", code);
  }
}

export function createAgentProtocolBridgeReview() {
  const now = "2026-09-04T10:45:00.000Z";
  const descriptor = createSampleAgentExtensionDescriptor();
  const session = createAgentProtocolBridgeSession({ bridgeSessionId: "bridge.review-001", address: sampleAgentBridgeAddress, now: () => now });
  const receipts = createSampleAgentPermissionReceipts({ descriptor, bridgeSessionId: "bridge.review-001", address: sampleAgentBridgeAddress, now });
  const producer = createRunProtocolProducer({ address: sampleAgentBridgeAddress, now: () => now });
  /** @type {Array<[string, any]>} */
  const messages = [
    ["initialize", { descriptor }],
    ["permission", { receipts }],
    ["prepare", { capability: "runner.fixed-python" }],
    ["start", {}],
    ["event", { event: producer.activity({ activityType: "review", message: "Bridge review active", progress: 0.5 }) }],
    ["artifact", { artifactId: "artifact.review-summary", digest: "b".repeat(64), sizeBytes: 128, redacted: true, pathNeutral: true, status: "available" }],
    ["event", { event: producer.result({ summary: "Bridge review complete", artifactIds: ["artifact.review-summary"] }) }],
    ["cleanup", { status: "completed", orphanCount: 0, handlesRemaining: 0, redacted: true, pathNeutral: true }]
  ];
  const accepted = messages.map(([operation, payload], index) =>
    session.accept(
      createAgentProtocolBridgeMessage({
        bridgeSessionId: "bridge.review-001",
        messageId: `review.message-${index + 1}`,
        sequence: index + 1,
        operation,
        address: sampleAgentBridgeAddress,
        payload
      })
    )
  );
  const snapshot = session.snapshot();
  const surface = freeze({
    schemaVersion: "agentique.agentProtocolBridgeSurface.v1",
    trust: "Signed extension",
    capabilityScope: "Capability scope",
    permission: "Explicit permission",
    lifecycle: snapshot.status,
    hostDispatchOwnership: "Agentique host only",
    packageDisposition: "No package bridge adopted",
    deniedAuthority: { ...deniedAuthority }
  });
  const ok = accepted.every((entry) => entry.ok) && snapshot.status === "cleaned" && Object.values(deniedAuthority).every((entry) => entry === false);
  return freeze({
    schemaVersion: "agentique.agentProtocolBridgeReview.v1",
    ok,
    operations: [...agentProtocolBridgeOperations],
    checks: {
      acceptedMessages: accepted.length,
      capabilities: descriptor.capabilities.length,
      deniedAuthority: Object.keys(deniedAuthority).length,
      nativeCommands: 16,
      nativePermissions: 2,
      handoffPackageAdopted: false,
      dynamicExtensionLoading: false
    },
    surface,
    snapshot,
    errors: ok ? [] : [{ code: "agent-bridge.review", message: "Agent protocol bridge review failed." }]
  });
}

function validateEnvelope(message, expected) {
  const errors = [];
  if (!isPlainObject(message)) return invalid("agent-bridge.message-object", "Bridge message must be an object.");
  exactKeys(message, ["schemaVersion", "bridgeSessionId", "messageId", "sequence", "operation", "address", "payload"], errors, "message");
  if (message.schemaVersion !== agentProtocolBridgeSchemaVersion) add(errors, "agent-bridge.schema", "Bridge schema version is unsupported.");
  validateToken(message.bridgeSessionId, "bridgeSessionId", errors);
  validateToken(message.messageId, "messageId", errors);
  if (message.bridgeSessionId !== expected.sessionId) add(errors, "agent-bridge.session-mismatch", "Bridge session id does not match.");
  if (!Number.isSafeInteger(message.sequence) || message.sequence < 1) add(errors, "agent-bridge.sequence", "Bridge sequence must be a positive safe integer.");
  if (!operationSet.has(message.operation)) add(errors, "agent-bridge.operation", "Bridge operation is unsupported.");
  try {
    const address = createRunAddress(message.address);
    if (!sameAddress(expected.runAddress, address)) add(errors, "agent-bridge.address-mismatch", "Complete run address does not match.");
  } catch (error) {
    add(errors, error.code ?? "agent-bridge.address", error.message);
  }
  validateOperationPayload(message.operation, message.payload, errors);
  const serialized = JSON.stringify(message);
  if (new TextEncoder().encode(serialized).byteLength > maxMessageBytes) add(errors, "agent-bridge.message-size", "Bridge message exceeds its byte limit.");
  if (unsafeTextPattern.test(serialized)) add(errors, "agent-bridge.unsafe-payload", "Bridge message contains execution-bearing or unsafe material.");
  return freeze({ ok: errors.length === 0, errors });
}

function validateOperationPayload(operation, payload, errors) {
  if (!isPlainObject(payload)) {
    add(errors, "agent-bridge.payload-object", "Operation payload must be an object.");
    return;
  }
  if (operation === "initialize") exactKeys(payload, ["descriptor"], errors, "initialize payload");
  else if (operation === "permission") exactKeys(payload, ["receipts"], errors, "permission payload");
  else if (operation === "prepare") {
    exactKeys(payload, ["capability"], errors, "prepare payload");
    if (!runnerCapabilitySet.has(payload.capability)) add(errors, "agent-bridge.runner-capability", "Prepare capability must be a fixed runner lane.");
  } else if (operation === "start") exactKeys(payload, [], errors, "start payload");
  else if (operation === "cancel") {
    exactKeys(payload, ["reasonCode"], errors, "cancel payload");
    if (!new Set(["user-requested", "policy-revoked", "timeout", "host-shutdown"]).has(payload.reasonCode))
      add(errors, "agent-bridge.cancel-reason", "Cancel reason is not allowlisted.");
  } else if (operation === "event") {
    exactKeys(payload, ["event"], errors, "event payload");
    const eventValidation = validateRunProtocolEvent(payload.event);
    if (!eventValidation.ok) add(errors, "agent-bridge.invalid-event", eventValidation.errors[0].message);
  } else if (operation === "artifact") validateArtifactPayload(payload, errors);
  else if (operation === "cleanup") validateCleanupPayload(payload, errors);
}

function validateDescriptor(descriptor) {
  const errors = [];
  if (!isPlainObject(descriptor)) return invalid("agent-bridge.descriptor-object", "Extension descriptor must be an object.");
  exactKeys(
    descriptor,
    ["schemaVersion", "extensionId", "version", "digest", "signature", "signer", "reviewStatus", "revoked", "host", "driftStatus", "capabilities", "authority"],
    errors,
    "extension descriptor"
  );
  if (descriptor.schemaVersion !== agentExtensionDescriptorSchemaVersion) add(errors, "agent-bridge.descriptor-schema", "Extension descriptor schema is unsupported.");
  validateToken(descriptor.extensionId, "extensionId", errors);
  validateToken(descriptor.version, "version", errors);
  if (!digestPattern.test(descriptor.digest ?? "")) add(errors, "agent-bridge.descriptor-digest", "Extension digest must be SHA-256.");
  if (descriptor.signature !== "verified" || !trustedSignerSet.has(descriptor.signer))
    add(errors, "agent-bridge.descriptor-signature", "Extension signature or signer is not trusted.");
  if (descriptor.reviewStatus !== "accepted") add(errors, "agent-bridge.descriptor-review", "Extension review is not accepted.");
  if (descriptor.revoked !== false) add(errors, "agent-bridge.descriptor-revoked", "Extension is revoked.");
  if (descriptor.host !== "agentique-ui" || descriptor.driftStatus !== "in-sync")
    add(errors, "agent-bridge.descriptor-compatibility", "Extension host or source state is incompatible.");
  if (!Array.isArray(descriptor.capabilities) || descriptor.capabilities.length === 0 || new Set(descriptor.capabilities).size !== descriptor.capabilities.length) {
    add(errors, "agent-bridge.capabilities", "Extension capabilities must be a non-empty unique array.");
  } else {
    for (const capability of descriptor.capabilities)
      if (!capabilitySet.has(capability)) add(errors, "agent-bridge.capability-unsupported", "Extension capability is unsupported.");
  }
  if (!isPlainObject(descriptor.authority)) add(errors, "agent-bridge.authority-object", "Denied authority must be an object.");
  else {
    exactKeys(descriptor.authority, Object.keys(deniedAuthority), errors, "denied authority");
    for (const value of Object.values(descriptor.authority)) if (value !== false) add(errors, "agent-bridge.authority-widened", "Generic extension authority must remain denied.");
  }
  return freeze({ ok: errors.length === 0, errors });
}

function validatePermissionReceipts(receipts, expected) {
  const errors = [];
  if (!Array.isArray(receipts) || receipts.length !== expected.descriptor.capabilities.length) {
    return invalid("agent-bridge.permission-count", "One permission receipt is required for every declared capability.");
  }
  const seen = new Set();
  for (const receipt of receipts) {
    if (!isPlainObject(receipt)) {
      add(errors, "agent-bridge.permission-object", "Permission receipt must be an object.");
      continue;
    }
    exactKeys(
      receipt,
      ["schemaVersion", "receiptId", "issuer", "extensionId", "bridgeSessionId", "address", "capability", "status", "revoked", "issuedAt", "expiresAt"],
      errors,
      "permission receipt"
    );
    if (receipt.schemaVersion !== agentPermissionReceiptSchemaVersion) add(errors, "agent-bridge.permission-schema", "Permission receipt schema is unsupported.");
    validateToken(receipt.receiptId, "receiptId", errors);
    if (receipt.issuer !== "agentique-ui") add(errors, "agent-bridge.permission-issuer", "Permission receipt must be product-issued.");
    if (receipt.extensionId !== expected.descriptor.extensionId || receipt.bridgeSessionId !== expected.bridgeSessionId)
      add(errors, "agent-bridge.permission-scope", "Permission extension or bridge scope does not match.");
    try {
      const receiptAddress = createRunAddress(receipt.address);
      if (!sameAddress(receiptAddress, expected.address)) add(errors, "agent-bridge.permission-address", "Permission address does not match.");
    } catch (error) {
      add(errors, error.code ?? "agent-bridge.permission-address", error.message);
    }
    if (!expected.descriptor.capabilities.includes(receipt.capability) || seen.has(receipt.capability))
      add(errors, "agent-bridge.permission-capability", "Permission capability is missing, duplicated, or undeclared.");
    seen.add(receipt.capability);
    if (receipt.status !== "granted" || receipt.revoked !== false) add(errors, "agent-bridge.permission-denied", "Permission is not currently granted.");
    const issued = Date.parse(receipt.issuedAt);
    const expires = Date.parse(receipt.expiresAt);
    const current = Date.parse(expected.now);
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > current || expires <= current)
      add(errors, "agent-bridge.permission-time", "Permission receipt is not current.");
  }
  for (const capability of expected.descriptor.capabilities)
    if (!seen.has(capability)) add(errors, "agent-bridge.permission-missing", "Declared capability lacks a permission receipt.");
  return freeze({ ok: errors.length === 0, errors });
}

function validateArtifactPayload(payload, errors) {
  exactKeys(payload, ["artifactId", "digest", "sizeBytes", "redacted", "pathNeutral", "status"], errors, "artifact payload");
  validateToken(payload.artifactId, "artifactId", errors);
  if (!digestPattern.test(payload.digest ?? "")) add(errors, "agent-bridge.artifact-digest", "Artifact digest must be SHA-256.");
  if (!Number.isSafeInteger(payload.sizeBytes) || payload.sizeBytes < 0 || payload.sizeBytes > maxArtifactBytes)
    add(errors, "agent-bridge.artifact-size", "Artifact size is outside the accepted bound.");
  if (payload.redacted !== true || payload.pathNeutral !== true) add(errors, "agent-bridge.artifact-safety", "Artifact receipt must be redacted and path-neutral.");
  if (!new Set(["available", "withheld", "failed"]).has(payload.status)) add(errors, "agent-bridge.artifact-status", "Artifact status is unsupported.");
}

function validateCleanupPayload(payload, errors) {
  exactKeys(payload, ["status", "orphanCount", "handlesRemaining", "redacted", "pathNeutral"], errors, "cleanup payload");
  if (!new Set(["completed", "cleanup-required", "failed"]).has(payload.status)) add(errors, "agent-bridge.cleanup-status", "Cleanup status is unsupported.");
  for (const field of ["orphanCount", "handlesRemaining"]) {
    if (!Number.isSafeInteger(payload[field]) || payload[field] < 0 || payload[field] > 1024)
      add(errors, "agent-bridge.cleanup-count", "Cleanup count is outside the accepted bound.");
  }
  if (payload.redacted !== true || payload.pathNeutral !== true) add(errors, "agent-bridge.cleanup-safety", "Cleanup receipt must be redacted and path-neutral.");
}

function canonicalMessageDigest(message) {
  return sha256HexSync(stableStringify(message));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactKeys(value, allowed, errors, label) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) add(errors, "agent-bridge.unexpected-field", `${label} contains an unexpected field.`);
  for (const key of allowed) if (!Object.hasOwn(value, key)) add(errors, "agent-bridge.required-field", `${label} is missing a required field.`);
}

function sameAddress(left, right) {
  return ["schemaVersion", "productScopeId", "sessionId", "resourceId", "runId"].every((field) => left[field] === right[field]);
}

function validateToken(value, field, errors) {
  if (typeof value !== "string" || !tokenPattern.test(value)) add(errors, "agent-bridge.token", `${field} must be a bounded opaque token.`);
}

function requiredToken(value, field) {
  const errors = [];
  validateToken(value, field, errors);
  if (errors.length > 0) throw problem(errors[0].code, errors[0].message);
  return value;
}

function requiredTimestamp(value, field) {
  const parsed = Date.parse(value);
  if (typeof value !== "string" || !Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw problem("agent-bridge.timestamp", `${field} must be an ISO UTC timestamp.`);
  }
  return value;
}

function rejectedTransition(operation) {
  return rejected("agent-bridge.transition", `${operation} is invalid in the current bridge state.`);
}

function accepted(disposition = undefined) {
  return { ok: true, disposition };
}

function rejected(code, message) {
  return { ok: false, code, message };
}

function rejection(entry) {
  return rejected(entry.code, entry.message);
}

function invalid(code, message) {
  return freeze({ ok: false, errors: [{ code, message }] });
}

function add(errors, code, message) {
  errors.push({ code, message: safeText(message) });
}

function safeText(value) {
  return String(value ?? "Bridge validation failed.")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 256);
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function problem(code, message) {
  const error = /** @type {Error & { code?: string }} */ (new Error(safeText(message)));
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(structuredClone(value));
}
