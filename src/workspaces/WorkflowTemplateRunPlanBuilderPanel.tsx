import { Boxes, FileCode2, GitBranch, RotateCcw, ShieldCheck } from "lucide-react";
import type { AnyRecord, WorkflowTemplateBuilderScenario } from "./TrustRunSettingsTypes";

type WorkflowTemplateRunPlanBuilderPanelProps = {
  workflowTemplateRunPlanBuilderSurface: AnyRecord;
  onWorkflowTemplateBuilderScenario: (scenario: WorkflowTemplateBuilderScenario) => void;
};

const scenarioIcons = {
  catalog: Boxes,
  "approval-template": ShieldCheck,
  "artifact-template": FileCode2,
  "missing-secret": ShieldCheck,
  "human-gate": ShieldCheck,
  "unsupported-node": GitBranch,
  "rerun-ready": RotateCcw
};

export function WorkflowTemplateRunPlanBuilderPanel({ workflowTemplateRunPlanBuilderSurface, onWorkflowTemplateBuilderScenario }: WorkflowTemplateRunPlanBuilderPanelProps) {
  const selectedTemplate = workflowTemplateRunPlanBuilderSurface.selectedTemplate;
  const firstArtifact = workflowTemplateRunPlanBuilderSurface.dryRun.resultArtifacts[0];

  return (
    <section
      className="graph-evidence-section"
      aria-label="Workflow template run-plan builder"
      data-template-builder-scenario={workflowTemplateRunPlanBuilderSurface.activeScenario}
    >
      <header>
        <h3>Workflow template builder</h3>
        <span>{workflowTemplateRunPlanBuilderSurface.builder.status}</span>
      </header>
      <div className="runner-actions" aria-label="Template builder scenario actions">
        {workflowTemplateRunPlanBuilderSurface.scenarioControls.map((scenario: AnyRecord) => {
          const Icon = scenarioIcons[scenario.id as WorkflowTemplateBuilderScenario] ?? Boxes;
          return (
            <button
              aria-pressed={scenario.selected}
              className="secondary-action"
              key={scenario.id}
              type="button"
              onClick={() => onWorkflowTemplateBuilderScenario(scenario.id as WorkflowTemplateBuilderScenario)}
            >
              <Icon aria-hidden="true" size={16} />
              <span>{scenario.label}</span>
            </button>
          );
        })}
      </div>
      <div className="graph-evidence-row">
        <span>Template</span>
        <strong>{selectedTemplate.title}</strong>
        <small>{`${selectedTemplate.category} / ${selectedTemplate.graphState.state}`}</small>
      </div>
      <div className="graph-evidence-row">
        <span>Typed IR</span>
        <strong>{workflowTemplateRunPlanBuilderSurface.workflowIr.schemaVersion}</strong>
        <small>{`${workflowTemplateRunPlanBuilderSurface.graphState.nodes} nodes / ${workflowTemplateRunPlanBuilderSurface.graphState.edges} edges`}</small>
      </div>
      <div className="graph-evidence-row">
        <span>Run plan</span>
        <strong>{workflowTemplateRunPlanBuilderSurface.runPlan.status}</strong>
        <small>{workflowTemplateRunPlanBuilderSurface.runPlan.startDecision}</small>
      </div>
      <div className="graph-evidence-row">
        <span>Secrets</span>
        <strong>{workflowTemplateRunPlanBuilderSurface.secretReview.status}</strong>
        <small>{`${workflowTemplateRunPlanBuilderSurface.secretReview.references.length} reference(s)`}</small>
      </div>
      <div className="graph-evidence-row">
        <span>Human gate</span>
        <strong>{workflowTemplateRunPlanBuilderSurface.humanGateReview.status}</strong>
        <small>{`${workflowTemplateRunPlanBuilderSurface.humanGateReview.gates.length} gate(s)`}</small>
      </div>
      <div className="graph-evidence-row">
        <span>Dry-run artifact</span>
        <strong>{firstArtifact?.descriptor ?? "metadata-only"}</strong>
        <small>{firstArtifact?.path ?? "artifacts/template-builder.json"}</small>
      </div>
      <div className="graph-evidence-row">
        <span>Rerun</span>
        <strong>{workflowTemplateRunPlanBuilderSurface.rerunEligibility.eligible ? "eligible" : "blocked"}</strong>
        <small>{workflowTemplateRunPlanBuilderSurface.rerunEligibility.blockers.join(", ") || workflowTemplateRunPlanBuilderSurface.rerunEligibility.action}</small>
      </div>
    </section>
  );
}
