import { createGraphRunPlan } from "./graph-run-plan.mjs";
import { createAllowedRunnerPermissionPreflight, summarizePermissionPreflight } from "./runner-permission-preflight.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";
import { runWorkflowSchedule, sampleSchedulableWorkflowIr } from "./workflow-scheduler.mjs";

export const workflowRunnerSessionSchemaVersion = "agentique.workflowRunnerSession.v1";

const fixedNow = "2026-06-13T00:00:00.000Z";
const supportedActions = new Set(["start", "cancel", "retry", "failure"]);

export function createIdleWorkflowRunnerSession() {
  return freezeSession({
    schemaVersion: workflowRunnerSessionSchemaVersion,
    action: "idle",
    status: "idle",
    runId: "run-ui-workflow-001",
    startedAt: "not-started",
    lastAction: "Awaiting accepted run plan",
    blockedReason: "",
    summary: emptySummary("not-started"),
    logs: ["runner.idle"],
    artifacts: [],
    nodeResults: [],
    permissionPreflight: summarizePermissionPreflight(null),
    cleanup: {
      schemaVersion: "agentique.workflowSchedulerCleanupReceipt.v1",
      ok: true,
      status: "not-started",
      idempotent: true,
      terminalRunStatus: "idle",
      removed: []
    }
  });
}

export function runAcceptedWorkflowSession({
  action = "start",
  workflowIr = sampleSchedulableWorkflowIr,
  runPlan = createGraphRunPlan(workflowIr, { permissionsApproved: true }),
  permissionPreflight = null,
  now = fixedNow
} = {}) {
  const normalizedAction = supportedActions.has(action) ? action : "start";
  const gate = reviewRunPlanForStart(runPlan);
  if (!gate.ok) {
    return freezeSession({
      schemaVersion: workflowRunnerSessionSchemaVersion,
      action: normalizedAction,
      status: gate.status,
      runId: runPlan?.workflowId ?? "run-ui-workflow-001",
      startedAt: now,
      lastAction: gate.lastAction,
      blockedReason: gate.message,
      summary: emptySummary("not-started"),
      logs: [gate.code],
      artifacts: [],
      nodeResults: [],
      permissionPreflight: summarizePermissionPreflight(permissionPreflight),
      cleanup: {
        schemaVersion: "agentique.workflowSchedulerCleanupReceipt.v1",
        ok: true,
        status: "not-started",
        idempotent: true,
        terminalRunStatus: gate.status,
        removed: []
      }
    });
  }

  const permissionGate = reviewPermissionPreflightForStart(permissionPreflight);
  if (!permissionGate.ok) {
    return freezeSession({
      schemaVersion: workflowRunnerSessionSchemaVersion,
      action: normalizedAction,
      status: "permission-blocked",
      runId: runPlan.workflowId ?? "run-ui-workflow-001",
      startedAt: now,
      lastAction: "Start blocked before scheduler",
      blockedReason: permissionGate.message,
      summary: emptySummary("not-started"),
      logs: [permissionGate.code],
      artifacts: [],
      nodeResults: [],
      permissionPreflight: summarizePermissionPreflight(permissionPreflight),
      cleanup: {
        schemaVersion: "agentique.workflowSchedulerCleanupReceipt.v1",
        ok: true,
        status: "not-started",
        idempotent: true,
        terminalRunStatus: "permission-blocked",
        removed: []
      }
    });
  }

  const run = runWorkflowSchedule(workflowIr, schedulerOptionsForAction(normalizedAction, now));
  return createRunnerSessionFromSchedule(run, actionLabel(normalizedAction), normalizedAction, now, permissionPreflight);
}

export function reviewWorkflowRunnerSessionGate() {
  const acceptedRunPlan = createGraphRunPlan(sampleSchedulableWorkflowIr, { permissionsApproved: true });
  const permissionPreflight = createAllowedRunnerPermissionPreflight();
  const start = runAcceptedWorkflowSession({ action: "start", runPlan: acceptedRunPlan, permissionPreflight });
  const cancel = runAcceptedWorkflowSession({ action: "cancel", runPlan: acceptedRunPlan, permissionPreflight });
  const retry = runAcceptedWorkflowSession({ action: "retry", runPlan: acceptedRunPlan, permissionPreflight });
  const failure = runAcceptedWorkflowSession({ action: "failure", runPlan: acceptedRunPlan, permissionPreflight });
  const blocked = runAcceptedWorkflowSession({
    action: "start",
    workflowIr: sampleSchedulableWorkflowIr,
    permissionPreflight,
    runPlan: {
      ...acceptedRunPlan,
      status: "blocked",
      startDecision: "blocked",
      summary: { ...acceptedRunPlan.summary, blocked: 1 }
    }
  });

  const ok = start.status === "succeeded" &&
    cancel.status === "canceled" &&
    cancel.cleanup.terminalRunStatus === "canceled" &&
    retry.status === "succeeded" &&
    retry.summary.retries > 0 &&
    failure.status === "failed" &&
    failure.summary.skipped > 0 &&
    start.permissionPreflight.status === "allowed" &&
    blocked.status === "blocked" &&
    blocked.nodeResults.length === 0 &&
    !/[A-Za-z]:[\\/]|vault:[a-z]|bearer\s+/iu.test(JSON.stringify({ start, cancel, retry, failure, blocked }));

  return Object.freeze({
    ok,
    schemaVersion: "agentique.workflowRunnerSessionReview.v1",
    checks: {
      start: start.status,
      cancel: cancel.status,
      retry: retry.status,
      failure: failure.status,
      blocked: blocked.status
    },
    summary: {
      startEvents: start.summary.events,
      retryEvents: retry.summary.retries,
      skippedAfterFailure: failure.summary.skipped,
      permissionAuditEvents: start.permissionPreflight.auditEvents,
      cleanupStates: [start.summary.cleanup, cancel.summary.cleanup, retry.summary.cleanup, failure.summary.cleanup]
    },
    errors: ok ? [] : [issue("workflow-runner-session.review", "Workflow runner session review failed.")]
  });
}

function createRunnerSessionFromSchedule(run, lastAction, action, now, permissionPreflight) {
  const nodeResults = (run.nodeResults ?? []).map((result) => ({
    nodeId: safeText(result.nodeId),
    type: safeText(result.type),
    status: safeText(result.status),
    attempts: Number(result.attempts ?? 0),
    code: result.code ? safeText(result.code) : null,
    message: result.message ? safeText(result.message) : null
  }));
  const logs = (run.events ?? []).map((entry) => `${entry.sequence}:${safeText(entry.nodeId)}:${safeText(entry.type)}`);
  const session = {
    schemaVersion: workflowRunnerSessionSchemaVersion,
    action,
    status: safeText(run.status),
    runId: safeText(run.schedule?.workflowId ?? "run-ui-workflow-001"),
    startedAt: now,
    lastAction,
    blockedReason: run.errors?.[0]?.message ? safeText(run.errors[0].message) : "",
    summary: {
      events: run.events?.length ?? 0,
      outputs: run.outputs?.length ?? 0,
      artifacts: run.artifacts?.length ?? 0,
      cleanup: safeText(run.cleanup?.status ?? "missing"),
      retries: countEvents(run.events, "retry"),
      failed: countNodeStatus(run.nodeResults, "failed"),
      skipped: countNodeStatus(run.nodeResults, "skipped"),
      canceled: countNodeStatus(run.nodeResults, "canceled"),
      terminal: safeText(run.status)
    },
    logs: logs.length > 0 ? logs : ["runner.no-events"],
    artifacts: (run.artifacts ?? []).slice(0, 8).map((artifact) => safeText(artifact.path)),
    nodeResults,
    permissionPreflight: summarizePermissionPreflight(permissionPreflight),
    cleanup: normalizeCleanup(run.cleanup, run.status)
  };
  return freezeSession(session);
}

function reviewRunPlanForStart(runPlan) {
  if (!runPlan || typeof runPlan !== "object") {
    return {
      ok: false,
      status: "blocked",
      code: "workflow-runner-session.missing-run-plan",
      lastAction: "Start blocked before scheduler",
      message: "Accepted run plan is required before deterministic scheduler start."
    };
  }
  if (runPlan.status === "permission-required") {
    return {
      ok: false,
      status: "permission-blocked",
      code: "workflow-runner-session.permission-required",
      lastAction: "Start blocked before scheduler",
      message: "Scoped permission review is required before deterministic scheduler start."
    };
  }
  if (runPlan.status !== "accepted" || runPlan.startDecision !== "reviewable") {
    return {
      ok: false,
      status: "blocked",
      code: "workflow-runner-session.run-plan-blocked",
      lastAction: "Start blocked before scheduler",
      message: "Run plan is not accepted; scheduler was not invoked."
    };
  }
  return { ok: true };
}

function reviewPermissionPreflightForStart(permissionPreflight) {
  if (!permissionPreflight || typeof permissionPreflight !== "object") {
    return {
      ok: false,
      code: "workflow-runner-session.permission-preflight-missing",
      message: "Permission start preflight is required before deterministic scheduler start."
    };
  }
  if (permissionPreflight.ok !== true || permissionPreflight.status !== "allowed") {
    const blocked = (permissionPreflight.decisions ?? []).filter((decision) => decision.status !== "allowed").length;
    return {
      ok: false,
      code: "workflow-runner-session.permission-preflight-blocked",
      message: `Permission start preflight blocked ${blocked} required grant${blocked === 1 ? "" : "s"}.`
    };
  }
  return { ok: true };
}

function schedulerOptionsForAction(action, now) {
  if (action === "cancel") {
    return { now, cancelBeforeNodeId: "merge" };
  }
  if (action === "retry") {
    return {
      now,
      retryPolicy: { normalize: 2 },
      failAttempts: { normalize: 1 }
    };
  }
  if (action === "failure") {
    return {
      now,
      retryPolicy: { normalize: 1 },
      failAttempts: { normalize: 3 }
    };
  }
  return { now };
}

function actionLabel(action) {
  if (action === "cancel") return "Cancel active run";
  if (action === "retry") return "Inject transient failure";
  if (action === "failure") return "Inject terminal failure";
  return "Start reviewed run";
}

function normalizeCleanup(cleanup, terminalRunStatus) {
  return {
    schemaVersion: "agentique.workflowSchedulerCleanupReceipt.v1",
    ok: Boolean(cleanup?.ok),
    status: safeText(cleanup?.status ?? "missing"),
    idempotent: Boolean(cleanup?.idempotent),
    terminalRunStatus: safeText(cleanup?.terminalRunStatus ?? terminalRunStatus),
    removed: Array.isArray(cleanup?.removed) ? cleanup.removed.map(safeText) : []
  };
}

function emptySummary(cleanup) {
  return {
    events: 0,
    outputs: 0,
    artifacts: 0,
    cleanup,
    retries: 0,
    failed: 0,
    skipped: 0,
    canceled: 0,
    terminal: "idle"
  };
}

function countEvents(events, type) {
  return (events ?? []).filter((entry) => entry.type === type).length;
}

function countNodeStatus(nodeResults, status) {
  return (nodeResults ?? []).filter((entry) => entry.status === status).length;
}

function safeText(value) {
  return redactText(String(value ?? "").replace(/\s+/gu, " ").trim()).slice(0, 160);
}

function freezeSession(session) {
  assertNoInlineSecrets(session);
  return Object.freeze(JSON.parse(JSON.stringify(session)));
}

function issue(code, message) {
  return { code, message: redactText(message) };
}
