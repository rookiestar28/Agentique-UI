import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  executeNodeAdapterRun,
  reviewNodeAdapterExecution,
  reviewNodePackagePolicy,
  sampleNodeAdapterInput,
  sampleNodeRunnerCapabilityInput,
  startNodeAdapterRun
} from "../src/core/node-adapter-runner.mjs";

const rootDir = ".tmp/node-adapter-runner-test";
const now = "2026-06-12T00:00:00.000Z";

test("node adapter runner validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-node-adapter-runner.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.ok(result.summary.files >= 7);
});

test("signed allowlisted packaged node adapter executes and writes run folder evidence", async () => {
  resetRoot();
  const result = await executeNodeAdapterRun(sampleNodeAdapterInput, { rootDir, now });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.status, "succeeded");
  assert.equal(result.launched, true);
  assert.equal(result.packagePolicy.packageManager, "blocked");
  assert.equal(result.health.ready, true);
  assert.equal(result.write.ok, true);
  for (const file of [
    "runs/run-node-001/run.json",
    "runs/run-node-001/logs/stdout.log",
    "runs/run-node-001/logs/stderr.log",
    "runs/run-node-001/outputs/node-result.json",
    "runs/run-node-001/artifacts/node-result.json",
    "runs/run-node-001/write-receipt.json"
  ]) {
    assert.equal(fs.existsSync(path.join(rootDir, file)), true, file);
  }
  assert.equal(result.environment.forwardedAmbient.length, 0);
  assert.ok(result.environment.adapterEnvKeys.includes("AGENTIQUE_RUN_ID"));
  assert.ok(result.environment.adapterEnvKeys.includes("NODE_NO_WARNINGS"));
});

test("unsigned tampered and revoked node adapters fail before launch", async () => {
  const unsigned = await executeNodeAdapterRun(sampleNodeAdapterInput, {
    rootDir,
    now,
    capabilityInput: mutateCapabilityInput((capability) => {
      capability.adapterPack.signature.status = "missing";
    })
  });
  const tampered = await executeNodeAdapterRun(sampleNodeAdapterInput, {
    rootDir,
    now,
    capabilityInput: mutateCapabilityInput((capability) => {
      capability.adapterPack.artifact.digest = "f".repeat(64);
    })
  });
  const revoked = await executeNodeAdapterRun(sampleNodeAdapterInput, {
    rootDir,
    now,
    capabilityInput: mutateCapabilityInput((capability) => {
      capability.adapterPolicy.revokedDigests = [capability.adapterPack.artifact.digest];
    })
  });
  for (const result of [unsigned, tampered, revoked]) {
    assert.equal(result.ok, false);
    assert.equal(result.status, "blocked");
    assert.equal(result.launched, false);
    assert.ok(result.errors.some((error) => error.code === "runner.adapter-blocked"));
  }
});

test("node package manager lifecycle inline and allow-all requests fail before launch", async () => {
  const unsafePolicy = {
    entryMode: "source-folder",
    packageManager: "npm",
    installAllowed: true,
    lifecycleScripts: "enabled",
    inlineScripts: true,
    broadSubprocess: true,
    allowAllEquivalent: true
  };
  const review = reviewNodePackagePolicy(unsafePolicy);
  assert.equal(review.ok, false);
  for (const code of [
    "node-adapter.entry-mode",
    "node-adapter.package-manager",
    "node-adapter.install",
    "node-adapter.lifecycle",
    "node-adapter.inline-script",
    "node-adapter.broad-subprocess",
    "node-adapter.allow-all"
  ]) {
    assert.ok(review.errors.some((error) => error.code === code), code);
  }
  const result = await executeNodeAdapterRun(sampleNodeAdapterInput, { rootDir, now, packagePolicy: unsafePolicy });
  assert.equal(result.ok, false);
  assert.equal(result.launched, false);
  assert.equal(result.status, "blocked");
});

test("node adapter cancellation is graceful and writes cleanup receipt", async () => {
  resetRoot();
  const run = startNodeAdapterRun({
    ...sampleNodeAdapterInput,
    runId: "run-node-cancel",
    mode: "sleep",
    sleepMs: 5000
  }, { rootDir, now, timeoutMs: 10000 });
  setTimeout(() => run.cancel("test cancellation"), 50);
  const result = await run.promise;
  assert.equal(result.ok, false);
  assert.equal(result.status, "canceled");
  assert.equal(result.cleanup.ok, true);
  assert.equal(fs.existsSync(path.join(rootDir, "runs/run-node-cancel/cleanup-receipt.json")), true);
});

test("node adapter logs are redacted before evidence write", async () => {
  resetRoot();
  const result = await executeNodeAdapterRun({
    ...sampleNodeAdapterInput,
    runId: "run-node-secret",
    mode: "secret"
  }, { rootDir, now });
  const rawMarker = "bearer " + "abcdefghijklmnop";
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(escapeRegExp(rawMarker), "u"));
  const stderr = fs.readFileSync(path.join(rootDir, "runs/run-node-secret/logs/stderr.log"), "utf8");
  assert.doesNotMatch(stderr, new RegExp(escapeRegExp(rawMarker), "u"));
  assert.match(stderr, /redacted:inline-sensitive-material/u);
});

test("node adapter runner review succeeds", async () => {
  const review = await reviewNodeAdapterExecution({ rootDir: ".tmp/node-adapter-runner-review-test" });
  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.environmentClean, true);
  assert.equal(review.checks.unsafePolicyBlockedBeforeLaunch, true);
});

test("node adapter public contract documents execution boundaries", () => {
  const text = fs.readFileSync("docs/contracts/node-adapter-runner.md", "utf8");
  for (const phrase of [
    "signed and allowlisted",
    "packaged adapter",
    "fail before launch",
    "package manager",
    "lifecycle scripts",
    "inline scripts",
    "cleanup receipt"
  ]) {
    assert.match(text, new RegExp(escapeRegExp(phrase), "u"));
  }
});

function resetRoot() {
  fs.rmSync(rootDir, { recursive: true, force: true });
}

function mutateCapabilityInput(mutator) {
  const capability = JSON.parse(JSON.stringify(sampleNodeRunnerCapabilityInput));
  mutator(capability);
  return capability;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
