import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const runnerRevocationCancelControlsSchemaVersion = "agentique.runnerRevocationCancelControls.v1";

const fixedRunId = "run-ui-control-001";
const fixedGrantId = "grant.workspace-read";
const supportedActions = new Set(["ready", "revoked-start", "stale-approval", "cancel", "force-kill", "cleanup-resolved"]);

export function createRunnerRevocationCancelControls({ action = "ready" } = {}) {
  const normalizedAction = supportedActions.has(action) ? action : "ready";
  const surface = createBaseSurface(normalizedAction);

  if (normalizedAction === "revoked-start") {
    return freezeSurface({
      ...surface,
      grant: {
        ...surface.grant,
        status: "revoked",
        revoked: true,
        revokedAt: "2026-06-16T10:08:00.000Z"
      },
      startDecision: blockedStart("runner-control.revoked-grant", "Revoked grant cannot start a prepared run."),
      nativeReceipt: nativeReceipt({
        kind: "start-denied",
        reason: "post-prepare-revocation",
        enforcedBeforeStart: true,
        cleanupRequired: false
      }),
      auditReceipts: [...surface.auditReceipts, auditReceipt("grant-revoked", "Revoked grant start denied before native start.")]
    });
  }

  if (normalizedAction === "stale-approval") {
    return freezeSurface({
      ...surface,
      approval: {
        ...surface.approval,
        status: "consumed",
        consumed: true,
        staleReuseDenied: true
      },
      startDecision: blockedStart("runner-control.stale-approval", "Consumed approval cannot be reused for a new start."),
      nativeReceipt: nativeReceipt({
        kind: "start-denied",
        reason: "stale-approval-reuse",
        enforcedBeforeStart: true,
        cleanupRequired: false
      }),
      auditReceipts: [...surface.auditReceipts, auditReceipt("approval-reuse-denied", "Stale approval reuse denied before native start.")]
    });
  }

  if (normalizedAction === "cancel") {
    return freezeSurface({
      ...surface,
      startDecision: allowedStart("running"),
      stopDecision: stopDecision({
        mode: "cancel",
        state: "canceled",
        receiptKind: "graceful-cancel",
        message: "Graceful cancel accepted and cleanup completed."
      }),
      cleanup: {
        status: "graceful-cleaned",
        required: false,
        resolutionReceipt: cleanupReceipt("accepted", "cancel-cleanup-complete")
      },
      retry: allowedRetry("Cancel cleanup receipt accepted."),
      nativeReceipt: nativeReceipt({
        kind: "graceful-cancel",
        reason: "user-cancel",
        enforcedBeforeStart: false,
        cleanupRequired: false
      }),
      auditReceipts: [...surface.auditReceipts, auditReceipt("run-canceled", "Graceful cancel receipt recorded.")]
    });
  }

  if (normalizedAction === "force-kill") {
    return freezeSurface({
      ...surface,
      startDecision: allowedStart("running"),
      stopDecision: stopDecision({
        mode: "forced-kill",
        state: "cleanup-required",
        receiptKind: "forced-stop",
        message: "Forced stop recorded; cleanup receipt is required before retry."
      }),
      cleanup: {
        status: "cleanup-required",
        required: true,
        resolutionReceipt: cleanupReceipt("pending", "forced-stop-cleanup-required")
      },
      retry: blockedRetry("runner-control.cleanup-required", "Retry blocked until cleanup-required is resolved."),
      nativeReceipt: nativeReceipt({
        kind: "forced-stop",
        reason: "user-kill-switch",
        enforcedBeforeStart: false,
        cleanupRequired: true
      }),
      auditReceipts: [...surface.auditReceipts, auditReceipt("forced-stop", "Forced stop receipt requires cleanup before retry.")]
    });
  }

  if (normalizedAction === "cleanup-resolved") {
    return freezeSurface({
      ...surface,
      startDecision: allowedStart("stopped"),
      stopDecision: stopDecision({
        mode: "forced-kill",
        state: "cleaned-up",
        receiptKind: "cleanup-resolved",
        message: "Forced stop cleanup receipt accepted; retry is allowed."
      }),
      cleanup: {
        status: "cleaned-up",
        required: false,
        resolutionReceipt: cleanupReceipt("accepted", "forced-stop-cleanup-resolved")
      },
      retry: allowedRetry("Cleanup resolution receipt accepted."),
      nativeReceipt: nativeReceipt({
        kind: "cleanup-resolved",
        reason: "cleanup-receipt-accepted",
        enforcedBeforeStart: false,
        cleanupRequired: false
      }),
      auditReceipts: [...surface.auditReceipts, auditReceipt("cleanup-resolved", "Cleanup resolution receipt accepted before retry.")]
    });
  }

  return freezeSurface(surface);
}

export function reviewRunnerRevocationCancelControlsGate() {
  const ready = createRunnerRevocationCancelControls({ action: "ready" });
  const revoked = createRunnerRevocationCancelControls({ action: "revoked-start" });
  const stale = createRunnerRevocationCancelControls({ action: "stale-approval" });
  const canceled = createRunnerRevocationCancelControls({ action: "cancel" });
  const forced = createRunnerRevocationCancelControls({ action: "force-kill" });
  const resolved = createRunnerRevocationCancelControls({ action: "cleanup-resolved" });
  const allSurfaces = [ready, revoked, stale, canceled, forced, resolved];

  const checks = {
    uiInteractionFlows: collectUiInteractionFlows(ready),
    revokedGrantStartDenied: revoked.grant.status === "revoked" && revoked.startDecision.code === "runner-control.revoked-grant",
    staleApprovalDenied: stale.approval.staleReuseDenied === true && stale.startDecision.code === "runner-control.stale-approval",
    cancelKillDistinct: canceled.stopDecision.mode === "cancel" && forced.stopDecision.mode === "forced-kill" && canceled.cleanup.status !== forced.cleanup.status,
    retryBlockedUntilCleanup: forced.retry.status === "blocked" && resolved.retry.status === "allowed" && resolved.cleanup.status === "cleaned-up",
    auditReceiptsRedacted: allSurfaces.every((surface) => surface.auditReceipts.every((receipt) => receipt.redacted === true)) && !unsafeBoundaryText(allSurfaces),
    noCapabilityWidening: allSurfaces.every(
      (surface) =>
        surface.boundary.noGenericShell === true &&
        surface.boundary.noProcessPermissionWidening === true &&
        surface.boundary.noPackageLifecycleExecution === true &&
        surface.boundary.noBrowserDataAccess === true &&
        surface.boundary.noAmbientEnvironmentAccess === true
    )
  };

  const requiredFlows = ["approve", "revoke", "start-denied", "cancel", "kill", "cleanup-resolved"];
  const ok = Object.entries(checks).every(([key, value]) => (key === "uiInteractionFlows" ? arraysEqual(value, requiredFlows) : value === true));

  return Object.freeze({
    ok,
    schemaVersion: "agentique.runnerRevocationCancelControlsReview.v1",
    checks,
    summary: {
      surfaces: allSurfaces.length,
      deniedStarts: [revoked, stale].filter((surface) => surface.startDecision.status === "blocked").length,
      stopModes: [...new Set([canceled.stopDecision.mode, forced.stopDecision.mode])],
      cleanupRequired: forced.cleanup.status,
      retryAfterCleanup: resolved.retry.status,
      auditReceipts: allSurfaces.reduce((count, surface) => count + surface.auditReceipts.length, 0)
    },
    errors: ok ? [] : [issue("runner-control.review", "Runner revocation cancel controls review failed.")]
  });
}

function createBaseSurface(action) {
  return {
    schemaVersion: runnerRevocationCancelControlsSchemaVersion,
    action,
    runId: fixedRunId,
    approval: {
      id: "approval-ui-control-001",
      status: "active",
      consumed: false,
      staleReuseDenied: false,
      preparedAt: "2026-06-16T10:00:00.000Z"
    },
    grant: {
      id: fixedGrantId,
      family: "workspace",
      action: "read",
      status: "active",
      revoked: false,
      scope: "active-workspace-resource",
      expiresAt: "2026-06-16T10:15:00.000Z"
    },
    startDecision: allowedStart("prepared"),
    stopDecision: stopDecision({
      mode: "none",
      state: "prepared",
      receiptKind: "not-requested",
      message: "No stop action requested."
    }),
    cleanup: {
      status: "not-required",
      required: false,
      resolutionReceipt: cleanupReceipt("not-required", "not-requested")
    },
    retry: allowedRetry("No cleanup hold is active."),
    nativeReceipt: nativeReceipt({
      kind: "prepared",
      reason: "reviewed-grant-active",
      enforcedBeforeStart: true,
      cleanupRequired: false
    }),
    auditReceipts: [auditReceipt("approval-active", "Prepared run approval is active and scoped.")],
    uiControls: [
      uiControl("ready", "Approve control sample", "approve"),
      uiControl("revoked-start", "Revoked start denial", "revoke"),
      uiControl("stale-approval", "Stale approval denial", "start-denied"),
      uiControl("cancel", "Cancel with receipt", "cancel"),
      uiControl("force-kill", "Force kill cleanup-required", "kill"),
      uiControl("cleanup-resolved", "Resolve cleanup", "cleanup-resolved")
    ],
    boundary: {
      sourceFirstOnly: true,
      noGenericShell: true,
      noProcessPermissionWidening: true,
      noPackageLifecycleExecution: true,
      noBrowserDataAccess: true,
      noAmbientEnvironmentAccess: true,
      signedInstallerClaim: false,
      productionRuntimeClaim: false
    }
  };
}

function allowedStart(state) {
  return {
    status: "allowed",
    code: "runner-control.start-allowed",
    state,
    message: "Reviewed approval and active grant allow native start."
  };
}

function blockedStart(code, message) {
  return {
    status: "blocked",
    code,
    state: "start-denied",
    message: redactText(message)
  };
}

function stopDecision({ mode, state, receiptKind, message }) {
  return {
    mode,
    state,
    receipt: {
      schemaVersion: "agentique.runnerStopReceipt.v1",
      kind: receiptKind,
      runId: fixedRunId,
      redacted: true,
      message: redactText(message)
    }
  };
}

function allowedRetry(message) {
  return {
    status: "allowed",
    code: "runner-control.retry-allowed",
    blockedUntilCleanupResolved: false,
    message: redactText(message)
  };
}

function blockedRetry(code, message) {
  return {
    status: "blocked",
    code,
    blockedUntilCleanupResolved: true,
    message: redactText(message)
  };
}

function nativeReceipt({ kind, reason, enforcedBeforeStart, cleanupRequired }) {
  return {
    schemaVersion: "agentique.runnerNativeEnforcementReceipt.v1",
    runId: fixedRunId,
    kind,
    reason,
    enforcedBeforeStart,
    cleanupRequired,
    path: `runs/${fixedRunId}/receipts/${kind}.json`,
    redacted: true
  };
}

function cleanupReceipt(status, reason) {
  return {
    schemaVersion: "agentique.runnerCleanupResolutionReceipt.v1",
    status,
    reason,
    path: `runs/${fixedRunId}/receipts/cleanup-${reason}.json`,
    redacted: true
  };
}

function auditReceipt(kind, message) {
  return {
    schemaVersion: "agentique.runnerControlAuditReceipt.v1",
    kind,
    runId: fixedRunId,
    path: `runs/${fixedRunId}/audit/${kind}.json`,
    redacted: true,
    message: redactText(message)
  };
}

function uiControl(action, label, flow) {
  return {
    action,
    label,
    flow,
    ariaLabel: label,
    nativeReceiptRequired: action === "force-kill" || action === "cleanup-resolved"
  };
}

function collectUiInteractionFlows(surface) {
  return surface.uiControls.map((control) => control.flow);
}

function unsafeBoundaryText(value) {
  return /[A-Za-z]:[\\/]|Bearer\s+|sk-[a-z0-9_-]+|cookie|token|vault:[a-z]/iu.test(JSON.stringify(value));
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function freezeSurface(surface) {
  // CRITICAL: retry stays blocked until a cleanup resolution receipt exists.
  if (surface.cleanup.status === "cleanup-required" && surface.retry.status !== "blocked") {
    throw issue("runner-control.retry-cleanup-gate", "Cleanup-required runs must block retry.");
  }
  assertNoInlineSecrets(surface);
  return Object.freeze(JSON.parse(JSON.stringify(surface)));
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(message));
  error.code = code;
  return error;
}
