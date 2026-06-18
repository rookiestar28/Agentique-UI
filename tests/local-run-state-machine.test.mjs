import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import {
  createLocalRunRecord,
  localRunStates,
  recoverLocalRun,
  reviewLocalRunStateMachine,
  sampleLocalRunRecord,
  transitionLocalRun
} from "../src/core/local-run-state-machine.mjs";

const now = "2026-06-12T00:00:00.000Z";

test("local run state-machine validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-local-run-state-machine.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.deepEqual(result.states, localRunStates);
});

test("local run state-machine covers every required state", () => {
  assert.deepEqual(localRunStates, [
    "queued",
    "preparing",
    "permission-blocked",
    "ready",
    "running",
    "canceling",
    "canceled",
    "succeeded",
    "failed",
    "cleanup-required",
    "cleaned"
  ]);
  const review = reviewLocalRunStateMachine();
  assert.equal(review.ok, true);
  assert.equal(review.summary.states, 11);
});

test("local run state-machine completes success lifecycle with cleanup", () => {
  let result = { ok: true, record: sampleLocalRunRecord };
  for (const action of [
    { type: "prepare" },
    { type: "ready", workerId: "worker.alpha-001" },
    { type: "start", workerId: "worker.alpha-001" },
    { type: "heartbeat" },
    { type: "progress", percent: 75, message: "adapter running" },
    { type: "succeed" },
    { type: "require-cleanup" },
    { type: "clean" }
  ]) {
    result = transitionLocalRun(result.record, action, { now });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
  }
  assert.equal(result.record.state, "cleaned");
  assert.equal(result.record.progress.percent, 100);
  assert.equal(result.record.cleanup.status, "cleaned");
  assert.equal(result.record.worker.id, "worker.alpha-001");
  assert.equal(result.record.events.length, 9);
});

test("local run state-machine blocks forbidden queued-to-running jump", () => {
  const result = transitionLocalRun(sampleLocalRunRecord, { type: "start", workerId: "worker.alpha-001" }, { now });
  assert.equal(result.ok, false);
  assert.equal(result.record.state, "queued");
  assert.ok(result.errors.some((error) => error.code === "local-run.forbidden-transition"));
});

test("local run state-machine supports permission-blocked then ready path", () => {
  const prepared = transitionLocalRun(sampleLocalRunRecord, { type: "prepare" }, { now }).record;
  const blocked = transitionLocalRun(prepared, { type: "block-permission", reason: "Need file grant" }, { now });
  assert.equal(blocked.ok, true);
  assert.equal(blocked.record.state, "permission-blocked");
  const ready = transitionLocalRun(blocked.record, { type: "ready", workerId: "worker.alpha-001" }, { now });
  assert.equal(ready.ok, true);
  assert.equal(ready.record.state, "ready");
  assert.equal(ready.record.failure, null);
});

test("local run state-machine handles cancellation and cleanup", () => {
  const ready = transitionLocalRun(
    transitionLocalRun(sampleLocalRunRecord, { type: "prepare" }, { now }).record,
    { type: "ready", workerId: "worker.alpha-001" },
    { now }
  ).record;
  const running = transitionLocalRun(ready, { type: "start", workerId: "worker.alpha-001" }, { now }).record;
  const canceling = transitionLocalRun(running, { type: "cancel" }, { now });
  assert.equal(canceling.record.state, "canceling");
  const canceled = transitionLocalRun(canceling.record, { type: "cancel-ack" }, { now });
  assert.equal(canceled.record.state, "canceled");
  const cleanup = transitionLocalRun(canceled.record, { type: "require-cleanup" }, { now });
  assert.equal(cleanup.record.state, "cleanup-required");
  assert.equal(cleanup.record.cleanup.required, true);
});

test("local run state-machine retries timeout deterministically then fails", () => {
  const base = createLocalRunRecord({
    resourceId: "resource.timeout",
    sessionId: "session.timeout",
    runId: "run.timeout",
    retry: { maxAttempts: 1 }
  }, { now });
  const ready = transitionLocalRun(
    transitionLocalRun(base, { type: "prepare" }, { now }).record,
    { type: "ready", workerId: "worker.timeout" },
    { now }
  ).record;
  const running = transitionLocalRun(ready, { type: "start", workerId: "worker.timeout" }, { now }).record;
  const retried = transitionLocalRun(running, { type: "timeout", message: "first timeout" }, { now });
  assert.equal(retried.ok, true);
  assert.equal(retried.record.state, "queued");
  assert.equal(retried.record.retry.attemptsUsed, 1);

  const rerunReady = transitionLocalRun(
    transitionLocalRun(retried.record, { type: "prepare" }, { now }).record,
    { type: "ready", workerId: "worker.timeout" },
    { now }
  ).record;
  const rerunning = transitionLocalRun(rerunReady, { type: "start", workerId: "worker.timeout" }, { now }).record;
  const failed = transitionLocalRun(rerunning, { type: "timeout", message: "second timeout" }, { now });
  assert.equal(failed.record.state, "failed");
  assert.equal(failed.record.failure.code, "local-run.timeout");
});

test("local run state-machine recovers stale incomplete runs safely", () => {
  const ready = transitionLocalRun(
    transitionLocalRun(sampleLocalRunRecord, { type: "prepare" }, { now }).record,
    { type: "ready", workerId: "worker.alpha-001" },
    { now }
  ).record;
  const running = transitionLocalRun(ready, { type: "start", workerId: "worker.alpha-001" }, { now }).record;
  const recovered = recoverLocalRun(running, { now: "2026-06-12T00:01:00.000Z" });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.record.state, "cleanup-required");
  assert.equal(recovered.record.recovery.recovered, true);
  assert.equal(recovered.record.failure.code, "local-run.recovered-stale");
});

test("local run state-machine rejects path-shaped ids", () => {
  assert.throws(() => createLocalRunRecord({
    resourceId: "resource.bad",
    sessionId: "session.bad",
    runId: ["runs", "bad"].join("/")
  }), /opaque id/u);
});

test("local run state-machine public contract documents recovery and cleanup", () => {
  const text = fs.readFileSync("docs/contracts/local-run-state-machine.md", "utf8");
  for (const phrase of [
    "deterministic",
    "stale incomplete",
    "cleanup-required",
    "forbidden transition"
  ]) {
    assert.match(text, new RegExp(escapeRegExp(phrase), "u"));
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
