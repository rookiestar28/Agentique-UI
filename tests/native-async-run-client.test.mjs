import assert from "node:assert/strict";
import test from "node:test";
import { createNativeAsyncRunClient, nativeAsyncRunEventName } from "../src/core/native-async-run-client.mjs";
import { sampleCheckpointHistory, sampleTimeTravelPrepareReceipt } from "../src/core/native-checkpoint-time-travel.mjs";

const address = {
  productScopeId: "workspace.local",
  sessionId: "session.native-ui",
  resourceId: "resource.native-ui",
  runId: "run.native-ui"
};

function nativeEvent(sequence, eventType, phase, status) {
  return {
    schemaVersion: "agentique.nativeRunnerEvent.v1",
    sequence,
    resourceId: address.resourceId,
    sessionId: address.sessionId,
    runId: address.runId,
    eventType,
    phase,
    occurredAtEpochMs: 1_788_480_000_000 + sequence,
    label: `${eventType} lifecycle event`,
    details: { status }
  };
}

test("native async client invokes exact Tauri commands and converts live events through the canonical protocol", async () => {
  const calls = [];
  const canonical = [];
  let listener;
  let unlistenCalls = 0;
  const client = createNativeAsyncRunClient({
    address,
    invokeNative: async (command, args) => {
      calls.push({ command, args });
      return { state: command.endsWith("start") ? "running" : "pending-approval" };
    },
    listenNative: async (eventName, handler) => {
      assert.equal(eventName, nativeAsyncRunEventName);
      listener = handler;
      return () => {
        unlistenCalls += 1;
      };
    },
    onEvent: (event) => canonical.push(event)
  });

  await client.connect();
  await client.prepare();
  await client.approvalProposal({ approvalId: "approval.native-ui" });
  await client.start({ approvalId: "approval.native-ui", permissionGrantId: "grant.native-ui" });
  listener({ payload: nativeEvent(1, "prepare.accepted", "pending", "pending-approval") });
  listener({ payload: nativeEvent(2, "run.succeeded", "terminal", "succeeded") });
  listener({ payload: { ...nativeEvent(1, "prepare.accepted", "pending", "pending-approval"), runId: "run.other" } });

  assert.deepEqual(
    calls.map((call) => call.command),
    ["agentique_runner_prepare", "agentique_runner_approval_proposal", "agentique_runner_start"]
  );
  assert.equal(calls[1].args.request.approvalId, "approval.native-ui");
  assert.deepEqual(calls[0].args.request, {
    resourceId: address.resourceId,
    sessionId: address.sessionId,
    runId: address.runId,
    commandId: "command.prepare-run.native-ui",
    adapterId: "adapter.local-python",
    approvalId: null,
    permissionProfileId: "permission.local-python.minimal",
    permissionGrantId: null
  });
  assert.deepEqual(
    canonical.map((event) => event.kind),
    ["activity", "result"]
  );
  assert.equal(canonical[1].address.productScopeId, address.productScopeId);
  assert.equal(client.snapshot().protocol.status, "terminal");
  await client.disconnect();
  await client.disconnect();
  assert.equal(unlistenCalls, 1);
});

test("native async client maps the fixed Node adapter to its exact profile and rejects unknown lanes", async () => {
  const calls = [];
  const client = createNativeAsyncRunClient({
    address,
    adapterId: "adapter.local-node",
    invokeNative: async (command, args) => {
      calls.push({ command, args });
      return { state: "pending-approval" };
    },
    listenNative: async () => () => {}
  });
  await client.prepare();
  assert.equal(calls[0].args.request.adapterId, "adapter.local-node");
  assert.equal(calls[0].args.request.permissionProfileId, "permission.local-node.minimal");
  assert.throws(
    () =>
      createNativeAsyncRunClient({
        address,
        adapterId: "adapter.generic-command",
        invokeNative: async () => ({}),
        listenNative: async () => () => {}
      }),
    /fixed allowlist/u
  );
});

test("native async client integrates metadata history and non-executing branch preparation", async () => {
  const calls = [];
  const sourceAddress = {
    resourceId: address.resourceId,
    sessionId: address.sessionId,
    runId: address.runId
  };
  const targetAddress = { ...sourceAddress, runId: "run.native-ui-branch" };
  const generationDigest = "a".repeat(64);
  const client = createNativeAsyncRunClient({
    address,
    invokeNative: async (command, args) => {
      calls.push({ command, args });
      if (command === "agentique_runner_checkpoint_history") return sampleCheckpointHistory(sourceAddress);
      return sampleTimeTravelPrepareReceipt({ sourceAddress, targetAddress, generationDigest, mode: "resume" });
    },
    listenNative: async () => () => {}
  });

  const history = await client.checkpointHistory();
  const branch = await client.prepareTimeTravel({ targetRunId: targetAddress.runId, generationDigest, mode: "resume" });

  assert.equal(history.includesContent, false);
  assert.equal(branch.state, "branch-ready");
  assert.equal(branch.willSpawnProcess, false);
  assert.deepEqual(
    calls.map(({ command }) => command),
    ["agentique_runner_checkpoint_history", "agentique_runner_time_travel_prepare"]
  );
  assert.deepEqual(calls[1].args.request, {
    schemaVersion: "agentique.nativeTimeTravelPrepareRequest.v1",
    sourceResourceId: sourceAddress.resourceId,
    sourceSessionId: sourceAddress.sessionId,
    sourceRunId: sourceAddress.runId,
    targetResourceId: targetAddress.resourceId,
    targetSessionId: targetAddress.sessionId,
    targetRunId: targetAddress.runId,
    generationDigest,
    mode: "resume"
  });
});

test("native async client resyncs bounded replay, skips diagnostics, and exposes cancel without process inputs", async () => {
  const calls = [];
  const events = [
    nativeEvent(1, "prepare.accepted", "pending", "pending-approval"),
    nativeEvent(2, "start.accepted", "running", "running"),
    nativeEvent(3, "run.canceled", "terminal", "canceled"),
    nativeEvent(4, "cleanup.completed", "cleanup", "cleaned-up")
  ];
  const client = createNativeAsyncRunClient({
    address,
    invokeNative: async (command, args) => {
      calls.push({ command, args });
      if (command === "agentique_runner_status") {
        return { state: "canceled", eventReplay: { schemaVersion: "agentique.nativeRunnerEventReplay.v1", events } };
      }
      return { state: "canceling" };
    },
    listenNative: async () => () => {}
  });

  const status = await client.resync();
  const cancel = await client.cancel();
  assert.equal(status.state, "canceled");
  assert.equal(cancel.state, "canceling");
  assert.equal(client.snapshot().acceptedEvents, 3);
  assert.equal(client.snapshot().diagnosticEventsSkipped, 1);
  assert.equal(client.snapshot().protocol.terminal.kind, "cancelled");
  assert.deepEqual(Object.keys(calls[1].args.request).sort(), [
    "adapterId",
    "approvalId",
    "commandId",
    "permissionGrantId",
    "permissionProfileId",
    "resourceId",
    "runId",
    "sessionId"
  ]);
  assert.doesNotMatch(JSON.stringify(calls), /"pid"|"executable"|"commandPath"|"env"/iu);
});

test("native async client revokes only the exact opaque grant through the fixed command", async () => {
  const calls = [];
  const client = createNativeAsyncRunClient({
    address,
    invokeNative: async (command, args) => {
      calls.push({ command, args });
      return { state: "canceling", permissionGrant: { grantId: "grant.native-ui", status: "revoked", redacted: true } };
    },
    listenNative: async () => () => {}
  });

  const receipt = await client.revoke({ permissionGrantId: "grant.native-ui" });
  assert.equal(receipt.state, "canceling");
  assert.equal(calls[0].command, "agentique_runner_revoke_permission");
  assert.deepEqual(calls[0].args.request, {
    resourceId: address.resourceId,
    sessionId: address.sessionId,
    runId: address.runId,
    commandId: "command.revoke-run.native-ui",
    adapterId: "adapter.local-python",
    approvalId: null,
    permissionProfileId: "permission.local-python.minimal",
    permissionGrantId: "grant.native-ui"
  });
  assert.doesNotMatch(JSON.stringify(calls), /"pid"|"path"|"targets"|"permissions"|"executable"|"arguments"|"env"/iu);
});

test("native async client fails closed on a durable replay sequence gap", async () => {
  const delivered = [];
  const client = createNativeAsyncRunClient({
    address,
    invokeNative: async () => ({
      state: "running",
      eventReplay: {
        schemaVersion: "agentique.nativeRunnerEventReplay.v1",
        events: [nativeEvent(1, "start.accepted", "running", "running"), nativeEvent(3, "run.succeeded", "terminal", "succeeded")]
      }
    }),
    listenNative: async () => () => {},
    onEvent: (event) => delivered.push(event)
  });
  await client.connect();
  await client.resync();
  assert.equal(delivered.length, 0);
  assert.equal(client.snapshot().protocol.status, "failed");
  assert.equal(client.snapshot().errors[0].code, "run-protocol.sequence-gap");
});

test("native diagnostic sequences remain contiguous while canonical UI events are compacted", async () => {
  const delivered = [];
  let listener;
  const client = createNativeAsyncRunClient({
    address,
    invokeNative: async () => ({ state: "succeeded" }),
    listenNative: async (_eventName, handler) => {
      listener = handler;
      return () => {};
    },
    onEvent: (event) => delivered.push(event)
  });
  await client.connect();
  listener({ payload: nativeEvent(1, "start.accepted", "running", "running") });
  listener({ payload: nativeEvent(2, "cleanup.completed", "cleanup", "cleaned-up") });
  listener({ payload: nativeEvent(3, "run.succeeded", "terminal", "succeeded") });
  assert.deepEqual(
    delivered.map((event) => event.sequence),
    [1, 2]
  );
  assert.equal(client.snapshot().lastNativeSequence, 3);
  assert.equal(client.snapshot().diagnosticEventsSkipped, 1);
  assert.equal(client.snapshot().protocol.status, "terminal");
});

test("native async client validates and retains only the exact durable product projection receipt", async () => {
  const productProjection = {
    schemaVersion: "agentique.nativeProductResultProjectionReceipt.v1",
    resourceId: address.resourceId,
    sessionId: address.sessionId,
    runId: address.runId,
    candidateDigest: "a".repeat(64),
    state: "succeeded",
    committed: true,
    idempotent: false,
    generationRef: `projections/${address.runId}/generations/${"a".repeat(64)}`,
    pointerRef: `projections/${address.runId}/current.json`,
    artifactRefs: [`projections/${address.runId}/generations/${"a".repeat(64)}/product/run.json`],
    recoveryClassification: "completed",
    redacted: true
  };
  const client = createNativeAsyncRunClient({
    address,
    invokeNative: async () => ({ state: "succeeded", productProjection }),
    listenNative: async () => () => {}
  });

  await client.status();

  assert.deepEqual(client.snapshot().productProjection, productProjection);
});

test("native async client rejects forged or cross-run product projection receipts", async () => {
  const client = createNativeAsyncRunClient({
    address,
    invokeNative: async () => ({
      state: "succeeded",
      productProjection: {
        schemaVersion: "agentique.nativeProductResultProjectionReceipt.v1",
        resourceId: address.resourceId,
        sessionId: address.sessionId,
        runId: "run.other",
        candidateDigest: "a".repeat(64),
        state: "succeeded",
        committed: true,
        idempotent: false,
        generationRef: "projections/run.other/generations/unsafe",
        pointerRef: "projections/run.other/current.json",
        artifactRefs: [],
        recoveryClassification: "completed",
        redacted: true
      }
    }),
    listenNative: async () => () => {}
  });

  await assert.rejects(client.status(), (error) => error.code === "native-async-client.projection-address");
  assert.equal(client.snapshot().productProjection, null);
});

test("native async client validates and retains a bounded native working-set checkpoint", async () => {
  const workingSetCheckpoint = {
    schemaVersion: "agentique.nativeWorkingSetCheckpointReceipt.v1",
    scopeId: address.runId,
    generationDigest: "b".repeat(64),
    committed: true,
    idempotent: false,
    restored: false,
    fileCount: 2,
    totalBytes: 128,
    generationRef: `working-sets/${address.runId}/checkpoints/generations/${"b".repeat(64)}`,
    pointerRef: `working-sets/${address.runId}/checkpoints/current.json`,
    rootRef: `working-sets/${address.runId}/active`,
    encryptedAtRest: false,
    replaysExternalEffects: false,
    redacted: true
  };
  const client = createNativeAsyncRunClient({
    address,
    invokeNative: async () => ({ state: "succeeded", workingSetCheckpoint }),
    listenNative: async () => () => {}
  });

  await client.status();
  assert.deepEqual(client.snapshot().workingSetCheckpoint, workingSetCheckpoint);
});

test("native async client rejects cross-scope or authority-widening checkpoint receipts", async () => {
  const client = createNativeAsyncRunClient({
    address,
    invokeNative: async () => ({
      state: "succeeded",
      workingSetCheckpoint: {
        schemaVersion: "agentique.nativeWorkingSetCheckpointReceipt.v1",
        scopeId: "run.other",
        generationDigest: "b".repeat(64),
        committed: true,
        idempotent: false,
        restored: false,
        fileCount: 1,
        totalBytes: 1,
        generationRef: "working-sets/run.other/checkpoints/generations/unsafe",
        pointerRef: "working-sets/run.other/checkpoints/current.json",
        rootRef: "working-sets/run.other/active",
        encryptedAtRest: true,
        replaysExternalEffects: true,
        redacted: true
      }
    }),
    listenNative: async () => () => {}
  });
  await assert.rejects(client.status(), (error) => error.code === "native-async-client.checkpoint-address");
  assert.equal(client.snapshot().workingSetCheckpoint, null);
});
