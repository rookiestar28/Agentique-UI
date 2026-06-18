import assert from "node:assert/strict";
import test from "node:test";
import { createCoreContractFixtureSet } from "../src/core/core-contract-drift-gate.mjs";
import {
  createSyntheticPackageBytes,
  localIntegrationSmokeVersion,
  runLocalIntegrationSmoke
} from "../src/core/local-integration-smoke.mjs";

test("validates the fixture-backed website-to-desktop import flow without execution claims", async () => {
  const result = await runLocalIntegrationSmoke();
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.schemaVersion, localIntegrationSmokeVersion);
  assert.deepEqual(result.steps, ["fixture-validated", "intent-validated", "package-verified", "library-upserted"]);
  assert.equal(result.importIntent.resourceId, "agent:research.alpha");
  assert.equal(result.importIntent.resourceVersion, "2026.06+alpha");
  assert.equal(result.importIntent.grantsAuthorization, false);
  assert.equal(result.importIntent.grantsDownload, false);
  assert.equal(result.importIntent.grantsExecution, false);
  assert.equal(result.importIntent.grantsPermission, false);
  assert.equal(result.verification.ticketMethod, "GET");
  assert.equal(result.verification.handoffMethod, "POST");
  assert.equal(result.verification.scopedTicketEndpoint, null);
  assert.equal(result.verification.finalByteUrlInMetadata, false);
  assert.equal(result.verification.signatureKind, "synthetic-fixture-digest");
  assert.equal(result.libraryState.resources.length, 1);
  assert.equal(result.libraryState.resources[0].resourceId, "agent:research.alpha");
  assert.equal(result.libraryState.resources[0].digest, result.verification.digest);
  assert.equal(result.cleanup.required, false);
  assert.deepEqual(result.noExecution, {
    networkRequestsPerformed: false,
    packageManagersExecuted: false,
    lifecycleHooksExecuted: false,
    workflowsExecuted: false,
    shellCommandsExecuted: false,
    nativeRuntimeStarted: false
  });
  assert.deepEqual(result.noOverclaim, {
    installerAvailable: false,
    updaterAvailable: false,
    nativeRunnerAvailable: false,
    localExecutionAvailable: false,
    directInstallVerified: false,
    publicSdkReleased: false,
    pactBrokerPublished: false
  });
});

test("synthetic package bytes are deterministic and public-safe", () => {
  const fixture = createCoreContractFixtureSet();
  const bytes = createSyntheticPackageBytes(fixture);
  assert.equal(bytes, createSyntheticPackageBytes(fixture));
  assert.match(bytes, /agentique-ui-local-integration-smoke/u);
  assert.doesNotMatch(bytes, /sk-[A-Za-z0-9_-]{6,}|bearer\s+[A-Za-z0-9._-]{12,}|storageKey|signedUrl|rawCommand|(?:^|[\s"'`(])[A-Za-z]:[\\/]|file:\/\//i);
});

test("byte tampering fails verification and requires cleanup without library import", async () => {
  const result = await runLocalIntegrationSmoke({ bytes: "tampered fixture bytes" });
  assert.equal(result.ok, false);
  assert.equal(result.libraryState, null);
  assert.equal(result.cleanup.required, true);
  assert.equal(result.cleanup.action, "discard-untrusted-fixture-bytes");
  assert.equal(result.errors[0].code, "package.verification-failed");
  assert.ok(result.errors[0].issues.includes("integrity.size-mismatch") || result.errors[0].issues.includes("integrity.digest-mismatch"));
});

test("deep-link drift fails closed before byte verification", async () => {
  const fixture = createCoreContractFixtureSet();
  fixture.importIntent.uri = fixture.importIntent.uri.replace("action=import", "action=execute");
  const result = await runLocalIntegrationSmoke({ fixture });
  assert.equal(result.ok, false);
  assert.equal(result.steps.length, 0);
  assert.equal(result.cleanup.required, false);
  assert.equal(result.cleanup.action, "no-local-state-created");
  assert.equal(result.errors[0].code, "fixture.contract-drift");
  assert.ok(result.errors[0].issues.includes("deep_link_contract_drift"));
});

test("contract drift and replayed ticket failures do not claim import success", async () => {
  const drifted = createCoreContractFixtureSet();
  drifted.schemaVersion = "agentique.coreContractFixtureSet.vNext";
  const driftResult = await runLocalIntegrationSmoke({ fixture: drifted });
  assert.equal(driftResult.ok, false);
  assert.equal(driftResult.libraryState, null);
  assert.equal(driftResult.errors[0].code, "fixture.contract-drift");
  assert.ok(driftResult.errors[0].issues.includes("fixture_contract_drift"));

  const replayResult = await runLocalIntegrationSmoke({
    replayedTickets: ["ticket_Aq2ULu3DZpaSSx7dlS6k8w"]
  });
  assert.equal(replayResult.ok, false);
  assert.equal(replayResult.libraryState, null);
  assert.equal(replayResult.cleanup.required, true);
  assert.equal(replayResult.errors[0].code, "package.verification-failed");
  assert.ok(replayResult.errors[0].issues.includes("ticket.replayed"));
});
