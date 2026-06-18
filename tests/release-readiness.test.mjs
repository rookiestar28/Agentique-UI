import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertReleaseEvidenceSafe,
  evaluateDistributionReadiness,
  sampleCompleteDistributionEvidence,
  sampleIncompleteDistributionEvidence
} from "../src/core/release-readiness.mjs";

test("missing evidence blocks distribution readiness", () => {
  const result = evaluateDistributionReadiness(sampleIncompleteDistributionEvidence);

  assert.equal(result.ok, false);
  assert.equal(result.bundleActive, false);
  assert.ok(result.blockers.some((blocker) => blocker.code === "distribution.bundle-disabled"));
  assert.ok(result.blockers.some((blocker) => blocker.code === "distribution.installerArtifact-missing"));
  assert.equal(result.summary.readyPlatforms, 0);
});

test("complete sample evidence passes readiness checks without installing", () => {
  const result = evaluateDistributionReadiness(sampleCompleteDistributionEvidence);

  assert.equal(result.ok, true);
  assert.equal(result.summary.readyPlatforms, 3);
  assert.equal(result.summary.blockers, 0);
  assert.equal(result.publishIntent, "manual-review-required");
});

test("unsafe evidence fails closed", () => {
  const unsafe = evaluateDistributionReadiness({
    ...sampleCompleteDistributionEvidence,
    platforms: {
      ...sampleCompleteDistributionEvidence.platforms,
      windows: {
        ...sampleCompleteDistributionEvidence.platforms.windows,
        installerArtifact: { status: "present", detail: ["C", ":\\release\\installer.msi"].join("") }
      }
    }
  });

  assert.equal(unsafe.ok, false);
  assert.equal(unsafe.blockers[0].code, "distribution.unsafe-path");
});

test("distribution readiness docs avoid released installer claims", () => {
  const text = fs.readFileSync("docs/validation/distribution-readiness.md", "utf8");

  assert.match(text, /no released installer/u);
  assert.match(text, /does not yet publish a desktop installer/u);
  assert.match(text, /bundle metadata active/u);
  assert.match(text, /npm run validate/u);
  assert.doesNotMatch(text, /ships a desktop installer\./u);
});

test("release evidence safety rejects private planning markers", () => {
  assert.throws(
    () => assertReleaseEvidenceSafe({ note: [".", "planning"].join("") }),
    (error) => error.code === "distribution.unsafe-output" && /private planning/u.test(error.message)
  );
});
