import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  assertReleasePackagingPreflightEvidenceSafe,
  readReleasePackagingPreflightInputs,
  sampleReleasePackagingPreflightReadyEvidence,
  validateReleasePackagingPreflight
} from "../src/core/release-packaging-preflight.mjs";

test("release packaging preflight reports a no-go evidence matrix before artifacts exist", () => {
  const result = validateReleasePackagingPreflight(readReleasePackagingPreflightInputs());

  assert.equal(result.ok, true);
  assert.equal(result.ready, false);
  assert.equal(result.publicationAllowed, false);
  assert.equal(result.decision, "no-go");
  assert.equal(result.status, "blocked");
  assert.ok(result.summary.blockedEntries >= 8);
  assert.equal(result.summary.readyEntries, 0);
  assert.deepEqual(result.summary.missingRequiredEntries, []);
  assert.deepEqual(result.summary.unexpectedEntries, []);

  const entryNames = result.matrix.map((entry) => entry.name);
  assert.ok(entryNames.includes("windows-installer"));
  assert.ok(entryNames.includes("macos-package"));
  assert.ok(entryNames.includes("linux-package"));
  assert.ok(entryNames.includes("signing-and-notarization"));
  assert.ok(entryNames.includes("updater-metadata"));
  assert.ok(entryNames.includes("checksums"));
  assert.ok(entryNames.includes("sbom-and-provenance"));
  assert.ok(entryNames.includes("clean-install-update-uninstall-smoke"));
  assert.ok(entryNames.includes("rollback"));
  assert.ok(entryNames.includes("public-boundary-scan"));
  assert.ok(entryNames.includes("owner-review"));

  assert.ok(result.blockers.some((blocker) => blocker.code === "release-packaging.owner-review-missing"));
  assert.equal(result.claims.releasedInstaller, false);
  assert.equal(result.claims.signedUpdater, false);
  assert.equal(result.claims.productionRuntime, false);
});

test("release packaging preflight can model go only when every evidence family is ready", () => {
  const result = validateReleasePackagingPreflight(readReleasePackagingPreflightInputs({ evidence: sampleReleasePackagingPreflightReadyEvidence }));

  assert.equal(result.ok, true);
  assert.equal(result.ready, true);
  assert.equal(result.publicationAllowed, true);
  assert.equal(result.decision, "go");
  assert.equal(result.status, "ready");
  assert.equal(result.summary.readyEntries, result.summary.totalEntries);
  assert.equal(result.blockers.length, 0);
});

test("release packaging preflight require-ready mode fails closed while current evidence is incomplete", () => {
  assert.throws(
    () =>
      execFileSync(process.execPath, ["scripts/check-release-packaging-preflight.mjs", "--require-ready"], {
        encoding: "utf8"
      }),
    (error) => error.status === 1 && /"decision": "no-go"/u.test(error.stderr)
  );
});

test("release packaging preflight evidence safety rejects private or local material", () => {
  assert.throws(
    () => assertReleasePackagingPreflightEvidenceSafe({ note: ["C", ":\\release\\installer.msi"].join("") }),
    (error) => error.code === "release-packaging.local-path" && /local path/u.test(error.message)
  );
  assert.throws(
    () => assertReleasePackagingPreflightEvidenceSafe({ note: [".", "planning"].join("") }),
    (error) => error.code === "release-packaging.private-reference" && /private planning/u.test(error.message)
  );
});
