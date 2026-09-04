import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  agentProtocolBridgeOperations,
  allowedAgentBridgeCapabilities,
  createAgentProtocolBridgeMessage,
  createAgentProtocolBridgeReview,
  createAgentProtocolBridgeSession,
  createSampleAgentExtensionDescriptor,
  createSampleAgentPermissionReceipts,
  sampleAgentBridgeAddress
} from "../src/core/agent-protocol-bridge.mjs";
import { createRunProtocolProducer } from "../src/core/run-protocol.mjs";

const now = "2026-09-04T10:45:00.000Z";

function buildSession() {
  return createAgentProtocolBridgeSession({
    bridgeSessionId: "bridge.session-001",
    address: sampleAgentBridgeAddress,
    now: () => now
  });
}

function send(session, sequence, operation, payload, messageId = `message.${sequence}`) {
  return session.accept(
    createAgentProtocolBridgeMessage({
      bridgeSessionId: "bridge.session-001",
      messageId,
      sequence,
      operation,
      address: sampleAgentBridgeAddress,
      payload
    })
  );
}

function initializeAndAuthorize(session, capabilities = allowedAgentBridgeCapabilities) {
  const descriptor = createSampleAgentExtensionDescriptor({ capabilities });
  assert.equal(send(session, 1, "initialize", { descriptor }).ok, true);
  const receipts = createSampleAgentPermissionReceipts({
    descriptor,
    bridgeSessionId: "bridge.session-001",
    address: sampleAgentBridgeAddress,
    now
  });
  assert.equal(send(session, 2, "permission", { receipts }).ok, true);
  return descriptor;
}

test("bridge implements the exact eight-operation capability-scoped lifecycle", () => {
  assert.deepEqual(agentProtocolBridgeOperations, ["initialize", "permission", "prepare", "start", "cancel", "event", "artifact", "cleanup"]);
  const session = buildSession();
  initializeAndAuthorize(session);

  const prepare = send(session, 3, "prepare", { capability: "runner.fixed-python" });
  assert.equal(prepare.disposition.operation, "prepare-fixed-run");
  assert.equal(prepare.disposition.hostOwned, true);
  assert.equal(send(session, 4, "start", {}).disposition.operation, "start-fixed-run");

  const producer = createRunProtocolProducer({ address: sampleAgentBridgeAddress, now: () => now });
  assert.equal(send(session, 5, "event", { event: producer.activity({ activityType: "progress", message: "Working", progress: 0.5 }) }).ok, true);
  assert.equal(
    send(session, 6, "artifact", {
      artifactId: "artifact.summary-001",
      digest: "b".repeat(64),
      sizeBytes: 128,
      redacted: true,
      pathNeutral: true,
      status: "available"
    }).ok,
    true
  );
  assert.equal(send(session, 7, "event", { event: producer.result({ summary: "Complete", artifactIds: ["artifact.summary-001"] }) }).ok, true);
  const cleanup = send(session, 8, "cleanup", {
    status: "completed",
    orphanCount: 0,
    handlesRemaining: 0,
    redacted: true,
    pathNeutral: true
  });
  assert.equal(cleanup.disposition.operation, "finalize-cleanup");
  assert.equal(session.snapshot().status, "cleaned");
});

test("cancel remains host-owned and preserves run-protocol cancellation truth", () => {
  const session = buildSession();
  initializeAndAuthorize(session);
  send(session, 3, "prepare", { capability: "runner.fixed-node" });
  send(session, 4, "start", {});
  const cancel = send(session, 5, "cancel", { reasonCode: "user-requested" });
  assert.equal(cancel.disposition.operation, "cancel-fixed-run");
  assert.equal(cancel.disposition.hostOwned, true);

  const producer = createRunProtocolProducer({ address: sampleAgentBridgeAddress, now: () => now });
  const terminal = send(session, 6, "event", { event: producer.cancelled({ reasonCode: "user-requested", message: "Canceled by user" }) });
  assert.equal(terminal.ok, true);
  assert.equal(session.snapshot().runTerminal.kind, "cancelled");
});

test("identical replay is idempotent while conflicts gaps scope drift and post-cleanup messages fail closed", () => {
  const descriptor = createSampleAgentExtensionDescriptor();
  const first = createAgentProtocolBridgeMessage({
    bridgeSessionId: "bridge.session-001",
    messageId: "message.init",
    sequence: 1,
    operation: "initialize",
    address: sampleAgentBridgeAddress,
    payload: { descriptor }
  });
  const session = buildSession();
  assert.equal(session.accept(first).status, "accepted");
  assert.equal(session.accept(first).status, "duplicate");
  const conflict = structuredClone(first);
  conflict.payload.descriptor.version = "1.0.1";
  assert.equal(session.accept(conflict).code, "agent-bridge.conflicting-duplicate");
  assert.equal(session.snapshot().status, "failed");

  const gap = buildSession();
  assert.equal(send(gap, 2, "initialize", { descriptor }).code, "agent-bridge.sequence-gap");

  const scope = buildSession();
  const wrongAddress = { ...sampleAgentBridgeAddress, resourceId: "resource.other" };
  const wrong = createAgentProtocolBridgeMessage({
    bridgeSessionId: "bridge.session-001",
    messageId: "message.scope",
    sequence: 1,
    operation: "initialize",
    address: wrongAddress,
    payload: { descriptor }
  });
  assert.equal(scope.accept(wrong).code, "agent-bridge.address-mismatch");
});

test("extension trust and capability mutations fail before permission or host disposition", () => {
  const mutations = [
    { signature: "unsigned" },
    { signer: "unknown-signer" },
    { reviewStatus: "unreviewed" },
    { revoked: true },
    { host: "other-host" },
    { driftStatus: "drifted" },
    { digest: "not-a-digest" },
    { capabilities: ["runner.fixed-python", "shell"] }
  ];
  for (const mutation of mutations) {
    const session = buildSession();
    const descriptor = { ...createSampleAgentExtensionDescriptor(), ...mutation };
    assert.equal(send(session, 1, "initialize", { descriptor }).ok, false, JSON.stringify(mutation));
    assert.equal(session.snapshot().dispositions.length, 0);
  }
});

test("permission receipts are product-issued current exact and bound to extension session address and capability", () => {
  const mutations = [
    { issuer: "extension" },
    { bridgeSessionId: "bridge.other" },
    { extensionId: "extension.other" },
    { address: { ...sampleAgentBridgeAddress, runId: "run.other" } },
    { status: "pending" },
    { revoked: true },
    { expiresAt: "2026-09-04T09:00:00.000Z" },
    { capability: "shell" }
  ];
  for (const mutation of mutations) {
    const session = buildSession();
    const descriptor = createSampleAgentExtensionDescriptor();
    assert.equal(send(session, 1, "initialize", { descriptor }).ok, true);
    const receipts = createSampleAgentPermissionReceipts({
      descriptor,
      bridgeSessionId: "bridge.session-001",
      address: sampleAgentBridgeAddress,
      now
    });
    receipts[0] = { ...receipts[0], ...mutation };
    assert.equal(send(session, 2, "permission", { receipts }).ok, false, JSON.stringify(mutation));
    assert.equal(session.snapshot().dispositions.length, 0);
  }
});

test("unknown fields and execution-bearing payloads fail closed", () => {
  const descriptor = createSampleAgentExtensionDescriptor();
  const unsafePayloads = [
    { descriptor, command: "runner start" },
    { descriptor, executable: "runtime" },
    { descriptor, args: ["--run"] },
    { descriptor, cwd: ["C", ":\\temp"].join("") },
    { descriptor, env: { TOKEN: "secret" } },
    { descriptor, url: "https://service.invalid" },
    { descriptor, package: "extension-package" },
    { descriptor, provider: "remote-provider" },
    { descriptor, cookie: "session=value" }
  ];
  for (const payload of unsafePayloads) {
    const session = buildSession();
    assert.equal(send(session, 1, "initialize", payload).ok, false);
    assert.equal(session.snapshot().status, "failed");
  }
});

test("event artifact and cleanup messages validate protocol binding and path-neutral truth", () => {
  const setup = () => {
    const session = buildSession();
    initializeAndAuthorize(session);
    send(session, 3, "prepare", { capability: "runner.fixed-python" });
    send(session, 4, "start", {});
    return session;
  };

  const producer = createRunProtocolProducer({ address: sampleAgentBridgeAddress, now: () => now });
  const wrongEvent = structuredClone(producer.activity({ activityType: "progress", message: "Working" }));
  wrongEvent.address.runId = "run.other";
  assert.equal(send(setup(), 5, "event", { event: wrongEvent }).ok, false);

  for (const artifact of [
    { artifactId: "artifact.bad", digest: "b".repeat(64), sizeBytes: 1, redacted: false, pathNeutral: true, status: "available" },
    { artifactId: "artifact.bad", digest: "b".repeat(64), sizeBytes: 1, redacted: true, pathNeutral: false, status: "available" },
    { artifactId: "artifact.bad", digest: "bad", sizeBytes: 1, redacted: true, pathNeutral: true, status: "available" },
    { artifactId: ["C", ":\\temp\\out"].join(""), digest: "b".repeat(64), sizeBytes: 1, redacted: true, pathNeutral: true, status: "available" }
  ]) {
    assert.equal(send(setup(), 5, "artifact", artifact).ok, false);
  }

  const cleanup = setup();
  const terminalProducer = createRunProtocolProducer({ address: sampleAgentBridgeAddress, now: () => now });
  send(cleanup, 5, "event", { event: terminalProducer.error({ code: "adapter-failed", message: "Adapter failed", retryable: false }) });
  assert.equal(send(cleanup, 6, "cleanup", { status: "completed", orphanCount: 1, handlesRemaining: 0, redacted: true, pathNeutral: true }).ok, false);
});

test("completed cleanup is terminal and later protocol messages fail the session closed", () => {
  const session = buildSession();
  initializeAndAuthorize(session);
  send(session, 3, "prepare", { capability: "runner.fixed-python" });
  send(session, 4, "start", {});
  const producer = createRunProtocolProducer({ address: sampleAgentBridgeAddress, now: () => now });
  send(session, 5, "event", { event: producer.result({ summary: "Complete", artifactIds: [] }) });
  assert.equal(send(session, 6, "cleanup", { status: "completed", orphanCount: 0, handlesRemaining: 0, redacted: true, pathNeutral: true }).ok, true);
  assert.equal(
    send(session, 7, "artifact", {
      artifactId: "artifact.late",
      digest: "b".repeat(64),
      sizeBytes: 1,
      redacted: true,
      pathNeutral: true,
      status: "available"
    }).code,
    "agent-bridge.session-terminal"
  );
});

test("review proves all operations and denied generic authority without native widening", () => {
  const review = createAgentProtocolBridgeReview();
  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.deepEqual(review.operations, agentProtocolBridgeOperations);
  assert.equal(review.checks.nativeCommands, 16);
  assert.equal(review.checks.nativePermissions, 2);
  assert.equal(review.checks.deniedAuthority, 11);
  assert.equal(review.checks.handoffPackageAdopted, false);
  assert.equal(review.checks.dynamicExtensionLoading, false);
  assert.equal(review.surface.hostDispatchOwnership, "Agentique host only");
  assert.equal(
    Object.values(review.surface.deniedAuthority).every((value) => value === false),
    true
  );

  const moduleText = fs.readFileSync("src/core/agent-protocol-bridge.mjs", "utf8");
  assert.doesNotMatch(
    moduleText,
    /node:child_process|child_process|node:fs|writeFile|appendFile|createWriteStream|spawn\(|execFile\(|exec\(|fetch\(|WebSocket\(|invoke\(|import\(/u
  );
});
