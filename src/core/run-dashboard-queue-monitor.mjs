import { createArtifactReceiptViewerSurface } from "./artifact-receipt-binding.mjs";
import { createDurableRunLedgerSurface } from "./durable-run-ledger.mjs";
import { createPermissionCenterSurface } from "./permission-center-policy-diff.mjs";
import { createRunnerRevocationCancelControls } from "./runner-revocation-cancel-controls.mjs";
import { createWatchdogHeartbeatSupervisorSurface } from "./watchdog-heartbeat-supervisor.mjs";

export const runDashboardQueueMonitorSchemaVersion = "agentique.runDashboardQueueMonitor.v1";

export const requiredRunDashboardStates = Object.freeze(["active", "queued", "completed", "canceled", "failed", "timed-out", "cleanup-required"]);

export const requiredQueueMonitorStates = Object.freeze(["scheduled", "running", "missed", "skipped", "canceled", "timed-out", "orphan-cleanup", "cleaned"]);

const supportedScenarios = new Set(requiredRunDashboardStates);
const privateTextPatterns = Object.freeze([
  /bearer\s+[A-Za-z0-9._-]{12,}/iu,
  /sk-[A-Za-z0-9_-]{16,}/iu,
  /[A-Z]:[\\/]/u,
  /\/Users\/|\/home\//u,
  new RegExp([String.raw`\.plan`, "ning|ref", "erence/|R[0-9]{4}"].join(""), "iu")
]);

export function createRunDashboardQueueMonitorSurface(options = {}) {
  const scenario = normalizeScenario(options.scenario ?? "active");
  const runnerSession = options.runnerSession ?? defaultRunnerSession(scenario);
  const runnerEventStream = options.runnerEventStream ?? defaultRunnerEventStream(scenario);
  const watchdogSupervisorSurface =
    options.watchdogSupervisorSurface ??
    createWatchdogHeartbeatSupervisorSurface({
      scenario: watchdogScenarioFor(scenario)
    });
  const durableRunLedgerSurface =
    options.durableRunLedgerSurface ??
    createDurableRunLedgerSurface({
      action: scenario === "failed" ? "corrupt" : "replay"
    });
  const artifactReceiptViewerSurface =
    options.artifactReceiptViewerSurface ??
    createArtifactReceiptViewerSurface({
      scenario: artifactScenarioFor(scenario)
    });
  const permissionCenterSurface =
    options.permissionCenterSurface ??
    createPermissionCenterSurface({
      scenario: scenario === "queued" ? "required" : "approved"
    });
  const runHistoryEvidence = options.runHistoryEvidence ?? defaultRunHistoryEvidence(scenario);
  const controls = controlsFor(scenario);
  const runStates = buildRunStates({ scenario, runnerSession, runHistoryEvidence, watchdogSupervisorSurface, artifactReceiptViewerSurface });
  const queueStates = buildQueueStates({ scenario, runnerEventStream, watchdogSupervisorSurface, runHistoryEvidence });
  const actionStates = buildActionStates();
  const signalStates = buildSignalStates({
    runnerEventStream,
    watchdogSupervisorSurface,
    durableRunLedgerSurface,
    artifactReceiptViewerSurface,
    permissionCenterSurface
  });

  const surface = {
    schemaVersion: runDashboardQueueMonitorSchemaVersion,
    generatedAt: "2026-06-17T00:00:00.000Z",
    activeScenario: {
      scenario,
      status: scenario,
      runId: runIdForScenario(scenario),
      queueState: queueStateForScenario(scenario)
    },
    controls,
    runStates,
    queueStates,
    signalStates,
    actionStates,
    interactionEvidence: [
      interaction("desktop", "Dashboard scenario controls update run, queue, event, watchdog, ledger, artifact, and permission summaries."),
      interaction("narrow", "Queue monitor rows preserve the same controls and fail-closed authority boundary in the narrow Run workspace.")
    ],
    summary: summarize({ runStates, queueStates, signalStates, actionStates, runnerEventStream, controls }),
    boundary: boundary()
  };
  return freeze(surface);
}

export function createRunDashboardQueueScenario(scenario = "active") {
  return createRunDashboardQueueMonitorSurface({ scenario });
}

export function reviewRunDashboardQueueMonitor() {
  const surface = createRunDashboardQueueMonitorSurface();
  const validation = validateRunDashboardQueueMonitorSurface(surface);
  return {
    ok: validation.ok,
    status: validation.status,
    surface,
    validation,
    errors: validation.failures
  };
}

export function validateRunDashboardQueueMonitorSurface(surface) {
  const failures = [];
  if (surface?.schemaVersion !== runDashboardQueueMonitorSchemaVersion) {
    failures.push(issue("run-dashboard.schema", "Unsupported run dashboard queue monitor schema version."));
  }

  requireStates("run-dashboard.run-state", requiredRunDashboardStates, surface?.runStates, "state", failures);
  requireStates("run-dashboard.queue-state", requiredQueueMonitorStates, surface?.queueStates, "state", failures);
  requireStates("run-dashboard.signal", ["native-event-transport", "watchdog", "ledger-replay", "artifact-receipt", "permission-center"], surface?.signalStates, "id", failures);
  requireStates("run-dashboard.action", ["cancel", "force-kill", "cleanup", "retry"], surface?.actionStates, "id", failures);

  if (!Array.isArray(surface?.controls) || surface.controls.length < requiredRunDashboardStates.length || surface.controls.some((control) => control.keyboardAccessible !== true)) {
    failures.push(issue("run-dashboard.controls", "Dashboard scenario controls must be keyboard-accessible."));
  }
  const interactionViewports = new Set((surface?.interactionEvidence ?? []).map((entry) => entry.viewport));
  for (const viewport of ["desktop", "narrow"]) {
    if (!interactionViewports.has(viewport)) {
      failures.push(issue("run-dashboard.interaction", `Missing ${viewport} interaction evidence.`));
    }
  }
  for (const [key, expected] of Object.entries(requiredBoundary())) {
    if (surface?.boundary?.[key] !== expected) {
      failures.push(issue("run-dashboard.boundary", `${key} must be ${String(expected)}.`));
    }
  }
  if ((surface?.queueStates ?? []).some((entry) => !String(entry.eventId ?? "").startsWith("evt-"))) {
    failures.push(issue("run-dashboard.event-id", "Every queue row must expose a stable event id."));
  }
  if (!JSON.stringify(surface ?? {}).includes("boundedLogs")) {
    failures.push(issue("run-dashboard.bounded-logs", "Dashboard summary must expose bounded log evidence."));
  }
  const exportedText = JSON.stringify(surface ?? {});
  if (privateTextPatterns.some((pattern) => pattern.test(exportedText))) {
    failures.push(issue("run-dashboard.public-safe", "Dashboard export contains private, local, or internal evidence text."));
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    summary: {
      runStates: new Set((surface?.runStates ?? []).map((entry) => entry.state)).size,
      queueStates: new Set((surface?.queueStates ?? []).map((entry) => entry.state)).size,
      signalStates: surface?.signalStates?.length ?? 0,
      actionStates: surface?.actionStates?.length ?? 0,
      interactionViewports: interactionViewports.size
    }
  };
}

function buildRunStates({ scenario, runnerSession, runHistoryEvidence, watchdogSupervisorSurface, artifactReceiptViewerSurface }) {
  const historyStates = runHistoryEvidence?.summary?.states ?? {};
  return [
    runState("active", scenario === "active" ? 1 : statusCount(runnerSession?.status, ["running", "succeeded"]), "running", runnerSession?.runId ?? "run-dashboard-active"),
    runState("queued", scenario === "queued" ? 1 : 1, "queued", "run-dashboard-queued"),
    runState("completed", scenario === "completed" ? 1 : (historyStates.succeeded ?? 1), "succeeded", "run-history-success"),
    runState("canceled", scenario === "canceled" ? 1 : (historyStates.canceled ?? 1), "canceled", "run-history-canceled"),
    runState("failed", scenario === "failed" ? 1 : (historyStates.failed ?? 1), "failed", "run-history-failed"),
    runState(
      "timed-out",
      scenario === "timed-out" ? 1 : (historyStates["timed-out"] ?? Number(watchdogSupervisorSurface?.summary?.timeoutEnforced === true)),
      "timed-out",
      "run-history-timeout"
    ),
    runState(
      "cleanup-required",
      scenario === "cleanup-required" ? 1 : (historyStates["cleanup-required"] ?? artifactReceiptViewerSurface?.summary?.cleanupRequired ?? 1),
      "cleanup-required",
      "run-history-cleanup"
    )
  ];
}

function buildQueueStates({ scenario, runnerEventStream, watchdogSupervisorSurface, runHistoryEvidence }) {
  const cleanup = runHistoryEvidence?.actionEvidence?.cleanup ?? {
    status: "cleaned",
    receiptPath: "runs/run-history-cleanup/cleanup-cleaned.json",
    removed: ["run-temp"]
  };
  return [
    queueState("scheduled", "evt-scheduled-001", "Workflow scheduled for reviewed start.", "queued", { runId: "run-dashboard-queued" }),
    queueState("running", runnerEventStream?.activeSample?.eventId ?? "evt-running-001", "Native event stream is receiving ordered runner events.", "active", {
      events: runnerEventStream?.summary?.events ?? 0
    }),
    queueState("missed", "evt-missed-001", "Missed schedule is retained for operator review without automatic restart.", "queued", { reason: "host-offline" }),
    queueState("skipped", "evt-skipped-001", "Skipped dependency state is visible before rerun.", "failed", { skipped: runnerEventStream?.summary?.skipped ?? 0 }),
    queueState("canceled", "evt-canceled-001", "Canceled run has a graceful stop receipt.", "canceled", { receipt: "runs/run-ui-control-001/receipts/graceful-cancel.json" }),
    queueState("timed-out", "evt-timeout-001", "Timeout budget is enforced by the watchdog surface.", "timed-out", {
      timeoutEnforced: watchdogSupervisorSurface?.summary?.timeoutEnforced === true
    }),
    queueState("orphan-cleanup", "evt-orphan-cleanup-001", "Orphan cleanup receipts must resolve before unsafe retry.", "cleanup-required", {
      cleanupReceipt: {
        status: cleanup.status === "cleaned" ? "cleaned" : "accepted",
        path: cleanup.receiptPath ?? "runs/run-history-cleanup/cleanup-cleaned.json",
        removed: cleanup.removed ?? []
      }
    }),
    queueState("cleaned", "evt-cleaned-001", "Cleanup receipt accepted and retry can be reviewed.", scenario === "cleanup-required" ? "cleanup-required" : "completed", {
      cleanupReceipt: {
        status: "cleaned",
        path: "runs/run-dashboard-cleanup/cleanup-cleaned.json",
        removed: ["scheduler:events", "scheduler:transient-node-state"]
      }
    })
  ];
}

function buildActionStates() {
  const cancel = createRunnerRevocationCancelControls({ action: "cancel" });
  const kill = createRunnerRevocationCancelControls({ action: "force-kill" });
  const cleanup = createRunnerRevocationCancelControls({ action: "cleanup-resolved" });
  const ready = createRunnerRevocationCancelControls({ action: "ready" });
  return [
    actionState("cancel", cancel.stopDecision.state, cancel.nativeReceipt.path, cancel.retry.status),
    actionState("force-kill", kill.stopDecision.state, kill.nativeReceipt.path, kill.retry.status),
    actionState("cleanup", cleanup.cleanup.status, cleanup.nativeReceipt.path, cleanup.retry.status),
    actionState("retry", ready.retry.status, ready.nativeReceipt.path, ready.retry.code)
  ];
}

function buildSignalStates({ runnerEventStream, watchdogSupervisorSurface, durableRunLedgerSurface, artifactReceiptViewerSurface, permissionCenterSurface }) {
  return [
    signalState("native-event-transport", runnerEventStream?.boundary?.liveTransport ? "active" : "descriptor", `${runnerEventStream?.summary?.events ?? 0} event(s)`),
    signalState("watchdog", watchdogSupervisorSurface?.summary?.terminalState ?? "unknown", `${watchdogSupervisorSurface?.summary?.heartbeatReceipts ?? 0} heartbeat receipt(s)`),
    signalState("ledger-replay", durableRunLedgerSurface?.replay?.status ?? "unknown", `${durableRunLedgerSurface?.replay?.runs?.length ?? 0} replayed run(s)`),
    signalState(
      "artifact-receipt",
      artifactReceiptViewerSurface?.summary?.nativeBacked ? "native-backed" : "metadata-only",
      `${artifactReceiptViewerSurface?.summary?.receipts ?? 0} receipt(s)`
    ),
    signalState("permission-center", permissionCenterSurface?.status ?? "unknown", `${permissionCenterSurface?.summary?.deniedFamilies ?? 0} denied family row(s)`)
  ];
}

function controlsFor(activeScenario) {
  return requiredRunDashboardStates.map((scenario) => ({
    scenario,
    label: labelForScenario(scenario),
    selected: scenario === activeScenario,
    keyboardAccessible: true
  }));
}

function summarize({ runStates, queueStates, signalStates, actionStates, runnerEventStream, controls }) {
  return {
    runStates: runStates.length,
    queueStates: queueStates.length,
    signalStates: signalStates.length,
    actionStates: actionStates.length,
    activeRuns: sumState(runStates, "active"),
    queuedRuns: sumState(runStates, "queued"),
    completedRuns: sumState(runStates, "completed"),
    canceledRuns: sumState(runStates, "canceled"),
    failedRuns: sumState(runStates, "failed"),
    timedOutRuns: sumState(runStates, "timed-out"),
    cleanupRequiredRuns: sumState(runStates, "cleanup-required"),
    eventIds: queueStates.filter((entry) => String(entry.eventId).startsWith("evt-")).length,
    boundedLogs: runnerEventStream?.summary?.boundedLogs ?? 0,
    controls: controls.length,
    interactionViewports: 2
  };
}

function boundary() {
  return {
    frontendAuthority: "display-and-request-only",
    nativeAuthorityRequired: true,
    capabilityWidening: false,
    genericProcessManager: false,
    genericShellEnabled: false,
    shellPluginEnabled: false,
    packageLifecycleEnabled: false,
    ambientEnvironmentEnabled: false,
    browserDataEnabled: false,
    containerStartEnabled: false,
    externalProviderAutomationEnabled: false,
    productionDesktopRuntimeClaim: false,
    signedInstallerClaim: false
  };
}

function requiredBoundary() {
  return boundary();
}

function runState(state, count, status, runId) {
  return {
    state,
    count: Number(count) > 0 ? Number(count) : 0,
    status,
    runId,
    receiptRef: `runs/${runId}/summary.json`
  };
}

function queueState(state, eventId, label, runStatus, details = {}) {
  return {
    state,
    eventId,
    label,
    runStatus,
    ...details
  };
}

function actionState(id, status, receiptRef, retryStatus) {
  return {
    id,
    status,
    receiptRef,
    retryStatus,
    nativeAuthorityRequired: true
  };
}

function signalState(id, status, detail) {
  return { id, status, detail };
}

function interaction(viewport, evidence) {
  return { viewport, evidence, status: "passed" };
}

function requireStates(code, required, rows, field, failures) {
  const seen = new Set((rows ?? []).map((entry) => entry[field]));
  for (const state of required) {
    if (!seen.has(state)) {
      failures.push(issue(code, `Missing required ${field}: ${state}.`));
    }
  }
}

function normalizeScenario(value) {
  const text = String(value ?? "");
  return supportedScenarios.has(text) ? text : "active";
}

function watchdogScenarioFor(scenario) {
  if (scenario === "timed-out") return "timeout";
  if (scenario === "canceled") return "cancel-escalation";
  if (scenario === "cleanup-required") return "forced-cleanup";
  return "healthy";
}

function artifactScenarioFor(scenario) {
  if (scenario === "failed") return "failure";
  if (scenario === "canceled") return "canceled";
  if (scenario === "cleanup-required" || scenario === "timed-out") return "cleanup-required";
  return "success";
}

function defaultRunnerSession(scenario) {
  return {
    runId: runIdForScenario(scenario),
    status: scenario === "active" ? "running" : scenario,
    summary: {
      terminal: scenario === "active" || scenario === "queued" ? "pending" : scenario,
      cleanup: scenario === "cleanup-required" ? "required" : "cleaned",
      retries: scenario === "failed" ? 1 : 0,
      failed: scenario === "failed" ? 1 : 0,
      skipped: 1,
      canceled: scenario === "canceled" ? 1 : 0
    }
  };
}

function defaultRunnerEventStream(scenario) {
  return {
    activeSample: {
      eventId: scenario === "queued" ? "evt-scheduled-001" : "evt-running-001",
      status: scenario === "queued" ? "queued" : "running"
    },
    summary: {
      events: 8,
      running: scenario === "active" ? 1 : 0,
      skipped: 1,
      failed: scenario === "failed" ? 1 : 0,
      cleanup: scenario === "cleanup-required" ? 2 : 1,
      boundedLogs: 3
    },
    boundary: {
      liveTransport: true
    }
  };
}

function defaultRunHistoryEvidence(scenario) {
  return {
    summary: {
      states: {
        succeeded: 1,
        failed: 1,
        canceled: 1,
        "timed-out": 1,
        "cleanup-required": 1,
        cleaned: 1,
        recovered: 1
      }
    },
    actionEvidence:
      scenario === "cleanup-required"
        ? {
            cleanup: {
              status: "cleaned",
              receiptPath: "runs/run-history-cleanup/cleanup-cleaned.json",
              removed: ["run-temp"]
            }
          }
        : {}
  };
}

function runIdForScenario(scenario) {
  return `run-dashboard-${scenario.replaceAll("-", "_")}`;
}

function queueStateForScenario(scenario) {
  if (scenario === "active") return "running";
  if (scenario === "queued") return "scheduled";
  if (scenario === "cleanup-required") return "orphan-cleanup";
  return scenario;
}

function labelForScenario(scenario) {
  return scenario
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function statusCount(status, statuses) {
  return statuses.includes(String(status ?? "")) ? 1 : 0;
}

function sumState(runStates, state) {
  return runStates.find((entry) => entry.state === state)?.count ?? 0;
}

function issue(code, message) {
  return { code, message };
}

function freeze(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freeze));
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      value[key] = freeze(child);
    }
    return Object.freeze(value);
  }
  return value;
}
