import assert from "node:assert/strict";
import test from "node:test";
import {
  reviewSourceFirstExecutableCapability,
  reviewSourceFirstExecutableCapabilityGate,
  sampleSourceFirstExecutableCapability
} from "../src/core/source-first-executable-capability.mjs";

test("source-first executable capability posture accepts the complete boundary", () => {
  const review = reviewSourceFirstExecutableCapability(sampleSourceFirstExecutableCapability);

  assert.equal(review.ok, true);
  assert.equal(review.status, "accepted");
  assert.equal(review.sourcePosture.sourceUse, "source-checkout");
  assert.equal(review.summary.capabilityRows, 10);
  assert.equal(review.summary.acceptedRows, 10);
  assert.equal(review.summary.plannedRows, 0);
  assert.equal(review.summary.parkedReleaseClaims, 4);
  assert.equal(review.summary.nextCapability, null);
  assert.deepEqual(review.capabilityMatrix.items.at(-1).id, "closeout-validation-claim-sync");
  assert.equal(review.releaseBoundary.productionDesktopRuntime, "parked");
  assert.equal(review.forbiddenClaims.universalRuntime, false);
});

test("source-first executable capability posture requires every ordered capability row", () => {
  const review = reviewSourceFirstExecutableCapability({
    ...sampleSourceFirstExecutableCapability,
    capabilityMatrix: sampleSourceFirstExecutableCapability.capabilityMatrix.filter((item) => item.id !== "native-event-transport")
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "source-first.capability-matrix"));
});

test("source-first executable capability posture blocks release and runtime overclaims", () => {
  const review = reviewSourceFirstExecutableCapability({
    ...sampleSourceFirstExecutableCapability,
    releaseBoundary: {
      ...sampleSourceFirstExecutableCapability.releaseBoundary,
      signedInstaller: "ready",
      productionDesktopRuntime: "ready"
    },
    forbiddenClaims: {
      ...sampleSourceFirstExecutableCapability.forbiddenClaims,
      universalRuntime: true,
      hostedRuntime: true,
      genericShell: true
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "source-first.release-boundary"));
  assert.ok(review.errors.some((error) => error.code === "source-first.forbidden-claim"));
});

test("source-first executable capability posture rejects unsafe evidence and internal markers", () => {
  const review = reviewSourceFirstExecutableCapability({
    ...sampleSourceFirstExecutableCapability,
    capabilityMatrix: sampleSourceFirstExecutableCapability.capabilityMatrix.map((item, index) =>
      index === 0
        ? {
            ...item,
            label: ["internal item ", "R", "9999"].join(""),
            evidenceRefs: [["C", ":\\private\\runner.log"].join("")]
          }
        : item
    ),
    publicSafety: {
      ...sampleSourceFirstExecutableCapability.publicSafety,
      privateMarkersAbsent: false,
      notes: [[".", "planning"].join(""), ["reference", "/", "docs"].join("")]
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "source-first.unsafe-text"));
  assert.ok(review.errors.some((error) => error.code === "source-first.evidence-ref"));
  assert.ok(review.errors.some((error) => error.code === "source-first.public-safety"));
});

test("source-first executable capability gate proves accepted and blocked paths", () => {
  const gate = reviewSourceFirstExecutableCapabilityGate();

  assert.equal(gate.ok, true);
  assert.equal(gate.acceptedStatus, "accepted");
  assert.equal(gate.missingCapabilityBlocked, true);
  assert.equal(gate.releaseOverclaimBlocked, true);
  assert.equal(gate.unsafeEvidenceBlocked, true);
  assert.equal(gate.summary.nextCapability, null);
});
