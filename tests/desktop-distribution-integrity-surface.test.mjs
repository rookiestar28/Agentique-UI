import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("distribution integrity is registered in validation and public contract surfaces", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const contract = fs.readFileSync("docs/contracts/desktop-distribution-integrity.md", "utf8");
  const checker = fs.readFileSync("scripts/check-desktop-distribution-integrity.mjs", "utf8");

  assert.match(packageJson.scripts["validate:desktop-distribution-integrity"], /check-desktop-distribution-integrity/u);
  assert.match(packageJson.scripts.validate, /validate:desktop-distribution-integrity/u);
  assert.match(contract, /Windows and Linux/u);
  assert.match(contract, /ephemeral test key/u);
  assert.match(contract, /does not establish production signing/u);
  assert.match(checker, /wrongChannelBlocked/u);
  assert.match(checker, /rollbackFloorBlocked/u);
});

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

test("public release surfaces retain production No-Go and macOS non-claims", () => {
  const files = [
    "README.md",
    "SECURITY.md",
    "SUPPORT.md",
    "docs/release/final-readiness.md",
    "docs/release/install.md",
    "docs/release/updater.md",
    "docs/release/smoke-tests.md",
    "docs/release/github-actions.md"
  ];
  const text = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

  assert.match(text, /macOS[^\n]*(?:skipped|unverified|unsupported)/u);
  assert.match(text, /production[^\n]*(?:blocked|No-Go|not)/iu);
  assert.match(text, /real production signing/u);
  assert.doesNotMatch(text, /production desktop runtime is released/u);
});
