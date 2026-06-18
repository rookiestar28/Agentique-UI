import assert from "node:assert/strict";
import test from "node:test";
import { createCuratedAdapterExecutionLane } from "../src/core/curated-adapter-execution-lane.mjs";
import { createGraphRunPlan } from "../src/core/graph-run-plan.mjs";
import { createAllowedRunnerPermissionPreflight } from "../src/core/runner-permission-preflight.mjs";
import {
  createRunnerEventStream,
  reviewRunnerEventStreamGate,
  runnerEventStreamSchemaVersion
} from "../src/core/runner-event-stream.mjs";
import { runAcceptedWorkflowSession } from "../src/core/workflow-runner-session.mjs";
import { sampleSchedulableWorkflowIr } from "../src/core/workflow-scheduler.mjs";

const runPlan = createGraphRunPlan(sampleSchedulableWorkflowIr, { permissionsApproved: true });
const permissionPreflight = createAllowedRunnerPermissionPreflight();

test("runner event stream exposes ordered stable event ids", () => {
  const session = runAcceptedWorkflowSession({ action: "start", runPlan, permissionPreflight });
  const stream = createRunnerEventStream({ session });

  assert.equal(stream.schemaVersion, runnerEventStreamSchemaVersion);
  assert.equal(stream.events.every((event, index) => event.sequence === index + 1), true);
  assert.equal(stream.events.every((event) => /^evt-\d{4}-[a-z0-9._:-]+-[a-z0-9._:-]+$/u.test(event.id)), true);
  assert.equal(stream.schedulerEvents.some((event) => event.type === "queued"), true);
  assert.equal(stream.schedulerEvents.some((event) => event.type === "started"), true);
  assert.equal(stream.schedulerEvents.some((event) => event.type === "succeeded"), true);
  assert.equal(stream.cleanupEvent.type, "cleanup");
});

test("active sample shows running progress and terminal consistency", () => {
  const session = runAcceptedWorkflowSession({ action: "start", runPlan, permissionPreflight });
  const stream = createRunnerEventStream({ session });

  assert.equal(stream.activeSample.status, "running");
  assert.match(stream.activeSample.cursor, /^evt-\d{4}/u);
  assert.equal(stream.activeSample.canAdvanceToTerminal, true);
  assert.equal(stream.terminalState, "succeeded");
});

test("retry failure and skipped dependency chains are visible per node", () => {
  const retrySession = runAcceptedWorkflowSession({ action: "retry", runPlan, permissionPreflight });
  const retryStream = createRunnerEventStream({ session: retrySession });
  const failureSession = runAcceptedWorkflowSession({ action: "failure", runPlan, permissionPreflight });
  const failureStream = createRunnerEventStream({ session: failureSession });

  assert.equal(retryStream.schedulerEvents.some((event) => event.type === "retrying"), true);
  assert.equal(failureStream.nodeTimelines.some((node) => node.status === "failed"), true);
  assert.equal(failureStream.nodeTimelines.some((node) => node.status === "skipped"), true);
  assert.equal(failureStream.dependencyChains.some((chain) => chain.status === "skipped" && chain.upstream === "normalize"), true);
});

test("canceled runs include canceled node event and cleanup event", () => {
  const session = runAcceptedWorkflowSession({ action: "cancel", runPlan, permissionPreflight });
  const stream = createRunnerEventStream({ session });

  assert.equal(stream.schedulerEvents.some((event) => event.type === "canceled"), true);
  assert.equal(stream.cleanupEvent.type, "cleanup");
  assert.equal(stream.cleanupEvent.label.includes("canceled"), true);
});

test("adapter lane event timeline is descriptor-only and ordered", () => {
  const session = runAcceptedWorkflowSession({ action: "start", runPlan, permissionPreflight });
  const stream = createRunnerEventStream({
    session,
    adapterLane: createCuratedAdapterExecutionLane({ selectedRuntime: "node" })
  });

  assert.equal(stream.adapterEvents.length >= 4, true);
  assert.equal(stream.adapterEvents.some((event) => event.type === "adapter-succeeded"), true);
  assert.equal(stream.adapterEvents.some((event) => event.type === "cleanup"), true);
  assert.equal(stream.boundary.descriptorOnly, true);
  assert.equal(stream.boundary.liveTransport, false);
});

test("bounded logs are redacted and path neutral", () => {
  const session = runAcceptedWorkflowSession({ action: "start", runPlan, permissionPreflight });
  const stream = createRunnerEventStream({ session, maxLogEntries: 3 });
  const text = JSON.stringify(stream);

  assert.equal(stream.boundedLogs.length <= 3, true);
  assert.equal(stream.boundedLogs.every((entry) => entry.redacted === true), true);
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/u);
  assert.doesNotMatch(text, /vault:[a-z][a-zA-Z0-9._-]+/u);
  assert.doesNotMatch(text, /bearer\s+[A-Za-z0-9._-]+/iu);
  assert.doesNotMatch(text, /cookie=/iu);
});

test("runner event stream review gate passes", () => {
  const review = reviewRunnerEventStreamGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.orderedEvents, true);
  assert.equal(review.checks.retryingVisible, true);
  assert.equal(review.checks.dependencyChains >= 2, true);
  assert.equal(review.checks.adapterEvents >= 4, true);
});
