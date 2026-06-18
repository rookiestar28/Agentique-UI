import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  createPythonNodeAdapterPackExpansion,
  pythonNodeAdapterPackExpansionSchemaVersion,
  reviewPythonNodeAdapterPackExpansion
} from "../src/core/python-node-adapter-pack-expansion.mjs";

test("python node adapter pack expansion accepts only fixed allowlisted packs", () => {
  const review = createPythonNodeAdapterPackExpansion();
  const runtimes = new Set(review.packs.map((pack) => pack.runtime));
  const adapterIds = new Set(review.packs.map((pack) => pack.adapterId));

  assert.equal(review.schemaVersion, pythonNodeAdapterPackExpansionSchemaVersion);
  assert.equal(review.packs.length, 2);
  assert.deepEqual([...runtimes].sort(), ["node", "python"]);
  assert.deepEqual([...adapterIds].sort(), ["adapter.local-node", "adapter.local-python"]);

  for (const pack of review.packs) {
    assert.equal(pack.fixed, true);
    assert.equal(pack.allowlisted, true);
    assert.equal(pack.manifest.signature, "verified");
    assert.match(pack.manifest.digest, /^[a-f0-9]{16}$/u);
    assert.equal(pack.manifest.signer, "agentique-adapter-release");
    assert.equal(pack.hostPrerequisites.ok, true);
    assert.equal(pack.permissionCeiling.shell, "deny");
    assert.equal(pack.permissionCeiling.environment, "deny");
    assert.equal(pack.permissionCeiling.browserData, "deny");
    assert.equal(pack.permissionCeiling.containers, "deny");
    assert.equal(pack.permissionCeiling.externalProviders, "deny");
    assert.equal(pack.watchdog.status, "supervised");
    assert.equal(pack.nativeEvents.transport, "native-event-stream");
    assert.ok(pack.artifacts.receipts.length >= 2);
    assert.equal(pack.cleanup.receipt.endsWith("cleanup-receipt.json"), true);
    assert.equal(pack.environment.forwardedAmbient.length, 0);
  }
});

test("python node adapter pack expansion keeps package lifecycle and authority denied", () => {
  const review = createPythonNodeAdapterPackExpansion();

  for (const pack of review.packs) {
    assert.equal(pack.packagePolicy.installAllowed, false);
    assert.equal(pack.packagePolicy.packageManager, "blocked");
    assert.equal(pack.packagePolicy.lifecycleScripts, "blocked");
    assert.equal(pack.packagePolicy.inlineScripts, false);
    assert.equal(pack.packagePolicy.broadSubprocess, false);
    assert.equal(pack.authority.autoInstall, false);
    assert.equal(pack.authority.lifecycleHooks, false);
    assert.equal(pack.authority.newRuntimeLane, false);
    assert.equal(pack.authority.browserData, false);
    assert.equal(pack.authority.ambientEnvironment, false);
    assert.equal(pack.authority.containerStart, false);
    assert.equal(pack.authority.providerAutomation, false);
  }
});

test("python node adapter pack expansion blocks unsafe samples before launch", () => {
  const review = createPythonNodeAdapterPackExpansion();
  const reasons = new Set(review.blockedSamples.map((sample) => sample.reason));

  for (const reason of [
    "unsigned",
    "unallowlisted",
    "runtime-mismatch",
    "broad-permission",
    "missing-host-prerequisite",
    "stale-watchdog",
    "missing-artifact-receipt",
    "missing-cleanup",
    "package-install",
    "lifecycle-script",
    "inline-script",
    "broad-subprocess",
    "ambient-env",
    "browser-data",
    "container-start",
    "provider-automation"
  ]) {
    assert.equal(reasons.has(reason), true, reason);
  }
  assert.equal(
    review.blockedSamples.every((sample) => sample.launched === false),
    true
  );
});

test("python node adapter pack expansion review passes and stays browser safe", () => {
  const validation = reviewPythonNodeAdapterPackExpansion();
  const moduleText = fs.readFileSync("src/core/python-node-adapter-pack-expansion.mjs", "utf8");

  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(validation.checks.fixedAllowlistedPacks, 2);
  assert.equal(validation.checks.blockedBeforeLaunch, 16);
  assert.equal(validation.checks.forwardedAmbient, 0);
  assert.doesNotMatch(moduleText, /node:child_process|node:fs|from\s+["'][^"']*(?:python|node)-adapter-runner|import\s*\([^)]*(?:python|node)-adapter-runner/u);
});
