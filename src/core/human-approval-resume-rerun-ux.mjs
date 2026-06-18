import { createDurableRunLedgerSurface } from "./durable-run-ledger.mjs";
import { createHumanApprovalInterrupt } from "./human-approval-interrupt.mjs";
import { createRunnerRevocationCancelControls } from "./runner-revocation-cancel-controls.mjs";
import { createRunHistoryEvidence } from "./run-history-evidence.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";
import { createWatchdogHeartbeatSupervisorSurface } from "./watchdog-heartbeat-supervisor.mjs";

export const humanApprovalResumeRerunUxSchemaVersion = "agentique.humanApprovalResumeRerunUx.v1";

export const requiredHumanApprovalResumeRerunScenarios = Object.freeze([
  "pending",
  "approve-resume",
  "deny",
  "stale-approval",
  "rerun",
  "retry-blocked-cleanup",
  "cancel-idempotent",
  "cleanup-resolved"
]);

const scenarioSet = new Set(requiredHumanApprovalResumeRerunScenarios);
const fixedNow = "2026-06-18T00:00:00.000Z";
const unsafeEvidencePattern =
  /(?<![A-Za-z])[A-Za-z]:[\\/]|(^|[\\/])\.\.([\\/]|$)|vault:[a-z][a-zA-Z0-9._-]{2,80}|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|cookie=/iu;

/**
 * @param {{
 *   scenario?: string,
 *   approvalAction?: string,
 *   humanApprovalInterrupt?: any,
 *   runnerControlSurface?: any,
 *   durableRunLedgerSurface?: any,
 *   runHistoryEvidence?: any,
 *   watchdogSupervisorSurface?: any,
 *   runnerSession?: any
 * }} [options]
 */
export function createHumanApprovalResumeRerunUxSurface({
  scenario = "pending",
  approvalAction,
  humanApprovalInterrupt = null,
  runnerControlSurface = null,
  durableRunLedgerSurface = null,
  runHistoryEvidence = null,
  watchdogSupervisorSurface = null,
  runnerSession = null
} = {}) {
  const normalizedScenario = scenarioSet.has(scenario) ? scenario : "pending";
  const config = scenarioConfig(normalizedScenario, approvalAction);
  const approval = humanApprovalInterrupt ?? createHumanApprovalInterrupt({ action: config.approvalAction });
  const runner = runnerControlSurface ?? createRunnerRevocationCancelControls({ action: config.runnerAction });
  const history = runHistoryEvidence ?? createRunHistoryEvidence({ action: config.historyAction, selectedRunId: config.historyRunId });
  const ledger = durableRunLedgerSurface ?? createDurableRunLedgerSurface({ action: config.ledgerAction });
  const watchdog = watchdogSupervisorSurface ?? createWatchdogHeartbeatSupervisorSurface({ scenario: config.watchdogScenario });
  const session = runnerSession ?? defaultRunnerSession(normalizedScenario, runner, history);
  const receipts = collectReceipts({ approval, runner, history, watchdog });
  const surface = {
    schemaVersion: humanApprovalResumeRerunUxSchemaVersion,
    scenario: normalizedScenario,
    generatedAt: fixedNow,
    scenarioControls: requiredHumanApprovalResumeRerunScenarios.map(scenarioControl),
    approval: approvalEvidence(approval, runner),
    runner: runnerEvidence(runner),
    rerun: rerunEvidence(history),
    retry: retryEvidence(runner),
    cancel: cancelEvidence(runner, watchdog),
    cleanup: cleanupEvidence(runner, history, watchdog),
    ledger: ledgerEvidence(ledger),
    watchdog: watchdogEvidence(watchdog),
    session: sessionEvidence(session),
    transitions: transitionRows({ approval, runner, history, ledger, watchdog, scenario: normalizedScenario }),
    receipts,
    summary: summaryEvidence({ approval, runner, history, receipts, watchdog }),
    boundary: boundary()
  };

  const validation = validateHumanApprovalResumeRerunUxSurface(surface);
  if (!validation.ok) {
    throw issue(validation.errors[0]?.code ?? "approval-resume-rerun.invalid", validation.errors[0]?.message ?? "Approval resume rerun UX surface is invalid.");
  }
  return freeze(surface);
}

export function validateHumanApprovalResumeRerunUxSurface(surface) {
  const errors = [];
  if (surface?.schemaVersion !== humanApprovalResumeRerunUxSchemaVersion) {
    errors.push(issue("approval-resume-rerun.schema", "Unsupported approval resume rerun schema."));
  }
  const controls = Array.isArray(surface?.scenarioControls) ? surface.scenarioControls.map((control) => control.id) : [];
  if (!arraysEqual(controls, requiredHumanApprovalResumeRerunScenarios)) {
    errors.push(issue("approval-resume-rerun.scenarios", "Scenario controls must cover approval, rerun, cancel, and cleanup states."));
  }
  if (!boundaryOk(surface?.boundary)) {
    errors.push(issue("approval-resume-rerun.authority", "Approval resume rerun UX cannot widen execution authority."));
  }
  if (!Array.isArray(surface?.receipts) || surface.receipts.length < 4 || !surface.receipts.every((receipt) => safeReceiptRef(receipt.ref))) {
    errors.push(issue("approval-resume-rerun.unsafe-receipt", "Receipt references must be relative, redacted, and path-neutral."));
  }
  if (surface?.approval?.decisionStatus === "rejected" && (surface?.approval?.resumeGate?.ok !== false || surface?.approval?.pausedNodeExecuted !== false)) {
    errors.push(issue("approval-resume-rerun.denied-resume", "Rejected approval must not resume or execute the paused node."));
  }
  if (surface?.approval?.staleReuseDenied === true && surface?.runner?.startDecision?.status !== "blocked") {
    errors.push(issue("approval-resume-rerun.stale-approval", "Stale approval reuse must be blocked before start."));
  }
  if (surface?.cleanup?.required === true && surface?.retry?.status !== "blocked") {
    errors.push(issue("approval-resume-rerun.cleanup-retry", "Cleanup-required state must block retry."));
  }
  if (surface?.cleanup?.required === false && surface?.scenario === "cleanup-resolved" && surface?.retry?.status !== "allowed") {
    errors.push(issue("approval-resume-rerun.cleanup-resolved", "Cleanup resolution must allow retry."));
  }
  if (surface?.cancel?.state === "canceled" && surface?.cancel?.idempotent !== true) {
    errors.push(issue("approval-resume-rerun.cancel-idempotency", "Cancel transition must expose idempotent receipt evidence."));
  }
  try {
    assertNoInlineSecrets(surface);
  } catch (error) {
    errors.push(issue("approval-resume-rerun.secret", error?.message ?? "Approval resume rerun evidence contains a secret."));
  }
  if (unsafeEvidencePattern.test(JSON.stringify(surface ?? {}))) {
    errors.push(issue("approval-resume-rerun.unsafe-evidence", "Approval resume rerun evidence contains unsafe path or secret-shaped material."));
  }

  return freeze({
    ok: errors.length === 0,
    schemaVersion: "agentique.humanApprovalResumeRerunUxValidation.v1",
    errors
  });
}

export function reviewHumanApprovalResumeRerunUx() {
  const surfaces = requiredHumanApprovalResumeRerunScenarios.map((scenario) => createHumanApprovalResumeRerunUxSurface({ scenario }));
  const byScenario = new Map(surfaces.map((surface) => [surface.scenario, surface]));
  const denied = byScenario.get("deny");
  const stale = byScenario.get("stale-approval");
  const rerun = byScenario.get("rerun");
  const blockedCleanup = byScenario.get("retry-blocked-cleanup");
  const cancel = byScenario.get("cancel-idempotent");
  const resolved = byScenario.get("cleanup-resolved");
  const checks = {
    scenarioCoverage: arraysEqual(
      surfaces.map((surface) => surface.scenario),
      requiredHumanApprovalResumeRerunScenarios
    ),
    deniedApprovalBlocksResume: denied?.approval.resumeGate.ok === false && denied?.approval.pausedNodeExecuted === false && denied?.approval.runState === "canceled",
    staleApprovalReuseDenied:
      stale?.approval.staleReuseDenied === true && stale?.runner.startDecision.status === "blocked" && stale?.receipts.some((receipt) => receipt.kind === "approval-reuse-denied"),
    rerunRetryCancelLedgerMapped:
      rerun?.rerun.previousEvidencePreserved === true &&
      rerun?.receipts.every((receipt) => safeReceiptRef(receipt.ref)) &&
      cancel?.cancel.state === "canceled" &&
      resolved?.retry.status === "allowed",
    forcedCleanupBlocksRetry: blockedCleanup?.cleanup.required === true && blockedCleanup?.retry.status === "blocked" && resolved?.cleanup.required === false,
    receiptIdempotency:
      cancel?.cancel.idempotent === true &&
      blockedCleanup?.cleanup.idempotent === true &&
      surfaces.every((surface) => surface.receipts.every((receipt) => receipt.redacted === true && safeReceiptRef(receipt.ref))),
    noCapabilityWidening: surfaces.every((surface) => boundaryOk(surface.boundary)),
    publicSafe: !unsafeEvidencePattern.test(JSON.stringify(surfaces))
  };
  const ok = Object.values(checks).every(Boolean);

  return freeze({
    schemaVersion: "agentique.humanApprovalResumeRerunUxReview.v1",
    ok,
    checks,
    summary: {
      scenarios: surfaces.length,
      receipts: surfaces.reduce((count, surface) => count + surface.receipts.length, 0),
      blockedRetries: surfaces.filter((surface) => surface.retry.status === "blocked").length,
      cleanupResolved: resolved?.cleanup.status ?? "missing",
      staleApprovalStatus: stale?.runner.startDecision.status ?? "missing"
    },
    surfaces: surfaces.map((surface) => ({
      scenario: surface.scenario,
      approval: surface.approval,
      retry: surface.retry,
      cleanup: surface.cleanup,
      receipts: surface.receipts
    })),
    errors: ok ? [] : [issue("approval-resume-rerun.review", "Approval resume rerun UX review failed.")]
  });
}

function scenarioConfig(scenario, approvalAction) {
  const base = {
    approvalAction: approvalAction ?? "pending",
    runnerAction: "ready",
    historyAction: "view",
    historyRunId: "run-history-success",
    ledgerAction: "replay",
    watchdogScenario: "healthy"
  };
  if (scenario === "approve-resume") {
    return { ...base, approvalAction: approvalAction ?? "approve" };
  }
  if (scenario === "deny") {
    return { ...base, approvalAction: approvalAction ?? "reject", historyAction: "cleanup", historyRunId: "run-history-canceled" };
  }
  if (scenario === "stale-approval") {
    return { ...base, approvalAction: approvalAction ?? "approve", runnerAction: "stale-approval" };
  }
  if (scenario === "rerun") {
    return { ...base, approvalAction: approvalAction ?? "approve", historyAction: "rerun", ledgerAction: "export" };
  }
  if (scenario === "retry-blocked-cleanup") {
    return {
      ...base,
      approvalAction: approvalAction ?? "approve",
      runnerAction: "force-kill",
      historyAction: "recover",
      historyRunId: "run-history-recovered",
      watchdogScenario: "timeout"
    };
  }
  if (scenario === "cancel-idempotent") {
    return { ...base, approvalAction: approvalAction ?? "approve", runnerAction: "cancel", historyAction: "cleanup-again", watchdogScenario: "terminal-idempotent" };
  }
  if (scenario === "cleanup-resolved") {
    return { ...base, approvalAction: approvalAction ?? "approve", runnerAction: "cleanup-resolved", historyAction: "cleanup", watchdogScenario: "forced-cleanup" };
  }
  return base;
}

function scenarioControl(id) {
  const labels = {
    pending: "Pending approval",
    "approve-resume": "Approve and resume",
    deny: "Deny approval",
    "stale-approval": "Stale approval",
    rerun: "Rerun evidence",
    "retry-blocked-cleanup": "Retry blocked",
    "cancel-idempotent": "Cancel idempotent",
    "cleanup-resolved": "Cleanup resolved"
  };
  return {
    id,
    label: labels[id] ?? id,
    ariaLabel: labels[id] ?? id
  };
}

function approvalEvidence(approval, runner) {
  return {
    runId: approval.run.runId,
    runState: approval.run.state,
    interruptStatus: approval.interrupt.status,
    decisionStatus: runner.approval?.staleReuseDenied ? "consumed" : approval.decision.status,
    checkpointId: approval.checkpoint.checkpointId,
    interruptId: approval.interrupt.interruptId,
    resumeGate: approval.resumeGate,
    pausedNodeExecuted: approval.run.pausedNodeExecuted,
    staleReuseDenied: runner.approval?.staleReuseDenied === true
  };
}

function runnerEvidence(runner) {
  return {
    action: runner.action,
    startDecision: runner.startDecision,
    stopDecision: runner.stopDecision,
    nativeReceipt: runner.nativeReceipt,
    auditReceipts: runner.auditReceipts
  };
}

function rerunEvidence(history) {
  const rerun = history.actionEvidence.rerun;
  return {
    status: rerun ? "created" : "not-requested",
    previousRunId: rerun?.previousRunId ?? history.selectedRunId,
    newRunId: rerun?.newRunId ?? null,
    previousEvidencePreserved: rerun?.previousEvidencePreserved === true,
    selectedRunId: history.selectedRunId
  };
}

function retryEvidence(runner) {
  return {
    status: runner.retry.status,
    code: runner.retry.code,
    blockedUntilCleanupResolved: runner.retry.blockedUntilCleanupResolved,
    message: runner.retry.message
  };
}

function cancelEvidence(runner, watchdog) {
  return {
    mode: runner.stopDecision.mode,
    state: runner.stopDecision.state,
    receipt: runner.stopDecision.receipt,
    idempotent: runner.stopDecision.state === "canceled" || watchdog.summary.terminalIdempotent === true
  };
}

function cleanupEvidence(runner, history, watchdog) {
  const cleanupAction = history.actionEvidence.cleanup;
  return {
    status: runner.cleanup.status,
    required: runner.cleanup.required,
    idempotent: runner.cleanup.resolutionReceipt?.status === "accepted" || cleanupAction?.idempotent === true || watchdog.summary.terminalIdempotent === true,
    resolutionReceipt: runner.cleanup.resolutionReceipt,
    runFolderReceipt: cleanupAction ?? null,
    watchdogReceipt: watchdog.supervisor.cleanup
  };
}

function ledgerEvidence(ledger) {
  return {
    action: ledger.action,
    replayStatus: ledger.replay.status,
    storageDecision: ledger.boundary.sourceFirstOnly ? "source-first-json-ledger" : "blocked",
    runCount: ledger.replay.runs.length,
    exportSummary: ledger.export?.summary ?? null,
    receiptRef: "ledger:source-first-json-ledger"
  };
}

function watchdogEvidence(watchdog) {
  return {
    scenario: watchdog.scenario,
    cleanupForced: watchdog.summary.cleanupForced,
    terminalState: watchdog.summary.terminalState,
    terminalIdempotent: watchdog.summary.terminalIdempotent,
    orphanCount: watchdog.summary.orphanCount
  };
}

function sessionEvidence(session) {
  return {
    status: safeText(session?.status ?? "review"),
    runId: safeId(session?.runId ?? "run-approval-ux"),
    cleanup: safeText(session?.cleanup?.status ?? "not-required"),
    lastAction: safeText(session?.lastAction ?? "approval-resume-rerun.review")
  };
}

function defaultRunnerSession(scenario, runner, history) {
  return {
    status: runner.stopDecision.state === "cleanup-required" ? "cleanup-required" : runner.stopDecision.state === "canceled" ? "canceled" : "review",
    runId: history.selectedRunId ?? "run-approval-ux",
    cleanup: { status: runner.cleanup.status },
    lastAction: `approval-resume-rerun.${scenario}`
  };
}

function transitionRows({ approval, runner, history, ledger, watchdog, scenario }) {
  return [
    transition("approval", approval.run.state, approval.resumeGate.code, `runs/${approval.run.runId}/approval/${approval.checkpoint.checkpointId}.json`),
    transition("runner-start", runner.startDecision.status, runner.startDecision.code, runner.nativeReceipt.path),
    transition("runner-stop", runner.stopDecision.state, runner.stopDecision.receipt.kind, `runs/${runner.runId}/receipts/${runner.stopDecision.receipt.kind}.json`),
    transition("run-history", history.selected.state, history.actionEvidence.rerun ? "rerun-created" : history.action, history.selected.cleanup.receiptPath),
    transition("ledger", ledger.replay.status, ledger.action, "ledger:source-first-json-ledger"),
    transition("watchdog", watchdog.summary.terminalState, watchdog.supervisor.cleanup.transition, watchdog.supervisor.cleanup.receiptRef),
    transition("scenario", scenario, "selected", `runs/${approval.run.runId}/review/${scenario}.json`)
  ];
}

function transition(family, status, code, receiptRef) {
  return {
    id: safeId(`${family}-${code}`),
    family,
    status: safeText(status),
    code: safeText(code),
    receiptRef: safeReceiptRef(receiptRef) ? receiptRef : "runs/redacted/receipt.json",
    idempotent: true,
    redacted: true
  };
}

function collectReceipts({ approval, runner, history, watchdog }) {
  const rows = [
    receipt("approval-checkpoint", `runs/${approval.run.runId}/approval/${approval.checkpoint.checkpointId}.json`),
    receipt(runner.nativeReceipt.kind, runner.nativeReceipt.path),
    receipt(runner.stopDecision.receipt.kind, `runs/${runner.runId}/receipts/${runner.stopDecision.receipt.kind}.json`),
    receipt(`cleanup-${runner.cleanup.resolutionReceipt.reason}`, runner.cleanup.resolutionReceipt.path),
    receipt("run-folder-cleanup", history.selected.cleanup.receiptPath),
    receipt("ledger-replay", "ledger:source-first-json-ledger"),
    receipt(`watchdog-${watchdog.supervisor.cleanup.transition}`, watchdog.supervisor.cleanup.receiptRef)
  ];
  for (const audit of runner.auditReceipts ?? []) {
    rows.push(receipt(audit.kind, audit.path));
  }
  if (history.actionEvidence.cleanup) {
    rows.push(receipt("run-history-cleanup-action", history.actionEvidence.cleanup.receiptPath));
  }
  if (history.actionEvidence.rerun) {
    rows.push(receipt("run-history-rerun", `runs/${history.actionEvidence.rerun.newRunId}/run.json`));
  }
  return rows.map((row, index) => ({ ...row, id: `receipt-${String(index + 1).padStart(2, "0")}-${safeId(row.kind)}` }));
}

function receipt(kind, ref) {
  return {
    kind: safeText(kind),
    ref: safeReceiptRef(ref) ? ref : "runs/redacted/receipt.json",
    idempotent: true,
    redacted: true
  };
}

function summaryEvidence({ approval, runner, history, receipts, watchdog }) {
  return {
    approvalState: approval.run.state,
    resumeStatus: approval.resumeGate.status,
    retryStatus: runner.retry.status,
    cleanupStatus: runner.cleanup.status,
    staleApprovalBlocked: runner.approval?.staleReuseDenied === true && runner.startDecision.status === "blocked",
    forcedCleanupBlocksRetry: runner.cleanup.required === true && runner.retry.status === "blocked",
    rerunCreated: history.actionEvidence.rerun?.newRunId ?? null,
    receipts: receipts.length,
    terminalIdempotent: watchdog.summary.terminalIdempotent
  };
}

function boundary() {
  return {
    sourceFirstOnly: true,
    browserWritesFiles: false,
    externalRuntimeStarted: false,
    noGenericShell: true,
    noProcessPermissionWidening: true,
    noPackageLifecycleExecution: true,
    noBrowserDataAccess: true,
    noAmbientEnvironmentAccess: true,
    noSignedInstallerDependency: true,
    noProductionRuntimeClaim: true
  };
}

function boundaryOk(value) {
  return (
    value?.sourceFirstOnly === true &&
    value?.browserWritesFiles === false &&
    value?.externalRuntimeStarted === false &&
    value?.noGenericShell === true &&
    value?.noProcessPermissionWidening === true &&
    value?.noPackageLifecycleExecution === true &&
    value?.noBrowserDataAccess === true &&
    value?.noAmbientEnvironmentAccess === true &&
    value?.noSignedInstallerDependency === true &&
    value?.noProductionRuntimeClaim === true
  );
}

function safeReceiptRef(value) {
  const text = String(value ?? "");
  if (text === "ledger:source-first-json-ledger") return true;
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{2,180}$/u.test(text) && !text.includes("..") && !text.includes("\\") && !text.includes(":") && !text.startsWith("/");
}

function safeId(value) {
  return (
    String(value ?? "id")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/gu, "-")
      .replace(/-+/gu, "-")
      .slice(0, 96) || "id"
  );
}

function safeText(value) {
  return redactText(
    String(value ?? "")
      .replace(/\s+/gu, " ")
      .trim()
  )
    .replace(unsafeEvidencePattern, "redacted:sensitive-evidence")
    .slice(0, 240);
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(safeText(message)));
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
