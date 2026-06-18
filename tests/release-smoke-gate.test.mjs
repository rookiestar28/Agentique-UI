import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertSmokeEvidenceSafe,
  readReleaseSmokeInputs,
  sampleSmokeBlockedEvidence,
  sampleSmokeReadyEvidence,
  validateReleaseSmokeGate
} from "../src/core/release-smoke-gate.mjs";

test("release smoke gate is configured but blocked without evidence", () => {
  const result = validateReleaseSmokeGate(readReleaseSmokeInputs());

  assert.equal(result.ok, true);
  assert.equal(result.ready, false);
  assert.equal(result.publicationAllowed, false);
  assert.ok(result.blockers.some((blocker) => blocker.code === "smoke.evidence-missing"));
});

test("release smoke gate accepts complete path-neutral evidence", () => {
  const inputs = readReleaseSmokeInputs();
  const result = validateReleaseSmokeGate({ ...inputs, evidence: sampleSmokeReadyEvidence });

  assert.equal(result.ok, true);
  assert.equal(result.ready, true);
  assert.equal(result.publicationAllowed, true);
});

test("release smoke scripts contain fail-closed platform checks", () => {
  const windows = fs.readFileSync("scripts/release-smoke-windows.ps1", "utf8");
  const macos = fs.readFileSync("scripts/release-smoke-macos.sh", "utf8");
  const linux = fs.readFileSync("scripts/release-smoke-linux.sh", "utf8");

  assert.match(windows, /Get-AuthenticodeSignature/u);
  assert.match(macos, /codesign --verify/u);
  assert.match(macos, /spctl --assess/u);
  assert.match(linux, /\*\.AppImage/u);
});

test("release smoke evidence rejects local path material", () => {
  assert.throws(
    () => assertSmokeEvidenceSafe({
      ...sampleSmokeBlockedEvidence,
      platforms: {
        ...sampleSmokeBlockedEvidence.platforms,
        windows: { logSummary: ["C", ":\\release\\smoke.log"].join("") }
      }
    }),
    (error) => error.code === "smoke.local-path"
  );
});

test("release smoke docs describe install update uninstall cleanup and redaction", () => {
  const text = fs.readFileSync("docs/release/smoke-tests.md", "utf8");

  for (const phrase of ["install", "launch", "version", "update", "uninstall", "cleanup", "redacted logs"]) {
    assert.match(text, new RegExp(phrase, "u"));
  }
});
