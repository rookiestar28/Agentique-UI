import assert from "node:assert/strict";
import test from "node:test";

import {
  checkpointTimeTravelBoundary,
  createNativeCheckpointTimeTravelClient,
  reviewCheckpointHistory,
  reviewTimeTravelPrepareReceipt,
  sampleCheckpointHistory,
  sampleTimeTravelPrepareReceipt
} from "../src/core/native-checkpoint-time-travel.mjs";

const sourceAddress = Object.freeze({ resourceId: "resource.runtime-001", sessionId: "session.runtime-001", runId: "run.runtime-source-001" });
const targetAddress = Object.freeze({ resourceId: sourceAddress.resourceId, sessionId: sourceAddress.sessionId, runId: "run.runtime-target-001" });

test("bounded checkpoint history exposes validated metadata without content or absolute paths", () => {
  const history = reviewCheckpointHistory(sampleCheckpointHistory(sourceAddress));
  assert.equal(history.schemaVersion, "agentique.nativeCheckpointHistory.v1");
  assert.equal(history.generations.length, 2);
  assert.equal(history.generations.filter((entry) => entry.current).length, 1);
  assert.doesNotMatch(JSON.stringify(history), /content|[A-Za-z]:[\\/]|\/home\/|\/Users\//u);
});

test("history rejects schema count digest current and reference mutations", () => {
  const valid = sampleCheckpointHistory(sourceAddress);
  const mutations = [
    { ...valid, schemaVersion: "agentique.nativeCheckpointHistory.v0" },
    { ...valid, generationCount: 99 },
    { ...valid, generations: valid.generations.map((entry) => ({ ...entry, current: false })) },
    { ...valid, generations: [{ ...valid.generations[0], generationDigest: "bad" }, valid.generations[1]] },
    { ...valid, generations: [{ ...valid.generations[0], generationRef: ["C", ":/escape"].join("") }, valid.generations[1]] },
    { ...valid, generations: [...valid.generations, ...Array.from({ length: 7 }, (_, index) => ({ ...valid.generations[0], generationDigest: `${index}`.repeat(64) }))] }
  ];
  for (const mutation of mutations) assert.throws(() => reviewCheckpointHistory(mutation));
});

test("time-travel prepare is branch-only and requires fresh approval", () => {
  const receipt = reviewTimeTravelPrepareReceipt(sampleTimeTravelPrepareReceipt({ sourceAddress, targetAddress, mode: "replay" }));
  assert.equal(receipt.state, "branch-ready");
  assert.equal(receipt.requiresFreshApproval, true);
  assert.equal(receipt.willSpawnProcess, false);
  assert.equal(receipt.sourceGenerationDigest, receipt.selectedGenerationDigest);
  assert.notEqual(receipt.sourceRunId, receipt.targetRunId);
});

test("client invokes only exact history and prepare commands with opaque bounded input", async () => {
  const calls = [];
  const client = createNativeCheckpointTimeTravelClient({
    requestNative: async (command, request) => {
      calls.push({ command, request });
      return command === "agentique_runner_checkpoint_history"
        ? sampleCheckpointHistory(sourceAddress)
        : sampleTimeTravelPrepareReceipt({ sourceAddress, targetAddress, mode: request.mode, generationDigest: request.generationDigest });
    }
  });
  const history = await client.history(sourceAddress);
  const prepared = await client.prepare({ sourceAddress, targetAddress, generationDigest: history.generations[0].generationDigest, mode: "retry" });

  assert.deepEqual(
    calls.map((entry) => entry.command),
    ["agentique_runner_checkpoint_history", "agentique_runner_time_travel_prepare"]
  );
  assert.deepEqual(Object.keys(calls[0].request), ["resourceId", "sessionId", "runId"]);
  assert.deepEqual(Object.keys(calls[1].request), [
    "schemaVersion",
    "sourceResourceId",
    "sourceSessionId",
    "sourceRunId",
    "targetResourceId",
    "targetSessionId",
    "targetRunId",
    "generationDigest",
    "mode"
  ]);
  assert.equal(prepared.requiresFreshApproval, true);
});

test("client rejects cross-scope targets unsafe ids invalid digests modes and raw authority", async () => {
  const client = createNativeCheckpointTimeTravelClient({ requestNative: async () => sampleCheckpointHistory(sourceAddress) });
  const base = { sourceAddress, targetAddress, generationDigest: "a".repeat(64), mode: "resume" };
  for (const input of [
    { ...base, targetAddress: { ...targetAddress, resourceId: "resource.other" } },
    { ...base, targetAddress: { ...targetAddress, runId: sourceAddress.runId } },
    { ...base, generationDigest: "bad" },
    { ...base, mode: "automatic" },
    { ...base, path: ["C", ":/escape"].join("") }
  ]) {
    await assert.rejects(client.prepare(input));
  }
});

test("time-travel boundary stays non-executing and path neutral", () => {
  const boundary = checkpointTimeTravelBoundary();
  assert.deepEqual(boundary.commands, ["agentique_runner_checkpoint_history", "agentique_runner_time_travel_prepare"]);
  assert.equal(boundary.sourceImmutable, true);
  assert.equal(boundary.freshApprovalRequired, true);
  assert.equal(boundary.externalEffectReplay, false);
  assert.equal(boundary.rendererPathSelection, false);
});
