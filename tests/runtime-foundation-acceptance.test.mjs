import assert from "node:assert/strict";
import test from "node:test";
import { buildRuntimeFoundationManifest, reviewRuntimeFoundationAcceptance, runtimeFoundationContractVersions } from "../src/core/runtime-foundation-acceptance.mjs";

test("exact aggregate manifest accepts the repository-side fixed runtime foundation", () => {
  const manifest = buildRuntimeFoundationManifest();
  const review = reviewRuntimeFoundationAcceptance(manifest);
  assert.equal(review.ok, true, JSON.stringify(review.failures));
  assert.equal(review.disposition, "repository-side-accepted-local-only");
  assert.equal(manifest.packageDisposition, "NO_ADOPT");
  assert.equal(manifest.predecessors.length, 7);
});

test("every predecessor needs final plan record command log mapping and exact binding", () => {
  for (const field of ["planFinalized", "recordPresent", "commandLogPresent", "acceptanceMapped", "candidateBound", "fullGatePassed"]) {
    const manifest = buildRuntimeFoundationManifest();
    manifest.predecessors[3][field] = false;
    assert.equal(reviewRuntimeFoundationAcceptance(manifest).ok, false, field);
  }
});

test("contract versions and cross-contract lifecycle semantics fail closed on drift", () => {
  const versionDrift = buildRuntimeFoundationManifest();
  versionDrift.contracts.runProtocol = "agentique.runProtocolEvent.v2";
  assert.equal(reviewRuntimeFoundationAcceptance(versionDrift).ok, false);

  for (const field of [
    "exactAddress",
    "explicitConsentBeforeStart",
    "singleTerminal",
    "projectionBeforeTerminal",
    "checkpointBeforeProjection",
    "cleanupFailureCannotPass",
    "humanReviewIndependent"
  ]) {
    const semanticDrift = buildRuntimeFoundationManifest();
    semanticDrift.semantics[field] = false;
    assert.equal(reviewRuntimeFoundationAcceptance(semanticDrift).ok, false, field);
  }
  assert.equal(Object.keys(buildRuntimeFoundationManifest().contracts).length, Object.keys(runtimeFoundationContractVersions).length);
});

test("package disposition rejects stale dependency experiments and implementation types", () => {
  const adopted = buildRuntimeFoundationManifest();
  adopted.packageDisposition = "RUNTIME_SIDECAR";
  assert.equal(reviewRuntimeFoundationAcceptance(adopted).ok, false);

  const stale = buildRuntimeFoundationManifest();
  stale.packageState.staleExperimentArtifacts = 1;
  assert.equal(reviewRuntimeFoundationAcceptance(stale).ok, false);

  const leaked = buildRuntimeFoundationManifest();
  leaked.packageState.externalImplementationTypesExposed = true;
  assert.equal(reviewRuntimeFoundationAcceptance(leaked).ok, false);
});

test("migration and reverse-order rollback remain explicit and fail closed", () => {
  const manifest = buildRuntimeFoundationManifest();
  assert.deepEqual(manifest.rollback.order, ["evaluation", "checkpoint-writes", "projection-writes"]);
  assert.equal(manifest.rollback.retainCommittedEvidenceReadOnly, true);
  assert.equal(manifest.rollback.partialStateBecomesSuccess, false);
  assert.equal(manifest.migrations.unknownSchema, "fail-closed");

  manifest.rollback.partialStateBecomesSuccess = true;
  assert.equal(reviewRuntimeFoundationAcceptance(manifest).ok, false);
});

test("platform and release gaps remain blockers for wider public claims", () => {
  const manifest = buildRuntimeFoundationManifest();
  assert.equal(manifest.claims.windowsFixedLane, "accepted-local-only");
  assert.equal(manifest.claims.crossPlatformPackagedDesktop, "blocked");
  assert.equal(manifest.claims.signedInstallerAndUpdater, "blocked");
  assert.equal(manifest.claims.productionRuntime, "blocked");

  manifest.claims.productionRuntime = "accepted";
  assert.equal(reviewRuntimeFoundationAcceptance(manifest).ok, false);
});

test("shared evidence is counted once and downstream product residuals stay open", () => {
  const manifest = buildRuntimeFoundationManifest();
  assert.ok(manifest.overlaps.every((row) => row.sharedEvidenceCount === 1));
  assert.ok(manifest.overlaps.every((row) => row.residualStatus === "open"));

  manifest.overlaps[0].sharedEvidenceCount = 2;
  assert.equal(reviewRuntimeFoundationAcceptance(manifest).ok, false);
});

test("unsafe evidence and unsupported capability claims fail the aggregate gate", () => {
  for (const mutation of [
    (manifest) => (manifest.security.secrets = 1),
    (manifest) => (manifest.security.absolutePaths = 1),
    (manifest) => (manifest.security.rawProcessDetails = 1),
    (manifest) => (manifest.capabilities.genericShell = true),
    (manifest) => (manifest.capabilities.arbitraryNetwork = true),
    (manifest) => (manifest.capabilities.externalEffectReplay = true)
  ]) {
    const manifest = buildRuntimeFoundationManifest();
    mutation(manifest);
    assert.equal(reviewRuntimeFoundationAcceptance(manifest).ok, false);
  }
});

test("aggregate review reports a bounded capability and non-claim disposition", () => {
  const review = reviewRuntimeFoundationAcceptance(buildRuntimeFoundationManifest());
  assert.deepEqual(review.acceptedCapabilities, [
    "canonical-run-protocol",
    "native-explicit-consent",
    "async-fixed-lane-coordination",
    "durable-product-projection",
    "bounded-working-set-checkpoint",
    "offline-agent-evaluation"
  ]);
  assert.ok(review.blockedClaims.includes("production-runtime"));
  assert.equal(JSON.stringify(review).includes(["B:", "\\"].join("")), false);
});
