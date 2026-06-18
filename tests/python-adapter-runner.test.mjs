import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  executePythonAdapterRun,
  reviewPythonAdapterExecution,
  samplePythonAdapterInput,
  startPythonAdapterRun
} from "../src/core/python-adapter-runner.mjs";
import { sampleRunnerCapabilityInput } from "../src/core/runner-capability.mjs";

const rootDir = ".tmp/python-adapter-runner-test";
const now = "2026-06-12T00:00:00.000Z";

test("python adapter runner validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-python-adapter-runner.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.ok(result.summary.files >= 7);
});

test("signed allowlisted python adapter executes and writes run folder evidence", async () => {
  resetRoot();
  const result = await executePythonAdapterRun(samplePythonAdapterInput, { rootDir, now });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.status, "succeeded");
  assert.equal(result.launched, true);
  assert.equal(result.health.ready, true);
  assert.equal(result.write.ok, true);
  for (const file of [
    "runs/run-python-001/run.json",
    "runs/run-python-001/logs/stdout.log",
    "runs/run-python-001/logs/stderr.log",
    "runs/run-python-001/outputs/python-result.json",
    "runs/run-python-001/artifacts/python-result.json",
    "runs/run-python-001/write-receipt.json"
  ]) {
    assert.equal(fs.existsSync(path.join(rootDir, file)), true, file);
  }
  assert.equal(result.environment.forwardedAmbient.length, 0);
  assert.ok(result.environment.adapterEnvKeys.includes("AGENTIQUE_RUN_ID"));
  assert.ok(result.environment.adapterEnvKeys.includes("PYTHONNOUSERSITE"));
});

test("unsigned python adapter fails before launch", async () => {
  const result = await executePythonAdapterRun(samplePythonAdapterInput, {
    rootDir,
    now,
    capabilityInput: mutateCapabilityInput((capability) => {
      capability.adapterPack.signature.status = "missing";
    })
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.launched, false);
  assert.ok(result.errors.some((error) => error.code === "runner.adapter-blocked"));
});

test("tampered and revoked python adapters fail before launch", async () => {
  const tampered = await executePythonAdapterRun(samplePythonAdapterInput, {
    rootDir,
    now,
    capabilityInput: mutateCapabilityInput((capability) => {
      capability.adapterPack.artifact.digest = "c".repeat(64);
    })
  });
  const revoked = await executePythonAdapterRun(samplePythonAdapterInput, {
    rootDir,
    now,
    capabilityInput: mutateCapabilityInput((capability) => {
      capability.adapterPolicy.revokedDigests = [capability.adapterPack.artifact.digest];
    })
  });
  assert.equal(tampered.launched, false);
  assert.equal(revoked.launched, false);
  assert.ok(tampered.errors.some((error) => error.code === "runner.adapter-blocked"));
  assert.ok(revoked.errors.some((error) => error.code === "runner.adapter-blocked"));
});

test("python adapter timeout writes cleanup receipt", async () => {
  resetRoot();
  const result = await executePythonAdapterRun({
    ...samplePythonAdapterInput,
    runId: "run-python-timeout",
    mode: "sleep",
    sleepMs: 5000
  }, { rootDir, now, timeoutMs: 50 });
  assert.equal(result.ok, false);
  assert.equal(result.status, "timed-out");
  assert.equal(result.launched, true);
  assert.equal(result.cleanup.ok, true);
  assert.equal(fs.existsSync(path.join(rootDir, "runs/run-python-timeout/cleanup-receipt.json")), true);
});

test("python adapter cancellation is graceful and writes cleanup receipt", async () => {
  resetRoot();
  const run = startPythonAdapterRun({
    ...samplePythonAdapterInput,
    runId: "run-python-cancel",
    mode: "sleep",
    sleepMs: 5000
  }, { rootDir, now, timeoutMs: 10000 });
  setTimeout(() => run.cancel("test cancellation"), 50);
  const result = await run.promise;
  assert.equal(result.ok, false);
  assert.equal(result.status, "canceled");
  assert.equal(result.cleanup.ok, true);
  assert.equal(fs.existsSync(path.join(rootDir, "runs/run-python-cancel/cleanup-receipt.json")), true);
});

test("python adapter logs are redacted before evidence write", async () => {
  resetRoot();
  const result = await executePythonAdapterRun({
    ...samplePythonAdapterInput,
    runId: "run-python-secret",
    mode: "secret"
  }, { rootDir, now });
  const rawMarker = "bearer " + "abcdefghijklmnop";
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(escapeRegExp(rawMarker), "u"));
  const stderr = fs.readFileSync(path.join(rootDir, "runs/run-python-secret/logs/stderr.log"), "utf8");
  assert.doesNotMatch(stderr, new RegExp(escapeRegExp(rawMarker), "u"));
  assert.match(stderr, /redacted:inline-sensitive-material/u);
});

test("python adapter runner review succeeds", async () => {
  const review = await reviewPythonAdapterExecution({ rootDir: ".tmp/python-adapter-runner-review-test" });
  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.environmentClean, true);
  assert.equal(review.checks.timeoutCleanup, true);
});

test("python adapter public contract documents execution boundaries", () => {
  const text = fs.readFileSync("docs/contracts/python-adapter-runner.md", "utf8");
  for (const phrase of [
    "signed and allowlisted",
    "fail before launch",
    "minimal environment",
    "timeout",
    "cancellation",
    "cleanup receipt"
  ]) {
    assert.match(text, new RegExp(escapeRegExp(phrase), "u"));
  }
});

function resetRoot() {
  fs.rmSync(rootDir, { recursive: true, force: true });
}

function mutateCapabilityInput(mutator) {
  const capability = JSON.parse(JSON.stringify(sampleRunnerCapabilityInput));
  mutator(capability);
  return capability;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
