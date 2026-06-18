import { redactText, sanitizeForExport } from "./secret-vault.mjs";

export const localRunStates = Object.freeze([
  "queued",
  "preparing",
  "permission-blocked",
  "ready",
  "running",
  "canceling",
  "canceled",
  "succeeded",
  "failed",
  "cleanup-required",
  "cleaned"
]);

const stateSet = new Set(localRunStates);
const fixedNow = "2026-06-12T00:00:00.000Z";
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u;
const terminalStates = new Set(["canceled", "succeeded", "failed", "cleaned"]);
const staleRecoveryStates = new Set(["preparing", "running", "canceling"]);

export const sampleLocalRunRecord = createLocalRunRecord({
  resourceId: "resource.visual-guide",
  sessionId: "session.local-001",
  runId: "run.local-001",
  timeoutMs: 60000,
  retry: { maxAttempts: 1 }
}, { now: fixedNow });

export function createLocalRunRecord(input = {}, options = {}) {
  const now = isoNow(options);
  const timeoutMs = normalizeTimeout(input.timeoutMs ?? 60000);
  const maxAttempts = normalizeMaxAttempts(input.retry?.maxAttempts ?? 0);
  const record = {
    schemaVersion: "agentique.localRunRecord.v1",
    resourceId: requireOpaqueId(input.resourceId ?? "resource.visual-guide", "resourceId"),
    sessionId: requireOpaqueId(input.sessionId ?? "session.local-001", "sessionId"),
    runId: requireOpaqueId(input.runId ?? "run.local-001", "runId"),
    state: "queued",
    attempt: 0,
    retry: {
      maxAttempts,
      attemptsUsed: 0
    },
    timeout: {
      timeoutMs,
      deadlineAt: null
    },
    worker: {
      id: null,
      readiness: "unassigned",
      heartbeatAt: null,
      staleAfterMs: Number(input.worker?.staleAfterMs ?? 30000)
    },
    progress: {
      percent: 0,
      message: "queued"
    },
    cancellation: {
      requested: false,
      requestedAt: null
    },
    cleanup: {
      required: false,
      status: "not-required",
      receiptAt: null
    },
    recovery: {
      recovered: false,
      reason: null,
      recoveredAt: null
    },
    failure: null,
    createdAt: now,
    updatedAt: now,
    sequence: 0,
    events: [event("created", "queued", now, { state: "queued" })]
  };
  return sanitizeForExport(record);
}

export function transitionLocalRun(record, action, options = {}) {
  const errors = validateRecord(record);
  const normalizedAction = normalizeAction(action);
  if (errors.length > 0) {
    return blocked(record, errors);
  }
  if (!normalizedAction.ok) {
    return blocked(record, [normalizedAction.error]);
  }

  const now = isoNow(options);
  const type = normalizedAction.action.type;
  const current = record.state;

  switch (type) {
    case "prepare":
      return requireState(record, ["queued"], type, () => nextRecord(record, "preparing", type, now, {
        progress: { percent: 5, message: "preparing" },
        worker: { ...record.worker, readiness: "preparing" }
      }));
    case "block-permission":
      return requireState(record, ["queued", "preparing"], type, () => nextRecord(record, "permission-blocked", type, now, {
        progress: { percent: record.progress.percent, message: "permission blocked" },
        failure: failure("local-run.permission-blocked", normalizedAction.action.reason ?? "Permission review is required.")
      }));
    case "ready":
      return requireState(record, ["preparing", "permission-blocked"], type, () => nextRecord(record, "ready", type, now, {
        worker: {
          ...record.worker,
          id: requireOpaqueId(normalizedAction.action.workerId ?? "worker.local-001", "workerId"),
          readiness: "ready",
          heartbeatAt: now
        },
        progress: { percent: 20, message: "ready" },
        failure: current === "permission-blocked" ? null : record.failure
      }));
    case "start":
      return requireState(record, ["ready"], type, () => nextRecord(record, "running", type, now, {
        attempt: record.attempt + 1,
        timeout: {
          ...record.timeout,
          deadlineAt: deadline(now, record.timeout.timeoutMs)
        },
        worker: {
          ...record.worker,
          id: requireOpaqueId(normalizedAction.action.workerId ?? record.worker.id ?? "worker.local-001", "workerId"),
          readiness: "running",
          heartbeatAt: now
        },
        progress: { percent: Math.max(record.progress.percent, 25), message: "running" }
      }));
    case "heartbeat":
      return requireState(record, ["running"], type, () => nextRecord(record, "running", type, now, {
        worker: { ...record.worker, heartbeatAt: now, readiness: "running" }
      }));
    case "progress":
      return requireState(record, ["running"], type, () => nextRecord(record, "running", type, now, {
        progress: {
          percent: normalizeProgress(normalizedAction.action.percent),
          message: redactText(normalizedAction.action.message ?? "running")
        }
      }));
    case "succeed":
      return requireState(record, ["running"], type, () => nextRecord(record, "succeeded", type, now, {
        timeout: { ...record.timeout, deadlineAt: null },
        progress: { percent: 100, message: "succeeded" },
        worker: { ...record.worker, readiness: "finished" },
        failure: null
      }));
    case "fail":
      return requireState(record, ["preparing", "ready", "running"], type, () => nextRecord(record, "failed", type, now, {
        timeout: { ...record.timeout, deadlineAt: null },
        worker: { ...record.worker, readiness: "failed" },
        failure: failure(normalizedAction.action.code ?? "local-run.failed", normalizedAction.action.message ?? "Run failed.")
      }));
    case "timeout":
      return requireState(record, ["running"], type, () => timeoutTransition(record, normalizedAction.action, now));
    case "cancel":
      if (["queued", "preparing", "permission-blocked", "ready"].includes(current)) {
        return nextRecord(record, "canceled", type, now, {
          cancellation: { requested: true, requestedAt: now },
          timeout: { ...record.timeout, deadlineAt: null },
          worker: { ...record.worker, readiness: "canceled" },
          failure: failure("local-run.canceled", "Run was canceled before process start.")
        });
      }
      return requireState(record, ["running"], type, () => nextRecord(record, "canceling", type, now, {
        cancellation: { requested: true, requestedAt: now },
        worker: { ...record.worker, readiness: "canceling" },
        progress: { percent: record.progress.percent, message: "canceling" }
      }));
    case "cancel-ack":
      return requireState(record, ["canceling"], type, () => nextRecord(record, "canceled", type, now, {
        timeout: { ...record.timeout, deadlineAt: null },
        worker: { ...record.worker, readiness: "canceled" },
        failure: failure("local-run.canceled", "Run cancellation completed.")
      }));
    case "require-cleanup":
      return requireState(record, ["succeeded", "failed", "canceled"], type, () => nextRecord(record, "cleanup-required", type, now, {
        cleanup: { required: true, status: "pending", receiptAt: null }
      }));
    case "clean":
      return requireState(record, ["cleanup-required"], type, () => nextRecord(record, "cleaned", type, now, {
        cleanup: { required: false, status: "cleaned", receiptAt: now },
        worker: { ...record.worker, readiness: "cleaned" }
      }));
    default:
      return blocked(record, [issue("local-run.unsupported-action", `Unsupported action: ${type}`)]);
  }
}

export function recoverLocalRun(record, options = {}) {
  const errors = validateRecord(record);
  if (errors.length > 0) {
    return blocked(record, errors);
  }
  const now = isoNow(options);
  if (record.state === "ready") {
    return nextRecord(record, "queued", "recover", now, {
      worker: { ...record.worker, readiness: "unassigned", heartbeatAt: null },
      recovery: { recovered: true, reason: "ready-reset-after-restart", recoveredAt: now },
      progress: { percent: 0, message: "queued after recovery" }
    });
  }
  if (staleRecoveryStates.has(record.state) && isStale(record, now)) {
    return nextRecord(record, "cleanup-required", "recover-stale", now, {
      timeout: { ...record.timeout, deadlineAt: null },
      worker: { ...record.worker, readiness: "stale" },
      cleanup: { required: true, status: "pending", receiptAt: null },
      recovery: { recovered: true, reason: "stale-incomplete-run", recoveredAt: now },
      failure: failure("local-run.recovered-stale", "Recovered stale incomplete run; cleanup is required.")
    });
  }
  return { ok: true, record: clone(record), errors: [], recovered: false };
}

export function reviewLocalRunStateMachine() {
  const statesCovered = new Set(localRunStates);
  const sample = runSampleLifecycle();
  const forbidden = transitionLocalRun(sampleLocalRunRecord, { type: "start" }, { now: fixedNow });
  return {
    schemaVersion: "agentique.localRunStateMachineReview.v1",
    ok: sample.ok && statesCovered.size === 11 && forbidden.ok === false,
    states: [...statesCovered],
    sampleState: sample.record.state,
    forbiddenJumpBlocked: forbidden.ok === false,
    errors: sample.errors,
    summary: {
      states: statesCovered.size,
      sampleEvents: sample.record.events.length,
      forbiddenJumpBlocked: forbidden.ok === false
    }
  };
}

function runSampleLifecycle() {
  let result = { ok: true, record: sampleLocalRunRecord, errors: [] };
  for (const action of [
    { type: "prepare" },
    { type: "ready", workerId: "worker.local-001" },
    { type: "start", workerId: "worker.local-001" },
    { type: "heartbeat" },
    { type: "progress", percent: 60, message: "running" },
    { type: "succeed" },
    { type: "require-cleanup" },
    { type: "clean" }
  ]) {
    result = transitionLocalRun(result.record, action, { now: fixedNow });
    if (!result.ok) return result;
  }
  return result;
}

function timeoutTransition(record, action, now) {
  if (record.retry.attemptsUsed < record.retry.maxAttempts) {
    return nextRecord(record, "queued", "timeout-retry", now, {
      retry: { ...record.retry, attemptsUsed: record.retry.attemptsUsed + 1 },
      timeout: { ...record.timeout, deadlineAt: null },
      worker: { ...record.worker, readiness: "unassigned", heartbeatAt: null },
      progress: { percent: 0, message: "queued for retry" },
      failure: failure("local-run.timeout-retry", action.message ?? "Run timed out and was queued for retry.")
    });
  }
  return nextRecord(record, "failed", "timeout", now, {
    timeout: { ...record.timeout, deadlineAt: null },
    worker: { ...record.worker, readiness: "failed" },
    failure: failure("local-run.timeout", action.message ?? "Run timed out.")
  });
}

function nextRecord(record, state, actionType, now, patch = {}) {
  if (!stateSet.has(state)) {
    return blocked(record, [issue("local-run.invalid-state", `Unsupported state: ${state}`)]);
  }
  const next = {
    ...clone(record),
    ...patch,
    state,
    updatedAt: now,
    sequence: Number(record.sequence ?? 0) + 1,
    events: [
      ...(record.events ?? []),
      event(actionType, state, now, {
        state,
        attempt: patch.attempt ?? record.attempt,
        retryAttemptsUsed: patch.retry?.attemptsUsed ?? record.retry?.attemptsUsed ?? 0
      })
    ]
  };
  return { ok: true, record: sanitizeForExport(next), errors: [] };
}

function requireState(record, allowedStates, actionType, factory) {
  if (!allowedStates.includes(record.state)) {
    return blocked(record, [issue("local-run.forbidden-transition", `${actionType} is not allowed from ${record.state}.`)]);
  }
  try {
    return factory();
  } catch (error) {
    return blocked(record, [issue(error.code ?? "local-run.transition-error", error.message)]);
  }
}

function validateRecord(record) {
  const errors = [];
  if (!record || typeof record !== "object") {
    return [issue("local-run.invalid-record", "Local run record must be an object.")];
  }
  if (record.schemaVersion !== "agentique.localRunRecord.v1") {
    errors.push(issue("local-run.schema", "Local run record schema is unsupported."));
  }
  if (!stateSet.has(record.state)) {
    errors.push(issue("local-run.state", "Local run state is unsupported."));
  }
  for (const field of ["resourceId", "sessionId", "runId"]) {
    try {
      requireOpaqueId(record[field], field);
    } catch (error) {
      errors.push(issue(error.code ?? "local-run.invalid-id", error.message));
    }
  }
  return errors;
}

function normalizeAction(action) {
  if (typeof action === "string") {
    return { ok: true, action: { type: action } };
  }
  if (!action || typeof action !== "object" || typeof action.type !== "string") {
    return { ok: false, error: issue("local-run.invalid-action", "Transition action must include a type.") };
  }
  return { ok: true, action };
}

function isStale(record, now) {
  const staleAfterMs = Number(record.worker?.staleAfterMs ?? 30000);
  const heartbeatAt = Date.parse(record.worker?.heartbeatAt ?? record.updatedAt ?? record.createdAt ?? now);
  return Date.parse(now) - heartbeatAt >= staleAfterMs;
}

function isoNow(options = {}) {
  const value = options.now ?? fixedNow;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw issue("local-run.invalid-time", "Timestamp must be a valid ISO date.");
  }
  return new Date(timestamp).toISOString();
}

function deadline(now, timeoutMs) {
  return new Date(Date.parse(now) + timeoutMs).toISOString();
}

function event(type, state, createdAt, details = {}) {
  return {
    type,
    state,
    createdAt,
    details: sanitizeForExport(details)
  };
}

function failure(code, message) {
  return {
    code,
    message: redactText(message)
  };
}

function normalizeProgress(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, Math.round(number)));
}

function normalizeTimeout(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1000 || number > 3600000) {
    throw issue("local-run.timeout", "Timeout must be an integer between 1000 and 3600000 milliseconds.");
  }
  return number;
}

function normalizeMaxAttempts(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 3) {
    throw issue("local-run.retry", "Retry attempts must be an integer between 0 and 3.");
  }
  return number;
}

function requireOpaqueId(value, fieldName) {
  const text = String(value ?? "");
  if (!idPattern.test(text) || text.includes("..") || text.includes("/") || text.includes("\\") || text.includes(":")) {
    throw issue("local-run.invalid-id", `${fieldName} must be an opaque id, not a path.`);
  }
  return text;
}

function blocked(record, errors) {
  return {
    ok: false,
    record: record ? clone(record) : null,
    errors
  };
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(redactText(message)));
  error.code = code;
  error.message = redactText(message);
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
