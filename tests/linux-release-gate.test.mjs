import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLinuxEvidenceSafe,
  readLinuxReleaseInputs,
  sampleLinuxBlockedEvidence,
  sampleLinuxReadyEvidence,
  validateLinuxReleaseGate
} from "../src/core/linux-release-gate.mjs";

test("Linux release gate is valid but blocked without package evidence", () => {
  const result = validateLinuxReleaseGate(readLinuxReleaseInputs());

  assert.equal(result.ok, true);
  assert.equal(result.ready, false);
  assert.equal(result.publicationAllowed, false);
  assert.deepEqual(result.bundleTargets, ["deb", "rpm", "appimage"]);
  assert.ok(result.blockers.some((blocker) => blocker.code === "linux.artifact-missing"));
  assert.ok(result.blockers.some((blocker) => blocker.code === "linux.webkitgtk-missing"));
  assert.equal(result.summary.updaterArtifact, "blocked");
});

test("Linux release gate accepts complete path-neutral evidence", () => {
  const inputs = readLinuxReleaseInputs();
  const result = validateLinuxReleaseGate({ ...inputs, evidence: sampleLinuxReadyEvidence });

  assert.equal(result.ok, true);
  assert.equal(result.ready, true);
  assert.equal(result.publicationAllowed, true);
  assert.equal(result.summary.compatibility, "passed");
  assert.equal(result.summary.updaterArtifact, "appimage");
});

test("Linux release evidence rejects local path material", () => {
  assert.throws(
    () =>
      assertLinuxEvidenceSafe({
        ...sampleLinuxBlockedEvidence,
        artifacts: [
          {
            target: "appimage",
            fileName: ["/", "tmp/agentique-ui.AppImage"].join(""),
            sha256: "2".repeat(64)
          }
        ]
      }),
    (error) => error.code === "linux.local-path"
  );
});
