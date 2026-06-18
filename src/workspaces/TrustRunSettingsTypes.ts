export type AnyRecord = Record<string, any>;

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
export type VerifyWorkspaceProps = {
  capabilityReview: AnyRecord;
  capabilityRows: AnyRecord[];
  dryRunReport: AnyRecord;
  primaryResource: AnyRecord;
  validation: { ok: boolean };
  verificationChecklist: Array<{ label: string; status: string }>;
};

export type RunWorkspaceProps = {
  adapterReview: AnyRecord;
  adapterPackExpansion: AnyRecord;
  adapterUpdateDecision: AnyRecord;
  artifactReceiptViewerSurface: AnyRecord;
  blockedGraphRunPlan: AnyRecord;
  curatedAdapterLane: AnyRecord;
  curatedAdapterRuntime: "python" | "node" | "blocked";
  durableRunLedgerSurface: AnyRecord;
  graphRunPlan: AnyRecord;
  nodeLaunchPlan: AnyRecord;
  onApproveRunnerPermissions: () => void;
  onCancelRunner: () => void;
  onFailRunner: () => void;
  onRetryRunner: () => void;
  onDurableRunLedgerAction: (action: DurableRunLedgerAction) => void;
  onArtifactReceiptScenario: (scenario: ArtifactReceiptScenario) => void;
  onRunnerControlAction: (action: RunnerControlAction) => void;
  onPermissionCenterScenario: (scenario: PermissionCenterScenario) => void;
  onRunDashboardScenario: (scenario: RunDashboardScenario) => void;
  onLogsArtifactFilter: (filter: LogsArtifactFilter) => void;
  onWorkflowTemplateBuilderScenario: (scenario: WorkflowTemplateBuilderScenario) => void;
  onWatchdogSupervisorScenario: (scenario: WatchdogSupervisorScenario) => void;
  onRevokeRunnerPermissions: () => void;
  onSelectCuratedAdapterLane: (runtime: "python" | "node" | "blocked") => void;
  onShowBlockedRunnerPermissions: () => void;
  onStartRunner: () => void;
  permissionAudit: AnyRecord;
  permissionCenterSurface: AnyRecord;
  runDashboardQueueMonitorSurface: AnyRecord;
  logsArtifactWorkbenchSurface: AnyRecord;
  mcpBridgeReadiness: AnyRecord;
  wasmWasiSandboxGate: AnyRecord;
  rootlessContainerPreflightGate: AnyRecord;
  browserAutomationConsentGate: AnyRecord;
  diagnosticsSupportBundle: AnyRecord;
  localVaultSecretsUx: AnyRecord;
  workflowTemplateRunPlanBuilderSurface: AnyRecord;
  humanApprovalResumeRerunSurface: AnyRecord;
  platformCapabilityReview: AnyRecord;
  pythonLaunchPlan: AnyRecord;
  registryReview: AnyRecord;
  repoLocalTaskRunnerLane: AnyRecord;
  runFolderManifest: AnyRecord;
  runHistoryEvidence: AnyRecord;
  multiLaneExecutionReadinessSurface: AnyRecord;
  runtimePrerequisiteReadinessSurface: AnyRecord;
  runnerControlSurface: AnyRecord;
  runnerEventStream: AnyRecord;
  watchdogSupervisorSurface: AnyRecord;
  externalAgentClientPackExpansion: AnyRecord;
  externalHandoffDescriptors: AnyRecord;
  functionExpansionCloseout: AnyRecord;
  sourceRoundTripHandoff: AnyRecord;
  humanApprovalInterrupt: AnyRecord;
  onHumanApprovalAction: (action: "pending" | "approve" | "reject" | "edit-input" | "handoff" | "resume-mismatch") => void;
  onHumanApprovalResumeRerunScenario: (scenario: HumanApprovalResumeRerunScenario) => void;
  onRuntimePrerequisiteScenario: (scenario: RuntimePrerequisiteScenario) => void;
  onRunHistoryAction: (action: "view" | "cleanup" | "cleanup-again" | "rerun" | "recover", runId?: string) => void;
  runnerPermissionBlockedReview: AnyRecord;
  runnerPermissionReview: AnyRecord;
  runnerStartAllowed: boolean;
  runnerSession: {
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
    };
    nodeResults: AnyRecord[];
    cleanup: {
      status: string;
      terminalRunStatus: string;
      removed: string[];
    };
  };
};

export type SettingsWorkspaceProps = {
  configDraft: AnyRecord;
  configExport: AnyRecord;
  distributionReadiness: AnyRecord;
  primaryResource: AnyRecord;
  redactionReport: AnyRecord;
  sampleUiSchema: AnyRecord;
  sampleVaultState: AnyRecord;
  localVaultSecretsUx: AnyRecord;
};
