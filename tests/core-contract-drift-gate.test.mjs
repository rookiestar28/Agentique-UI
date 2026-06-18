import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCoreContractFixtureSet,
  coreContractFixtureSetVersion,
  createCoreContractFixtureSet,
  validateCoreContractFixtureSet
} from "../src/core/core-contract-drift-gate.mjs";
import { importIntentContractVersion } from "../src/core/import-intent.mjs";
import { resourceBundleSchemaVersion, sourceResourceBundleMapperVersion } from "../src/core/source-resource-bundle-mapper.mjs";
import {
  sourceGraphContractVersion,
  sourceWorkflowGraphMapperVersion,
  workflowIrSchemaVersion
} from "../src/core/source-workflow-graph-mapper.mjs";

test("creates deterministic public-safe core contract fixtures for UI consumers", () => {
  const fixture = createCoreContractFixtureSet();
  assert.deepEqual(fixture, createCoreContractFixtureSet());
  assert.deepEqual(validateCoreContractFixtureSet(fixture), { ok: true, issues: [] });
  assert.equal(assertCoreContractFixtureSet(fixture), fixture);
  assert.equal(fixture.schemaVersion, coreContractFixtureSetVersion);
  assert.equal(fixture.generatedFor, "agentique-ui");
  assert.equal(fixture.routes.readback.path, "/api/public/v1/resources/agent%3Aresearch.alpha/readback");
  assert.equal(fixture.routes.downloadHandoff.method, "POST");
  assert.equal(fixture.importIntent.version, importIntentContractVersion);
  assert.equal(fixture.contracts.resourceBundleMapper, sourceResourceBundleMapperVersion);
  assert.equal(fixture.contracts.resourceBundleSchema, resourceBundleSchemaVersion);
  assert.equal(fixture.contracts.resourceGraph, sourceGraphContractVersion);
  assert.equal(fixture.contracts.workflowGraphMapper, sourceWorkflowGraphMapperVersion);
  assert.equal(fixture.contracts.workflowIr, workflowIrSchemaVersion);
});

test("fixture projections preserve POST handoff and no-overclaim boundaries", () => {
  const fixture = createCoreContractFixtureSet();
  assert.equal(fixture.projections.bundle.bundle.schemaVersion, resourceBundleSchemaVersion);
  assert.equal(fixture.projections.bundle.handoff.method, "POST");
  assert.equal(fixture.projections.bundle.handoff.finalByteUrl, null);
  assert.equal(fixture.projections.bundle.handoff.scopedTicketEndpoint, null);
  assert.equal(fixture.projections.bundle.noOverclaim.scopedGetTicketEndpoint, false);
  assert.equal(fixture.projections.bundle.noOverclaim.finalByteUrlInMetadata, false);
  assert.equal(fixture.projections.workflow.workflowIr.schemaVersion, workflowIrSchemaVersion);
  assert.equal(fixture.projections.workflow.noExecution.workflowsExecuted, false);
  assert.equal(fixture.projections.workflow.noExecution.networkRequestsPerformed, false);
  assert.equal(fixture.projections.workflow.noOverclaim.localRunnerAvailable, false);
  assert.equal(fixture.projections.workflow.noOverclaim.credentialValuesAvailable, false);
});

test("fails closed when routes, methods, or handoff metadata drift", () => {
  const routeDrift = cloneFixture();
  routeDrift.routes.readback.path = "/api/public/v1/resources/agent%3Aresearch.alpha";
  assertIssues(routeDrift, ["route_contract_drift"]);

  const methodDrift = cloneFixture();
  methodDrift.routes.downloadHandoff.method = "GET";
  assertIssues(methodDrift, ["download_method_drift"]);

  const handoffDrift = cloneFixture();
  handoffDrift.sourceMetadata.downloadMetadata.handoff.finalByteUrl = "https://www.agentique.io/download/final";
  assertIssues(handoffDrift, ["download_method_drift"]);
});

test("fails closed when import intent, resource identity, bundle, or graph schemas drift", () => {
  const deepLinkVersionDrift = cloneFixture();
  deepLinkVersionDrift.importIntent.version = "agentique.importIntent.vNext";
  assertIssues(deepLinkVersionDrift, ["deep_link_contract_drift"]);

  const deepLinkActionDrift = cloneFixture();
  deepLinkActionDrift.importIntent.action = "execute";
  assertIssues(deepLinkActionDrift, ["deep_link_contract_drift"]);

  const identityDrift = cloneFixture();
  identityDrift.resource.id = "agent/research";
  assertIssues(identityDrift, ["resource_identity_contract_drift", "route_contract_drift"]);

  const versionDrift = cloneFixture();
  versionDrift.resource.version = "2026/06";
  assertIssues(versionDrift, ["deep_link_contract_drift", "resource_identity_contract_drift"]);

  const bundleDrift = cloneFixture();
  bundleDrift.projections.bundle.bundle.schemaVersion = "agentique.resourceBundle.vNext";
  assertIssues(bundleDrift, ["bundle_projection_contract_drift"]);

  const graphDrift = cloneFixture();
  graphDrift.projections.workflow.workflowIr.schemaVersion = "agentique.workflowIr.vNext";
  assertIssues(graphDrift, ["workflow_projection_contract_drift"]);
});

test("fails closed on unsupported release claims and unsafe fixture text", () => {
  const releaseClaimDrift = cloneFixture();
  releaseClaimDrift.noReleaseClaims.publicSdkReleased = true;
  assertIssues(releaseClaimDrift, ["unsupported_release_or_runtime_claim"]);

  const unsafeFixture = cloneFixture();
  unsafeFixture.resource.title = "Research Alpha sk-live-not-a-real-secret";
  assertIssues(unsafeFixture, ["unsafe_fixture_text"]);

  const serialized = JSON.stringify(createCoreContractFixtureSet());
  assert.doesNotMatch(serialized, /sk-[A-Za-z0-9_-]{6,}|ghp_[A-Za-z0-9_]{12,}|bearer\s+[A-Za-z0-9._-]{12,}|storageKey|signedUrl|rawCommand|operatorNote|(?:^|[\s"'`(])[A-Za-z]:[\\/]|file:\/\//i);
  assert.doesNotMatch(serialized, new RegExp(["\\.plan", "ning"].join(""), "i"));
  assert.doesNotMatch(serialized, new RegExp(["ref", "erence[\\\\/]docs"].join(""), "i"));
});

function cloneFixture() {
  return JSON.parse(JSON.stringify(createCoreContractFixtureSet()));
}

function assertIssues(fixture, expectedIssues) {
  const result = validateCoreContractFixtureSet(fixture);
  assert.equal(result.ok, false);
  for (const issue of expectedIssues) {
    assert.ok(result.issues.includes(issue), `${issue} missing from ${JSON.stringify(result.issues)}`);
  }
}
