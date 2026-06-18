import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  createCuratedAdapterExecutionLane,
  curatedAdapterExecutionLaneSchemaVersion,
  reviewCuratedAdapterExecutionLane
} from "../src/core/curated-adapter-execution-lane.mjs";

test("curated adapter lane exposes signed allowlisted Python and Node samples", () => {
  const review = createCuratedAdapterExecutionLane();
  const runtimes = new Set(review.lanes.map((lane) => lane.runtime));

  assert.equal(review.schemaVersion, curatedAdapterExecutionLaneSchemaVersion);
  assert.equal(runtimes.has("python"), true);
  assert.equal(runtimes.has("node"), true);
  for (const lane of review.lanes) {
    assert.equal(lane.signature, "verified");
    assert.equal(lane.allowlisted, true);
    assert.equal(lane.supportMode, "locally-runnable");
    assert.equal(lane.status, "succeeded");
    assert.ok(lane.evidence.files.includes(`runs/${lane.runId}/run.json`));
    assert.ok(lane.evidence.writeReceipt.endsWith("write-receipt.json"));
  }
});

test("curated adapter lane blocks unsafe samples before launch", () => {
  const review = createCuratedAdapterExecutionLane({ selectedRuntime: "node" });
  const reasons = new Set(review.blockedSamples.map((sample) => sample.reason));

  for (const reason of ["unsigned", "tampered", "revoked", "wrong-support-mode", "unsafe-package-policy"]) {
    assert.equal(reasons.has(reason), true, reason);
  }
  assert.equal(review.blockedSamples.every((sample) => sample.launched === false), true);
});

test("curated adapter lane environment forwarding stays adapter-scoped", () => {
  const review = createCuratedAdapterExecutionLane();

  for (const lane of review.lanes) {
    assert.equal(lane.environment.forwardedAmbient.length, 0);
    assert.ok(lane.environment.adapterEnvKeys.includes("AGENTIQUE_RUN_ID"));
    assert.doesNotMatch(JSON.stringify(lane.environment), /USERPROFILE|APPDATA|NPM_TOKEN|CONDA_PREFIX/u);
  }
});

test("curated adapter lane exposes timeout and cancellation cleanup receipts", () => {
  const review = createCuratedAdapterExecutionLane();

  assert.equal(review.cleanupSamples.length, 2);
  assert.ok(review.cleanupSamples.some((sample) => sample.runtime === "python" && sample.status === "timed-out-cleaned"));
  assert.ok(review.cleanupSamples.some((sample) => sample.runtime === "node" && sample.status === "canceled-cleaned"));
  assert.equal(review.cleanupSamples.every((sample) => sample.receipt.endsWith("cleanup-receipt.json")), true);
});

test("curated adapter lane review passes and remains browser safe", () => {
  const review = reviewCuratedAdapterExecutionLane();
  const moduleText = fs.readFileSync("src/core/curated-adapter-execution-lane.mjs", "utf8");

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.doesNotMatch(moduleText, /from\s+["'][^"']*(?:python|node)-adapter-runner|import\s*\([^)]*(?:python|node)-adapter-runner|node:child_process|node:fs/u);
});
