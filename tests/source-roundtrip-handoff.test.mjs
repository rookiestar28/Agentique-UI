import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSourceRoundTripHandoffSafe,
  createSourceRoundTripHandoff,
  reviewSourceRoundTripHandoffGate,
  sourceRoundTripHandoffSchemaVersion
} from "../src/core/source-roundtrip-handoff.mjs";

test("first-class platform samples produce source-preserving export descriptors", () => {
  const review = createSourceRoundTripHandoff();

  assert.equal(review.schemaVersion, sourceRoundTripHandoffSchemaVersion);
  assert.equal(review.status, "round-trip-review-ready");
  assert.deepEqual(review.exports.map((entry) => entry.platform), ["n8n", "dify", "langgraph"]);
  assert.equal(review.summary.sourceFilesPreserved, 3);
  assert.equal(review.exports.every((entry) => entry.sourceFile.emitsOriginalSourceFile), true);
  assert.equal(review.exports.every((entry) => entry.sourceFile.rawBytesEmbedded === false), true);
  assert.equal(review.exports.every((entry) => entry.sourceEnvelope.sourceMapNodes > 0), true);
  assertSourceRoundTripHandoffSafe(review);
});

test("lossy normalization is mapped to explicit loss-report entries", () => {
  const review = createSourceRoundTripHandoff();

  for (const entry of review.exports) {
    const lossyTotal = entry.agentiqueMetadata.lossReport.degraded +
      entry.agentiqueMetadata.lossReport.blocked +
      entry.agentiqueMetadata.lossReport.handoffOnly;
    if (lossyTotal > 0) {
      assert.equal(entry.lossEntries.length > 0, true, entry.platform);
      assert.equal(entry.lossEntries.every((loss) => loss.executionEligible === false), true);
    }
  }
});

test("platform handoff descriptors include credentials providers permissions and blocked reasons", () => {
  const review = createSourceRoundTripHandoff();
  const n8n = review.exports.find((entry) => entry.platform === "n8n");
  const dify = review.exports.find((entry) => entry.platform === "dify");
  const langgraph = review.exports.find((entry) => entry.platform === "langgraph");

  assert.equal(review.summary.localExecutableNodes > 0, true);
  assert.equal(review.summary.handoffNeeds > 0, true);
  assert.equal(n8n.handoffDescriptors.some((entry) => entry.credentialReferenceCount > 0), true);
  assert.equal(n8n.handoffDescriptors.some((entry) => entry.permissionFamilies.includes("secrets")), true);
  assert.equal(dify.handoffDescriptors.some((entry) => entry.providerDependencies.includes("openai")), true);
  assert.equal(langgraph.handoffDescriptors.some((entry) => entry.targetCategory === "source-platform-runtime"), true);
  assert.equal(review.sourcePlatformHandoffs.every((entry) => entry.localExecutionAllowed === false), true);
  assert.equal(review.sourcePlatformHandoffs.every((entry) => entry.startsBridge === false && entry.startsRuntime === false), true);
});

test("descriptor safety rejects raw secrets paths commands and executable bridge claims", () => {
  const unsafeValues = [
    { value: `sk-${"a".repeat(20)}` },
    { value: ["C:", "Users", "example"].join("\\") },
    { value: "npm install unsafe-package" },
    { descriptor: { startsBridge: true } },
    { sourceFile: { rawSource: "workflow body" } },
    { private: [".", "planning"].join("") }
  ];

  for (const unsafe of unsafeValues) {
    assert.throws(
      () => assertSourceRoundTripHandoffSafe(unsafe),
      (error) => [
        "vault.inline-secret",
        "source-roundtrip.unsafe-path",
        "source-roundtrip.command-text",
        "source-roundtrip.executable-claim",
        "source-roundtrip.raw-source",
        "source-roundtrip.private-marker"
      ].includes(error.code)
    );
  }
});

test("source round-trip handoff review gate passes", () => {
  const review = reviewSourceRoundTripHandoffGate();

  assert.equal(review.ok, true);
  assert.equal(review.checks.platforms, 3);
  assert.equal(review.checks.sourceFilesPreserved, 3);
  assert.equal(review.checks.handoffNeeds > 0, true);
  assert.equal(review.checks.bridgeDisabled, true);
});
