import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  createRepoLocalTaskRunnerLane,
  repoLocalTaskRunnerLaneSchemaVersion,
  reviewRepoLocalTaskRunnerLane
} from "../src/core/repo-local-task-runner-lane.mjs";

test("repo local task runner lane accepts only repo-owned fixed task manifests", () => {
  const review = createRepoLocalTaskRunnerLane();
  const taskIds = new Set(review.tasks.map((task) => task.taskId));
  const commandIds = new Set(review.tasks.map((task) => task.command.id));

  assert.equal(review.schemaVersion, repoLocalTaskRunnerLaneSchemaVersion);
  assert.equal(review.tasks.length, 2);
  assert.deepEqual([...taskIds].sort(), ["task.run-unit-tests", "task.validate-public"]);
  assert.deepEqual([...commandIds].sort(), ["npm-test", "validate-public"]);

  for (const task of review.tasks) {
    assert.equal(task.manifest.repoOwned, true);
    assert.equal(task.manifest.source, "repo-local");
    assert.equal(task.command.approvedFixedCommand, true);
    assert.equal(task.command.allowlisted, true);
    assert.equal(task.command.packageInstall, false);
    assert.equal(task.command.lifecycleHook, false);
    assert.equal(task.command.generatedAdapterHook, false);
    assert.equal(task.command.downloadedWorkflow, false);
  }
});

test("repo local task runner lane records dry-run approval scope env artifact cleanup and audit evidence", () => {
  const review = createRepoLocalTaskRunnerLane();

  for (const task of review.tasks) {
    assert.equal(task.dryRun.status, "passed");
    assert.match(task.dryRun.receipt, /receipts\/tasks\/.+\.json/u);
    assert.equal(task.approval.required, true);
    assert.equal(task.approval.userApproved, true);
    assert.match(task.approval.receipt, /approval-receipt\.json$/u);
    assert.equal(task.workingDirectory.scope, "repo-relative");
    assert.equal(task.workingDirectory.insideRepo, true);
    assert.equal(task.workingDirectory.absolute, false);
    assert.equal(task.workingDirectory.traversal, false);
    assert.deepEqual(task.environment.forwardedAmbient, []);
    assert.ok(task.environment.whitelist.includes("AGENTIQUE_RUN_ID"));
    assert.ok(task.artifacts.receipts.length >= 2);
    assert.match(task.cleanup.receipt, /cleanup-receipt\.json$/u);
    assert.ok(task.audit.events.length >= 2);
  }
});

test("repo local task runner lane blocks unsafe samples before launch", () => {
  const review = createRepoLocalTaskRunnerLane();
  const reasons = new Set(review.blockedSamples.map((sample) => sample.reason));

  for (const reason of [
    "arbitrary-shell",
    "package-install",
    "lifecycle-hook",
    "generated-adapter-hook",
    "downloaded-workflow",
    "broad-subprocess",
    "ambient-env",
    "browser-data",
    "container-start",
    "provider-automation",
    "absolute-working-directory",
    "path-traversal",
    "missing-approval",
    "missing-dry-run",
    "missing-artifact-receipt",
    "missing-cleanup"
  ]) {
    assert.equal(reasons.has(reason), true, reason);
  }
  assert.equal(
    review.blockedSamples.every((sample) => sample.launched === false),
    true
  );
});

test("repo local task runner lane review passes and stays browser safe", () => {
  const validation = reviewRepoLocalTaskRunnerLane();
  const moduleText = fs.readFileSync("src/core/repo-local-task-runner-lane.mjs", "utf8");

  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(validation.checks.repoOwnedManifests, 2);
  assert.equal(validation.checks.approvedFixedCommands, 2);
  assert.equal(validation.checks.blockedBeforeLaunch, 16);
  assert.equal(validation.checks.forwardedAmbient, 0);
  assert.doesNotMatch(moduleText, /node:child_process|child_process|node:fs|spawn\(|execFile\(|exec\(/u);
});
