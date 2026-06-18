import { type PointerEvent, type WheelEvent, useMemo, useState } from "react";
import { Code2, Maximize2, Minimize2, PanelRight, Plus, RotateCcw, Search, ShieldCheck, X, ZoomIn, ZoomOut } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import { WorkflowTemplateRunPlanBuilderPanel } from "./WorkflowTemplateRunPlanBuilderPanel";
import {
  canvasHeight,
  canvasWidth,
  clamp,
  defaultLayout,
  getEdgePath,
  getInitialGraphViewport,
  graphNodeIcons,
  maxZoom,
  minZoom,
  nodeHeight,
  nodeWidth,
  supportedNodeTypes
} from "./GraphWorkspaceModel";
import type { AnyRecord, GraphDragState, GraphEdge, GraphNode, GraphPosition, GraphViewport, RunnerUiSession } from "./GraphWorkspaceModel";
import type { WorkflowTemplateBuilderScenario } from "./TrustRunSettingsTypes";

export function GraphWorkspace({
  onApproveRunnerPermissions,
  onCancelRunner,
  onFailRunner,
  onRetryRunner,
  onRevokeRunnerPermissions,
  onShowBlockedRunnerPermissions,
  onStartRunner,
  onWorkflowTemplateBuilderScenario,
  blockedGraphRunPlan,
  graphRunPlan,
  externalHandoffDescriptors,
  humanApprovalInterrupt,
  platformCapabilityReview,
  rawWorkflowMutation,
  runnerPermissionBlockedReview,
  runnerPermissionReview,
  runnerStartAllowed,
  runnerSession,
  runnerEventStream,
  sampleWorkflowIr,
  workflowTemplateRunPlanBuilderSurface,
  workflowDiff,
  workflowEdit,
  workflowEditedState,
  workflowRedoState,
  workflowReview,
  workflowUndoState
}: {
  onApproveRunnerPermissions: () => void;
  onCancelRunner: () => void;
  onFailRunner: () => void;
  onRetryRunner: () => void;
  onRevokeRunnerPermissions: () => void;
  onShowBlockedRunnerPermissions: () => void;
  onStartRunner: () => void;
  onWorkflowTemplateBuilderScenario: (scenario: WorkflowTemplateBuilderScenario) => void;
  blockedGraphRunPlan: AnyRecord;
  graphRunPlan: AnyRecord;
  externalHandoffDescriptors: AnyRecord;
  humanApprovalInterrupt: AnyRecord;
  platformCapabilityReview: AnyRecord;
  rawWorkflowMutation: AnyRecord;
  runnerPermissionBlockedReview: AnyRecord;
  runnerPermissionReview: AnyRecord;
  runnerStartAllowed: boolean;
  runnerSession: RunnerUiSession;
  runnerEventStream: AnyRecord;
  sampleWorkflowIr: AnyRecord;
  workflowTemplateRunPlanBuilderSurface: AnyRecord;
  workflowDiff: AnyRecord;
  workflowEdit: AnyRecord;
  workflowEditedState: AnyRecord;
  workflowRedoState: AnyRecord;
  workflowReview: AnyRecord;
  workflowUndoState: AnyRecord;
}) {
  const { t } = useI18n();
  const nodes = workflowReview.nodes as GraphNode[];
  const edges = workflowReview.edges as GraphEdge[];
  const [selectedNodeId, setSelectedNodeId] = useState(nodes[1]?.id ?? nodes[0]?.id ?? "");
  const [viewport, setViewport] = useState<GraphViewport>(() => getInitialGraphViewport());
  const [nodePositions, setNodePositions] = useState<Record<string, GraphPosition>>(() => defaultLayout);
  const [dragState, setDragState] = useState<GraphDragState | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isRunnerPanelExpanded, setIsRunnerPanelExpanded] = useState(false);

  const layoutNodes = useMemo(
    () =>
      nodes.map((node, index) => ({
        ...node,
        unsupported: !supportedNodeTypes.has(node.type),
        x: nodePositions[node.id]?.x ?? defaultLayout[node.id]?.x ?? 84 + (index % 4) * 226,
        y: nodePositions[node.id]?.y ?? 180 + Math.floor(index / 4) * 180
      })),
    [nodePositions, nodes]
  );

  const selectedNode = layoutNodes.find((node) => node.id === selectedNodeId) ?? layoutNodes[0];
  const positionById = new Map(layoutNodes.map((node) => [node.id, node]));
  const unsupportedNodes = layoutNodes.filter((node) => node.unsupported);
  const credentialNodes = layoutNodes.filter((node) => node.credentials.length > 0);
  const platformCapabilityRows = (platformCapabilityReview.matrixRows ?? []).slice(0, 6);
  const graphCapabilityRows = [
    {
      label: "Executable",
      value: `${graphRunPlan.summary.executable} local node`,
      detail: "allowlisted scheduler path"
    },
    {
      label: "Permission required",
      value: `${runnerPermissionReview.summary.required} grant`,
      detail: runnerPermissionReview.ok ? "preflight allowed" : "preflight blocked"
    },
    {
      label: "Blocked",
      value: `${graphRunPlan.summary.blocked} node`,
      detail: "fail-closed by default"
    },
    {
      label: "Handoff only",
      value: `${graphRunPlan.summary.handoffOnly} path`,
      detail: "external runtime boundary"
    }
  ];

  const updateZoom = (nextScale: number) => {
    setViewport((current) => ({
      ...current,
      scale: clamp(Number(nextScale.toFixed(2)), minZoom, maxZoom)
    }));
  };

  const handleToggleInspector = () => {
    setIsInspectorOpen((isOpen) => {
      const nextIsOpen = !isOpen;
      if (nextIsOpen) {
        setIsRunnerPanelExpanded(false);
      }
      return nextIsOpen;
    });
  };

  const handleExpandRunnerPanel = () => {
    setIsInspectorOpen(false);
    setIsRunnerPanelExpanded(true);
  };

  const handleFitGraph = () => {
    setViewport(getInitialGraphViewport());
    setSelectedNodeId(unsupportedNodes[0]?.id ?? layoutNodes[0]?.id ?? "");
  };

  const handleCanvasPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // IMPORTANT: floating controls must not start canvas panning; it blocks reliable button activation.
    const target = event.target as HTMLElement;
    if (target.closest(".graph-node-button") || target.closest(".graph-runner-panel, .graph-runner-toggle, .node-inspector, .graph-side-tools")) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      kind: "canvas",
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: viewport.x,
      startY: viewport.y
    });
  };

  const handleNodePointerDown = (event: PointerEvent<HTMLButtonElement>, nodeId: string) => {
    const node = positionById.get(nodeId);
    if (!node) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedNodeId(nodeId);
    setDragState({
      kind: "node",
      pointerId: event.pointerId,
      nodeId,
      originX: event.clientX,
      originY: event.clientY,
      startX: node.x,
      startY: node.y
    });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    if (dragState.kind === "canvas") {
      setViewport((current) => ({
        ...current,
        x: dragState.startX + event.clientX - dragState.originX,
        y: dragState.startY + event.clientY - dragState.originY
      }));
      return;
    }
    const deltaX = (event.clientX - dragState.originX) / viewport.scale;
    const deltaY = (event.clientY - dragState.originY) / viewport.scale;
    setNodePositions((current) => ({
      ...current,
      [dragState.nodeId]: {
        x: clamp(dragState.startX + deltaX, 0, canvasWidth - nodeWidth),
        y: clamp(dragState.startY + deltaY, 0, canvasHeight - nodeHeight)
      }
    }));
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (dragState?.pointerId === event.pointerId) {
      setDragState(null);
    }
  };

  const handleCanvasWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const nextScale = clamp(Number((viewport.scale + (event.deltaY > 0 ? -0.08 : 0.08)).toFixed(2)), minZoom, maxZoom);
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const contentX = (pointerX - viewport.x) / viewport.scale;
    const contentY = (pointerY - viewport.y) / viewport.scale;
    setViewport({
      scale: nextScale,
      x: pointerX - contentX * nextScale,
      y: pointerY - contentY * nextScale
    });
  };

  return (
    <div className="workspace-stack" data-page="graph">
      <section className="workspace-section graph-workspace" aria-labelledby="graph-heading">
        <div className="graph-editor-shell">
          <header className="graph-editor-header">
            <div className="graph-project-title">
              <p className="caption">{t("workspace.graph.caption")}</p>
              <h2 id="graph-heading">{t("workspace.graph.title")}</h2>
              <span>{t("workspace.graph.subtitle")}</span>
            </div>
            <div className="graph-mode-tabs" aria-label={t("workspace.graph.modeLabel")}>
              <button aria-pressed="true" type="button">
                {t("workspace.graph.editor")}
              </button>
              <button aria-pressed="false" type="button">
                {t("workspace.graph.executions")}
              </button>
              <button aria-pressed="false" type="button">
                {t("workspace.graph.evaluations")}
              </button>
            </div>
            <div className="graph-editor-actions" aria-label={t("workspace.graph.validationSummary")}>
              <span>{workflowReview.summary.nodes} nodes</span>
              <span>{workflowReview.summary.edges} edges</span>
              <button className="graph-publish-button" type="button">
                <span aria-hidden="true" />
                {t("workspace.graph.review")}
              </button>
            </div>
          </header>

          <div className="graph-toolbar" aria-label={t("workspace.graph.canvasControls")}>
            <button aria-label="Zoom in" title="Zoom in" type="button" onClick={() => updateZoom(viewport.scale + 0.1)}>
              <ZoomIn aria-hidden="true" size={18} />
            </button>
            <button aria-label="Zoom out" title="Zoom out" type="button" onClick={() => updateZoom(viewport.scale - 0.1)}>
              <ZoomOut aria-hidden="true" size={18} />
            </button>
            <button aria-label="Fit graph" title="Fit graph" type="button" onClick={handleFitGraph}>
              <RotateCcw aria-hidden="true" size={18} />
            </button>
            <span aria-label="Current graph zoom">{Math.round(viewport.scale * 100)}%</span>
          </div>
          <div className="graph-capability-matrix" aria-label={t("workspace.graph.capabilityMatrix")}>
            {graphCapabilityRows.map((row) => (
              <div className="graph-capability-row" key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
                <small>{row.detail}</small>
              </div>
            ))}
          </div>

          <div className="graph-layout">
            <div
              className="workflow-canvas"
              aria-label={t("workspace.graph.canvasLabel")}
              onPointerCancel={handlePointerEnd}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onWheel={handleCanvasWheel}
              style={{
                ["--graph-pan-x" as string]: `${viewport.x}px`,
                ["--graph-pan-y" as string]: `${viewport.y}px`,
                ["--graph-scale" as string]: viewport.scale
              }}
            >
              <div className="graph-canvas-glow" aria-hidden="true" />
              <div className="graph-viewport" data-graph-viewport="interactive">
                <svg aria-hidden="true" className="graph-edge-layer" focusable="false" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
                  <defs>
                    <marker id="graph-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="6" refY="4">
                      <path d="M0,0 L8,4 L0,8 Z" />
                    </marker>
                    <filter id="graph-edge-glow" x="-40%" y="-40%" width="180%" height="180%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  {edges.map((edge) => {
                    const from = positionById.get(edge.from);
                    const to = positionById.get(edge.to);
                    if (!from || !to) {
                      return null;
                    }
                    const startX = from.x + nodeWidth;
                    const startY = from.y + 38;
                    const endX = to.x;
                    const endY = to.y + 38;
                    const path = getEdgePath(startX, startY, endX, endY);
                    const labelX = (startX + endX) / 2;
                    const labelY = (startY + endY) / 2 - 10;
                    const toNode = positionById.get(edge.to);
                    return (
                      <g className={`graph-edge${toNode?.unsupported ? " graph-edge-risk" : ""}`} key={`${edge.from}-${edge.to}`}>
                        <path d={path} markerEnd="url(#graph-arrow)" />
                        <line x1={startX} x2={startX + 1} y1={startY} y2={startY} />
                        <text x={labelX} y={labelY}>
                          {edge.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <div className="graph-node-layer">
                  {layoutNodes.map((node) => {
                    const NodeIcon = graphNodeIcons[node.type] ?? (node.unsupported ? ShieldCheck : Code2);
                    return (
                      <button
                        aria-pressed={node.id === selectedNode?.id}
                        className={`graph-node-button risk-${node.risk}${node.unsupported ? " unsupported" : ""}`}
                        data-node-id={node.id}
                        key={node.id}
                        onClick={() => setSelectedNodeId(node.id)}
                        onPointerCancel={handlePointerEnd}
                        onPointerDown={(event) => handleNodePointerDown(event, node.id)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerEnd}
                        style={{ left: node.x, top: node.y }}
                        type="button"
                      >
                        <span className="graph-node-icon" aria-hidden="true">
                          <NodeIcon size={20} />
                        </span>
                        <strong>{node.label}</strong>
                        <small>{node.type}</small>
                        <small>
                          {node.inputs.length} in / {node.outputs.length} out
                        </small>
                        {node.credentials.length > 0 ? <small>{node.credentials.length} credential reference</small> : <small>No credentials</small>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="graph-side-tools" aria-label="Graph quick tools">
                <button aria-label="Add graph node" title="Add graph node" type="button">
                  <Plus aria-hidden="true" size={19} />
                </button>
                <button aria-label="Search graph" title="Search graph" type="button">
                  <Search aria-hidden="true" size={19} />
                </button>
                <button
                  aria-label={isInspectorOpen ? "Hide graph inspector" : "Show graph inspector"}
                  aria-pressed={isInspectorOpen}
                  className="graph-overlay-toggle"
                  title="Toggle graph inspector"
                  type="button"
                  onClick={handleToggleInspector}
                >
                  <PanelRight aria-hidden="true" size={19} />
                </button>
              </div>

              {isInspectorOpen ? (
                <aside className="node-inspector" aria-label="Node inspector">
                  <div className="graph-panel-header">
                    <div className="section-heading">
                      <p className="caption">Node inspector</p>
                      <h3>{selectedNode?.label ?? "No node selected"}</h3>
                    </div>
                    <button className="graph-panel-icon-button" aria-label="Close node inspector" type="button" onClick={() => setIsInspectorOpen(false)}>
                      <X aria-hidden="true" size={16} />
                    </button>
                  </div>
                  {selectedNode ? (
                    <dl className="inspector-fields">
                      <div>
                        <dt>Node id</dt>
                        <dd>{selectedNode.id}</dd>
                      </div>
                      <div>
                        <dt>Type</dt>
                        <dd>{selectedNode.type}</dd>
                      </div>
                      <div>
                        <dt>Risk</dt>
                        <dd>{selectedNode.risk}</dd>
                      </div>
                      <div>
                        <dt>IO</dt>
                        <dd>
                          {selectedNode.inputs.length} input / {selectedNode.outputs.length} output
                        </dd>
                      </div>
                      <div>
                        <dt>Credentials</dt>
                        <dd>{selectedNode.credentials.length}</dd>
                      </div>
                      <div>
                        <dt>Unsupported</dt>
                        <dd>{selectedNode.unsupported ? "blocked" : "supported"}</dd>
                      </div>
                    </dl>
                  ) : null}
                </aside>
              ) : null}
              {isRunnerPanelExpanded ? (
                <aside className="graph-runner-panel" aria-label="Graph runner execution controls" data-runner-status={runnerSession.status} id="graph-runner-controls">
                  <div className="graph-panel-header">
                    <div className="section-heading">
                      <p className="caption">Execution</p>
                      <h3>Runner controls</h3>
                    </div>
                    <button
                      aria-controls="graph-runner-controls"
                      aria-expanded="true"
                      aria-label="Minimize graph runner controls"
                      className="graph-panel-icon-button"
                      type="button"
                      onClick={() => setIsRunnerPanelExpanded(false)}
                    >
                      <Minimize2 aria-hidden="true" size={16} />
                    </button>
                  </div>
                  <div className="runner-status-line" aria-label="Graph runner status">
                    <strong>{runnerSession.status}</strong>
                    <span>{runnerPermissionReview.ok ? "permission preflight allowed" : "permission preflight blocked"}</span>
                  </div>
                  <div className="runner-actions" aria-label="Graph start cancel controls">
                    <button className="secondary-action" type="button" onClick={onApproveRunnerPermissions}>
                      Approve scoped grants
                    </button>
                    <button className="secondary-action" type="button" onClick={onRevokeRunnerPermissions}>
                      Revoke network grant
                    </button>
                    <button className="secondary-action" type="button" onClick={onShowBlockedRunnerPermissions}>
                      Blocked grants
                    </button>
                    <button aria-label="Start reviewed run" className="primary-action" disabled={!runnerStartAllowed} type="button" onClick={onStartRunner}>
                      Start
                    </button>
                    <button aria-label="Cancel active run" className="secondary-action" disabled={runnerSession.status === "idle"} type="button" onClick={onCancelRunner}>
                      Cancel
                    </button>
                  </div>
                  <div className="runner-actions runner-scenario-actions" aria-label="Runner retry and failure evidence">
                    <button className="secondary-action" disabled={!runnerStartAllowed} type="button" onClick={onRetryRunner}>
                      Retry sample
                    </button>
                    <button className="secondary-action" disabled={!runnerStartAllowed} type="button" onClick={onFailRunner}>
                      Failure sample
                    </button>
                  </div>
                  <div className="runner-mini-evidence" aria-label="Graph runner logs and artifacts">
                    <span>{runnerSession.summary.events} events</span>
                    <span>{runnerPermissionReview.summary.blocked} grant blockers</span>
                    <span>{runnerSession.summary.retries} retry</span>
                    <span>{runnerSession.summary.skipped} skipped</span>
                    <span>{runnerSession.summary.artifacts} artifacts</span>
                    <span>{runnerSession.summary.cleanup} cleanup</span>
                  </div>
                  <ol className="runner-timeline-strip" aria-label="Graph runner compact timeline">
                    {runnerEventStream.schedulerEvents.slice(0, 6).map((event: AnyRecord) => (
                      <li className={event.type} key={event.id}>
                        <span>{event.type}</span>
                        <strong>{event.nodeId}</strong>
                        <small>{event.id}</small>
                      </li>
                    ))}
                  </ol>
                </aside>
              ) : (
                <button
                  aria-controls="graph-runner-controls"
                  aria-expanded="false"
                  aria-label="Expand graph runner controls"
                  className="graph-runner-toggle"
                  data-runner-status={runnerSession.status}
                  type="button"
                  onClick={handleExpandRunnerPanel}
                >
                  <span>Runner controls</span>
                  <strong>{runnerSession.status}</strong>
                  <small>{runnerPermissionReview.ok ? "preflight allowed" : "preflight blocked"}</small>
                  <Maximize2 aria-hidden="true" size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="graph-overlays" aria-label="Validation risk and credential overlays">
          <span>{workflowReview.ok ? "Graph validation passed" : "Graph validation blocked"}</span>
          <span>{unsupportedNodes.length} unsupported node</span>
          <span>{credentialNodes.length} credential-bearing node</span>
          <span>{sampleWorkflowIr.sourceLinks.map((link: { label: string }) => link.label).join(" / ")}</span>
        </div>
        <details className="graph-evidence-disclosure">
          <summary>
            <span className="graph-evidence-title">Execution evidence</span>
            <span className="graph-evidence-summary">
              <span>{`Run plan ${graphRunPlan.status}`}</span>
              <span>{`Preflight ${runnerPermissionReview.status}`}</span>
              <span>{`Checkpoint ${humanApprovalInterrupt.checkpoint.status}`}</span>
              <span>{`${externalHandoffDescriptors.summary.descriptors} handoff descriptor${externalHandoffDescriptors.summary.descriptors === 1 ? "" : "s"}`}</span>
            </span>
          </summary>
          <div className="graph-evidence-body">
            <section className="graph-evidence-section" aria-label="Graph run plan gate">
              <header>
                <h3>Run plan gate</h3>
                <span>{graphRunPlan.startDecision}</span>
              </header>
              <div className="graph-evidence-row">
                <span>Run plan</span>
                <strong>{graphRunPlan.status}</strong>
                <small>{`${graphRunPlan.summary.blocked} blocked / ${graphRunPlan.summary.permissionRequired} permission`}</small>
              </div>
            </section>

            <ol className="graph-evidence-list" aria-label="Graph run plan node classifications">
              {graphRunPlan.nodePlans.slice(0, 5).map((node: AnyRecord) => (
                <li className={node.classification} key={node.id}>
                  <span>{node.label}</span>
                  <strong>{node.classification}</strong>
                  <small>{node.reasons[0]?.message ?? "reviewed"}</small>
                </li>
              ))}
            </ol>

            <section className="graph-evidence-section" aria-label="Graph approval checkpoint evidence">
              <header>
                <h3>Approval checkpoint</h3>
                <span>{humanApprovalInterrupt.resumeGate.status}</span>
              </header>
              <div className="graph-evidence-row">
                <span>Checkpoint</span>
                <strong>{humanApprovalInterrupt.checkpoint.status}</strong>
                <small>{humanApprovalInterrupt.checkpoint.checkpointId}</small>
              </div>
              <div className="graph-evidence-row">
                <span>Decision</span>
                <strong>{humanApprovalInterrupt.decision.status}</strong>
                <small>{humanApprovalInterrupt.decision.type}</small>
              </div>
              <div className="graph-evidence-row">
                <span>Resume gate</span>
                <strong>{humanApprovalInterrupt.resumeGate.status}</strong>
                <small>{humanApprovalInterrupt.resumeGate.code}</small>
              </div>
            </section>

            <section className="graph-evidence-section" aria-label="Graph permission preflight review">
              <header>
                <h3>Permission preflight</h3>
                <span>{`${runnerPermissionReview.summary.allowed}/${runnerPermissionReview.summary.required} grants allowed`}</span>
              </header>
              <div className="graph-evidence-row">
                <span>Permission preflight</span>
                <strong>{runnerPermissionReview.status}</strong>
                <small>{`${runnerPermissionReview.summary.allowed}/${runnerPermissionReview.summary.required} grants allowed`}</small>
              </div>
              <div className="graph-evidence-row">
                <span>Audit export</span>
                <strong>{runnerPermissionReview.auditArtifact.path}</strong>
                <small>{`${runnerPermissionReview.auditArtifact.events} redacted event(s)`}</small>
              </div>
              <div className="graph-evidence-row">
                <span>Blocked sample</span>
                <strong>{runnerPermissionBlockedReview.summary.blocked}</strong>
                <small>expired / wrong-run / hidden / ambient / shell</small>
              </div>
            </section>

            <ol className="graph-evidence-list" aria-label="Graph required runner grants">
              {runnerPermissionReview.requirements.slice(0, 5).map((requirement: AnyRecord) => (
                <li className={requirement.status} key={`${requirement.family}-${requirement.action}-${requirement.code}`}>
                  <span>{requirement.family}</span>
                  <strong>{requirement.status}</strong>
                  <small>{requirement.message}</small>
                </li>
              ))}
            </ol>

            <section className="graph-evidence-section" aria-label="Blocked high-risk run plan sample">
              <header>
                <h3>Blocked sample plan</h3>
                <span>{blockedGraphRunPlan.status}</span>
              </header>
              <div className="graph-evidence-row">
                <span>Blocked sample plan</span>
                <strong>{`${blockedGraphRunPlan.summary.blocked} blocked / ${blockedGraphRunPlan.summary.handoffOnly} handoff`}</strong>
                <small>Unsupported and high-risk nodes remain outside the deterministic scheduler path.</small>
              </div>
            </section>

            <section className="graph-evidence-section" aria-label="Graph external handoff descriptors">
              <header>
                <h3>External handoff</h3>
                <span>{externalHandoffDescriptors.status}</span>
              </header>
              <div className="graph-evidence-row">
                <span>Handoff descriptors</span>
                <strong>{externalHandoffDescriptors.summary.descriptors}</strong>
                <small>{externalHandoffDescriptors.status}</small>
              </div>
              <div className="graph-evidence-row">
                <span>Blocked rows</span>
                <strong>{externalHandoffDescriptors.summary.blocked}</strong>
                <small>{externalHandoffDescriptors.summary.handoffOnly} handoff-only</small>
              </div>
              <div className="graph-evidence-row">
                <span>Bridge</span>
                <strong>{externalHandoffDescriptors.bridgeBoundary.startsBridge ? "enabled" : "disabled"}</strong>
                <small>{externalHandoffDescriptors.bridgeBoundary.requiresSeparateBridgeGate ? "separate gate required" : "no gate"}</small>
              </div>
            </section>

            <ol className="graph-evidence-list" aria-label="Graph runner node result evidence">
              {runnerSession.nodeResults.slice(0, 5).map((node: AnyRecord) => (
                <li className={node.status} key={`${node.nodeId}-${node.status}`}>
                  <span>{node.nodeId}</span>
                  <strong>{node.status}</strong>
                  <small>{`${node.attempts} attempt${node.attempts === 1 ? "" : "s"}`}</small>
                </li>
              ))}
            </ol>

            <section className="graph-evidence-section" aria-label="Graph runner cleanup receipt">
              <header>
                <h3>Cleanup</h3>
                <span>{runnerSession.cleanup.status}</span>
              </header>
              <div className="graph-evidence-row">
                <span>Cleanup</span>
                <strong>{runnerSession.cleanup.status}</strong>
                <small>{`${runnerSession.cleanup.terminalRunStatus} / ${runnerSession.cleanup.removed.length} transient record(s)`}</small>
              </div>
            </section>

            <section className="graph-evidence-section" aria-label="Platform capability classification matrix">
              <header>
                <h3>Platform capability classification</h3>
                <span>{`${platformCapabilityReview.summary.sourceFamilies} source families / ${platformCapabilityReview.summary.blocked} blocked`}</span>
              </header>
              <ol className="graph-evidence-list">
                {platformCapabilityRows.map((row: AnyRecord, index: number) => (
                  <li key={`${row.platform}-${row.sourceFamily}-${row.primaryClassification}-${index}`}>
                    <span>{`${row.platform} / ${row.sourceFamily}`}</span>
                    <strong>{row.primaryClassification}</strong>
                    <small>{row.executionLane}</small>
                  </li>
                ))}
              </ol>
            </section>

            <section className="graph-evidence-section" aria-label="Workflow editor state summary">
              <header>
                <h3>Editor state</h3>
                <span>{workflowEditedState.operationMode}</span>
              </header>
              <div className="graph-evidence-row">
                <span>Validation</span>
                <strong>{workflowEditedState.validation.ok ? "valid" : "blocked"}</strong>
                <small>{`${workflowEditedState.past.length} undo / ${workflowUndoState.future.length} redo`}</small>
              </div>
            </section>

            <WorkflowTemplateRunPlanBuilderPanel
              workflowTemplateRunPlanBuilderSurface={workflowTemplateRunPlanBuilderSurface}
              onWorkflowTemplateBuilderScenario={onWorkflowTemplateBuilderScenario}
            />

            <section className="graph-evidence-section" aria-label="Workflow diff summary">
              <header>
                <h3>Diff summary</h3>
                <span>{`${workflowDiff.summary.addedNodes} node / ${workflowDiff.summary.addedEdges} edge`}</span>
              </header>
              <div className="graph-evidence-row">
                <span>Latest accepted edit</span>
                <strong>{workflowEdit.ok ? workflowDiff.addedNodes.join(", ") : "none"}</strong>
                <small>Redo restores {workflowRedoState.present.nodes.length} nodes after undo.</small>
              </div>
            </section>

            <div className="graph-evidence-status" role="status">
              <strong>Raw external workflow mutation blocked</strong>
              <span>{rawWorkflowMutation.errors[0]?.message ?? "Raw workflow mutation is blocked."}</span>
              <span>Unsupported nodes fail closed; graph editing describes changes before guarded local execution can be reviewed.</span>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
