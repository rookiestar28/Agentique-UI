import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  reviewCompanionIntegrationCloseout,
  reviewCompanionIntegrationCloseoutGate,
  sampleCompanionIntegrationCloseout
} from "../src/core/companion-integration-closeout-gate.mjs";

test("companion integration closeout accepts the completed local-static scope", () => {
  const review = reviewCompanionIntegrationCloseout(sampleCompanionIntegrationCloseout);

  assert.equal(review.ok, true);
  assert.equal(review.status, "accepted");
  assert.equal(review.summary.sourceRevision, "2621a33ba9cd83b125ffaabeec7817abc3c52719");
  assert.equal(review.summary.packageVersion, "0.2.1");
  assert.equal(review.summary.acceptedCapabilities, 5);
  assert.equal(review.summary.deferredCapabilities, 7);
  assert.equal(review.summary.blockedClaims, 17);
  assert.equal(review.summary.publicSafety, "passed");
  assert.equal(review.summary.sourcePinClean, true);
});

test("source pin and package version drift fail closed", () => {
  const sourceDrift = reviewCompanionIntegrationCloseout({
    ...sampleCompanionIntegrationCloseout,
    sourcePin: {
      ...sampleCompanionIntegrationCloseout.sourcePin,
      branch: "next",
      revision: "1".repeat(40)
    }
  });
  const packageDrift = reviewCompanionIntegrationCloseout({
    ...sampleCompanionIntegrationCloseout,
    packages: sampleCompanionIntegrationCloseout.packages.map((pkg) => (
      pkg.name === "@agentique.io/readback" ? { ...pkg, version: "0.3.0" } : pkg
    ))
  });

  assert.equal(sourceDrift.ok, false);
  assert.ok(sourceDrift.errors.some((error) => error.code === "companion-closeout.source-pin"));
  assert.equal(packageDrift.ok, false);
  assert.ok(packageDrift.errors.some((error) => error.code === "companion-closeout.package-version"));
});

test("capability evidence must be accepted and path-neutral", () => {
  const review = reviewCompanionIntegrationCloseout({
    ...sampleCompanionIntegrationCloseout,
    capabilities: {
      ...sampleCompanionIntegrationCloseout.capabilities,
      "download-acquisition-proof": {
        status: "blocked",
        sourcePackage: "@agentique.io/readback",
        adapterSchema: "agentique.companionDownloadAcquisition.v1",
        evidenceRef: ["C", ":\\private\\download.log"].join("")
      }
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "companion-closeout.capability-status"));
  assert.ok(review.errors.some((error) => error.code === "companion-closeout.evidence-ref"));
});

test("unsupported live auth publication action and runtime claims are blocked", () => {
  const review = reviewCompanionIntegrationCloseout({
    ...sampleCompanionIntegrationCloseout,
    claimBoundary: {
      ...sampleCompanionIntegrationCloseout.claimBoundary,
      liveUploadAvailable: true,
      authenticatedUpload: true,
      publication: true,
      githubActionRuntime: true,
      hostedRuntime: true,
      universalRuntime: true,
      packageLifecycleExecution: true
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "companion-closeout.claim-boundary"));
});

test("deferred companion capabilities require a separate gate", () => {
  const review = reviewCompanionIntegrationCloseout({
    ...sampleCompanionIntegrationCloseout,
    deferredCapabilities: {
      ...sampleCompanionIntegrationCloseout.deferredCapabilities,
      "github-action-runtime": { status: "accepted", requiresSeparateGate: false }
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "companion-closeout.deferred-capability"));
});

test("public safety and worktree evidence must be explicit", () => {
  const review = reviewCompanionIntegrationCloseout({
    ...sampleCompanionIntegrationCloseout,
    publicSafety: {
      publicBoundaryScan: "missing",
      noSecretScan: "passed",
      privateMarkersAbsent: false,
      publicDocsNoInternalCodes: false,
      evidenceRefsPathNeutral: false
    },
    worktreeEvidence: {
      expectedChangeSetOnly: true,
      unrelatedDirtyFilesExcluded: false,
      sourcePinClean: true,
      uiCommitPublicSafe: false
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "companion-closeout.public-safety"));
  assert.ok(review.errors.some((error) => error.code === "companion-closeout.worktree-evidence"));
});

test("public validation document states accepted scope and blocked claims", () => {
  const text = fs.readFileSync("docs/validation/companion-integration-closeout.md", "utf8");

  assert.match(text, /Companion Integration Closeout/u);
  assert.match(text, /source revision `2621a33ba9cd83b125ffaabeec7817abc3c52719`/u);
  assert.match(text, /read-only readback and badge projection/u);
  assert.match(text, /static validator import proof/u);
  assert.match(text, /safe download acquisition proof/u);
  assert.match(text, /review-only uploader preview/u);
  assert.match(text, /browser-local external intake scanner/u);
  assert.match(text, /authenticated review submission/u);
  assert.match(text, /GitHub Action runtime/u);
  assert.match(text, /hosted runtime/u);
  assert.match(text, /universal runtime/u);
  assert.doesNotMatch(text, /\bR\d{4}\b/u);
});

test("companion integration closeout gate proves accepted and blocked paths", () => {
  const summary = reviewCompanionIntegrationCloseoutGate();

  assert.equal(summary.ok, true);
  assert.equal(summary.acceptedStatus, "accepted");
  assert.equal(summary.sourceDriftBlocked, true);
  assert.equal(summary.packageDriftBlocked, true);
  assert.equal(summary.missingEvidenceBlocked, true);
  assert.equal(summary.overclaimBlocked, true);
  assert.equal(summary.unsafeReferenceBlocked, true);
  assert.equal(summary.completedDeferredCapabilityBlocked, true);
});
