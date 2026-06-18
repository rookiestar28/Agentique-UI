import { useI18n } from "../i18n/I18nProvider";
import { ArtifactReceiptViewerPanel } from "./ArtifactReceiptViewerPanel";
import { AdapterRegistryTrustPanel } from "./AdapterRegistryTrustPanel";
import { BrowserAutomationConsentGatePanel } from "./BrowserAutomationConsentGatePanel";
import { DiagnosticsSupportBundlePanel } from "./DiagnosticsSupportBundlePanel";
import { DurableRunLedgerPanel } from "./DurableRunLedgerPanel";
import { ExternalAgentClientPackExpansionPanel } from "./ExternalAgentClientPackExpansionPanel";
import { ExternalHandoffPanel } from "./ExternalHandoffPanel";
import { FunctionExpansionCloseoutPanel } from "./FunctionExpansionCloseoutPanel";
import { HumanApprovalResumeRerunPanel } from "./HumanApprovalResumeRerunPanel";
import { LogsArtifactWorkbenchPanel } from "./LogsArtifactWorkbenchPanel";
import { LocalVaultSecretsPanel } from "./LocalVaultSecretsPanel";
import { McpBridgeReadinessPanel } from "./McpBridgeReadinessPanel";
import { MultiLaneExecutionReadinessPanel } from "./MultiLaneExecutionReadinessPanel";
import { PermissionCenterPolicyDiffPanel } from "./PermissionCenterPolicyDiffPanel";
import { PythonNodeAdapterPackExpansionPanel } from "./PythonNodeAdapterPackExpansionPanel";
import { RepoLocalTaskRunnerLanePanel } from "./RepoLocalTaskRunnerLanePanel";
import { RootlessContainerPreflightGatePanel } from "./RootlessContainerPreflightGatePanel";
import { RunDashboardQueueMonitorPanel } from "./RunDashboardQueueMonitorPanel";
import { RuntimePrerequisiteReadinessPanel } from "./RuntimePrerequisiteReadinessPanel";
import { RunnerRevocationCancelControls } from "./RunnerRevocationCancelControls";
import { WasmWasiSandboxGatePanel } from "./WasmWasiSandboxGatePanel";
import { WatchdogHeartbeatSupervisorPanel } from "./WatchdogHeartbeatSupervisorPanel";
import type { AnyRecord, RunWorkspaceProps } from "./TrustRunSettingsTypes";

export function RunWorkspace({
  adapterReview,
  adapterPackExpansion,
  adapterUpdateDecision,
  artifactReceiptViewerSurface,
  blockedGraphRunPlan,
  curatedAdapterLane,
  curatedAdapterRuntime,
  durableRunLedgerSurface,
  graphRunPlan,
  nodeLaunchPlan,
  onApproveRunnerPermissions,
  onCancelRunner,
  onFailRunner,
  onRetryRunner,
  onArtifactReceiptScenario,
  onDurableRunLedgerAction,
  onRunnerControlAction,
  onPermissionCenterScenario,
  onRunDashboardScenario,
  onLogsArtifactFilter,
  onWatchdogSupervisorScenario,
  onRevokeRunnerPermissions,
  onSelectCuratedAdapterLane,
  onShowBlockedRunnerPermissions,
  onStartRunner,
  permissionAudit,
  permissionCenterSurface,
  runDashboardQueueMonitorSurface,
  logsArtifactWorkbenchSurface,
  mcpBridgeReadiness,
  wasmWasiSandboxGate,
  rootlessContainerPreflightGate,
  browserAutomationConsentGate,
  diagnosticsSupportBundle,
  localVaultSecretsUx,
  platformCapabilityReview,
  pythonLaunchPlan,
  registryReview,
  repoLocalTaskRunnerLane,
  runFolderManifest,
  runHistoryEvidence,
  multiLaneExecutionReadinessSurface,
  runtimePrerequisiteReadinessSurface,
  runnerControlSurface,
  runnerEventStream,
  watchdogSupervisorSurface,
  externalAgentClientPackExpansion,
  externalHandoffDescriptors,
  functionExpansionCloseout,
  sourceRoundTripHandoff,
  humanApprovalInterrupt,
  humanApprovalResumeRerunSurface,
  onHumanApprovalAction,
  onHumanApprovalResumeRerunScenario,
  onRuntimePrerequisiteScenario,
  onRunHistoryAction,
  runnerPermissionBlockedReview,
  runnerPermissionReview,
  runnerStartAllowed,
  runnerSession
}: RunWorkspaceProps) {
  const activeNav = "run";
  const { t } = useI18n();
  const platformCapabilityRows = (platformCapabilityReview.matrixRows ?? []).slice(0, 4);

  return (
    <>
      {activeNav === "run" ? (
        <div className="workspace-stack" data-page="run">
          <section className="workspace-section run-workspace" aria-labelledby="run-heading">
            <div className="section-heading">
              <p className="caption">{t("workspace.run.caption")}</p>
              <h2 id="run-heading">{t("workspace.run.title")}</h2>
            </div>
            <div className="runner-control-panel" aria-label="Runner execution controls" data-runner-status={runnerSession.status}>
              <div className="runner-status-grid">
                <div>
                  <span>Status</span>
                  <strong>{runnerSession.status}</strong>
                </div>
                <div>
                  <span>Run</span>
                  <strong>{runnerSession.runId}</strong>
                </div>
                <div>
                  <span>Permission</span>
                  <strong>{runnerPermissionReview.status}</strong>
                </div>
                <div>
                  <span>Cleanup</span>
                  <strong>{runnerSession.summary.cleanup}</strong>
                </div>
              </div>
              <div className="runner-actions" aria-label="Run start cancel controls">
                <button className="secondary-action" type="button" onClick={onApproveRunnerPermissions}>
                  Approve scoped grants
                </button>
                <button className="secondary-action" type="button" onClick={onRevokeRunnerPermissions}>
                  Revoke network grant
                </button>
                <button className="secondary-action" type="button" onClick={onShowBlockedRunnerPermissions}>
                  Blocked grant sample
                </button>
                <button aria-label="Start reviewed run" className="primary-action" disabled={!runnerStartAllowed} type="button" onClick={onStartRunner}>
                  Start reviewed run
                </button>
                <button aria-label="Cancel active run" className="secondary-action" disabled={runnerSession.status === "idle"} type="button" onClick={onCancelRunner}>
                  Cancel active run
                </button>
                <button aria-label="Inject transient failure retry sample" className="secondary-action" disabled={!runnerStartAllowed} type="button" onClick={onRetryRunner}>
                  Retry sample
                </button>
                <button aria-label="Inject terminal failure sample" className="secondary-action" disabled={!runnerStartAllowed} type="button" onClick={onFailRunner}>
                  Failure sample
                </button>
              </div>
              <div className="runner-state" aria-label="Runner state summary">
                <span>{runnerSession.lastAction}</span>
                {runnerSession.blockedReason ? <span>{runnerSession.blockedReason}</span> : <span>Scheduler evidence is ready for review.</span>}
              </div>
              <RunDashboardQueueMonitorPanel runDashboardQueueMonitorSurface={runDashboardQueueMonitorSurface} onRunDashboardScenario={onRunDashboardScenario} />
              <LogsArtifactWorkbenchPanel logsArtifactWorkbenchSurface={logsArtifactWorkbenchSurface} onLogsArtifactFilter={onLogsArtifactFilter} />
              <PermissionCenterPolicyDiffPanel permissionCenterSurface={permissionCenterSurface} onPermissionCenterScenario={onPermissionCenterScenario} />
              <RunnerRevocationCancelControls runnerControlSurface={runnerControlSurface} onRunnerControlAction={onRunnerControlAction} />
              <WatchdogHeartbeatSupervisorPanel watchdogSupervisorSurface={watchdogSupervisorSurface} onWatchdogSupervisorScenario={onWatchdogSupervisorScenario} />
              <DurableRunLedgerPanel durableRunLedgerSurface={durableRunLedgerSurface} onDurableRunLedgerAction={onDurableRunLedgerAction} />
              <div className="run-plan-gate" aria-label="Run plan gate summary">
                <div>
                  <span>Run plan</span>
                  <strong>{graphRunPlan.status}</strong>
                </div>
                <div>
                  <span>Start decision</span>
                  <strong>{graphRunPlan.startDecision}</strong>
                </div>
                <div>
                  <span>Workflow</span>
                  <strong>{graphRunPlan.workflowId}</strong>
                </div>
              </div>
              <div className="run-plan-counts" aria-label="Run plan classification counts">
                <span>{graphRunPlan.summary.executable} executable</span>
                <span>{graphRunPlan.summary.permissionRequired} permission-required</span>
                <span>{graphRunPlan.summary.blocked} blocked</span>
                <span>{graphRunPlan.summary.handoffOnly} handoff-only</span>
              </div>
              <div className="permission-preflight-panel" aria-label="Runner permission preflight review">
                <div className="permission-preflight-strip">
                  <div>
                    <span>Preflight</span>
                    <strong>{runnerPermissionReview.status}</strong>
                    <small>{`${runnerPermissionReview.summary.allowed}/${runnerPermissionReview.summary.required} grants allowed`}</small>
                  </div>
                  <div>
                    <span>Current grants</span>
                    <strong>{runnerPermissionReview.summary.currentGrants}</strong>
                    <small>{`${runnerPermissionReview.summary.revoked} revoked / ${runnerPermissionReview.summary.blocked} blocked`}</small>
                  </div>
                  <div>
                    <span>Audit export</span>
                    <strong>{runnerPermissionReview.auditArtifact.path}</strong>
                    <small>{`${runnerPermissionReview.auditArtifact.events} redacted event(s)`}</small>
                  </div>
                </div>
                <ol className="permission-grant-list" aria-label="Required runner grants">
                  {runnerPermissionReview.requirements.map((requirement: AnyRecord) => (
                    <li className={requirement.status} key={`${requirement.family}-${requirement.action}-${requirement.code}`}>
                      <span>{requirement.family}</span>
                      <strong>{requirement.status}</strong>
                      <small>{`${requirement.message} / ${requirement.target}`}</small>
                    </li>
                  ))}
                </ol>
                <ol className="permission-grant-list compact" aria-label="Current runner grant status">
                  {(runnerPermissionReview.grants.length > 0
                    ? runnerPermissionReview.grants
                    : [{ id: "no-grants", family: "none", status: "missing", expiresAt: "not-granted", targets: ["approve first"] }]
                  )
                    .slice(0, 8)
                    .map((grant: AnyRecord) => (
                      <li className={grant.status} key={grant.id}>
                        <span>{grant.family}</span>
                        <strong>{grant.status}</strong>
                        <small>{`${grant.expiresAt} / ${grant.targets[0]}`}</small>
                      </li>
                    ))}
                </ol>
                <ol className="permission-grant-list compact" aria-label="Blocked permission samples">
                  {runnerPermissionBlockedReview.requirements.map((requirement: AnyRecord) => (
                    <li className={requirement.status} key={`${requirement.family}-${requirement.code}`}>
                      <span>{requirement.family}</span>
                      <strong>{requirement.code.replace("permission-grant.", "")}</strong>
                      <small>{requirement.message}</small>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="run-state" aria-label="Scheduler lifecycle evidence">
                <span>{runnerSession.summary.terminal} terminal</span>
                <span>{runnerSession.summary.retries} retry</span>
                <span>{runnerSession.summary.failed} failed</span>
                <span>{runnerSession.summary.skipped} skipped</span>
                <span>{runnerSession.summary.canceled} canceled</span>
                <span>{runnerSession.cleanup.status} cleanup</span>
              </div>
              <div className="runner-event-timeline" aria-label="Run streaming timeline">
                <div className="run-history-grid compact">
                  <div>
                    <span>Stream status</span>
                    <strong>{runnerEventStream.activeSample.status}</strong>
                    <small>{`terminal ${runnerEventStream.terminalState}`}</small>
                  </div>
                  <div>
                    <span>Events</span>
                    <strong>{runnerEventStream.summary.events}</strong>
                    <small>{`${runnerEventStream.summary.running} running / ${runnerEventStream.summary.cleanup} cleanup`}</small>
                  </div>
                  <div>
                    <span>Retry</span>
                    <strong>{runnerEventStream.summary.retrying}</strong>
                    <small>{`${runnerEventStream.summary.skipped} skipped / ${runnerEventStream.summary.failed} failed`}</small>
                  </div>
                  <div>
                    <span>Adapter stream</span>
                    <strong>{runnerEventStream.summary.adapterEvents}</strong>
                    <small>{runnerEventStream.boundary.liveTransport ? "live transport" : "descriptor stream"}</small>
                  </div>
                </div>
                <ol className="runner-event-list" aria-label="Run streaming timeline events">
                  {runnerEventStream.events.slice(0, 14).map((event: AnyRecord) => (
                    <li className={event.type} key={event.id}>
                      <span>{`#${event.sequence} ${event.type}`}</span>
                      <strong>{event.nodeId}</strong>
                      <small>{event.label}</small>
                    </li>
                  ))}
                </ol>
                <ol className="runner-node-timeline" aria-label="Run per-node execution evidence">
                  {runnerEventStream.nodeTimelines.map((node: AnyRecord) => (
                    <li className={node.status} key={`${node.nodeId}-${node.status}`}>
                      <span>{node.nodeId}</span>
                      <strong>{node.status}</strong>
                      <small>{`${node.events.length} event(s) / ${node.attempts} attempt(s)`}</small>
                    </li>
                  ))}
                </ol>
                <ol className="runner-dependency-chain" aria-label="Run dependency chain evidence">
                  {(runnerEventStream.dependencyChains.length > 0
                    ? runnerEventStream.dependencyChains
                    : [{ nodeId: "none", status: "clear", upstream: "none", message: "No failed dependency chain." }]
                  ).map((chain: AnyRecord) => (
                    <li className={chain.status} key={`${chain.nodeId}-${chain.upstream}-${chain.status}`}>
                      <span>{chain.status}</span>
                      <strong>{chain.nodeId}</strong>
                      <small>{`${chain.upstream} / ${chain.message}`}</small>
                    </li>
                  ))}
                </ol>
                <ol className="runner-log-preview" aria-label="Run bounded redacted log preview">
                  {runnerEventStream.boundedLogs.map((line: AnyRecord) => (
                    <li key={`${line.index}-${line.text}`}>
                      <span>{`log ${line.index}`}</span>
                      <strong>{line.redacted ? "redacted" : "blocked"}</strong>
                      <small>{line.text}</small>
                    </li>
                  ))}
                </ol>
                <ol className="runner-event-list compact" aria-label="Adapter lane event timeline">
                  {runnerEventStream.adapterEvents.map((event: AnyRecord) => (
                    <li className={event.type} key={event.id}>
                      <span>{event.type}</span>
                      <strong>{event.nodeId}</strong>
                      <small>{event.label}</small>
                    </li>
                  ))}
                </ol>
                <div className="runner-cleanup-receipt" aria-label="Run cleanup stream evidence">
                  <span>Cleanup stream</span>
                  <strong>{runnerEventStream.cleanupEvent?.type ?? "not-started"}</strong>
                  <small>{runnerEventStream.cleanupEvent?.label ?? "No cleanup event emitted yet."}</small>
                </div>
              </div>
              <div className="approval-checkpoint-panel" aria-label="Human approval checkpoint">
                <div className="section-heading">
                  <p className="caption">Human approval</p>
                  <h2>Interrupt checkpoint</h2>
                </div>
                <div className="approval-checkpoint-grid">
                  <div>
                    <span>Run state</span>
                    <strong>{humanApprovalInterrupt.run.state}</strong>
                    <small>{humanApprovalInterrupt.run.runId}</small>
                  </div>
                  <div>
                    <span>Checkpoint</span>
                    <strong>{humanApprovalInterrupt.checkpoint.status}</strong>
                    <small>{humanApprovalInterrupt.checkpoint.checkpointId}</small>
                  </div>
                  <div>
                    <span>Interrupt</span>
                    <strong>{humanApprovalInterrupt.interrupt.status}</strong>
                    <small>{humanApprovalInterrupt.interrupt.interruptId}</small>
                  </div>
                  <div>
                    <span>Boundary</span>
                    <strong>{humanApprovalInterrupt.boundary.descriptorOnly ? "descriptor only" : "blocked"}</strong>
                    <small>{humanApprovalInterrupt.boundary.externalRuntimeStarted ? "external started" : "no external runtime"}</small>
                  </div>
                </div>
                <div className="approval-action-list" aria-label="Approval interrupt controls">
                  <button className="secondary-action" type="button" onClick={() => onHumanApprovalAction("pending")}>
                    Pending checkpoint
                  </button>
                  <button className="secondary-action" type="button" onClick={() => onHumanApprovalAction("approve")}>
                    Approve checkpoint
                  </button>
                  <button className="secondary-action" type="button" onClick={() => onHumanApprovalAction("reject")}>
                    Reject checkpoint
                  </button>
                  <button className="secondary-action" type="button" onClick={() => onHumanApprovalAction("edit-input")}>
                    Edit input sample
                  </button>
                  <button className="secondary-action" type="button" onClick={() => onHumanApprovalAction("handoff")}>
                    Handoff decision
                  </button>
                  <button className="secondary-action" type="button" onClick={() => onHumanApprovalAction("resume-mismatch")}>
                    Mismatch resume sample
                  </button>
                </div>
                <div className="approval-checkpoint-grid compact" aria-label="Approval resume gate">
                  <div>
                    <span>Resume</span>
                    <strong>{humanApprovalInterrupt.resumeGate.status}</strong>
                    <small>{humanApprovalInterrupt.resumeGate.code}</small>
                  </div>
                  <div>
                    <span>Run id match</span>
                    <strong>{humanApprovalInterrupt.resumeAttempt?.runId === humanApprovalInterrupt.checkpoint.runId ? "match" : "blocked"}</strong>
                    <small>{humanApprovalInterrupt.checkpoint.runId}</small>
                  </div>
                  <div>
                    <span>Checkpoint match</span>
                    <strong>{humanApprovalInterrupt.resumeAttempt?.checkpointId === humanApprovalInterrupt.checkpoint.checkpointId ? "match" : "blocked"}</strong>
                    <small>{humanApprovalInterrupt.checkpoint.checkpointId}</small>
                  </div>
                  <div>
                    <span>Interrupt match</span>
                    <strong>{humanApprovalInterrupt.resumeAttempt?.pendingInterruptId === humanApprovalInterrupt.checkpoint.pendingInterruptId ? "match" : "blocked"}</strong>
                    <small>{humanApprovalInterrupt.checkpoint.pendingInterruptId}</small>
                  </div>
                </div>
                <ol className="approval-timeline-list" aria-label="Approval checkpoint timeline">
                  {humanApprovalInterrupt.timeline.map((event: AnyRecord) => (
                    <li className={event.state} key={event.id}>
                      <span>{`#${event.sequence} ${event.type}`}</span>
                      <strong>{event.state}</strong>
                      <small>{event.label}</small>
                    </li>
                  ))}
                </ol>
                <div className="approval-checkpoint-grid compact" aria-label="Approval edited input evidence">
                  <div>
                    <span>Edited</span>
                    <strong>{humanApprovalInterrupt.decision.edited ? "recorded" : "not edited"}</strong>
                    <small>{humanApprovalInterrupt.decision.editedInput?.validation ?? "pending human decision"}</small>
                  </div>
                  <div>
                    <span>Redaction</span>
                    <strong>{humanApprovalInterrupt.decision.editedInput?.redacted ? "redacted" : "not needed"}</strong>
                    <small>{humanApprovalInterrupt.decision.editedInput?.value ?? "No edited input captured."}</small>
                  </div>
                </div>
              </div>
              <div className="blocked-run-plan-strip" aria-label="Blocked run plan safety sample">
                <strong>Blocked sample plan</strong>
                <span>{`${blockedGraphRunPlan.status} / ${blockedGraphRunPlan.summary.blocked} blocked / ${blockedGraphRunPlan.summary.handoffOnly} handoff`}</span>
                <small>Unsupported and high-risk nodes do not enter scheduler execution.</small>
              </div>
              <ExternalHandoffPanel externalHandoffDescriptors={externalHandoffDescriptors} />
              <ExternalAgentClientPackExpansionPanel externalAgentClientPackExpansion={externalAgentClientPackExpansion} />
              <McpBridgeReadinessPanel mcpBridgeReadiness={mcpBridgeReadiness} />
              <WasmWasiSandboxGatePanel wasmWasiSandboxGate={wasmWasiSandboxGate} />
              <RootlessContainerPreflightGatePanel rootlessContainerPreflightGate={rootlessContainerPreflightGate} />
              <BrowserAutomationConsentGatePanel browserAutomationConsentGate={browserAutomationConsentGate} />
              <LocalVaultSecretsPanel localVaultSecretsUx={localVaultSecretsUx} />
              <DiagnosticsSupportBundlePanel diagnosticsSupportBundle={diagnosticsSupportBundle} />
              <FunctionExpansionCloseoutPanel functionExpansionCloseout={functionExpansionCloseout} />
              <div className="source-roundtrip-panel compact" aria-label="Run source handoff local blocked external summary">
                <strong>Source round-trip handoff summary</strong>
                <dl className="source-roundtrip-grid compact">
                  <div>
                    <dt>Local subset</dt>
                    <dd>{`${sourceRoundTripHandoff.summary.localExecutableNodes} executable`}</dd>
                  </div>
                  <div>
                    <dt>Blocked nodes</dt>
                    <dd>{sourceRoundTripHandoff.summary.blockedNodes}</dd>
                  </div>
                  <div>
                    <dt>External handoff</dt>
                    <dd>{`${sourceRoundTripHandoff.summary.handoffNeeds} needs`}</dd>
                  </div>
                </dl>
                <ol className="source-roundtrip-list compact">
                  {sourceRoundTripHandoff.sourcePlatformHandoffs.slice(0, 4).map((handoff: AnyRecord) => (
                    <li className={handoff.classification} key={handoff.id}>
                      <span>{`${handoff.platform} / ${handoff.sourceFamily}`}</span>
                      <strong>{handoff.classification}</strong>
                      <small>{handoff.targetCategory}</small>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="platform-capability-strip compact" aria-label="Run platform capability classifications">
                <div>
                  <strong>Platform capability map</strong>
                  <span>{`${platformCapabilityReview.summary.sourceFamilies} families / ${platformCapabilityReview.summary.permissionRequired} permission`}</span>
                </div>
                <ol>
                  {platformCapabilityRows.map((row: AnyRecord, index: number) => (
                    <li key={`${row.platform}-${row.sourceFamily}-${index}`}>
                      <span>{row.sourceFamily}</span>
                      <strong>{row.primaryClassification}</strong>
                      <small>{row.executionLane}</small>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="runner-evidence-grid">
                <ol className="runner-log-list" aria-label="Runner logs">
                  {runnerSession.logs.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
                <ol className="runner-artifact-list" aria-label="Runner artifacts">
                  {(runnerSession.artifacts.length > 0 ? runnerSession.artifacts : ["artifacts/not-started.json"]).map((artifact) => (
                    <li key={artifact}>{artifact}</li>
                  ))}
                </ol>
              </div>
              <ol className="runner-node-result-list" aria-label="Runner node results">
                {runnerSession.nodeResults.map((node: AnyRecord) => (
                  <li className={node.status} key={`${node.nodeId}-${node.status}`}>
                    <span>{node.nodeId}</span>
                    <strong>{node.status}</strong>
                    <small>{`${node.attempts} attempt${node.attempts === 1 ? "" : "s"}`}</small>
                  </li>
                ))}
              </ol>
              <div className="runner-cleanup-receipt" aria-label="Runner cleanup receipt">
                <span>Cleanup receipt</span>
                <strong>{runnerSession.cleanup.status}</strong>
                <small>{`${runnerSession.cleanup.terminalRunStatus} / ${runnerSession.cleanup.removed.length} transient record(s) removed`}</small>
              </div>
              <div className="runner-cleanup-receipt" aria-label="Runner permission audit evidence">
                <span>Permission audit</span>
                <strong>{runnerSession.permissionPreflight.status}</strong>
                <small>{`${runnerSession.permissionPreflight.allowed}/${runnerSession.permissionPreflight.required} grants / ${runnerSession.permissionPreflight.artifactPath}`}</small>
              </div>
            </div>
            <div className="run-history-panel" aria-label="Run history and evidence browser">
              <div className="section-heading">
                <p className="caption">Run history</p>
                <h2>Evidence browser</h2>
              </div>
              <div className="run-history-grid compact">
                <div>
                  <span>Total runs</span>
                  <strong>{runHistoryEvidence.summary.totalRuns}</strong>
                  <small>{`${runHistoryEvidence.summary.cleanupReceipts} cleanup receipt(s)`}</small>
                </div>
                <div>
                  <span>Selected run</span>
                  <strong>{runHistoryEvidence.selectedRunId}</strong>
                  <small>{runHistoryEvidence.selected.state}</small>
                </div>
                <div>
                  <span>Boundary</span>
                  <strong>{runHistoryEvidence.boundary.nativeBacked ? "native backed" : runHistoryEvidence.boundary.descriptorOnly ? "descriptor only" : "blocked"}</strong>
                  <small>{runHistoryEvidence.boundary.redacted ? "redacted evidence" : "not redacted"}</small>
                </div>
                <div>
                  <span>Rerun links</span>
                  <strong>{runHistoryEvidence.summary.rerunLinks}</strong>
                  <small>{`${runHistoryEvidence.summary.recovered} recovered run(s)`}</small>
                </div>
              </div>
              <ol className="run-history-list" aria-label="Run history records">
                {runHistoryEvidence.history.map((entry: AnyRecord) => (
                  <li className={entry.state} key={entry.runId}>
                    <button
                      className="run-history-record"
                      type="button"
                      aria-pressed={entry.runId === runHistoryEvidence.selectedRunId}
                      onClick={() => onRunHistoryAction("view", entry.runId)}
                    >
                      <span>{entry.state}</span>
                      <strong>{entry.runId}</strong>
                      <small>{entry.cleanup.status}</small>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="run-evidence-browser" aria-label="Run evidence browser">
                <div className="run-history-grid compact">
                  <div>
                    <span>Status</span>
                    <strong>{runHistoryEvidence.evidenceBrowser.status}</strong>
                    <small>{runHistoryEvidence.evidenceBrowser.runId}</small>
                  </div>
                  <div>
                    <span>Digest</span>
                    <strong>{runHistoryEvidence.evidenceBrowser.reproducibilityDigest.slice(0, 16)}</strong>
                    <small>reproducibility proof</small>
                  </div>
                  <div>
                    <span>Cleanup</span>
                    <strong>{runHistoryEvidence.evidenceBrowser.cleanup.status}</strong>
                    <small>{runHistoryEvidence.evidenceBrowser.cleanup.receiptPath}</small>
                  </div>
                  <div>
                    <span>Failure</span>
                    <strong>{runHistoryEvidence.selected.failure.status}</strong>
                    <small>{runHistoryEvidence.selected.failure.code ?? "none"}</small>
                  </div>
                </div>
                <ol className="run-evidence-list" aria-label="Run evidence logs">
                  {runHistoryEvidence.evidenceBrowser.logs.map((log: AnyRecord) => (
                    <li key={log.name}>
                      <span>{log.name}</span>
                      <strong>{log.redacted ? "redacted" : "blocked"}</strong>
                      <small>{log.text}</small>
                    </li>
                  ))}
                </ol>
                <ol className="run-evidence-list" aria-label="Run evidence outputs">
                  {runHistoryEvidence.evidenceBrowser.outputs.map((output: AnyRecord) => (
                    <li key={output.path}>
                      <span>{output.mediaType}</span>
                      <strong>{output.path}</strong>
                      <small>{`${output.bytes} bytes / ${String(output.digest).slice(0, 12)}`}</small>
                    </li>
                  ))}
                </ol>
                <ol className="run-evidence-list" aria-label="Run evidence artifacts">
                  {runHistoryEvidence.evidenceBrowser.artifacts.map((artifact: AnyRecord) => (
                    <li key={artifact.id}>
                      <span>{artifact.viewer}</span>
                      <strong>{artifact.path}</strong>
                      <small>{artifact.redacted ? "redacted viewer metadata" : "blocked artifact"}</small>
                    </li>
                  ))}
                </ol>
                <ol className="run-evidence-list timeline" aria-label="Run evidence timeline">
                  {runHistoryEvidence.evidenceBrowser.timeline.map((event: AnyRecord) => (
                    <li key={`${runHistoryEvidence.evidenceBrowser.runId}-${event.sequence}`}>
                      <span>{`#${event.sequence}`}</span>
                      <strong>{event.state}</strong>
                      <small>{event.label}</small>
                    </li>
                  ))}
                </ol>
                <div className="run-history-actions" aria-label="Run cleanup and rerun actions">
                  <button className="secondary-action" type="button" onClick={() => onRunHistoryAction("cleanup", "run-history-cleanup")}>
                    Cleanup selected
                  </button>
                  <button className="secondary-action" type="button" onClick={() => onRunHistoryAction("cleanup-again", "run-history-cleanup")}>
                    Cleanup again
                  </button>
                  <button className="secondary-action" type="button" onClick={() => onRunHistoryAction("rerun", "run-history-success")}>
                    Rerun selected
                  </button>
                  <button className="secondary-action" type="button" onClick={() => onRunHistoryAction("recover", "run-history-recovered")}>
                    Recover stale run
                  </button>
                </div>
                <div className="run-history-grid compact">
                  {runHistoryEvidence.actionEvidence.cleanup ? (
                    <div>
                      <span>Cleanup action</span>
                      <strong>{runHistoryEvidence.actionEvidence.cleanup.status}</strong>
                      <small>{`${runHistoryEvidence.actionEvidence.cleanup.removed.length} removed / idempotent ${runHistoryEvidence.actionEvidence.cleanup.idempotent}`}</small>
                    </div>
                  ) : null}
                  {runHistoryEvidence.actionEvidence.rerun ? (
                    <div>
                      <span>Rerun action</span>
                      <strong>{runHistoryEvidence.actionEvidence.rerun.newRunId}</strong>
                      <small>{`from ${runHistoryEvidence.actionEvidence.rerun.previousRunId}`}</small>
                    </div>
                  ) : null}
                  {runHistoryEvidence.actionEvidence.recovery ? (
                    <div>
                      <span>Recovery action</span>
                      <strong>{runHistoryEvidence.actionEvidence.recovery.reason}</strong>
                      <small>{runHistoryEvidence.actionEvidence.recovery.cleanupRequired ? "cleanup required" : "no cleanup"}</small>
                    </div>
                  ) : null}
                </div>
              </div>
              <ArtifactReceiptViewerPanel artifactReceiptViewerSurface={artifactReceiptViewerSurface} onArtifactReceiptScenario={onArtifactReceiptScenario} />
              <HumanApprovalResumeRerunPanel
                humanApprovalResumeRerunSurface={humanApprovalResumeRerunSurface}
                onHumanApprovalResumeRerunScenario={onHumanApprovalResumeRerunScenario}
              />
              <RuntimePrerequisiteReadinessPanel
                runtimePrerequisiteReadinessSurface={runtimePrerequisiteReadinessSurface}
                onRuntimePrerequisiteScenario={onRuntimePrerequisiteScenario}
              />
              <MultiLaneExecutionReadinessPanel multiLaneExecutionReadinessSurface={multiLaneExecutionReadinessSurface} />
            </div>
            <div className="curated-adapter-lane-panel" aria-label="Curated adapter execution lane">
              <div className="runner-actions" aria-label="Curated adapter lane controls">
                <button className="secondary-action" aria-pressed={curatedAdapterRuntime === "python"} type="button" onClick={() => onSelectCuratedAdapterLane("python")}>
                  Run Python sample
                </button>
                <button className="secondary-action" aria-pressed={curatedAdapterRuntime === "node"} type="button" onClick={() => onSelectCuratedAdapterLane("node")}>
                  Run Node sample
                </button>
                <button className="secondary-action" aria-pressed={curatedAdapterRuntime === "blocked"} type="button" onClick={() => onSelectCuratedAdapterLane("blocked")}>
                  Blocked pack sample
                </button>
              </div>
              <div className="curated-adapter-lane-grid" aria-label="Curated adapter lane evidence">
                <div>
                  <span>Selected lane</span>
                  <strong>{curatedAdapterRuntime === "blocked" ? "blocked samples" : curatedAdapterLane.selected.runtime}</strong>
                  <small>
                    {curatedAdapterRuntime === "blocked"
                      ? `${curatedAdapterLane.summary.blockedBeforeLaunch} blocked before launch`
                      : `${curatedAdapterLane.selected.status} / ${curatedAdapterLane.selected.runId}`}
                  </small>
                </div>
                <div>
                  <span>Signature</span>
                  <strong>{curatedAdapterLane.selected.signature}</strong>
                  <small>{curatedAdapterLane.selected.allowlisted ? "allowlisted" : "not allowlisted"}</small>
                </div>
                <div>
                  <span>Support mode</span>
                  <strong>{curatedAdapterLane.selected.supportMode}</strong>
                  <small>{curatedAdapterLane.selected.digest} digest</small>
                </div>
                <div>
                  <span>Validation command</span>
                  <strong>{curatedAdapterLane.selected.validationCommand}</strong>
                  <small>Node validation runner writes bounded evidence</small>
                </div>
              </div>
              <ol className="curated-adapter-evidence-list" aria-label="Curated adapter permission asks">
                {curatedAdapterLane.selected.permissions.map((permission: AnyRecord) => (
                  <li key={`${permission.family}-${permission.action}`}>
                    <span>{permission.family}</span>
                    <strong>{permission.action}</strong>
                    <small>{permission.target}</small>
                  </li>
                ))}
              </ol>
              <ol className="curated-adapter-evidence-list" aria-label="Curated adapter run folder evidence">
                {curatedAdapterLane.selected.evidence.files.map((file: string) => (
                  <li key={file}>
                    <span>evidence</span>
                    <strong>{file.split("/").slice(-1)[0]}</strong>
                    <small>{file}</small>
                  </li>
                ))}
              </ol>
              <ol className="curated-adapter-block-list" aria-label="Curated adapter blocked samples">
                {curatedAdapterLane.blockedSamples.map((sample: AnyRecord) => (
                  <li key={sample.reason}>
                    <span>{sample.reason}</span>
                    <strong>{sample.status}</strong>
                    <small>{sample.message}</small>
                  </li>
                ))}
              </ol>
              <div className="curated-adapter-lane-grid compact" aria-label="Curated adapter cleanup receipts">
                {curatedAdapterLane.cleanupSamples.map((sample: AnyRecord) => (
                  <div key={`${sample.runtime}-${sample.status}`}>
                    <span>{sample.runtime}</span>
                    <strong>{sample.status}</strong>
                    <small>{sample.receipt}</small>
                  </div>
                ))}
              </div>
              <div className="curated-adapter-lane-grid compact" aria-label="Curated adapter environment evidence">
                <div>
                  <span>Adapter env</span>
                  <strong>{curatedAdapterLane.selected.environment.adapterEnvKeys.join(" / ")}</strong>
                  <small>adapter-scoped keys only</small>
                </div>
                <div>
                  <span>Ambient env</span>
                  <strong>{curatedAdapterLane.selected.environment.forwardedAmbient.length}</strong>
                  <small>no user environment values forwarded</small>
                </div>
              </div>
            </div>
            <PythonNodeAdapterPackExpansionPanel adapterPackExpansion={adapterPackExpansion} />
            <RepoLocalTaskRunnerLanePanel repoLocalTaskRunnerLane={repoLocalTaskRunnerLane} />
            <div className="run-state" aria-label="Adapter pack trust summary">
              <span>{adapterReview.trust.signature} signature</span>
              <span>{adapterReview.trust.allowlisted ? "allowlisted" : "not allowlisted"}</span>
              <span>{adapterReview.adapter.runtime} runtime</span>
              <span>{adapterReview.summary.blockingErrors} blocker</span>
            </div>
            <div className="field-list" aria-label="Adapter pack identity and provenance">
              <div>
                <span>Adapter</span>
                <strong>
                  {adapterReview.adapter.id}@{adapterReview.adapter.version}
                </strong>
              </div>
              <div>
                <span>Digest</span>
                <strong>{adapterReview.artifact.digest.slice(0, 12)}</strong>
              </div>
              <div>
                <span>Signer</span>
                <strong>{adapterReview.trust.signer}</strong>
              </div>
              <div>
                <span>Provenance</span>
                <strong>{adapterReview.trust.provenance}</strong>
              </div>
            </div>
            <div className="capability-list" aria-label="Adapter permission ceiling">
              {Object.entries(adapterReview.permissions).map(([family, decision]) => (
                <div className={`capability-row ${decision}`} key={family}>
                  <div>
                    <strong>{family}</strong>
                    <span>adapter request</span>
                  </div>
                  <span className="decision-pill">{String(decision)}</span>
                </div>
              ))}
            </div>
            <div className="fail-closed" role="status">
              <strong>Adapter review only</strong>
              <span>Unsigned, tampered, revoked, incompatible, or non-allowlisted adapter packs fail closed before a sidecar launch plan exists.</span>
            </div>
            <AdapterRegistryTrustPanel registryReview={registryReview} adapterUpdateDecision={adapterUpdateDecision} />
            <div className="section-heading">
              <p className="caption">Python sidecar</p>
              <h2>Launch plan contract</h2>
            </div>
            <div className="run-state" aria-label="Python sidecar launch plan summary">
              <span>{pythonLaunchPlan.summary.status}</span>
              <span>{pythonLaunchPlan.network.auth}</span>
              <span>{pythonLaunchPlan.summary.healthCheck} health check</span>
              <span>{pythonLaunchPlan.summary.cleanup} cleanup</span>
            </div>
            <div className="field-list" aria-label="Python sidecar isolation">
              <div>
                <span>Native boundary</span>
                <strong>{pythonLaunchPlan.nativeCommand}</strong>
              </div>
              <div>
                <span>Web process spawn</span>
                <strong>{pythonLaunchPlan.willSpawnProcessFromWebLayer ? "enabled" : "blocked"}</strong>
              </div>
              <div>
                <span>Network</span>
                <strong>
                  {pythonLaunchPlan.network.mode} / {pythonLaunchPlan.network.listenHost}
                </strong>
              </div>
              <div>
                <span>Environment</span>
                <strong>{pythonLaunchPlan.environment.forwardAmbient ? "ambient forwarded" : "explicit variables only"}</strong>
              </div>
            </div>
            <div className="fail-closed" role="status">
              <strong>Launch plan only</strong>
              <span>
                Python sidecars require signed adapter review, scoped workspace references, per-launch localhost auth, health checks, redacted stdout/stderr, graceful shutdown, and
                process-tree cleanup.
              </span>
            </div>
            <div className="section-heading">
              <p className="caption">Node sidecar</p>
              <h2>Package lifecycle boundary</h2>
            </div>
            <div className="run-state" aria-label="Node sidecar package policy summary">
              <span>{nodeLaunchPlan.summary.status}</span>
              <span>{nodeLaunchPlan.packagePolicy?.packageManager} package manager</span>
              <span>{nodeLaunchPlan.packagePolicy?.lifecycleScripts} lifecycle scripts</span>
              <span>{nodeLaunchPlan.packagePolicy?.inlineScripts ? "inline scripts enabled" : "inline scripts blocked"}</span>
            </div>
            <div className="fail-closed" role="status">
              <strong>Node package execution blocked</strong>
              <span>
                Node sidecars must use a signed packaged adapter binary. Ambient package managers, install steps, package lifecycle scripts, and inline scripts are blocked by
                policy.
              </span>
            </div>
            <div className="section-heading">
              <p className="caption">Permission enforcement</p>
              <h2>Audit decisions</h2>
            </div>
            <div className="run-state" aria-label="Permission audit summary">
              <span>{permissionAudit.summary.allowed} allowed</span>
              <span>{permissionAudit.summary.blocked} blocked</span>
              <span>{permissionAudit.summary.promptRequired} prompt required</span>
              <span>revocation overrides allow</span>
            </div>
            <ol className="permission-audit" aria-label="Permission enforcement audit log">
              {permissionAudit.results.map((result: { code: string; family: string; status: string }) => (
                <li key={`${result.family}-${result.code}`}>
                  <span>{result.family}</span>
                  <strong>{result.status}</strong>
                  <small>{result.code}</small>
                </li>
              ))}
            </ol>
            <div className="section-heading">
              <p className="caption">Run folder</p>
              <h2>Artifact manifest</h2>
            </div>
            <div className="run-state" aria-label="Run folder manifest summary">
              <span>{runFolderManifest.summary.logs} logs</span>
              <span>{runFolderManifest.summary.outputs} output</span>
              <span>{runFolderManifest.summary.artifacts} artifact</span>
              <span>{runFolderManifest.summary.cleanup} cleanup</span>
            </div>
            <div className="descriptor-review" aria-label="Run json reproducibility metadata">
              <span>run.json</span>
              <strong>{runFolderManifest.runJson.paths.runJson}</strong>
              <pre>
                {JSON.stringify(
                  {
                    runId: runFolderManifest.runJson.runId,
                    runtime: runFolderManifest.runJson.adapter.runtime,
                    digest: runFolderManifest.runJson.reproducibility.inputDigest.slice(0, 16),
                    permissionAudit: runnerSession.permissionPreflight.artifactPath,
                    sideEffects: runFolderManifest.runJson.sideEffects.length
                  },
                  null,
                  2
                )}
              </pre>
            </div>
            <div className="fail-closed" role="status">
              <strong>Manifest only</strong>
              <span>
                Run folder contracts describe predictable run.json, logs, outputs, artifacts, viewer metadata, cleanup state, failure state, and reproducibility evidence without
                writing files from the web layer.
              </span>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
