import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertMacosEvidenceSafe,
  readMacosReleaseInputs,
  sampleMacosBlockedEvidence,
  sampleMacosReadyEvidence,
  validateMacosReleaseGate
} from "../src/core/macos-release-gate.mjs";

test("macOS release gate is valid but blocked without notarized artifacts", () => {
  const result = validateMacosReleaseGate(readMacosReleaseInputs());

  assert.equal(result.ok, true);
  assert.equal(result.ready, false);
  assert.equal(result.publicationAllowed, false);
  assert.deepEqual(result.bundleTargets, ["app", "dmg"]);
  assert.ok(result.blockers.some((blocker) => blocker.code === "macos.artifact-missing"));
  assert.ok(result.blockers.some((blocker) => blocker.code === "macos.notarization-missing"));
});

test("macOS release gate accepts complete path-neutral evidence", () => {
  const inputs = readMacosReleaseInputs();
  const result = validateMacosReleaseGate({ ...inputs, evidence: sampleMacosReadyEvidence });

  assert.equal(result.ok, true);
  assert.equal(result.ready, true);
  assert.equal(result.publicationAllowed, true);
  assert.equal(result.summary.notarization, "accepted");
  assert.equal(result.summary.smoke, "passed");
});

test("macOS release evidence rejects local path material", () => {
  assert.throws(
    () => assertMacosEvidenceSafe({
      ...sampleMacosBlockedEvidence,
      artifacts: [
        {
          target: "dmg",
          fileName: ["/", "tmp/Agentique UI.dmg"].join(""),
          sha256: "e".repeat(64)
        }
      ]
    }),
    (error) => error.code === "macos.local-path"
  );
});

test("macOS release docs preserve notarization and unsigned limitations", () => {
  const text = fs.readFileSync("docs/release/macos-signing-notarization.md", "utf8");

  assert.match(text, /app and DMG/u);
  assert.match(text, /Developer ID/u);
  assert.match(text, /notarization/u);
  assert.match(text, /Ad-hoc or unsigned artifacts are for local smoke only/u);
  assert.match(text, /npm run validate:release-macos/u);
});
