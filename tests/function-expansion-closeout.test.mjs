import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createFunctionExpansionCloseoutReview, reviewFunctionExpansionCloseoutGate, reviewFunctionExpansionCloseoutDescriptor } from "../src/core/function-expansion-closeout.mjs";

const privatePlanMarker = ["\\.", "planning"].join("");
const privateReferenceDocsMarker = ["reference", "\\/", "docs"].join("");
const unsafePublicMarkerPattern = new RegExp(`\\bR\\d{4}\\b|${privatePlanMarker}|${privateReferenceDocsMarker}|[A-Za-z]:[\\\\/]`, "u");

test("function expansion closeout accepts the completed local-only chain", () => {
  const review = createFunctionExpansionCloseoutReview();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.status, "accepted");
  assert.equal(review.summary.featureFamilies, 19);
  assert.equal(review.summary.acceptedFeatureFamilies, 19);
  assert.equal(review.summary.portabilityRows, 5);
  assert.equal(review.summary.graphBlockRows, 7);
  assert.equal(review.summary.releaseRuntimeClaimsBlocked, true);
  assert.equal(review.summary.desktopNarrowEvidence, "passed");
});

test("feature family rows are accepted and use path-neutral evidence", () => {
  const review = createFunctionExpansionCloseoutReview();

  for (const feature of review.featureFamilies.items) {
    assert.equal(feature.status, "accepted", `${feature.id} is accepted`);
    assert.equal(feature.localOnly, true);
    assert.equal(feature.reviewOnly, true);
    assert.equal(feature.widensAuthority, false);
    assert.equal(feature.releaseClaimAllowed, false);
    for (const reference of feature.evidenceRefs) {
      assert.match(reference, /^(docs\/contracts|docs\/validation|docs\/security|evidence)\//u);
      assert.doesNotMatch(reference, unsafePublicMarkerPattern);
    }
  }
});

test("portability drift and profile requirements are mapped", () => {
  const review = createFunctionExpansionCloseoutReview();
  const rows = new Map(review.portabilityMapping.items.map((row) => [row.id, row]));

  for (const id of [
    "portable-profile-taxonomy",
    "generated-adapter-drift-status",
    "repo-local-task-lane-profile",
    "external-client-pack-portability",
    "support-bundle-profile-diagnostics"
  ]) {
    assert.equal(rows.get(id).status, "mapped");
    assert.equal(rows.get(id).scriptExecution, false);
    assert.equal(rows.get(id).automaticInstall, false);
    assert.equal(rows.get(id).lifecycleHooksTrusted, false);
    assert.equal(rows.get(id).generatedCodeCopied, false);
  }
});

test("graph block run workspace and credential requirements are mapped", () => {
  const review = createFunctionExpansionCloseoutReview();
  const rows = new Map(review.graphBlockHandoff.items.map((row) => [row.id, row]));

  for (const id of [
    "graph-block-ir-readback",
    "schema-driven-block-forms",
    "run-ledger-queue-events",
    "artifact-lifecycle",
    "credential-reference-boundary",
    "library-import-export-lifecycle",
    "diagnostics-observability"
  ]) {
    assert.equal(rows.get(id).status, "mapped");
    assert.equal(rows.get(id).typedIrOnly, true);
    assert.equal(rows.get(id).referenceOnlyCredentials, true);
    assert.equal(rows.get(id).runtimeAuthority, false);
    assert.equal(rows.get(id).rawExecutableFieldsStored, false);
  }
});

test("validation evidence and claim sync are required", () => {
  const review = createFunctionExpansionCloseoutReview({
    validationOverrides: {
      publicBoundaryScan: "missing"
    },
    claimSyncOverrides: {
      statusIndex: "stale"
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "function-closeout.validation-evidence"));
  assert.ok(review.errors.some((error) => error.code === "function-closeout.claim-sync"));
});

test("release runtime and automation claims remain blocked", () => {
  const review = createFunctionExpansionCloseoutReview({
    noGoOverrides: {
      signedInstaller: "ready",
      updater: "ready",
      productionDesktopRuntime: "ready",
      genericShell: "ready",
      arbitraryWorkflowExecution: "ready",
      browserDataAccess: "ready",
      ambientEnvironmentAccess: "ready",
      packageLifecycleExecution: "ready",
      automaticPluginInstall: "ready",
      lifecycleHookTrust: "ready",
      containerStart: "ready",
      imagePull: "ready",
      externalProviderAutomation: "ready"
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "function-closeout.no-go"));
  assert.equal(review.noGoClaims.allBlocked, false);
});

test("public safety rejects internal markers and unsafe evidence refs", () => {
  const review = createFunctionExpansionCloseoutReview({
    featureOverrides: {
      "function-expansion-roadmap-filing": {
        label: ["private marker ", "R", "9999"].join(""),
        evidenceRefs: [["C", ":\\private\\plan.md"].join("")]
      }
    },
    publicSafetyOverrides: {
      privateMarkersAbsent: false
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "function-closeout.unsafe-text"));
  assert.ok(review.errors.some((error) => error.code === "function-closeout.evidence-ref"));
  assert.ok(review.errors.some((error) => error.code === "function-closeout.public-safety"));
});

test("descriptor review rejects unsupported schema", () => {
  const accepted = createFunctionExpansionCloseoutReview();
  const review = reviewFunctionExpansionCloseoutDescriptor({
    ...accepted,
    schemaVersion: "agentique.functionExpansionCloseout.v0"
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "function-closeout.schema"));
});

test("function expansion closeout document is public safe and states no-go claims", () => {
  const text = fs.readFileSync("docs/validation/function-expansion-closeout.md", "utf8");

  assert.match(text, /Function Expansion Closeout/u);
  assert.match(text, /source-first supported-local-only/u);
  assert.match(text, /No-Go claims/u);
  assert.match(text, /signed installer/u);
  assert.match(text, /production desktop runtime/u);
  assert.match(text, /Passing this closeout does not publish/u);
  assert.doesNotMatch(text, unsafePublicMarkerPattern);
});

test("function expansion closeout gate proves accepted and blocked paths", () => {
  const gate = reviewFunctionExpansionCloseoutGate();

  assert.equal(gate.ok, true);
  assert.equal(gate.acceptedStatus, "accepted");
  assert.equal(gate.missingFeatureBlocked, true);
  assert.equal(gate.missingPortabilityBlocked, true);
  assert.equal(gate.missingGraphBlockBlocked, true);
  assert.equal(gate.validationEvidenceBlocked, true);
  assert.equal(gate.overclaimBlocked, true);
  assert.equal(gate.unsafeReferenceBlocked, true);
});
