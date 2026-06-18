import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  createExecutableCapabilityCloseoutPack,
  reviewExecutableCapabilityCloseoutGate,
  reviewExecutableCapabilityCloseoutPack
} from "../src/core/executable-capability-closeout-pack.mjs";
import { reviewSourceFirstExecutableCapability, sampleSourceFirstExecutableCapability } from "../src/core/source-first-executable-capability.mjs";

const privatePlanMarker = ["\\.", "planning"].join("");
const privateReferenceDocsMarker = ["reference", "\\/", "docs"].join("");
const unsafePublicMarkerPattern = new RegExp(`\\bR\\d{4}\\b|${privatePlanMarker}|${privateReferenceDocsMarker}|[A-Za-z]:[\\\\/]`, "u");

test("executable capability closeout pack accepts completed local-only evidence", () => {
  const pack = createExecutableCapabilityCloseoutPack();
  const review = reviewExecutableCapabilityCloseoutPack(pack);

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.status, "accepted");
  assert.equal(review.summary.capabilityRows, 10);
  assert.equal(review.summary.acceptedCapabilities, 10);
  assert.equal(review.summary.releaseRuntimeClaimsBlocked, true);
  assert.equal(review.summary.publicSafety, "passed");
  assert.equal(review.summary.desktopNarrowEvidence, "passed");
});

test("every closeout capability has accepted status and path-neutral public evidence", () => {
  const pack = createExecutableCapabilityCloseoutPack();

  for (const capability of pack.capabilities) {
    assert.equal(capability.status, "accepted", `${capability.id} is accepted`);
    assert.ok(capability.evidenceRefs.length > 0, `${capability.id} has evidence refs`);
    for (const reference of capability.evidenceRefs) {
      assert.match(reference, /^(docs\/contracts|docs\/validation|docs\/security|evidence)\//u);
      assert.doesNotMatch(reference, unsafePublicMarkerPattern);
    }
  }
});

test("validation evidence and source-first claim sync are required", () => {
  const pack = createExecutableCapabilityCloseoutPack();
  const weakened = {
    ...pack,
    validationEvidence: {
      ...pack.validationEvidence,
      agentiqueUiFullValidation: "missing"
    },
    claimSync: {
      ...pack.claimSync,
      sourceFirstDocs: "stale"
    }
  };
  const review = reviewExecutableCapabilityCloseoutPack(weakened);

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "executable-closeout.validation-evidence"));
  assert.ok(review.errors.some((error) => error.code === "executable-closeout.claim-sync"));
});

test("release and runtime overclaims remain blocked", () => {
  const pack = createExecutableCapabilityCloseoutPack();
  const review = reviewExecutableCapabilityCloseoutPack({
    ...pack,
    noGoClaims: {
      ...pack.noGoClaims,
      signedInstaller: "ready",
      updater: "ready",
      productionDesktopRuntime: "ready"
    },
    forbiddenRuntimeClaims: {
      ...pack.forbiddenRuntimeClaims,
      universalRuntime: true,
      automaticDownloadedWorkflowExecution: true,
      packageLifecycleExecution: true
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "executable-closeout.no-go"));
  assert.ok(review.errors.some((error) => error.code === "executable-closeout.forbidden-runtime"));
});

test("public safety rejects internal markers and unsafe evidence references", () => {
  const pack = createExecutableCapabilityCloseoutPack();
  const review = reviewExecutableCapabilityCloseoutPack({
    ...pack,
    capabilities: pack.capabilities.map((capability, index) =>
      index === 0
        ? {
            ...capability,
            label: ["private item ", "R", "9999"].join(""),
            evidenceRefs: [["C", ":\\private\\log.txt"].join("")]
          }
        : capability
    ),
    publicSafety: {
      ...pack.publicSafety,
      privateMarkersAbsent: false
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "executable-closeout.unsafe-text"));
  assert.ok(review.errors.some((error) => error.code === "executable-closeout.evidence-ref"));
  assert.ok(review.errors.some((error) => error.code === "executable-closeout.public-safety"));
});

test("source-first capability matrix is synchronized to accepted closeout rows", () => {
  const review = reviewSourceFirstExecutableCapability(sampleSourceFirstExecutableCapability);

  assert.equal(review.ok, true);
  assert.equal(review.summary.acceptedRows, 10);
  assert.equal(review.summary.plannedRows, 0);
  assert.equal(review.summary.nextCapability, null);
  assert.equal(review.releaseBoundary.productionDesktopRuntime, "parked");
});

test("closeout pack document is public safe and states continued No-Go claims", () => {
  const text = fs.readFileSync("docs/validation/executable-capability-closeout-pack.md", "utf8");

  assert.match(text, /Executable Capability Closeout Pack/u);
  assert.match(text, /source-first local workspace/u);
  assert.match(text, /supported-local-only/u);
  assert.match(text, /signed installer/u);
  assert.match(text, /production desktop runtime/u);
  assert.match(text, /desktop and narrow interaction evidence/u);
  assert.doesNotMatch(text, unsafePublicMarkerPattern);
});

test("executable capability closeout gate proves accepted and blocked paths", () => {
  const gate = reviewExecutableCapabilityCloseoutGate();

  assert.equal(gate.ok, true);
  assert.equal(gate.acceptedStatus, "accepted");
  assert.equal(gate.missingCapabilityBlocked, true);
  assert.equal(gate.validationEvidenceBlocked, true);
  assert.equal(gate.overclaimBlocked, true);
  assert.equal(gate.unsafeReferenceBlocked, true);
});
