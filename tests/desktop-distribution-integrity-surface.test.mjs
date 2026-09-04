import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("release policy requires exactly Windows and Linux while macOS remains explicitly skipped", () => {
  const updater = JSON.parse(fs.readFileSync("release/updater-policy.spec.json", "utf8"));
  const smoke = JSON.parse(fs.readFileSync("release/smoke-plan.spec.json", "utf8"));
  const workflow = JSON.parse(fs.readFileSync("release/github-release-workflow.spec.json", "utf8"));
  const finalGate = JSON.parse(fs.readFileSync("release/final-readiness.spec.json", "utf8"));
  const tauri = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));

  assert.deepEqual(updater.requiredPlatforms, ["windows-x86_64", "linux-x86_64"]);
  assert.deepEqual(Object.keys(smoke.platforms), ["windows", "linux"]);
  assert.deepEqual(workflow.requiredRunners, ["windows-latest", "ubuntu-22.04"]);
  assert.equal(finalGate.requiredGates.includes("macos"), false);
  assert.deepEqual(finalGate.skippedPlatforms, ["macos"]);
  assert.equal(tauri.bundle.targets.includes("app"), false);
  assert.equal(tauri.bundle.targets.includes("dmg"), false);
  assert.equal(tauri.bundle.createUpdaterArtifacts, false);
  assert.equal(tauri.plugins?.updater, undefined);
});
