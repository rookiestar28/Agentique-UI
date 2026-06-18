import { useMemo } from "react";
import { reviewAdapterPack, sampleAdapterPack, sampleAdapterPolicy } from "../../core/adapter-pack-policy.mjs";
import { resolveAdapterUpdate, reviewAdapterRegistryManifestTrustPolicy, sampleAdapterRegistry } from "../../core/adapter-registry.mjs";
import { sampleLibraryState } from "../../core/library-store.mjs";
import { reviewPlatformCapabilityClassifierGate } from "../../core/platform-capability-classifier.mjs";
import { evaluatePermissionBatch, samplePermissionPolicy, samplePermissionRequests } from "../../core/permission-engine.mjs";
import { createExternalAgentClientPackExpansion } from "../../core/external-agent-client-pack-expansion.mjs";
import { createBrowserAutomationConsentReview, reviewBrowserAutomationConsentGate } from "../../core/browser-automation-consent-gate.mjs";
import { createDiagnosticsSupportBundleReview, reviewDiagnosticsSupportBundleGate } from "../../core/diagnostics-support-bundle.mjs";
import { createFunctionExpansionCloseoutReview, reviewFunctionExpansionCloseoutGate } from "../../core/function-expansion-closeout.mjs";
import { createLocalVaultSecretsReview, reviewLocalVaultSecretsGate } from "../../core/local-vault-secrets-ux.mjs";
import { createMcpBridgeReadinessDescriptor } from "../../core/mcp-bridge-readiness-descriptor.mjs";
import { createPythonNodeAdapterPackExpansion } from "../../core/python-node-adapter-pack-expansion.mjs";
import { createRootlessContainerPreflightReview, reviewRootlessContainerPreflightGate } from "../../core/rootless-container-preflight-gate.mjs";
import { createRunFolderManifest, sampleRunFolderInput } from "../../core/run-folder.mjs";
import { createSidecarLaunchPlan, sampleNodeSidecarRequest, samplePythonSidecarRequest } from "../../core/sidecar-runner.mjs";
import { createSourceRoundTripHandoff } from "../../core/source-roundtrip-handoff.mjs";
import { createWasmWasiSandboxReview, reviewWasmWasiSandboxGate } from "../../core/wasm-wasi-sandbox-gate.mjs";
import { applyWorkflowEdit, createWorkflowEditorState, redoWorkflowEdit, undoWorkflowEdit } from "../../core/workflow-editor.mjs";
import { sampleWorkflowIr, validateWorkflowIr } from "../../core/workflow-ir.mjs";
import { sampleSchedulableWorkflowIr } from "../../core/workflow-scheduler.mjs";
import { createPermissionCenterSurface } from "../../core/permission-center-policy-diff.mjs";
import { useRunnerWorkspaceState } from "../../app-state/useRunnerWorkspaceState";
import { createRepoLocalTaskRunnerLane } from "../../core/repo-local-task-runner-lane.mjs";
import type { NavigationKey } from "../../ui/navigation";
import { GraphWorkspace } from "../GraphWorkspace";
import { RunWorkspace } from "../TrustRunSettingsWorkspaces";

type GraphRunRouteProps = {
  activeNav: Extract<NavigationKey, "graph" | "run">;
};

export default function GraphWorkspaceAndRunWorkspaceRoute({ activeNav }: GraphRunRouteProps) {
  const activeWorkflowIr = sampleSchedulableWorkflowIr;
  const blockedWorkflowIr = sampleWorkflowIr;
  const primaryResource = sampleLibraryState.resources[0];
  const platformCapabilityReview = useMemo(() => reviewPlatformCapabilityClassifierGate(), []);
  const sourceRoundTripHandoff = useMemo(() => createSourceRoundTripHandoff(), []);
  const {
    artifactReceiptViewerSurface,
    blockedGraphRunPlan,
    curatedAdapterLane,
    curatedAdapterRuntime,
    durableRunLedgerSurface,
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
    logsArtifactWorkbenchSurface,
    workflowTemplateRunPlanBuilderSurface,
    permissionCenterSurface,
    runHistoryEvidence,
    runDashboardQueueMonitorSurface,
    runtimePrerequisiteReadinessSurface,
    runnerControlSurface,
    runnerEventStream,
    runnerPermissionBlockedReview,
    runnerPermissionReview,
    runnerSession,
    runnerStartAllowed,
    watchdogSupervisorSurface
  } = useRunnerWorkspaceState({ activeWorkflowIr, blockedWorkflowIr });
  const editableWorkflowIr = {
    ...activeWorkflowIr,
    nodes: activeWorkflowIr.nodes.map((node: { id: string; type: string }) => ({ ...node }))
  };
  const workflowEditor = createWorkflowEditorState(editableWorkflowIr, { createdAt: "2026-06-11T00:15:00.000Z" });
  const workflowEdit = applyWorkflowEdit(
    workflowEditor,
    {
      type: "add-node",
      node: {
        id: "audit-summary",
        type: "viewer",
        label: "Audit summary",
        inputs: ["handoffDescriptor"],
        outputs: ["auditArtifact"],
        risk: "low",
        credentials: []
      }
    },
    { updatedAt: "2026-06-11T00:16:00.000Z" }
  );
  const workflowEditedState = workflowEdit.ok ? workflowEdit.state : workflowEditor;
  const workflowUndoState = undoWorkflowEdit(workflowEditedState);
  const workflowRedoState = redoWorkflowEdit(workflowUndoState);
  const rawWorkflowMutation = applyWorkflowEdit(workflowEditor, {
    type: "mutate-raw",
    rawFormat: "n8n",
    rawPayload: { nodes: [] }
  });
  const workflowDiff = workflowEditedState.lastDiff;
  const workflowReview = validateWorkflowIr(activeWorkflowIr);
  const adapterReview = useMemo(() => reviewAdapterPack(sampleAdapterPack, sampleAdapterPolicy, primaryResource), [primaryResource]);
  const adapterPackExpansion = useMemo(() => createPythonNodeAdapterPackExpansion(), []);
  const externalAgentClientPackExpansion = useMemo(() => createExternalAgentClientPackExpansion(), []);
  const mcpBridgeReadiness = useMemo(() => createMcpBridgeReadinessDescriptor(), []);
  const wasmWasiSandboxGate = useMemo(
    () => ({
      review: createWasmWasiSandboxReview(),
      gate: reviewWasmWasiSandboxGate()
    }),
    []
  );
  const rootlessContainerPreflightGate = useMemo(
    () => ({
      review: createRootlessContainerPreflightReview(),
      gate: reviewRootlessContainerPreflightGate()
    }),
    []
  );
  const browserAutomationConsentGate = useMemo(
    () => ({
      review: createBrowserAutomationConsentReview(),
      gate: reviewBrowserAutomationConsentGate()
    }),
    []
  );
  const localVaultSecretsUx = useMemo(
    () => ({
      review: createLocalVaultSecretsReview(),
      gate: reviewLocalVaultSecretsGate()
    }),
    []
  );
  const repoLocalTaskRunnerLane = useMemo(() => createRepoLocalTaskRunnerLane(), []);
  const registryReview = useMemo(
    () =>
      reviewAdapterRegistryManifestTrustPolicy(sampleAdapterRegistry, sampleAdapterPack, primaryResource, {
        platform: "windows",
        targetHost: "agentique-ui",
        profile: "review",
        mode: "local"
      }),
    [primaryResource]
  );
  const adapterUpdateDecision = useMemo(
    () =>
      resolveAdapterUpdate(sampleAdapterRegistry, {
        adapterId: "adapter.visual-python",
        version: "0.0.9"
      }),
    []
  );
  const pythonLaunchPlan = useMemo(() => createSidecarLaunchPlan(samplePythonSidecarRequest), []);
  const nodeLaunchPlan = useMemo(() => createSidecarLaunchPlan(sampleNodeSidecarRequest), []);
  const permissionAudit = useMemo(() => evaluatePermissionBatch(samplePermissionPolicy, samplePermissionRequests), []);
  const permissionCenterBaseline = useMemo(() => createPermissionCenterSurface(), []);
  const activePermissionCenterSurface = permissionCenterSurface ?? permissionCenterBaseline;
  const diagnosticsSupportBundle = useMemo(
    () => ({
      review: createDiagnosticsSupportBundleReview({
        runDashboardQueueMonitorSurface,
        logsArtifactWorkbenchSurface,
        permissionCenterSurface: activePermissionCenterSurface,
        registryReview,
        runtimePrerequisiteReadinessSurface,
        localVaultSecretsUx
      }),
      gate: reviewDiagnosticsSupportBundleGate()
    }),
    [activePermissionCenterSurface, localVaultSecretsUx, logsArtifactWorkbenchSurface, registryReview, runDashboardQueueMonitorSurface, runtimePrerequisiteReadinessSurface]
  );
  const functionExpansionCloseout = useMemo(
    () => ({
      review: createFunctionExpansionCloseoutReview(),
      gate: reviewFunctionExpansionCloseoutGate()
    }),
    []
  );
  const runFolderManifest = useMemo(() => createRunFolderManifest(sampleRunFolderInput), []);

  if (activeNav === "graph") {
    return (
      <GraphWorkspace
        onApproveRunnerPermissions={handleApproveRunnerPermissions}
        onCancelRunner={handleCancelRunner}
        onFailRunner={handleFailureRunner}
        onRetryRunner={handleRetryRunner}
        onRevokeRunnerPermissions={handleRevokeRunnerPermissions}
        onShowBlockedRunnerPermissions={handleShowBlockedRunnerPermissions}
        onStartRunner={handleStartRunner}
        onWorkflowTemplateBuilderScenario={handleWorkflowTemplateBuilderScenario}
        rawWorkflowMutation={rawWorkflowMutation}
        blockedGraphRunPlan={blockedGraphRunPlan}
        graphRunPlan={graphRunPlan}
        externalHandoffDescriptors={externalHandoffDescriptors}
        platformCapabilityReview={platformCapabilityReview}
        runnerPermissionBlockedReview={runnerPermissionBlockedReview}
        runnerPermissionReview={runnerPermissionReview}
        runnerStartAllowed={runnerStartAllowed}
        runnerSession={runnerSession}
        runnerEventStream={runnerEventStream}
        humanApprovalInterrupt={humanApprovalInterrupt}
        sampleWorkflowIr={activeWorkflowIr}
        workflowTemplateRunPlanBuilderSurface={workflowTemplateRunPlanBuilderSurface}
        workflowDiff={workflowDiff}
        workflowEdit={workflowEdit}
        workflowEditedState={workflowEditedState}
        workflowRedoState={workflowRedoState}
        workflowReview={workflowReview}
        workflowUndoState={workflowUndoState}
      />
    );
  }

  return (
    <RunWorkspace
      adapterReview={adapterReview}
      adapterPackExpansion={adapterPackExpansion}
      adapterUpdateDecision={adapterUpdateDecision}
      artifactReceiptViewerSurface={artifactReceiptViewerSurface}
      durableRunLedgerSurface={durableRunLedgerSurface}
      graphRunPlan={graphRunPlan}
      platformCapabilityReview={platformCapabilityReview}
      nodeLaunchPlan={nodeLaunchPlan}
      curatedAdapterLane={curatedAdapterLane}
      curatedAdapterRuntime={curatedAdapterRuntime}
      onApproveRunnerPermissions={handleApproveRunnerPermissions}
      onCancelRunner={handleCancelRunner}
      onFailRunner={handleFailureRunner}
      onRetryRunner={handleRetryRunner}
      onArtifactReceiptScenario={handleArtifactReceiptScenario}
      onDurableRunLedgerAction={handleDurableRunLedgerAction}
      onRunnerControlAction={handleRunnerControlAction}
      onPermissionCenterScenario={handlePermissionCenterScenario}
      onRunDashboardScenario={handleRunDashboardScenario}
      onLogsArtifactFilter={handleLogsArtifactFilter}
      onWorkflowTemplateBuilderScenario={handleWorkflowTemplateBuilderScenario}
      onWatchdogSupervisorScenario={handleWatchdogSupervisorScenario}
      onRevokeRunnerPermissions={handleRevokeRunnerPermissions}
      onSelectCuratedAdapterLane={handleSelectCuratedAdapterLane}
      onShowBlockedRunnerPermissions={handleShowBlockedRunnerPermissions}
      onStartRunner={handleStartRunner}
      permissionAudit={permissionAudit}
      permissionCenterSurface={activePermissionCenterSurface}
      pythonLaunchPlan={pythonLaunchPlan}
      registryReview={registryReview}
      runFolderManifest={runFolderManifest}
      repoLocalTaskRunnerLane={repoLocalTaskRunnerLane}
      runHistoryEvidence={runHistoryEvidence}
      runDashboardQueueMonitorSurface={runDashboardQueueMonitorSurface}
      logsArtifactWorkbenchSurface={logsArtifactWorkbenchSurface}
      mcpBridgeReadiness={mcpBridgeReadiness}
      wasmWasiSandboxGate={wasmWasiSandboxGate}
      rootlessContainerPreflightGate={rootlessContainerPreflightGate}
      browserAutomationConsentGate={browserAutomationConsentGate}
      diagnosticsSupportBundle={diagnosticsSupportBundle}
      localVaultSecretsUx={localVaultSecretsUx}
      workflowTemplateRunPlanBuilderSurface={workflowTemplateRunPlanBuilderSurface}
      multiLaneExecutionReadinessSurface={multiLaneExecutionReadinessSurface}
      runtimePrerequisiteReadinessSurface={runtimePrerequisiteReadinessSurface}
      runnerControlSurface={runnerControlSurface}
      runnerEventStream={runnerEventStream}
      watchdogSupervisorSurface={watchdogSupervisorSurface}
      externalAgentClientPackExpansion={externalAgentClientPackExpansion}
      externalHandoffDescriptors={externalHandoffDescriptors}
      functionExpansionCloseout={functionExpansionCloseout}
      sourceRoundTripHandoff={sourceRoundTripHandoff}
      humanApprovalInterrupt={humanApprovalInterrupt}
      humanApprovalResumeRerunSurface={humanApprovalResumeRerunSurface}
      onHumanApprovalAction={handleHumanApprovalAction}
      onHumanApprovalResumeRerunScenario={handleHumanApprovalResumeRerunScenario}
      onRuntimePrerequisiteScenario={handleRuntimePrerequisiteScenario}
      runnerPermissionBlockedReview={runnerPermissionBlockedReview}
      runnerPermissionReview={runnerPermissionReview}
      runnerStartAllowed={runnerStartAllowed}
      runnerSession={runnerSession}
      blockedGraphRunPlan={blockedGraphRunPlan}
      onRunHistoryAction={handleRunHistoryAction}
    />
  );
}
