import type { AnyRecord, NativeApprovalScenario } from "./TrustRunSettingsTypes";

type NativeApprovalConsentPanelProps = {
  surface: AnyRecord;
  onScenario: (scenario: NativeApprovalScenario) => void;
};

const scenarios: Array<{ id: NativeApprovalScenario; label: string }> = [
  { id: "pending", label: "Pending proposal" },
  { id: "approved", label: "Explicit approve" },
  { id: "denied", label: "Deny" },
  { id: "expired", label: "Expired" },
  { id: "revoked", label: "Revoked" },
  { id: "consumed", label: "Consumed" },
  { id: "mismatched", label: "Scope mismatch" }
];

export function NativeApprovalConsentPanel({ surface, onScenario }: NativeApprovalConsentPanelProps) {
  return (
    <section className="approval-checkpoint-panel" aria-labelledby="native-approval-heading" data-native-approval-status={surface.status}>
      <div className="section-heading">
        <p className="caption">Native host consent</p>
        <h2 id="native-approval-heading">Review the exact effect before start</h2>
      </div>
      <div className="approval-checkpoint-grid">
        <div>
          <span>Decision</span>
          <strong>{surface.status}</strong>
          <small>{surface.summary.explicitUserAction ? "explicit user action recorded" : "decision required"}</small>
        </div>
        <div>
          <span>Action</span>
          <strong>{surface.proposal.effect.actionId}</strong>
          <small>{surface.proposal.effect.adapterId}</small>
        </div>
        <div>
          <span>Risk and abort</span>
          <strong>{surface.proposal.effect.risk}</strong>
          <small>{surface.proposal.effect.abortPath}</small>
        </div>
        <div>
          <span>Start authority</span>
          <strong>{surface.startAllowed ? "allowed once" : "blocked"}</strong>
          <small>{surface.summary.actor}</small>
        </div>
      </div>
      <ol className="permission-grant-list compact" aria-label="Exact native approval capabilities">
        {surface.proposal.effect.capabilities.map((capability: AnyRecord) => (
          <li key={`${capability.family}-${capability.action}-${capability.target}`}>
            <span>{capability.family}</span>
            <strong>{capability.action}</strong>
            <small>{capability.target}</small>
          </li>
        ))}
      </ol>
      <div className="approval-action-list" aria-label="Native approval decision scenarios">
        {scenarios.map((scenario) => (
          <button className="secondary-action" type="button" key={scenario.id} onClick={() => onScenario(scenario.id)} aria-pressed={surface.scenario === scenario.id}>
            {scenario.label}
          </button>
        ))}
      </div>
      <div className="fail-closed" role="status">
        <strong>{surface.startAllowed ? "Exact one-time grant ready" : "Native start remains blocked"}</strong>
        <span>
          Agentique owns policy and presentation. Identifiers alone, legacy grants, hidden capability changes, ambient credentials, browser data, and scope drift never authorize an
          effect.
        </span>
      </div>
    </section>
  );
}
