import assert from "node:assert/strict";
import test from "node:test";
import {
  artifactReceiptBindingSchemaVersion,
  createArtifactReceiptBinding,
  createArtifactReceiptViewerSurface,
  reviewArtifactReceiptBindingGate
} from "../src/core/artifact-receipt-binding.mjs";

test("artifact receipts bind run identity digest size mime retention and cleanup", () => {
  const binding = createArtifactReceiptBinding({ scenario: "success" });

  assert.equal(binding.schemaVersion, artifactReceiptBindingSchemaVersion);
  assert.equal(binding.nativeReadback.nativeBacked, true);
  assert.equal(binding.receipts[0].runId, "run-history-success");
  assert.equal(binding.receipts[0].artifactId, "artifact-result-json");
  assert.match(binding.receipts[0].digest, /^[a-f0-9]{64}$/u);
  assert.equal(binding.receipts[0].sizeBytes, 128);
  assert.equal(binding.receipts[0].mimeType, "application/json");
  assert.equal(binding.receipts[0].retention.policy, "retain-until-cleanup");
  assert.equal(binding.receipts[0].cleanup.state, "pending");
});

test("approved low-risk viewer families render only safe redacted previews", () => {
  const surface = createArtifactReceiptViewerSurface({ scenario: "success" });
  const receipt = surface.binding.receipts[0];

  assert.equal(receipt.viewer.family, "json");
  assert.equal(receipt.viewer.previewMode, "safe-inline");
  assert.equal(receipt.viewer.activeContent, false);
  assert.equal(receipt.preview.renderable, true);
  assert.equal(receipt.preview.redacted, true);
  assert.doesNotMatch(JSON.stringify(surface), /vault:[a-z]|bearer\s+|cookie=|<script|onerror=/iu);
});

test("risky viewer families are metadata-only or sandbox-required", () => {
  const binding = createArtifactReceiptBinding({ scenario: "risky-family" });
  const risky = binding.receipts[0];

  assert.equal(risky.viewer.family, "html");
  assert.equal(risky.viewer.activeContent, true);
  assert.equal(risky.viewer.previewMode, "sandbox-required");
  assert.equal(risky.preview.renderable, false);
  assert.equal(risky.preview.reason, "sandbox-required");
});

test("artifact states cover success failure canceled and cleanup-required evidence", () => {
  const surface = createArtifactReceiptViewerSurface({ scenario: "matrix" });
  const states = new Set(surface.stateMatrix.map((entry) => entry.runState));

  for (const state of ["succeeded", "failed", "canceled", "cleanup-required"]) {
    assert.equal(states.has(state), true, state);
  }
  assert.equal(surface.stateMatrix.find((entry) => entry.runState === "cleanup-required").cleanupRequired, true);
  assert.equal(surface.stateMatrix.find((entry) => entry.runState === "canceled").previewMode, "metadata-only");
});

test("artifact receipt binding rejects traversal local paths and sensitive material", () => {
  assert.throws(
    () =>
      createArtifactReceiptBinding({
        scenario: "success",
        overrideReceipt: {
          artifactPath: "../outside/raw.html"
        }
      }),
    /safe relative artifact path/u
  );

  assert.throws(
    () =>
      createArtifactReceiptBinding({
        scenario: "success",
        overrideReceipt: {
          previewText: "bearer abcdefghijklmnop cookie=secret"
        }
      }),
    /unsafe artifact receipt/u
  );
});

test("artifact receipt binding gate proves receipt policy and no capability widening", () => {
  const review = reviewArtifactReceiptBindingGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.runIdentityBound, true);
  assert.equal(review.checks.digestSizeMimeRetention, true);
  assert.equal(review.checks.safePreviewPolicy, true);
  assert.equal(review.checks.riskyFamiliesRestricted, true);
  assert.equal(review.checks.cleanupAwareStates, true);
  assert.equal(review.checks.unsafeReceiptsRejected, true);
  assert.equal(review.checks.noCapabilityWidening, true);
});
