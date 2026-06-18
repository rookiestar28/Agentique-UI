import type { AnyRecord, PermissionCenterScenario } from "./TrustRunSettingsTypes";

type PermissionCenterPolicyDiffPanelProps = {
  permissionCenterSurface: AnyRecord;
  onPermissionCenterScenario: (scenario: PermissionCenterScenario) => void;
};

export function PermissionCenterPolicyDiffPanel({ permissionCenterSurface, onPermissionCenterScenario }: PermissionCenterPolicyDiffPanelProps) {
  return (
    <div className="run-evidence-browser" aria-label="Permission center and policy diff" data-permission-center-status={permissionCenterSurface.status}>
      <div className="section-heading">
        <p className="caption">Permission center</p>
        <h2>Policy diff and grants</h2>
      </div>
      <div className="runner-actions" aria-label="Permission center scenario actions">
        {permissionCenterSurface.controls.map((control: AnyRecord) => (
          <button
            aria-pressed={control.selected}
            className="secondary-action"
            key={control.scenario}
            type="button"
            onClick={() => onPermissionCenterScenario(control.scenario as PermissionCenterScenario)}
          >
            {control.label}
          </button>
        ))}
      </div>
      <div className="run-history-grid compact" aria-label="Permission center summary">
        <div>
          <span>Status</span>
          <strong>{permissionCenterSurface.status}</strong>
          <small>{`${permissionCenterSurface.activePreflight.allowed}/${permissionCenterSurface.activePreflight.required} active grants`}</small>
        </div>
        <div>
          <span>Revoked</span>
          <strong>{permissionCenterSurface.summary.revocations}</strong>
          <small>{`${permissionCenterSurface.summary.staleGrants} stale grant(s)`}</small>
        </div>
        <div>
          <span>Denied</span>
          <strong>{permissionCenterSurface.summary.deniedFamilies}</strong>
          <small>{`${permissionCenterSurface.summary.riskExplanations} risk explanation(s)`}</small>
        </div>
        <div>
          <span>Audit</span>
          <strong>{permissionCenterSurface.summary.auditReceipts}</strong>
          <small>{permissionCenterSurface.boundary.auditArtifact}</small>
        </div>
      </div>
      <ol className="run-evidence-list compact" aria-label="Permission policy diffs">
        {permissionCenterSurface.policyDiffs.map((diff: AnyRecord) => (
          <li className={diff.status} key={`${diff.family}-${diff.status}`}>
            <span>{diff.family}</span>
            <strong>{`${diff.baseline} -> ${diff.effective}`}</strong>
            <small>{`${diff.requested} requested / ${diff.reason}`}</small>
          </li>
        ))}
      </ol>
      <ol className="run-evidence-list compact" aria-label="Adapter permission ceilings">
        {permissionCenterSurface.adapterCeilings.map((ceiling: AnyRecord) => (
          <li className={ceiling.status} key={`${ceiling.adapterId}-${ceiling.status}`}>
            <span>{ceiling.adapterId}</span>
            <strong>{ceiling.status}</strong>
            <small>{`${ceiling.requestedFamilies.join(", ")} / blocked ${ceiling.blockedFamilies.join(", ") || "none"}`}</small>
          </li>
        ))}
      </ol>
      <ol className="run-evidence-list compact" aria-label="Denied permission families">
        {permissionCenterSurface.deniedFamilies.map((entry: AnyRecord) => (
          <li className={entry.status} key={`${entry.family}-${entry.code}`}>
            <span>{entry.family}</span>
            <strong>{entry.code.replace("permission-center.", "")}</strong>
            <small>{entry.message}</small>
          </li>
        ))}
      </ol>
      <ol className="run-evidence-list compact" aria-label="Permission audit receipts">
        {permissionCenterSurface.auditReceipts.map((receipt: AnyRecord) => (
          <li className={receipt.status} key={receipt.id}>
            <span>{receipt.kind}</span>
            <strong>{receipt.redacted ? "redacted" : "blocked"}</strong>
            <small>{`${receipt.path} / ${receipt.events} event(s)`}</small>
          </li>
        ))}
      </ol>
      <div className="runner-cleanup-receipt" aria-label="Permission center authority boundary">
        <span>Authority</span>
        <strong>{permissionCenterSurface.boundary.nativeAuthorityRequired ? "native required" : "blocked"}</strong>
        <small>{permissionCenterSurface.boundary.promptIsSandbox ? "blocked" : "prompt is not sandbox"}</small>
      </div>
    </div>
  );
}
