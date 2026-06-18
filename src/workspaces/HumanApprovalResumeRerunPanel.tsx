import type { AnyRecord, HumanApprovalResumeRerunScenario } from "./TrustRunSettingsTypes";

type HumanApprovalResumeRerunPanelProps = {
  humanApprovalResumeRerunSurface: AnyRecord;
  onHumanApprovalResumeRerunScenario: (scenario: HumanApprovalResumeRerunScenario) => void;
};

export function HumanApprovalResumeRerunPanel({ humanApprovalResumeRerunSurface, onHumanApprovalResumeRerunScenario }: HumanApprovalResumeRerunPanelProps) {
  return (
    <div className="approval-checkpoint-panel" aria-label="Human approval resume rerun UX">
      <div className="section-heading">
        <p className="caption">Approval resume</p>
        <h2>Resume and rerun receipts</h2>
      </div>
      <div className="approval-action-list" aria-label="Approval resume rerun controls">
        {humanApprovalResumeRerunSurface.scenarioControls.map((scenario: AnyRecord) => (
          <button
            aria-pressed={humanApprovalResumeRerunSurface.scenario === scenario.id}
            className="secondary-action"
            key={scenario.id}
            type="button"
            onClick={() => onHumanApprovalResumeRerunScenario(scenario.id as HumanApprovalResumeRerunScenario)}
          >
            {scenario.label}
          </button>
        ))}
      </div>
      <div className="approval-checkpoint-grid compact" aria-label="Approval resume rerun state summary">
        <div>
          <span>Approval</span>
          <strong>{humanApprovalResumeRerunSurface.approval.decisionStatus}</strong>
          <small>{humanApprovalResumeRerunSurface.approval.resumeGate.code}</small>
        </div>
        <div>
          <span>Retry</span>
          <strong>{humanApprovalResumeRerunSurface.retry.status}</strong>
          <small>{humanApprovalResumeRerunSurface.retry.code}</small>
        </div>
        <div>
          <span>Cleanup</span>
          <strong>{humanApprovalResumeRerunSurface.cleanup.status}</strong>
          <small>{humanApprovalResumeRerunSurface.cleanup.required ? "retry blocked" : "retry available"}</small>
        </div>
        <div>
          <span>Receipts</span>
          <strong>{humanApprovalResumeRerunSurface.receipts.length}</strong>
          <small>{humanApprovalResumeRerunSurface.ledger.replayStatus}</small>
        </div>
      </div>
      <ol className="approval-timeline-list" aria-label="Approval resume rerun transition timeline">
        {humanApprovalResumeRerunSurface.transitions.map((transition: AnyRecord) => (
          <li className={transition.status} key={transition.id}>
            <span>{transition.family}</span>
            <strong>{transition.code}</strong>
            <small>{transition.receiptRef}</small>
          </li>
        ))}
      </ol>
      <ol className="approval-timeline-list compact" aria-label="Approval resume rerun receipt ledger">
        {humanApprovalResumeRerunSurface.receipts.map((receipt: AnyRecord) => (
          <li key={receipt.id}>
            <span>{receipt.kind}</span>
            <strong>{receipt.idempotent ? "idempotent" : "blocked"}</strong>
            <small>{receipt.ref}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
