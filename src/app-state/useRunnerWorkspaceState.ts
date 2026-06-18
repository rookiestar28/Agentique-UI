import { useCallback, useMemo, useState } from "react";
import { createArtifactReceiptViewerSurface } from "../core/artifact-receipt-binding.mjs";
import { createExternalHandoffDescriptors } from "../core/external-handoff-descriptors.mjs";
import { createGraphRunPlan } from "../core/graph-run-plan.mjs";
import { createHumanApprovalInterrupt } from "../core/human-approval-interrupt.mjs";
import { createHumanApprovalResumeRerunUxSurface } from "../core/human-approval-resume-rerun-ux.mjs";
import { createCuratedAdapterExecutionLane } from "../core/curated-adapter-execution-lane.mjs";
import { createDurableRunLedgerSurface } from "../core/durable-run-ledger.mjs";
import { createLogsArtifactWorkbenchSurface } from "../core/logs-artifact-workbench.mjs";
import { createMultiLaneExecutionReadinessSurface } from "../core/multi-lane-execution-readiness.mjs";
import { createPermissionCenterSurface } from "../core/permission-center-policy-diff.mjs";
import { createRunDashboardQueueMonitorSurface } from "../core/run-dashboard-queue-monitor.mjs";
import { createRuntimePrerequisiteReadinessSurface } from "../core/runtime-prerequisite-readiness.mjs";
import { createRunnerRevocationCancelControls } from "../core/runner-revocation-cancel-controls.mjs";
import { createWatchdogHeartbeatSupervisorSurface } from "../core/watchdog-heartbeat-supervisor.mjs";
import {
  approveRunnerPermissionGrants,
  createBlockedRunnerPermissionScenario,
  createInitialRunnerPermissionStore,
  createRunnerPermissionReview,
  revokeRunnerPermissionGrant
} from "../core/runner-permission-preflight.mjs";
import { createRunHistoryEvidence } from "../core/run-history-evidence.mjs";
import { createRunnerEventStream } from "../core/runner-event-stream.mjs";
import { createIdleWorkflowRunnerSession, runAcceptedWorkflowSession } from "../core/workflow-runner-session.mjs";
import { createWorkflowTemplateRunPlanBuilderSurface } from "../core/workflow-template-run-plan-builder.mjs";

export type RunnerUiSession = {
  action: string;
  status: string;
  runId: string;
  startedAt: string;
  lastAction: string;
  blockedReason: string;
  summary: {
    events: number;
    outputs: number;
    artifacts: number;
    cleanup: string;
    retries: number;
    failed: number;
    skipped: number;
    canceled: number;
    terminal: string;
  };
  logs: string[];
  artifacts: string[];
  permissionPreflight: {
    ok: boolean;
    status: string;
    required: number;
    allowed: number;
    blocked: number;
    auditEvents: number;
    artifactPath: string;
    redacted: boolean;
  };
  nodeResults: Array<{
    nodeId: string;
    type: string;
    status: string;
    attempts: number;
    code: string | null;
    message: string | null;
  }>;
  cleanup: {
    ok: boolean;
    status: string;
    idempotent: boolean;
    terminalRunStatus: string;
    removed: string[];
  };
};

type RunnerWorkspaceStateInput = {
  activeWorkflowIr: any;
  blockedWorkflowIr: any;
};

export type RunnerControlAction = "ready" | "revoked-start" | "stale-approval" | "cancel" | "force-kill" | "cleanup-resolved";
export type DurableRunLedgerAction = "replay" | "migrate" | "corrupt" | "export";
export type WatchdogSupervisorScenario = "healthy" | "timeout" | "cancel-escalation" | "forced-cleanup" | "terminal-idempotent";
export type ArtifactReceiptScenario = "success" | "failure" | "canceled" | "cleanup-required" | "risky-family" | "matrix";
export type RuntimePrerequisiteScenario = "windows-source-checkout" | "missing-python" | "missing-rust" | "unsupported-os" | "revoked-adapter" | "package-manager-request";
export type PermissionCenterScenario = "required" | "approved" | "revoked" | "blocked" | "stale";
export type RunDashboardScenario = "active" | "queued" | "completed" | "canceled" | "failed" | "timed-out" | "cleanup-required";
export type LogsArtifactFilter = "all" | "run" | "resource" | "mime" | "viewer" | "cleanup" | "retention" | "risky-preview" | "stale";
export type WorkflowTemplateBuilderScenario = "catalog" | "approval-template" | "artifact-template" | "missing-secret" | "human-gate" | "unsupported-node" | "rerun-ready";
export type HumanApprovalResumeRerunScenario =
  | "pending"
  | "approve-resume"
  | "deny"
  | "stale-approval"
  | "rerun"
  | "retry-blocked-cleanup"
  | "cancel-idempotent"
  | "cleanup-resolved";

function createIdleRunnerSession(): RunnerUiSession {
  return createIdleWorkflowRunnerSession() as RunnerUiSession;
}

export function useRunnerWorkspaceState({ activeWorkflowIr, blockedWorkflowIr }: RunnerWorkspaceStateInput) {
  const [runnerPermissionStore, setRunnerPermissionStore] = useState(() =>
    createInitialRunnerPermissionStore({
      now: "2026-06-12T00:00:00.000Z"
    })
  );
  const [runnerPermissionScenario, setRunnerPermissionScenario] = useState<"required" | "blocked-sample">("required");
  const [curatedAdapterRuntime, setCuratedAdapterRuntime] = useState<"python" | "node" | "blocked">("python");
  const [runHistoryEvidenceAction, setRunHistoryEvidenceAction] = useState<"view" | "cleanup" | "cleanup-again" | "rerun" | "recover">("view");
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState("run-history-success");
  const [humanApprovalAction, setHumanApprovalAction] = useState<"pending" | "approve" | "reject" | "edit-input" | "handoff" | "resume-mismatch">("pending");
  const [humanApprovalResumeRerunScenario, setHumanApprovalResumeRerunScenario] = useState<HumanApprovalResumeRerunScenario>("pending");
  const [runnerControlAction, setRunnerControlAction] = useState<RunnerControlAction>("ready");
  const [durableRunLedgerAction, setDurableRunLedgerAction] = useState<DurableRunLedgerAction>("replay");
  const [watchdogSupervisorScenario, setWatchdogSupervisorScenario] = useState<WatchdogSupervisorScenario>("healthy");
  const [artifactReceiptScenario, setArtifactReceiptScenario] = useState<ArtifactReceiptScenario>("success");
  const [runtimePrerequisiteScenario, setRuntimePrerequisiteScenario] = useState<RuntimePrerequisiteScenario>("windows-source-checkout");
  const [permissionCenterScenario, setPermissionCenterScenario] = useState<PermissionCenterScenario>("required");
  const [runDashboardScenario, setRunDashboardScenario] = useState<RunDashboardScenario>("active");
  const [logsArtifactFilter, setLogsArtifactFilter] = useState<LogsArtifactFilter>("all");
  const [workflowTemplateBuilderScenario, setWorkflowTemplateBuilderScenario] = useState<WorkflowTemplateBuilderScenario>("catalog");
  const [runnerSession, setRunnerSession] = useState<RunnerUiSession>(() => createIdleRunnerSession());

  const runnerPermissionBlockedReview = useMemo(
    () =>
      createBlockedRunnerPermissionScenario({
        now: "2026-06-12T00:00:00.000Z"
      }),
    []
  );
  const runnerPermissionReview = useMemo(
    () =>
      runnerPermissionScenario === "blocked-sample"
        ? runnerPermissionBlockedReview
        : createRunnerPermissionReview({
            store: runnerPermissionStore,
            now: "2026-06-12T00:00:00.000Z"
          }),
    [runnerPermissionBlockedReview, runnerPermissionScenario, runnerPermissionStore]
  );
  const runnerPermissionsApproved = runnerPermissionReview.ok;
  const graphRunPlan = useMemo(() => createGraphRunPlan(activeWorkflowIr, { permissionsApproved: runnerPermissionsApproved }), [activeWorkflowIr, runnerPermissionsApproved]);
  const blockedGraphRunPlan = useMemo(() => createGraphRunPlan(blockedWorkflowIr, { permissionsApproved: true }), [blockedWorkflowIr]);
  const runnerStartAllowed = graphRunPlan.status === "accepted" && graphRunPlan.startDecision === "reviewable" && runnerPermissionReview.ok;
  const curatedAdapterLane = useMemo(
    () =>
      createCuratedAdapterExecutionLane({
        selectedRuntime: curatedAdapterRuntime === "node" ? "node" : "python"
      }),
    [curatedAdapterRuntime]
  );
  const runnerEventStream = useMemo(
    () =>
      createRunnerEventStream({
        session: runnerSession,
        adapterLane: curatedAdapterLane
      }),
    [curatedAdapterLane, runnerSession]
  );
  const humanApprovalInterrupt = useMemo(
    () =>
      createHumanApprovalInterrupt({
        action: humanApprovalAction
      }),
    [humanApprovalAction]
  );
  const runnerControlSurface = useMemo(
    () =>
      createRunnerRevocationCancelControls({
        action: runnerControlAction
      }),
    [runnerControlAction]
  );
  const durableRunLedgerSurface = useMemo(
    () =>
      createDurableRunLedgerSurface({
        action: durableRunLedgerAction
      }),
    [durableRunLedgerAction]
  );
  const watchdogSupervisorSurface = useMemo(
    () =>
      createWatchdogHeartbeatSupervisorSurface({
        scenario: watchdogSupervisorScenario
      }),
    [watchdogSupervisorScenario]
  );
  const artifactReceiptViewerSurface = useMemo(
    () =>
      createArtifactReceiptViewerSurface({
        scenario: artifactReceiptScenario
      }),
    [artifactReceiptScenario]
  );
  const runtimePrerequisiteReadinessSurface = useMemo(
    () =>
      createRuntimePrerequisiteReadinessSurface({
        scenario: runtimePrerequisiteScenario
      }),
    [runtimePrerequisiteScenario]
  );
  const permissionCenterSurface = useMemo(
    () =>
      createPermissionCenterSurface({
        scenario: permissionCenterScenario
      }),
    [permissionCenterScenario]
  );
  const multiLaneExecutionReadinessSurface = useMemo(() => createMultiLaneExecutionReadinessSurface(), []);
  const externalHandoffDescriptors = useMemo(
    () =>
      createExternalHandoffDescriptors({
        runPlan: blockedGraphRunPlan,
        localRun: runnerSession,
        eventStream: runnerEventStream
      }),
    [blockedGraphRunPlan, runnerEventStream, runnerSession]
  );
  const runHistoryEvidence = useMemo(
    () =>
      createRunHistoryEvidence({
        action: runHistoryEvidenceAction,
        selectedRunId: selectedHistoryRunId
      }),
    [runHistoryEvidenceAction, selectedHistoryRunId]
  );
  const runDashboardQueueMonitorSurface = useMemo(
    () =>
      createRunDashboardQueueMonitorSurface({
        scenario: runDashboardScenario,
        runnerSession,
        runnerEventStream,
        durableRunLedgerSurface,
        watchdogSupervisorSurface,
        artifactReceiptViewerSurface,
        permissionCenterSurface,
        runHistoryEvidence
      }),
    [
      artifactReceiptViewerSurface,
      durableRunLedgerSurface,
      permissionCenterSurface,
      runDashboardScenario,
      runHistoryEvidence,
      runnerEventStream,
      runnerSession,
      watchdogSupervisorSurface
    ]
  );
  const logsArtifactWorkbenchSurface = useMemo(
    () =>
      createLogsArtifactWorkbenchSurface({
        scenario: logsArtifactFilter,
        artifactReceiptViewerSurface,
        runHistoryEvidence,
        runDashboardQueueMonitorSurface
      }),
    [artifactReceiptViewerSurface, logsArtifactFilter, runDashboardQueueMonitorSurface, runHistoryEvidence]
  );
  const workflowTemplateRunPlanBuilderSurface = useMemo(
    () =>
      createWorkflowTemplateRunPlanBuilderSurface({
        scenario: workflowTemplateBuilderScenario,
        graphRunPlan,
        humanApprovalInterrupt,
        runnerSession
      }),
    [graphRunPlan, humanApprovalInterrupt, runnerSession, workflowTemplateBuilderScenario]
  );
  const humanApprovalResumeRerunSurface = useMemo(
    () =>
      createHumanApprovalResumeRerunUxSurface({
        scenario: humanApprovalResumeRerunScenario,
        humanApprovalInterrupt,
        runnerControlSurface,
        durableRunLedgerSurface,
        runHistoryEvidence,
        watchdogSupervisorSurface,
        runnerSession
      }),
    [durableRunLedgerSurface, humanApprovalInterrupt, humanApprovalResumeRerunScenario, runHistoryEvidence, runnerControlSurface, runnerSession, watchdogSupervisorSurface]
  );

  const handleApproveRunnerPermissions = useCallback(() => {
    const approved = approveRunnerPermissionGrants(
      createInitialRunnerPermissionStore({
        now: "2026-06-12T00:00:00.000Z"
      }),
      undefined,
      { now: "2026-06-12T00:00:00.000Z" }
    );
    setPermissionCenterScenario("approved");
    setRunnerPermissionScenario("required");
    setRunnerPermissionStore(approved.store);
    setRunnerSession((current) => ({
      ...current,
      status: current.status === "permission-blocked" ? "ready" : current.status,
      lastAction: approved.ok ? "Permission preflight allowed" : "Permission preflight blocked",
      blockedReason: approved.ok ? "" : (approved.errors[0]?.message ?? "Permission preflight blocked."),
      permissionPreflight: {
        ok: approved.ok,
        status: approved.status,
        required: approved.summary.required,
        allowed: approved.summary.allowed,
        blocked: approved.summary.blocked,
        auditEvents: approved.summary.auditEvents,
        artifactPath: approved.auditArtifact.path,
        redacted: approved.auditArtifact.redacted
      }
    }));
  }, []);

  const handleRevokeRunnerPermissions = useCallback(() => {
    const approved = approveRunnerPermissionGrants(
      createInitialRunnerPermissionStore({
        now: "2026-06-12T00:00:00.000Z"
      }),
      undefined,
      { now: "2026-06-12T00:00:00.000Z" }
    );
    const revoked = revokeRunnerPermissionGrant(approved.store, "grant.network-connect", {
      now: "2026-06-12T00:00:00.000Z"
    });
    setPermissionCenterScenario("revoked");
    setRunnerPermissionScenario("required");
    setRunnerPermissionStore(revoked.store);
    setRunnerSession((current) => ({
      ...current,
      status: "permission-blocked",
      lastAction: "Network grant revoked",
      blockedReason: revoked.errors[0]?.message ?? "Permission preflight blocked by revoked grant.",
      permissionPreflight: {
        ok: revoked.ok,
        status: revoked.status,
        required: revoked.summary.required,
        allowed: revoked.summary.allowed,
        blocked: revoked.summary.blocked,
        auditEvents: revoked.summary.auditEvents,
        artifactPath: revoked.auditArtifact.path,
        redacted: revoked.auditArtifact.redacted
      }
    }));
  }, []);

  const handleShowBlockedRunnerPermissions = useCallback(() => {
    setPermissionCenterScenario("blocked");
    setRunnerPermissionScenario("blocked-sample");
    setRunnerSession((current) => ({
      ...current,
      status: "permission-blocked",
      lastAction: "Blocked permission sample loaded",
      blockedReason: runnerPermissionBlockedReview.errors[0]?.message ?? "Permission preflight blocked.",
      permissionPreflight: {
        ok: runnerPermissionBlockedReview.ok,
        status: runnerPermissionBlockedReview.status,
        required: runnerPermissionBlockedReview.summary.required,
        allowed: runnerPermissionBlockedReview.summary.allowed,
        blocked: runnerPermissionBlockedReview.summary.blocked,
        auditEvents: runnerPermissionBlockedReview.summary.auditEvents,
        artifactPath: runnerPermissionBlockedReview.auditArtifact.path,
        redacted: runnerPermissionBlockedReview.auditArtifact.redacted
      }
    }));
  }, [runnerPermissionBlockedReview]);

  const handlePermissionCenterScenario = useCallback(
    (scenario: PermissionCenterScenario) => {
      if (scenario === "approved") {
        handleApproveRunnerPermissions();
        return;
      }
      if (scenario === "revoked") {
        handleRevokeRunnerPermissions();
        return;
      }
      if (scenario === "blocked") {
        handleShowBlockedRunnerPermissions();
        return;
      }
      setPermissionCenterScenario(scenario);
      setRunnerPermissionScenario("required");
      if (scenario === "required") {
        setRunnerPermissionStore(
          createInitialRunnerPermissionStore({
            now: "2026-06-12T00:00:00.000Z"
          })
        );
        setRunnerSession((current) => ({
          ...current,
          status: current.status === "idle" ? current.status : "permission-blocked",
          lastAction: "Permission grants required",
          blockedReason: "Scoped grants are required before reviewed start.",
          permissionPreflight: {
            ...current.permissionPreflight,
            ok: false,
            status: "blocked",
            allowed: 0,
            blocked: current.permissionPreflight.required
          }
        }));
        return;
      }
      setRunnerSession((current) => ({
        ...current,
        status: "permission-blocked",
        lastAction: "Stale permission grants loaded",
        blockedReason: "Expired grants require a fresh scoped review.",
        permissionPreflight: {
          ...current.permissionPreflight,
          ok: false,
          status: "stale",
          allowed: 0,
          blocked: current.permissionPreflight.required
        }
      }));
    },
    [handleApproveRunnerPermissions, handleRevokeRunnerPermissions, handleShowBlockedRunnerPermissions]
  );

  const handleRunDashboardScenario = useCallback((scenario: RunDashboardScenario) => {
    setRunDashboardScenario(scenario);
  }, []);

  const handleLogsArtifactFilter = useCallback((filter: LogsArtifactFilter) => {
    setLogsArtifactFilter(filter);
  }, []);

  const handleWorkflowTemplateBuilderScenario = useCallback((scenario: WorkflowTemplateBuilderScenario) => {
    setWorkflowTemplateBuilderScenario(scenario);
  }, []);

  const handleHumanApprovalResumeRerunScenario = useCallback((scenario: HumanApprovalResumeRerunScenario) => {
    setHumanApprovalResumeRerunScenario(scenario);
    setHumanApprovalAction("pending");
    setRunnerControlAction("ready");
    setRunHistoryEvidenceAction("view");
    setSelectedHistoryRunId("run-history-success");
    setDurableRunLedgerAction("replay");
    setWatchdogSupervisorScenario("healthy");

    if (scenario === "approve-resume") {
      setHumanApprovalAction("approve");
      return;
    }
    if (scenario === "deny") {
      setHumanApprovalAction("reject");
      setRunHistoryEvidenceAction("cleanup");
      setSelectedHistoryRunId("run-history-canceled");
      return;
    }
    if (scenario === "stale-approval") {
      setHumanApprovalAction("approve");
      setRunnerControlAction("stale-approval");
      return;
    }
    if (scenario === "rerun") {
      setHumanApprovalAction("approve");
      setRunHistoryEvidenceAction("rerun");
      setSelectedHistoryRunId("run-history-success-rerun-001");
      setDurableRunLedgerAction("export");
      return;
    }
    if (scenario === "retry-blocked-cleanup") {
      setHumanApprovalAction("approve");
      setRunnerControlAction("force-kill");
      setRunHistoryEvidenceAction("recover");
      setSelectedHistoryRunId("run-history-recovered");
      setWatchdogSupervisorScenario("timeout");
      return;
    }
    if (scenario === "cancel-idempotent") {
      setHumanApprovalAction("approve");
      setRunnerControlAction("cancel");
      setRunHistoryEvidenceAction("cleanup-again");
      setWatchdogSupervisorScenario("terminal-idempotent");
      return;
    }
    if (scenario === "cleanup-resolved") {
      setHumanApprovalAction("approve");
      setRunnerControlAction("cleanup-resolved");
      setRunHistoryEvidenceAction("cleanup");
      setSelectedHistoryRunId("run-history-cleanup");
      setWatchdogSupervisorScenario("forced-cleanup");
      return;
    }
  }, []);

  const handleSelectCuratedAdapterLane = useCallback((runtime: "python" | "node" | "blocked") => {
    setCuratedAdapterRuntime(runtime);
  }, []);

  const handleRunHistoryAction = useCallback(
    (action: "view" | "cleanup" | "cleanup-again" | "rerun" | "recover", runId = selectedHistoryRunId) => {
      setRunHistoryEvidenceAction(action);
      if (action === "rerun") {
        setSelectedHistoryRunId("run-history-success-rerun-001");
        return;
      }
      if (action === "recover") {
        setSelectedHistoryRunId("run-history-recovered");
        return;
      }
      setSelectedHistoryRunId(runId);
    },
    [selectedHistoryRunId]
  );

  const handleHumanApprovalAction = useCallback((action: "pending" | "approve" | "reject" | "edit-input" | "handoff" | "resume-mismatch") => {
    setHumanApprovalAction(action);
  }, []);

  const handleRunnerControlAction = useCallback((action: RunnerControlAction) => {
    const nextSurface = createRunnerRevocationCancelControls({ action });
    setRunnerControlAction(action);
    setRunnerSession((current) => ({
      ...current,
      status:
        nextSurface.startDecision.status === "blocked"
          ? "permission-blocked"
          : nextSurface.stopDecision.state === "cleanup-required"
            ? "cleanup-required"
            : nextSurface.stopDecision.state === "canceled"
              ? "canceled"
              : current.status,
      lastAction: nextSurface.nativeReceipt.reason,
      blockedReason: nextSurface.startDecision.status === "blocked" ? nextSurface.startDecision.message : "",
      cleanup: {
        ...current.cleanup,
        status: nextSurface.cleanup.status,
        terminalRunStatus: nextSurface.stopDecision.state
      }
    }));
  }, []);

  const handleDurableRunLedgerAction = useCallback((action: DurableRunLedgerAction) => {
    const nextSurface = createDurableRunLedgerSurface({ action });
    setDurableRunLedgerAction(action);
    setRunnerSession((current) => ({
      ...current,
      lastAction: `durable-ledger.${nextSurface.replay.status}`,
      blockedReason: nextSurface.replay.status === "corrupt-fallback" ? "Stored run ledger could not be replayed; fresh evidence is required." : current.blockedReason
    }));
  }, []);

  const handleWatchdogSupervisorScenario = useCallback((scenario: WatchdogSupervisorScenario) => {
    const nextSurface = createWatchdogHeartbeatSupervisorSurface({ scenario });
    setWatchdogSupervisorScenario(scenario);
    setRunnerSession((current) => ({
      ...current,
      status: nextSurface.summary.terminalState === "cleanup-required" ? "cleanup-required" : nextSurface.summary.terminalState === "cleaned" ? "ready" : current.status,
      lastAction: `watchdog.${nextSurface.supervisor.cleanup.transition}`,
      blockedReason: nextSurface.summary.orphanCount === 0 ? "" : "Watchdog cleanup left orphan evidence.",
      cleanup: {
        ...current.cleanup,
        status: nextSurface.supervisor.cleanup.processTreeCleanup ? "cleaned" : current.cleanup.status,
        terminalRunStatus: nextSurface.summary.terminalState
      }
    }));
  }, []);

  const handleArtifactReceiptScenario = useCallback((scenario: ArtifactReceiptScenario) => {
    const nextSurface = createArtifactReceiptViewerSurface({ scenario });
    setArtifactReceiptScenario(scenario);
    setRunnerSession((current) => ({
      ...current,
      lastAction: `artifact-receipt.${nextSurface.binding.receipts[0].viewer.previewMode}`,
      blockedReason: nextSurface.summary.riskyReceipts > 0 ? "Risky artifact viewer requires metadata-only or sandbox-required handling." : current.blockedReason
    }));
  }, []);

  const handleRuntimePrerequisiteScenario = useCallback((scenario: RuntimePrerequisiteScenario) => {
    const nextSurface = createRuntimePrerequisiteReadinessSurface({ scenario });
    const blockedRuntime = nextSurface.runtimeRows.find((row: any) => row.status === "blocked");
    const blockedBootstrap = nextSurface.bootstrapRows.find((row: any) => row.status === "blocked");
    const blockedAdapter = nextSurface.adapterRows.find((row: any) => row.startAllowed === false);
    const blockedReason =
      blockedRuntime?.remediation ??
      blockedBootstrap?.remediation ??
      (blockedAdapter
        ? "Adapter readiness is blocked by compatibility or revocation evidence."
        : nextSurface.readiness.packagePolicy.blockingRequests > 0
          ? "Package-manager and lifecycle requests remain denied."
          : "");
    setRuntimePrerequisiteScenario(scenario);
    setRunnerSession((current) => ({
      ...current,
      lastAction: `runtime-readiness.${nextSurface.summary.ready ? "ready" : "blocked"}`,
      blockedReason: nextSurface.summary.ready ? "" : blockedReason
    }));
  }, []);

  const handleStartRunner = useCallback(() => {
    setRunnerSession(
      runAcceptedWorkflowSession({
        action: "start",
        workflowIr: activeWorkflowIr,
        runPlan: graphRunPlan,
        permissionPreflight: runnerPermissionReview.preflight,
        now: "2026-06-13T00:00:00.000Z"
      }) as RunnerUiSession
    );
  }, [activeWorkflowIr, graphRunPlan, runnerPermissionReview.preflight]);

  const handleCancelRunner = useCallback(() => {
    setRunnerSession(
      runAcceptedWorkflowSession({
        action: "cancel",
        workflowIr: activeWorkflowIr,
        runPlan: graphRunPlan,
        permissionPreflight: runnerPermissionReview.preflight,
        now: "2026-06-13T00:00:00.000Z"
      }) as RunnerUiSession
    );
  }, [activeWorkflowIr, graphRunPlan, runnerPermissionReview.preflight]);

  const handleRetryRunner = useCallback(() => {
    setRunnerSession(
      runAcceptedWorkflowSession({
        action: "retry",
        workflowIr: activeWorkflowIr,
        runPlan: graphRunPlan,
        permissionPreflight: runnerPermissionReview.preflight,
        now: "2026-06-13T00:00:00.000Z"
      }) as RunnerUiSession
    );
  }, [activeWorkflowIr, graphRunPlan, runnerPermissionReview.preflight]);

  const handleFailureRunner = useCallback(() => {
    setRunnerSession(
      runAcceptedWorkflowSession({
        action: "failure",
        workflowIr: activeWorkflowIr,
        runPlan: graphRunPlan,
        permissionPreflight: runnerPermissionReview.preflight,
        now: "2026-06-13T00:00:00.000Z"
      }) as RunnerUiSession
    );
  }, [activeWorkflowIr, graphRunPlan, runnerPermissionReview.preflight]);

  return {
    artifactReceiptViewerSurface,
    blockedGraphRunPlan,
    curatedAdapterLane,
    curatedAdapterRuntime,
    externalHandoffDescriptors,
    graphRunPlan,
    handleArtifactReceiptScenario,
    handleDurableRunLedgerAction,
    handleApproveRunnerPermissions,
    handleCancelRunner,
    handleFailureRunner,
    handleHumanApprovalAction,
    handleHumanApprovalResumeRerunScenario,
    handleLogsArtifactFilter,
    handleWorkflowTemplateBuilderScenario,
    handlePermissionCenterScenario,
    handleRunDashboardScenario,
    handleRuntimePrerequisiteScenario,
    handleRunnerControlAction,
    handleRetryRunner,
    handleRevokeRunnerPermissions,
    handleRunHistoryAction,
    handleSelectCuratedAdapterLane,
    handleShowBlockedRunnerPermissions,
    handleStartRunner,
    handleWatchdogSupervisorScenario,
    humanApprovalInterrupt,
    humanApprovalResumeRerunSurface,
    multiLaneExecutionReadinessSurface,
    permissionCenterSurface,
    durableRunLedgerSurface,
    runHistoryEvidence,
    runDashboardQueueMonitorSurface,
    logsArtifactWorkbenchSurface,
    workflowTemplateRunPlanBuilderSurface,
    runtimePrerequisiteReadinessSurface,
    runnerControlSurface,
    runnerEventStream,
    runnerPermissionBlockedReview,
    runnerPermissionReview,
    runnerSession,
    runnerStartAllowed,
    watchdogSupervisorSurface
  };
}
