import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  reviewRunnerCapabilityCloseout,
  reviewRunnerCapabilityCloseoutGate,
  sampleRunnerCapabilityCloseout
} from "../src/core/runner-capability-closeout-gate.mjs";

test("runner capability closeout accepts supported local-only scope", () => {
  const review = reviewRunnerCapabilityCloseout(sampleRunnerCapabilityCloseout);

  assert.equal(review.ok, true);
  assert.equal(review.status, "accepted");
  assert.equal(review.summary.supportedLocalRunScope, "supported-local-only");
  assert.equal(review.summary.acceptedCapabilities, 13);
  assert.equal(review.summary.releaseClaimsBlocked, true);
  assert.equal(review.summary.publicSafety, "passed");
});

test("missing runner validation steps fail closed", () => {
  const review = reviewRunnerCapabilityCloseout({
    ...sampleRunnerCapabilityCloseout,
    validationSteps: sampleRunnerCapabilityCloseout.validationSteps.filter((step) => step !== "validate:workflow-scheduler")
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "runner-closeout.validation-step"));
});

test("capability records must be accepted and path-neutral", () => {
  const review = reviewRunnerCapabilityCloseout({
    ...sampleRunnerCapabilityCloseout,
    capabilities: {
      ...sampleRunnerCapabilityCloseout.capabilities,
      "python-adapter": { status: "blocked", evidenceRef: ["C", ":\\private\\runner.log"].join("") }
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "runner-closeout.capability-status"));
  assert.ok(review.errors.some((error) => error.code === "runner-closeout.evidence-ref"));
});

test("release and runtime overclaims are blocked", () => {
  const review = reviewRunnerCapabilityCloseout({
    ...sampleRunnerCapabilityCloseout,
    claimBoundary: {
      supportedLocalRunScope: "universal",
      supportedLocalRuns: true,
      universalRuntime: true,
      hostedRuntime: true,
      automaticExecution: true,
      productionDesktopRuntime: true,
      installerUpdater: true,
      paidCloudRuntime: true
    },
    releaseBoundary: {
      windowsInstaller: "ready",
      macosInstaller: "blocked",
      linuxPackages: "blocked",
      updater: "ready",
      productionDesktopRuntime: "ready"
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "runner-closeout.local-scope"));
  assert.ok(review.errors.some((error) => error.code === "runner-closeout.claim-boundary"));
  assert.ok(review.errors.some((error) => error.code === "runner-closeout.release-boundary"));
});

test("public safety checks must pass", () => {
  const review = reviewRunnerCapabilityCloseout({
    ...sampleRunnerCapabilityCloseout,
    publicSafety: {
      publicBoundaryScan: "failed",
      noSecretScan: "missing",
      privateMarkersAbsent: false,
      evidenceRefsPathNeutral: false
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "runner-closeout.public-safety"));
});

test("closeout document states supported local-only scope and blocked release claims", () => {
  const text = fs.readFileSync("docs/validation/runner-capability-closeout.md", "utf8");

  assert.match(text, /supported-local-only/u);
  assert.match(text, /production desktop runtime/u);
  assert.match(text, /signed updater channel/u);
  assert.match(text, /automatic execution of arbitrary downloaded resources/u);
  assert.doesNotMatch(text, /\bR\d{4}\b/u);
});

test("runner capability closeout gate proves accepted and blocked paths", () => {
  const summary = reviewRunnerCapabilityCloseoutGate();

  assert.equal(summary.ok, true);
  assert.equal(summary.acceptedStatus, "accepted");
  assert.equal(summary.missingValidationBlocked, true);
  assert.equal(summary.overclaimBlocked, true);
  assert.equal(summary.unsafeReferenceBlocked, true);
});
