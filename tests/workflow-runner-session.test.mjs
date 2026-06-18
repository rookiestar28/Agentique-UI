import assert from "node:assert/strict";
import test from "node:test";
import { createGraphRunPlan } from "../src/core/graph-run-plan.mjs";
import { createAllowedRunnerPermissionPreflight } from "../src/core/runner-permission-preflight.mjs";
import {
  createIdleWorkflowRunnerSession,
  reviewWorkflowRunnerSessionGate,
  runAcceptedWorkflowSession,
  workflowRunnerSessionSchemaVersion
} from "../src/core/workflow-runner-session.mjs";
import { sampleWorkflowIr } from "../src/core/workflow-ir.mjs";
import { sampleSchedulableWorkflowIr } from "../src/core/workflow-scheduler.mjs";

const permissionPreflight = createAllowedRunnerPermissionPreflight();

test("idle runner session is deterministic and non-executing", () => {
  const session = createIdleWorkflowRunnerSession();

  assert.equal(session.schemaVersion, workflowRunnerSessionSchemaVersion);
  assert.equal(session.status, "idle");
  assert.equal(session.summary.events, 0);
  assert.equal(session.permissionPreflight.status, "missing");
  assert.equal(session.cleanup.status, "not-started");
});

test("accepted run plan starts allowlisted graph to succeeded", () => {
  const runPlan = createGraphRunPlan(sampleSchedulableWorkflowIr, { permissionsApproved: true });
  const session = runAcceptedWorkflowSession({ workflowIr: sampleSchedulableWorkflowIr, runPlan, permissionPreflight, action: "start" });

  assert.equal(runPlan.status, "accepted");
  assert.equal(session.status, "succeeded");
  assert.equal(session.summary.terminal, "succeeded");
  assert.equal(session.permissionPreflight.status, "allowed");
  assert.equal(session.nodeResults.every((entry) => entry.status === "succeeded"), true);
  assert.ok(session.artifacts.some((artifact) => artifact === "artifacts/merge-previewArtifact.json"));
  assert.equal(session.cleanup.terminalRunStatus, "succeeded");
});

test("cancel action reaches canceled and records cleanup", () => {
  const runPlan = createGraphRunPlan(sampleSchedulableWorkflowIr, { permissionsApproved: true });
  const session = runAcceptedWorkflowSession({ workflowIr: sampleSchedulableWorkflowIr, runPlan, permissionPreflight, action: "cancel" });

  assert.equal(session.status, "canceled");
  assert.equal(session.summary.canceled > 0, true);
  assert.equal(session.cleanup.ok, true);
  assert.equal(session.cleanup.terminalRunStatus, "canceled");
});

test("transient failure retries and then succeeds", () => {
  const runPlan = createGraphRunPlan(sampleSchedulableWorkflowIr, { permissionsApproved: true });
  const session = runAcceptedWorkflowSession({ workflowIr: sampleSchedulableWorkflowIr, runPlan, permissionPreflight, action: "retry" });
  const normalize = session.nodeResults.find((entry) => entry.nodeId === "normalize");

  assert.equal(session.status, "succeeded");
  assert.equal(session.summary.retries, 1);
  assert.equal(normalize.status, "succeeded");
  assert.equal(normalize.attempts, 2);
});

test("terminal failure propagates skipped dependency evidence", () => {
  const runPlan = createGraphRunPlan(sampleSchedulableWorkflowIr, { permissionsApproved: true });
  const session = runAcceptedWorkflowSession({ workflowIr: sampleSchedulableWorkflowIr, runPlan, permissionPreflight, action: "failure" });
  const merge = session.nodeResults.find((entry) => entry.nodeId === "merge");
  const handoff = session.nodeResults.find((entry) => entry.nodeId === "handoff");

  assert.equal(session.status, "failed");
  assert.equal(session.summary.failed, 1);
  assert.equal(session.summary.skipped, 2);
  assert.equal(merge.status, "skipped");
  assert.equal(handoff.status, "skipped");
  assert.equal(session.cleanup.terminalRunStatus, "failed");
});

test("blocked and high-risk run plans never start scheduler", () => {
  const blockedRunPlan = createGraphRunPlan(sampleWorkflowIr, { permissionsApproved: true });
  const session = runAcceptedWorkflowSession({ workflowIr: sampleWorkflowIr, runPlan: blockedRunPlan, permissionPreflight, action: "start" });

  assert.equal(blockedRunPlan.status, "blocked");
  assert.equal(session.status, "blocked");
  assert.equal(session.summary.events, 0);
  assert.deepEqual(session.nodeResults, []);
  assert.match(session.blockedReason, /not accepted/u);
});

test("missing permission preflight blocks before scheduler", () => {
  const runPlan = createGraphRunPlan(sampleSchedulableWorkflowIr, { permissionsApproved: true });
  const session = runAcceptedWorkflowSession({ workflowIr: sampleSchedulableWorkflowIr, runPlan, action: "start" });

  assert.equal(session.status, "permission-blocked");
  assert.equal(session.summary.events, 0);
  assert.equal(session.permissionPreflight.status, "missing");
  assert.deepEqual(session.nodeResults, []);
});

test("runner session gate covers success cancel retry failure and blocked paths", () => {
  const review = reviewWorkflowRunnerSessionGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.start, "succeeded");
  assert.equal(review.checks.cancel, "canceled");
  assert.equal(review.checks.retry, "succeeded");
  assert.equal(review.checks.failure, "failed");
  assert.equal(review.checks.blocked, "blocked");
});
