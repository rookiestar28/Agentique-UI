import assert from "node:assert/strict";
import test from "node:test";
import {
  assertReleaseEvidenceSafe,
  readWindowsReleaseInputs,
  sampleWindowsBlockedEvidence,
  sampleWindowsReadyEvidence,
  validateWindowsReleaseGate
} from "../src/core/windows-release-gate.mjs";

test("Windows release gate is valid but blocked without installer evidence", () => {
  const result = validateWindowsReleaseGate(readWindowsReleaseInputs());

  assert.equal(result.ok, true);
  assert.equal(result.ready, false);
  assert.equal(result.publicationAllowed, false);
  assert.deepEqual(result.bundleTargets, ["nsis", "msi"]);
  assert.ok(result.blockers.some((blocker) => blocker.code === "windows.artifact-missing"));
  assert.ok(result.blockers.some((blocker) => blocker.code === "windows.signature-missing"));
});

test("Windows release gate accepts complete path-neutral evidence", () => {
  const inputs = readWindowsReleaseInputs();
  const result = validateWindowsReleaseGate({ ...inputs, evidence: sampleWindowsReadyEvidence });

  assert.equal(result.ok, true);
  assert.equal(result.ready, true);
  assert.equal(result.publicationAllowed, true);
  assert.equal(result.summary.signature, "verified");
  assert.equal(result.summary.smoke, "passed");
});

test("Windows release evidence rejects local path material", () => {
  assert.throws(
    () =>
      assertReleaseEvidenceSafe({
        ...sampleWindowsBlockedEvidence,
        installerArtifacts: [
          {
            target: "msi",
            fileName: ["C", ":\\release\\Agentique.msi"].join(""),
            sha256: "c".repeat(64)
          }
        ]
      }),
    (error) => error.code === "windows.local-path"
  );
});
