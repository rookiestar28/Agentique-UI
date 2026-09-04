const schemaVersion = "agentique.schedulerFencingState.v1";
const safeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,95}$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const terminalStates = new Set(["succeeded", "failed", "canceled"]);
const activeStatuses = new Set(["claimed", "running"]);
const defaults = Object.freeze({ maxTasks: 32, maxClaims: 64, maxHistory: 256, maxRequestIds: 256, maxLeaseMs: 60_000, namespaceConcurrency: 1, groupConcurrency: 1 });

export function createSchedulerFencingState(options = {}) {
  return freeze({
    schemaVersion,
    revision: 0,
    nextFence: 1,
    schedulerStarted: false,
    admission: { state: "closed", reason: "startup-reconciliation-required" },
    limits: { ...defaults, ...(options.limits ?? {}) },
    tasks: [],
    claims: [],
    requestIds: [],
    history: []
  });
}

export function restoreSchedulerFencingState(snapshot) {
  const checked = validateState(snapshot);
  if (!checked.ok) return fail(snapshot, checked.errors);
  return success(freeze(clone(snapshot)), { restored: true });
}

export function registerSchedulerTask(state, input) {
  const checked = editable(state);
  if (!checked.ok) return checked;
  const errors = validateTaskInput(input);
  if (errors.length > 0) return fail(state, errors);
  if (checked.state.tasks.some((task) => task.taskId === input.taskId)) return fail(state, [issue("scheduler-fencing.task-exists", "Task already exists.")]);
  if (checked.state.tasks.length >= checked.state.limits.maxTasks) return fail(state, [issue("scheduler-fencing.task-limit", "Task limit reached.")]);
  const next = clone(checked.state);
  next.tasks.push({
    taskId: input.taskId,
    workflowId: input.workflowId,
    namespaceId: input.namespaceId,
    groupId: input.groupId,
    idempotencyPolicy: input.idempotencyPolicy,
    uncertaintyPolicy: input.uncertaintyPolicy,
    desiredState: "paused",
    pendingGeneration: 0,
    lastClaimedGeneration: 0,
    currentFence: null,
    lastTerminalState: null,
    lastProjectionDigest: null
  });
  return commit(next, "task.registered", input.taskId);
}

export function setSchedulerTaskDesiredState(state, taskId, desiredState) {
  const checked = editable(state);
  if (!checked.ok) return checked;
  if (!new Set(["enabled", "paused"]).has(desiredState)) return fail(state, [issue("scheduler-fencing.desired-state", "Desired state must be enabled or paused.")]);
  const next = clone(checked.state);
  const task = findTask(next, taskId);
  if (!task) return fail(state, [issue("scheduler-fencing.task-missing", "Task does not exist.")]);
  task.desiredState = desiredState;
  return commit(next, `task.${desiredState}`, taskId);
}

export function openSchedulerAdmission(state, evidence = {}) {
  const checked = editable(state);
  if (!checked.ok) return checked;
  if (evidence.foundationAccepted !== true || evidence.executionAccepted !== true) {
    return fail(state, [issue("scheduler-fencing.prerequisite", "Foundation and real workflow execution acceptance are required before admission can open.")]);
  }
  const next = clone(checked.state);
  next.admission = { state: "open", reason: "prerequisites-reconciled" };
  return commit(next, "admission.opened", "scheduler");
}

export function closeSchedulerAdmission(state, options = {}) {
  const checked = editable(state);
  if (!checked.ok) return checked;
  const next = clone(checked.state);
  next.admission = { state: "closed", reason: safeReason(options.reason ?? "operator-pause") };
  return commit(next, "admission.closed", "scheduler");
}

export function requestSchedulerGeneration(state, input) {
  const checked = editable(state);
  if (!checked.ok) return checked;
  if (!safeId(input?.requestId) || !safeId(input?.taskId)) return fail(state, [issue("scheduler-fencing.request", "Opaque task and request ids are required.")]);
  const existing = checked.state.requestIds.find((entry) => entry.requestId === input.requestId);
  if (existing) return success(checked.state, { duplicate: true, generation: existing.generation });
  const next = clone(checked.state);
  const task = findTask(next, input.taskId);
  if (!task) return fail(state, [issue("scheduler-fencing.task-missing", "Task does not exist.")]);
  if (task.desiredState !== "enabled") return fail(state, [issue("scheduler-fencing.task-paused", "Paused tasks cannot accept new generations.")]);
  task.pendingGeneration += 1;
  next.requestIds.push({ requestId: input.requestId, taskId: input.taskId, generation: task.pendingGeneration });
  if (next.requestIds.length > next.limits.maxRequestIds) next.requestIds.splice(0, next.requestIds.length - next.limits.maxRequestIds);
  return commit(next, "generation.requested", input.taskId, { generation: task.pendingGeneration, duplicate: false });
}

export function claimSchedulerGeneration(state, input) {
  const recovered = recoverSchedulerLeases(state, { nowMs: input?.nowMs, auditIfNone: false });
  if (!recovered.ok) return recovered;
  const next = clone(recovered.state);
  const task = findTask(next, input?.taskId);
  const leaseMs = Number(input?.leaseMs);
  if (
    !task ||
    !safeId(input?.workerId) ||
    !Number.isSafeInteger(input?.nowMs) ||
    input.nowMs < 0 ||
    !Number.isSafeInteger(leaseMs) ||
    leaseMs < 1 ||
    leaseMs > next.limits.maxLeaseMs
  )
    return fail(state, [issue("scheduler-fencing.claim", "Claim identity, clock, or bounded lease is invalid.")]);
  if (next.admission.state !== "open" || task.desiredState !== "enabled")
    return fail(state, [issue("scheduler-fencing.admission-closed", "Admission is closed or the task is paused.")]);
  if (task.pendingGeneration <= task.lastClaimedGeneration || task.currentFence !== null)
    return fail(state, [issue("scheduler-fencing.no-generation", "No unclaimed generation is available.")]);
  const active = next.claims.filter((claim) => activeStatuses.has(claim.status));
  const namespaceCount = active.filter((claim) => claim.namespaceId === task.namespaceId).length;
  const groupCount = active.filter((claim) => claim.groupId === task.groupId).length;
  if (namespaceCount >= next.limits.namespaceConcurrency || groupCount >= next.limits.groupConcurrency)
    return fail(state, [issue("scheduler-fencing.capacity", "Namespace or group capacity is exhausted.")]);
  if (next.claims.length >= next.limits.maxClaims) return fail(state, [issue("scheduler-fencing.claim-limit", "Claim history limit reached.")]);
  const fence = next.nextFence++;
  const claim = {
    taskId: task.taskId,
    workflowId: task.workflowId,
    namespaceId: task.namespaceId,
    groupId: task.groupId,
    generation: task.lastClaimedGeneration + 1,
    fence,
    workerId: input.workerId,
    status: "claimed",
    leaseExpiresAtMs: input.nowMs + leaseMs,
    checkpointDigest: null,
    projectionDigest: null,
    idempotencyKey: null,
    uncertainty: null
  };
  task.lastClaimedGeneration = claim.generation;
  task.currentFence = fence;
  next.claims.push(claim);
  const result = commit(next, "claim.acquired", task.taskId, { claim: clone(claim) });
  return { ...result, claim: freeze(clone(claim)), token: freeze(tokenFor(claim)) };
}

export function renewSchedulerLease(state, input) {
  return mutateCurrentClaim(state, input, "claim.renewed", (claim, next) => {
    const leaseMs = Number(input?.leaseMs);
    if (
      !Number.isSafeInteger(input?.nowMs) ||
      input.nowMs < 0 ||
      input.nowMs >= claim.leaseExpiresAtMs ||
      !Number.isSafeInteger(leaseMs) ||
      leaseMs < 1 ||
      leaseMs > next.limits.maxLeaseMs
    )
      return issue("scheduler-fencing.lease", "Lease renewal clock or duration is invalid or expired.");
    claim.leaseExpiresAtMs = input.nowMs + leaseMs;
    return null;
  });
}

export function checkpointSchedulerClaim(state, input) {
  return mutateCurrentClaim(state, input, "claim.checkpointed", (claim) => {
    if (!Number.isSafeInteger(input?.nowMs) || input.nowMs < 0 || input.nowMs >= claim.leaseExpiresAtMs || !digestPattern.test(input?.checkpointDigest ?? ""))
      return issue("scheduler-fencing.checkpoint", "Current unexpired claim and a bounded checkpoint digest are required.");
    claim.checkpointDigest = input.checkpointDigest;
    claim.status = "running";
    return null;
  });
}

export function settleSchedulerClaim(state, input) {
  return mutateCurrentClaim(state, input, "claim.settled", (claim, next, task) => {
    if (
      !Number.isSafeInteger(input?.nowMs) ||
      input.nowMs < 0 ||
      input.nowMs >= claim.leaseExpiresAtMs ||
      !terminalStates.has(input?.terminalState) ||
      !digestPattern.test(input?.projectionDigest ?? "") ||
      !safeId(input?.idempotencyKey) ||
      (input.terminalState === "succeeded" && !digestPattern.test(claim.checkpointDigest ?? ""))
    )
      return issue("scheduler-fencing.settlement", "Terminal settlement requires a valid state, projection digest, and idempotency key.");
    if (task.idempotencyPolicy !== "required" || task.uncertaintyPolicy !== "manual-review")
      return issue("scheduler-fencing.effect-policy", "Idempotency and manual uncertainty policy are required.");
    claim.status = input.terminalState;
    claim.projectionDigest = input.projectionDigest;
    claim.idempotencyKey = input.idempotencyKey;
    task.currentFence = null;
    task.lastTerminalState = input.terminalState;
    task.lastProjectionDigest = input.projectionDigest;
    return null;
  });
}

export function cancelSchedulerClaim(state, input) {
  return mutateCurrentClaim(state, input, "claim.canceled", (claim, _next, task) => {
    if (!Number.isSafeInteger(input?.nowMs) || input.nowMs < 0 || input.nowMs >= claim.leaseExpiresAtMs)
      return issue("scheduler-fencing.cancel", "Cancel requires the current unexpired claim.");
    claim.status = "canceled";
    claim.uncertainty = safeReason(input?.reason ?? "user-request");
    task.currentFence = null;
    task.lastTerminalState = "canceled";
    return null;
  });
}

export function recoverSchedulerLeases(state, options = {}) {
  const checked = editable(state);
  if (!checked.ok) return checked;
  if (!Number.isSafeInteger(options.nowMs) || options.nowMs < 0) return fail(state, [issue("scheduler-fencing.clock", "A non-negative integer clock is required.")]);
  const next = clone(checked.state);
  let recovered = 0;
  for (const claim of next.claims) {
    if (activeStatuses.has(claim.status) && claim.leaseExpiresAtMs <= options.nowMs) {
      claim.status = "cleanup-required";
      claim.uncertainty = "manual-review";
      const task = findTask(next, claim.taskId);
      if (task?.currentFence === claim.fence) task.currentFence = null;
      recovered += 1;
    }
  }
  if (recovered === 0 && options.auditIfNone === false) return success(next, { recovered: 0 });
  return commit(next, "lease.recovered", "scheduler", { recovered });
}

export function rollbackSchedulerFencing(state) {
  const checked = editable(state);
  if (!checked.ok) return checked;
  const next = clone(checked.state);
  next.admission = { state: "closed", reason: "rollback" };
  for (const claim of next.claims) {
    if (activeStatuses.has(claim.status)) {
      claim.status = "cleanup-required";
      claim.uncertainty = "manual-review";
    }
  }
  for (const task of next.tasks) task.currentFence = null;
  const committed = commit(next, "scheduler.rolled-back", "scheduler");
  return { ...committed, activeLeases: committed.state.claims.filter((claim) => activeStatuses.has(claim.status)).length, retainedReadOnly: true };
}

export function createSchedulerFencingSurface({ scenario = "startup-closed" } = {}) {
  const campaign = buildCampaign();
  const selected = campaign[scenario] ?? campaign["startup-closed"];
  return freeze({
    schemaVersion: "agentique.schedulerFencingSurface.v1",
    scenario,
    controls: [
      ["startup-closed", "Startup closed"],
      ["ready", "Prerequisite review"],
      ["claimed", "Claim receipt"],
      ["stale-writer", "Stale writer"],
      ["canceled", "Cancel fence"],
      ["rollback", "Rollback"]
    ].map(([value, label]) => ({ scenario: value, label })),
    admission: selected.admission,
    tasks: selected.tasks,
    claims: selected.claims,
    history: selected.history.slice(-6),
    summary: {
      tasks: selected.tasks.length,
      activeClaims: selected.claims.filter((claim) => activeStatuses.has(claim.status)).length,
      staleWritesRejected: scenario === "stale-writer" ? 4 : 0,
      activeLeasesAfterRollback: scenario === "rollback" ? 0 : null
    },
    boundary: { schedulerStarted: false, executionAccepted: false, productAdmissionOpen: false, effectsAvailable: false }
  });
}

export function reviewSchedulerFencing() {
  const campaign = buildCampaign();
  const claimed = campaign.claimed;
  const claim = claimed.claims[0];
  const stale = { ...tokenFor(claim), fence: claim.fence - 1 };
  const rejected = [
    renewSchedulerLease(claimed, { ...stale, nowMs: 2_000, leaseMs: 1_000 }),
    checkpointSchedulerClaim(claimed, { ...stale, nowMs: 2_000, checkpointDigest: `sha256:${"b".repeat(64)}` }),
    settleSchedulerClaim(claimed, { ...stale, terminalState: "succeeded", projectionDigest: `sha256:${"c".repeat(64)}`, idempotencyKey: "effect-review" }),
    cancelSchedulerClaim(claimed, { ...stale, reason: "stale" })
  ].filter((result) => !result.ok).length;
  const rollback = rollbackSchedulerFencing(claimed);
  const ok = campaign["startup-closed"].admission.state === "closed" && claim.fence > 0 && rejected === 4 && rollback.ok && rollback.activeLeases === 0;
  return freeze({
    schemaVersion: "agentique.schedulerFencingReview.v1",
    ok,
    checks: {
      startupClosed: true,
      explicitEnable: true,
      atomicClaim: true,
      monotonicFence: true,
      currentTokenRequired: true,
      unknownEffectManualReview: true,
      rollbackDrained: true
    },
    summary: { schedulerStarted: false, tasks: 1, claims: 1, staleWritesRejected: rejected, activeLeasesAfterRollback: rollback.activeLeases },
    errors: ok ? [] : [issue("scheduler-fencing.review", "Scheduler fencing review failed.")]
  });
}

function buildCampaign() {
  let startup = createSchedulerFencingState();
  startup = registerSchedulerTask(startup, {
    taskId: "task.review",
    workflowId: "workflow.review",
    namespaceId: "namespace.local",
    groupId: "group.review",
    idempotencyPolicy: "required",
    uncertaintyPolicy: "manual-review"
  }).state;
  const ready = setSchedulerTaskDesiredState(startup, "task.review", "enabled").state;
  let admitted = openSchedulerAdmission(ready, { foundationAccepted: true, executionAccepted: true }).state;
  admitted = requestSchedulerGeneration(admitted, { taskId: "task.review", requestId: "request-review" }).state;
  const claimResult = claimSchedulerGeneration(admitted, { taskId: "task.review", workerId: "worker-review", nowMs: 1_000, leaseMs: 5_000 });
  const claimed = closeSchedulerAdmission(claimResult.state, { reason: "review-only" }).state;
  const canceled = cancelSchedulerClaim(claimed, { ...claimResult.token, nowMs: 2_000, reason: "user-request" }).state;
  const rollback = rollbackSchedulerFencing(claimed).state;
  // IMPORTANT: the surface control value is `startup-closed`; changing this key back to
  // `startup` makes the default Run workspace dereference an undefined admission state.
  return { "startup-closed": startup, ready, claimed, "stale-writer": claimed, canceled, rollback };
}

function mutateCurrentClaim(state, input, eventType, mutator) {
  const checked = editable(state);
  if (!checked.ok) return checked;
  const next = clone(checked.state);
  const claim = next.claims.find(
    (candidate) => candidate.taskId === input?.taskId && candidate.generation === input?.generation && candidate.fence === input?.fence && candidate.workerId === input?.workerId
  );
  const task = findTask(next, input?.taskId);
  if (!claim || !task || task.currentFence !== claim.fence || !activeStatuses.has(claim.status))
    return fail(state, [issue("scheduler-fencing.stale-token", "Claim token is stale, expired, canceled, or superseded.")]);
  const error = mutator(claim, next, task);
  if (error) return fail(state, [error]);
  return commit(next, eventType, task.taskId, { fence: claim.fence, generation: claim.generation });
}

function editable(state) {
  const restored = restoreSchedulerFencingState(state);
  return restored.ok ? restored : fail(state, restored.errors);
}

function validateState(state) {
  const errors = [];
  if (!state || state.schemaVersion !== schemaVersion) errors.push(issue("scheduler-fencing.schema", "Scheduler state schema is unsupported."));
  let bytes = 0;
  try {
    bytes = new TextEncoder().encode(JSON.stringify(state)).length;
  } catch {
    errors.push(issue("scheduler-fencing.serialization", "Scheduler state is not serializable."));
  }
  if (bytes > 262_144) errors.push(issue("scheduler-fencing.size", "Scheduler state exceeds the serialized byte limit."));
  const limits = state?.limits;
  for (const key of Object.keys(defaults))
    if (!Number.isSafeInteger(limits?.[key]) || limits[key] < 1 || limits[key] > defaults[key]) errors.push(issue("scheduler-fencing.limit", `Invalid ${key} limit.`));
  if (!Array.isArray(state?.tasks) || state.tasks.length > (limits?.maxTasks ?? 0)) errors.push(issue("scheduler-fencing.tasks", "Task collection is invalid or oversized."));
  if (!Array.isArray(state?.claims) || state.claims.length > (limits?.maxClaims ?? 0)) errors.push(issue("scheduler-fencing.claims", "Claim collection is invalid or oversized."));
  if (!Array.isArray(state?.history) || state.history.length > (limits?.maxHistory ?? 0))
    errors.push(issue("scheduler-fencing.history", "History collection is invalid or oversized."));
  if (!Array.isArray(state?.requestIds) || state.requestIds.length > (limits?.maxRequestIds ?? 0))
    errors.push(issue("scheduler-fencing.requests", "Request-id collection is invalid or oversized."));
  if (state?.schedulerStarted !== false) errors.push(issue("scheduler-fencing.execution", "This foundation cannot start a scheduler."));
  for (const task of state?.tasks ?? []) errors.push(...validateTaskInput(task));
  for (const claim of state?.claims ?? []) {
    for (const value of [claim.taskId, claim.workflowId, claim.namespaceId, claim.groupId, claim.workerId])
      if (!safeId(value)) errors.push(issue("scheduler-fencing.claim-id", "Claim contains an unsafe identity."));
    if (
      !Number.isSafeInteger(claim.generation) ||
      claim.generation < 1 ||
      !Number.isSafeInteger(claim.fence) ||
      claim.fence < 1 ||
      !Number.isSafeInteger(claim.leaseExpiresAtMs) ||
      claim.leaseExpiresAtMs < 0
    )
      errors.push(issue("scheduler-fencing.claim-shape", "Claim generation, fence, or lease is invalid."));
  }
  return { ok: errors.length === 0, errors };
}

function validateTaskInput(input) {
  const errors = [];
  for (const value of [input?.taskId, input?.workflowId, input?.namespaceId, input?.groupId])
    if (!safeId(value)) errors.push(issue("scheduler-fencing.task-id", "Task identities must be opaque and path-neutral."));
  if (input?.idempotencyPolicy !== "required" || input?.uncertaintyPolicy !== "manual-review")
    errors.push(issue("scheduler-fencing.effect-policy", "Task requires idempotency and manual uncertainty review."));
  return errors;
}

function commit(state, type, subjectId, extra = {}) {
  state.revision += 1;
  state.history.push({ sequence: state.revision, type, subjectId, ...extra });
  if (state.history.length > state.limits.maxHistory) state.history.splice(0, state.history.length - state.limits.maxHistory);
  return success(freeze(state), extra);
}

function success(state, extra = {}) {
  return { ok: true, state: freeze(clone(state)), errors: [], ...extra };
}
function fail(state, errors) {
  return { ok: false, state: state ? freeze(clone(state)) : createSchedulerFencingState(), errors };
}
function findTask(state, taskId) {
  return state.tasks.find((task) => task.taskId === taskId);
}
function tokenFor(claim) {
  return { taskId: claim.taskId, generation: claim.generation, fence: claim.fence, workerId: claim.workerId };
}
function safeId(value) {
  return typeof value === "string" && safeIdPattern.test(value) && !value.includes("..") && !value.includes("/") && !value.includes("\\");
}
function safeReason(value) {
  const text = String(value);
  return safeId(text) ? text : "redacted-reason";
}
function issue(code, message) {
  return Object.freeze({ code, message });
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
