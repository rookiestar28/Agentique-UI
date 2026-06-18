import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readReleaseMetadata, requiredBundleTargets, validateReleaseMetadata } from "../src/core/release-metadata.mjs";

test("release metadata synchronizes package Tauri and Cargo versions", () => {
  const result = validateReleaseMetadata(readReleaseMetadata());

  assert.equal(result.ok, true);
  assert.equal(result.version, "0.1.0");
  assert.equal(result.bundleActive, true);
  for (const target of requiredBundleTargets) {
    assert.ok(result.targets.includes(target), `missing target ${target}`);
  }
});

test("default Tauri capability still grants no runtime permissions", () => {
  const capability = JSON.parse(fs.readFileSync("src-tauri/capabilities/default.json", "utf8"));
  assert.deepEqual(capability.permissions, []);
});

test("release metadata validator detects version drift", () => {
  const metadata = readReleaseMetadata();
  metadata.tauriConfig.version = "0.2.0";
  const result = validateReleaseMetadata(metadata);

  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.code === "metadata.version-drift"));
});

