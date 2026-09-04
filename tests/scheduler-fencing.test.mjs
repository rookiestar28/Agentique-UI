import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelSchedulerClaim,
  claimSchedulerGeneration,
  closeSchedulerAdmission,
  createSchedulerFencingState,
  openSchedulerAdmission,
  checkpointSchedulerClaim,
  recoverSchedulerLeases,
  registerSchedulerTask,
  renewSchedulerLease,
  requestSchedulerGeneration,
  restoreSchedulerFencingState,
  reviewSchedulerFencing,
  rollbackSchedulerFencing,
  setSchedulerTaskDesiredState,
  settleSchedulerClaim
} from "../src/core/scheduler-fencing.mjs";

const task = {
  taskId: "task.daily-review",
  workflowId: "workflow.review",
  namespaceId: "namespace.local",
  groupId: "group.review",
  idempotencyPolicy: "required",
  uncertaintyPolicy: "manual-review"
};

function readyState() {
  let state = createSchedulerFencingState();
  state = registerSchedulerTask(state, task).state;
  state = setSchedulerTaskDesiredState(state, task.taskId, "enabled").state;
  state = openSchedulerAdmission(state, { foundationAccepted: true, executionAccepted: true }).state;
  return state;
}

function claimedState() {
  let state = readyState();
  state = requestSchedulerGeneration(state, { taskId: task.taskId, requestId: "request-001" }).state;
  const claimed = claimSchedulerGeneration(state, { taskId: task.taskId, workerId: "worker-a", nowMs: 1_000, leaseMs: 5_000 });
  assert.equal(claimed.ok, true);
  return claimed;
}

test("startup and restored state remain admission-closed until both prerequisites are explicit", () => {
  const initial = createSchedulerFencingState();
  assert.equal(initial.admission.state, "closed");
  assert.equal(Object.isFrozen(initial.admission), true);
  assert.equal(Object.isFrozen(initial.tasks), true);
  assert.equal(openSchedulerAdmission(initial, { foundationAccepted: true, executionAccepted: false }).ok, false);
  const restored = restoreSchedulerFencingState(JSON.parse(JSON.stringify(initial)));
  assert.equal(restored.ok, true);
  assert.equal(restored.state.admission.state, "closed");
});

test("task registration defaults paused and explicit enable is auditable", () => {
  const registered = registerSchedulerTask(createSchedulerFencingState(), task);
  assert.equal(registered.state.tasks[0].desiredState, "paused");
  const enabled = setSchedulerTaskDesiredState(registered.state, task.taskId, "enabled");
  assert.equal(enabled.state.tasks[0].desiredState, "enabled");
  assert.equal(enabled.state.history.at(-1).type, "task.enabled");
});

test("request ids deduplicate while a post-claim request creates a later generation", () => {
  let state = readyState();
  const first = requestSchedulerGeneration(state, { taskId: task.taskId, requestId: "request-001" });
  const duplicate = requestSchedulerGeneration(first.state, { taskId: task.taskId, requestId: "request-001" });
  assert.equal(duplicate.duplicate, true);
  const claimed = claimSchedulerGeneration(duplicate.state, { taskId: task.taskId, workerId: "worker-a", nowMs: 1_000, leaseMs: 5_000 });
  const later = requestSchedulerGeneration(claimed.state, { taskId: task.taskId, requestId: "request-002" });
  assert.equal(later.state.tasks[0].pendingGeneration, 2);
  assert.equal(claimed.claim.generation, 1);
});

test("only one atomic claim wins and fences increase monotonically", () => {
  const first = claimedState();
  const duplicate = claimSchedulerGeneration(first.state, { taskId: task.taskId, workerId: "worker-b", nowMs: 1_001, leaseMs: 5_000 });
  assert.equal(duplicate.ok, false);
  let state = checkpointSchedulerClaim(first.state, {
    ...first.token,
    checkpointDigest: `sha256:${"b".repeat(64)}`,
    nowMs: 2_000
  }).state;
  state = settleSchedulerClaim(state, {
    ...first.token,
    nowMs: 2_500,
    terminalState: "succeeded",
    projectionDigest: `sha256:${"a".repeat(64)}`,
    idempotencyKey: "effect-task-1"
  }).state;
  state = requestSchedulerGeneration(state, { taskId: task.taskId, requestId: "request-002" }).state;
  const second = claimSchedulerGeneration(state, { taskId: task.taskId, workerId: "worker-b", nowMs: 7_000, leaseMs: 5_000 });
  assert.ok(second.claim.fence > first.claim.fence);
});

test("renew and checkpoint require the exact current fencing token", () => {
  const claimed = claimedState();
  assert.equal(renewSchedulerLease(claimed.state, { ...claimed.token, nowMs: 2_000, leaseMs: 5_000 }).ok, true);
  assert.equal(renewSchedulerLease(claimed.state, { ...claimed.token, fence: claimed.token.fence - 1, nowMs: 2_000, leaseMs: 5_000 }).ok, false);
  const checkpoint = checkpointSchedulerClaim(claimed.state, { ...claimed.token, checkpointDigest: `sha256:${"b".repeat(64)}`, nowMs: 2_000 });
  assert.equal(checkpoint.ok, true);
  assert.equal(checkpoint.state.claims[0].checkpointDigest.startsWith("sha256:"), true);
});

test("expired recovery fences the old owner and never automatically replays unknown effects", () => {
  const claimed = claimedState();
  const recovered = recoverSchedulerLeases(claimed.state, { nowMs: 7_000 });
  assert.equal(recovered.state.claims[0].status, "cleanup-required");
  assert.equal(recovered.state.claims[0].uncertainty, "manual-review");
  const late = settleSchedulerClaim(recovered.state, {
    ...claimed.token,
    nowMs: 7_000,
    terminalState: "succeeded",
    projectionDigest: `sha256:${"c".repeat(64)}`,
    idempotencyKey: "effect-task-1"
  });
  assert.equal(late.ok, false);
});

test("cancel fences late success and records a visible terminal history entry", () => {
  const claimed = claimedState();
  const canceled = cancelSchedulerClaim(claimed.state, { ...claimed.token, nowMs: 2_000, reason: "user-request" });
  assert.equal(canceled.ok, true);
  assert.equal(canceled.state.claims[0].status, "canceled");
  assert.equal(canceled.state.history.at(-1).type, "claim.canceled");
  assert.equal(
    settleSchedulerClaim(canceled.state, {
      ...claimed.token,
      nowMs: 2_500,
      terminalState: "succeeded",
      projectionDigest: `sha256:${"d".repeat(64)}`,
      idempotencyKey: "effect-task-1"
    }).ok,
    false
  );
});

test("namespace and group concurrency limits are enforced at claim", () => {
  let state = readyState();
  state = registerSchedulerTask(state, { ...task, taskId: "task.second", workflowId: "workflow.second" }).state;
  state = setSchedulerTaskDesiredState(state, "task.second", "enabled").state;
  state = requestSchedulerGeneration(state, { taskId: task.taskId, requestId: "request-001" }).state;
  state = requestSchedulerGeneration(state, { taskId: "task.second", requestId: "request-002" }).state;
  state = claimSchedulerGeneration(state, { taskId: task.taskId, workerId: "worker-a", nowMs: 1_000, leaseMs: 5_000 }).state;
  const blocked = claimSchedulerGeneration(state, { taskId: "task.second", workerId: "worker-b", nowMs: 1_001, leaseMs: 5_000 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errors[0].code, "scheduler-fencing.capacity");
});

test("settlement requires bounded idempotency and projection evidence", () => {
  const claimed = claimedState();
  assert.equal(settleSchedulerClaim(claimed.state, { ...claimed.token, nowMs: 2_000, terminalState: "succeeded" }).ok, false);
  assert.equal(
    settleSchedulerClaim(claimed.state, {
      ...claimed.token,
      nowMs: 7_000,
      terminalState: "succeeded",
      projectionDigest: `sha256:${"e".repeat(64)}`,
      idempotencyKey: "effect-task-1"
    }).ok,
    false
  );
  const checkpointed = checkpointSchedulerClaim(claimed.state, {
    ...claimed.token,
    checkpointDigest: `sha256:${"f".repeat(64)}`,
    nowMs: 2_000
  });
  const settled = settleSchedulerClaim(checkpointed.state, {
    ...claimed.token,
    nowMs: 2_500,
    terminalState: "succeeded",
    projectionDigest: `sha256:${"e".repeat(64)}`,
    idempotencyKey: "effect-task-1"
  });
  assert.equal(settled.ok, true);
  assert.equal(settled.state.claims[0].status, "succeeded");
});

test("restore rejects unsafe, corrupt, oversized, and schema-drifted snapshots", () => {
  const valid = readyState();
  assert.equal(restoreSchedulerFencingState(valid).ok, true);
  assert.equal(restoreSchedulerFencingState({ ...valid, schemaVersion: "unknown" }).ok, false);
  assert.equal(restoreSchedulerFencingState({ ...valid, tasks: [{ ...valid.tasks[0], taskId: "../escape" }] }).ok, false);
  assert.equal(restoreSchedulerFencingState({ ...valid, history: Array.from({ length: 257 }, (_, index) => ({ sequence: index + 1 })) }).ok, false);
});

test("close and rollback drain active leases without deleting durable task history", () => {
  const claimed = claimedState();
  const closed = closeSchedulerAdmission(claimed.state, { reason: "operator-pause" });
  assert.equal(closed.state.admission.state, "closed");
  const rolledBack = rollbackSchedulerFencing(closed.state);
  assert.equal(rolledBack.ok, true);
  assert.equal(rolledBack.activeLeases, 0);
  assert.equal(rolledBack.state.tasks.length, 1);
  assert.ok(rolledBack.state.history.length > claimed.state.history.length);
});

test("fixed review campaign covers admission, leases, stale writers, cancel, and rollback", () => {
  const review = reviewSchedulerFencing();
  assert.equal(review.ok, true);
  assert.equal(review.summary.schedulerStarted, false);
  assert.equal(review.summary.staleWritesRejected, 4);
  assert.equal(review.summary.activeLeasesAfterRollback, 0);
});
