import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMacosEvidenceSafe,
  readMacosReleaseInputs,
  sampleMacosBlockedEvidence,
  sampleMacosReadyEvidence,
  validateMacosReleaseGate
} from "../src/core/macos-release-gate.mjs";

test("macOS release gate is valid but explicitly skipped and unverified", () => {
  const result = validateMacosReleaseGate(readMacosReleaseInputs());

  assert.equal(result.ok, true);
  assert.equal(result.ready, false);
  assert.equal(result.publicationAllowed, false);
  assert.equal(result.status, "skipped");
  assert.equal(result.summary.macosVerified, false);
  assert.ok(result.blockers.some((blocker) => blocker.code === "macos.owner-skipped"));
});

test("macOS release gate cannot become ready from supplied evidence", () => {
  const inputs = readMacosReleaseInputs();
  const result = validateMacosReleaseGate({ ...inputs, evidence: sampleMacosReadyEvidence });

  assert.equal(result.ok, true);
  assert.equal(result.ready, false);
  assert.equal(result.publicationAllowed, false);
  assert.equal(result.summary.notarization, "skipped");
  assert.equal(result.summary.smoke, "skipped");
});

test("macOS release evidence rejects local path material", () => {
  assert.throws(
    () =>
      assertMacosEvidenceSafe({
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
