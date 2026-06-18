import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { sampleWorkflowIr } from "../src/core/workflow-ir.mjs";
import {
  createWorkflowSchedule,
  reviewWorkflowScheduler,
  runWorkflowSchedule,
  sampleSchedulableWorkflowIr
} from "../src/core/workflow-scheduler.mjs";

test("workflow scheduler validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-workflow-scheduler.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.ok(result.summary.events > 0);
});

test("workflow scheduler creates deterministic topological order for branch and merge graph", () => {
  const schedule = createWorkflowSchedule(sampleSchedulableWorkflowIr);
  assert.equal(schedule.ok, true, JSON.stringify(schedule.errors));
  assert.deepEqual(schedule.order, ["source", "normalize", "classify", "merge", "handoff"]);
  assert.equal(schedule.summary.executable, 5);
});

test("workflow scheduler runs successful DAG with deterministic artifacts", () => {
  const result = runWorkflowSchedule(sampleSchedulableWorkflowIr);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.status, "succeeded");
  assert.equal(result.nodeResults.every((entry) => entry.status === "succeeded"), true);
  assert.ok(result.outputs.some((output) => output.path === "outputs/merge-previewArtifact.json"));
  assert.ok(result.artifacts.every((artifact) => artifact.path.startsWith("artifacts/")));
  assert.equal(result.cleanup.ok, true);
  assert.equal(result.cleanup.idempotent, true);
});

test("workflow scheduler blocks unsupported execution-risk nodes with visible reasons", () => {
  const schedule = createWorkflowSchedule(sampleWorkflowIr);
  assert.equal(schedule.ok, false);
  assert.equal(schedule.status, "blocked");
  assert.ok(schedule.blockers.some((blocker) => blocker.nodeId === "provider-sync"));
  assert.ok(schedule.errors.some((error) => error.code === "workflow-scheduler.unsupported-node"));

  const handoff = createWorkflowSchedule(sampleWorkflowIr, { mode: "handoff" });
  assert.equal(handoff.ok, true);
  assert.equal(handoff.status, "handoff-required");
  assert.ok(handoff.handoffReasons.some((reason) => reason.nodeId === "provider-sync"));
});

test("workflow scheduler retries a transient node failure deterministically", () => {
  const result = runWorkflowSchedule(sampleSchedulableWorkflowIr, {
    retryPolicy: { normalize: 2 },
    failAttempts: { normalize: 1 }
  });
  const normalize = result.nodeResults.find((entry) => entry.nodeId === "normalize");
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(normalize.status, "succeeded");
  assert.equal(normalize.attempts, 2);
  assert.ok(result.events.some((entry) => entry.nodeId === "normalize" && entry.type === "retry"));
});

test("workflow scheduler propagates partial failure to dependent nodes", () => {
  const result = runWorkflowSchedule(sampleSchedulableWorkflowIr, {
    retryPolicy: { normalize: 1 },
    failAttempts: { normalize: 3 }
  });
  const normalize = result.nodeResults.find((entry) => entry.nodeId === "normalize");
  const merge = result.nodeResults.find((entry) => entry.nodeId === "merge");
  const handoff = result.nodeResults.find((entry) => entry.nodeId === "handoff");
  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(normalize.status, "failed");
  assert.equal(merge.status, "skipped");
  assert.equal(handoff.status, "skipped");
  assert.equal(result.cleanup.ok, true);
});

test("workflow scheduler cancellation records cleanup and stops later nodes", () => {
  const result = runWorkflowSchedule(sampleSchedulableWorkflowIr, { cancelBeforeNodeId: "merge" });
  const merge = result.nodeResults.find((entry) => entry.nodeId === "merge");
  const handoff = result.nodeResults.find((entry) => entry.nodeId === "handoff");
  assert.equal(result.ok, false);
  assert.equal(result.status, "canceled");
  assert.equal(merge.status, "canceled");
  assert.equal(handoff.status, "canceled");
  assert.equal(result.cleanup.ok, true);
  assert.equal(result.cleanup.terminalRunStatus, "canceled");
});

test("workflow scheduler review succeeds", () => {
  const review = reviewWorkflowScheduler();
  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.failurePropagated, true);
  assert.equal(review.checks.cancellationCleanup, true);
});

test("workflow scheduler public contract documents execution boundaries", () => {
  const text = fs.readFileSync("docs/contracts/workflow-scheduler.md", "utf8");
  for (const phrase of [
    "allowlisted node families",
    "topological order",
    "branch",
    "merge",
    "retries",
    "failure propagation",
    "cancellation",
    "artifact mapping",
    "cleanup receipt"
  ]) {
    assert.match(text, new RegExp(escapeRegExp(phrase), "u"));
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
