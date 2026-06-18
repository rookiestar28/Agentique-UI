import assert from "node:assert/strict";
import test from "node:test";
import {
  createGraphRunPlan,
  reviewGraphRunPlanGate,
  sampleAcceptedGraphRunPlan
} from "../src/core/graph-run-plan.mjs";
import { sampleWorkflowIr } from "../src/core/workflow-ir.mjs";
import { sampleSchedulableWorkflowIr } from "../src/core/workflow-scheduler.mjs";

test("valid sample graph produces deterministic accepted run plan", () => {
  const plan = createGraphRunPlan(sampleSchedulableWorkflowIr, { permissionsApproved: true });

  assert.equal(plan.schemaVersion, "agentique.graphRunPlan.v1");
  assert.equal(plan.status, "accepted");
  assert.equal(plan.startDecision, "reviewable");
  assert.deepEqual(plan.nodePlans.map((node) => node.id), ["source", "normalize", "classify", "merge", "handoff"]);
  assert.equal(plan.summary.executable, 4);
  assert.equal(plan.summary.handoffOnly, 1);
  assert.equal(plan.summary.blocked, 0);
  assert.equal(sampleAcceptedGraphRunPlan.status, "accepted");
});

test("unsupported and high-risk nodes fail closed with visible reasons", () => {
  const plan = createGraphRunPlan(sampleWorkflowIr);
  const provider = plan.nodePlans.find((node) => node.id === "provider-sync");

  assert.equal(plan.status, "blocked");
  assert.equal(provider.classification, "blocked");
  assert.match(JSON.stringify(provider.reasons), /unsupported-node/u);
  assert.match(JSON.stringify(provider.reasons), /high-risk/u);
  assert.doesNotMatch(JSON.stringify(plan), /vault:providerCredential/u);
});

test("credentialed supported nodes require scoped permission review", () => {
  const credentialed = {
    ...sampleSchedulableWorkflowIr,
    nodes: sampleSchedulableWorkflowIr.nodes.map((node) => (
      node.id === "normalize" ? { ...node, credentials: ["vault:providerCredential"] } : node
    ))
  };
  const pending = createGraphRunPlan(credentialed);
  const approved = createGraphRunPlan(credentialed, { permissionsApproved: true });

  assert.equal(pending.status, "permission-required");
  assert.equal(pending.nodePlans.find((node) => node.id === "normalize").classification, "permission-required");
  assert.deepEqual(pending.nodePlans.find((node) => node.id === "normalize").permissionFamilies, ["secrets", "externalProviders"]);
  assert.equal(approved.status, "accepted");
});

test("dangling edges cycles and malformed input fail closed", () => {
  const dangling = createGraphRunPlan({
    ...sampleSchedulableWorkflowIr,
    edges: [{ from: "source", to: "missing", label: "bad" }]
  });
  const cyclic = createGraphRunPlan({
    ...sampleSchedulableWorkflowIr,
    edges: [...sampleSchedulableWorkflowIr.edges, { from: "handoff", to: "source", label: "cycle" }]
  });
  const malformed = createGraphRunPlan(null);

  assert.equal(dangling.status, "blocked");
  assert.match(JSON.stringify(dangling.errors), /dangling-edge/u);
  assert.equal(cyclic.status, "blocked");
  assert.match(JSON.stringify(cyclic.errors), /cycle/u);
  assert.equal(malformed.status, "blocked");
  assert.match(JSON.stringify(malformed.errors), /invalid/u);
});

test("blocked upstream nodes propagate dependency blockers", () => {
  const plan = createGraphRunPlan({
    ...sampleSchedulableWorkflowIr,
    nodes: sampleSchedulableWorkflowIr.nodes.map((node) => (
      node.id === "normalize" ? { ...node, type: "external-action", risk: "high" } : node
    ))
  });
  const merge = plan.nodePlans.find((node) => node.id === "merge");

  assert.equal(plan.status, "blocked");
  assert.equal(merge.classification, "blocked");
  assert.match(JSON.stringify(merge.reasons), /dependency-blocked/u);
  assert.equal(plan.edgePlans.find((edge) => edge.to === "merge").classification, "blocked");
});

test("run-plan output is path-neutral and secret-free", () => {
  const plan = createGraphRunPlan({
    ...sampleSchedulableWorkflowIr,
    nodes: sampleSchedulableWorkflowIr.nodes.map((node) => (
      node.id === "source" ? { ...node, label: "bearer abcdefghijklmnop" } : node
    ))
  });
  const text = JSON.stringify(plan);

  assert.equal(plan.status, "blocked");
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/u);
  assert.doesNotMatch(text, /vault:[a-z]/u);
  assert.doesNotMatch(text, /bearer\s+abcdefghijklmnop/iu);
});

test("graph run-plan gate review proves accepted and blocked cases", () => {
  const review = reviewGraphRunPlanGate();

  assert.equal(review.ok, true);
  assert.equal(review.checks.accepted, "accepted");
  assert.equal(review.checks.blocked, "blocked");
  assert.equal(review.checks.permissionRequired, "permission-required");
  assert.equal(review.checks.dangling, "blocked");
  assert.equal(review.checks.cyclic, "blocked");
});
