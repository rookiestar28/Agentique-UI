import assert from "node:assert/strict";
import test from "node:test";
import {
  assertExternalHandoffDescriptorsSafe,
  createExternalHandoffDescriptors,
  externalHandoffDescriptorsSchemaVersion,
  reviewExternalHandoffDescriptorGate
} from "../src/core/external-handoff-descriptors.mjs";
import { createGraphRunPlan } from "../src/core/graph-run-plan.mjs";
import { createRunnerEventStream } from "../src/core/runner-event-stream.mjs";
import { createAllowedRunnerPermissionPreflight } from "../src/core/runner-permission-preflight.mjs";
import { sampleWorkflowIr } from "../src/core/workflow-ir.mjs";
import { sampleSchedulableWorkflowIr } from "../src/core/workflow-scheduler.mjs";
import { runAcceptedWorkflowSession } from "../src/core/workflow-runner-session.mjs";

test("blocked and high-risk nodes produce actionable external handoff descriptors", () => {
  const runPlan = createGraphRunPlan(sampleWorkflowIr, { permissionsApproved: true });
  const handoff = createExternalHandoffDescriptors({ runPlan });
  const provider = handoff.descriptors.find((descriptor) => descriptor.nodeId === "provider-sync");

  assert.equal(handoff.schemaVersion, externalHandoffDescriptorsSchemaVersion);
  assert.equal(handoff.status, "handoff-review-required");
  assert.equal(provider.targetCategory, "provider-or-external-effect");
  assert.equal(provider.descriptor.localExecutionAllowed, false);
  assert.equal(provider.descriptor.startsRuntime, false);
  assert.ok(provider.reasons.some((reason) => /unsupported|high-risk/u.test(reason.code)));
});

test("handoff-only nodes remain descriptor export rows without bridge launch", () => {
  const runPlan = createGraphRunPlan(sampleSchedulableWorkflowIr, { permissionsApproved: true });
  const handoff = createExternalHandoffDescriptors({ runPlan });
  const descriptor = handoff.descriptors.find((row) => row.nodeId === "handoff");

  assert.equal(descriptor.classification, "handoff-only");
  assert.equal(descriptor.targetCategory, "descriptor-export");
  assert.equal(descriptor.descriptor.descriptorOnly, true);
  assert.equal(descriptor.descriptor.startsBridge, false);
  assert.equal(handoff.bridgeBoundary.requiresSeparateBridgeGate, true);
});

test("credentialed provider or permission-required nodes can be routed to handoff review", () => {
  const credentialed = {
    ...sampleSchedulableWorkflowIr,
    nodes: sampleSchedulableWorkflowIr.nodes.map((node) => (
      node.id === "normalize" ? { ...node, credentials: ["vault:providerCredential"] } : node
    ))
  };
  const runPlan = createGraphRunPlan(credentialed);
  const handoff = createExternalHandoffDescriptors({ runPlan });
  const permission = handoff.descriptors.find((descriptor) => descriptor.nodeId === "normalize");
  const text = JSON.stringify(handoff);

  assert.equal(permission.classification, "permission-required");
  assert.equal(permission.targetCategory, "credential-or-provider-review");
  assert.equal(permission.requiredBoundary, "scoped-permission-review-or-external-handoff");
  assert.doesNotMatch(text, /vault:providerCredential/u);
});

test("partial local run evidence is linked without exposing local paths", () => {
  const runPlan = createGraphRunPlan(sampleSchedulableWorkflowIr, { permissionsApproved: true });
  const permissionPreflight = createAllowedRunnerPermissionPreflight();
  const localRun = runAcceptedWorkflowSession({ action: "start", runPlan, permissionPreflight });
  const eventStream = createRunnerEventStream({ session: localRun });
  const handoff = createExternalHandoffDescriptors({ runPlan, localRun, eventStream });
  const descriptor = handoff.descriptors.find((row) => row.nodeId === "handoff");
  const text = JSON.stringify(descriptor);

  assert.equal(descriptor.partialEvidence.linkedRunId, localRun.runId);
  assert.equal(descriptor.partialEvidence.localRunStatus, "succeeded");
  assert.ok(descriptor.partialEvidence.upstreamCompleted > 0);
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/u);
});

test("destination policies require explicit user action for user-owned clients and export folders", () => {
  const runPlan = createGraphRunPlan(sampleSchedulableWorkflowIr, { permissionsApproved: true });
  const handoff = createExternalHandoffDescriptors({ runPlan });
  const descriptor = handoff.descriptors.find((row) => row.nodeId === "handoff");

  assert.equal(descriptor.destinationPolicy.requiresExplicitUserAction, true);
  assert.equal(descriptor.destinationPolicy.automaticOpen, false);
  assert.equal(descriptor.destinationPolicy.allowedDestinations.includes("user-owned-client"), true);
  assert.equal(descriptor.destinationPolicy.allowedDestinations.includes("export-folder"), true);
  assert.equal(descriptor.destinationPolicy.exportFolder.writesFilesFromApp, false);
  assert.equal(descriptor.userAction.intent, "review-export-or-open-user-owned-client");
});

test("localhost and deep-link targets are constrained without bridge execution", () => {
  const handoff = createExternalHandoffDescriptors({
    runPlan: createGraphRunPlan(sampleWorkflowIr, { permissionsApproved: true }),
    destinationScenario: "localhost-deeplink"
  });
  const policy = handoff.destinationReview;

  assert.equal(policy.localhost.allowed, true);
  assert.deepEqual(policy.localhost.allowedHosts, ["127.0.0.1", "localhost"]);
  assert.equal(policy.localhost.startsServer, false);
  assert.equal(policy.deepLink.allowed, true);
  assert.equal(policy.deepLink.allowedSchemes.includes("agentique-client"), true);
  assert.equal(policy.deepLink.opensAutomatically, false);
  assert.equal(handoff.bridgeBoundary.startsBridge, false);
  assert.equal(handoff.bridgeBoundary.makesNetworkRequest, false);
});

test("unknown clients and unsafe payloads remain blocked by default", () => {
  const unknownClient = createExternalHandoffDescriptors({
    runPlan: createGraphRunPlan(sampleWorkflowIr, { permissionsApproved: true }),
    destinationScenario: "unknown-client"
  });
  const unsafePayload = createExternalHandoffDescriptors({
    runPlan: createGraphRunPlan(sampleWorkflowIr, { permissionsApproved: true }),
    destinationScenario: "unsafe-payload"
  });

  assert.equal(unknownClient.destinationReview.client.status, "blocked");
  assert.equal(unknownClient.destinationReview.client.reason, "unknown-client");
  assert.equal(unsafePayload.destinationReview.payload.status, "blocked");
  assert.equal(unsafePayload.destinationReview.payload.reason, "unsafe-payload");
  assert.equal(unknownClient.summary.blockedDestinations > 0, true);
  assert.equal(unsafePayload.summary.blockedDestinations > 0, true);
});

test("descriptor safety rejects commands paths browser data and raw secrets", () => {
  for (const unsafe of [
    { output: ["C", ":\\tmp\\handoff.json"].join("") },
    { output: "npm run bridge" },
    { output: "bearer abcdefghijklmnop" },
    { output: "cookie=session" }
  ]) {
    assert.throws(
      () => assertExternalHandoffDescriptorsSafe(unsafe),
      /unsafe material|inline sensitive material/u
    );
  }
});

test("external handoff descriptor review gate passes", () => {
  const review = reviewExternalHandoffDescriptorGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.ok(review.checks.descriptorRows >= 2);
  assert.equal(review.checks.bridgeDisabled, true);
  assert.ok(review.checks.permissionRows >= 1);
  assert.equal(review.checks.userOwnedDestinationPolicy, true);
  assert.equal(review.checks.localhostDeepLinkConstrained, true);
  assert.equal(review.checks.unknownClientsBlocked, true);
  assert.equal(review.checks.unsafePayloadsBlocked, true);
  assert.equal(review.checks.cleanupReadiness, true);
});
