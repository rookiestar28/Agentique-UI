import type { AnyRecord, RunnerControlAction } from "./TrustRunSettingsTypes";

type RunnerRevocationCancelControlsProps = {
  runnerControlSurface: AnyRecord;
  onRunnerControlAction: (action: RunnerControlAction) => void;
};

export function RunnerRevocationCancelControls({ runnerControlSurface, onRunnerControlAction }: RunnerRevocationCancelControlsProps) {
  return (
    <div className="runner-event-timeline" aria-label="Runner revocation cancel kill controls">
      <div className="section-heading">
        <p className="caption">Runner controls</p>
        <h2>Revocation and stop receipts</h2>
      </div>
      <div className="runner-actions" aria-label="Runner revocation cancel kill action buttons">
        {runnerControlSurface.uiControls.map((control: AnyRecord) => (
          <button
            aria-pressed={runnerControlSurface.action === control.action}
            className="secondary-action"
            key={control.action}
            type="button"
            onClick={() => onRunnerControlAction(control.action)}
          >
            {control.label}
          </button>
        ))}
      </div>
      <div className="run-history-grid compact" aria-label="Runner revocation cancel receipt summary">
        <div>
          <span>Grant</span>
          <strong>{runnerControlSurface.grant.status}</strong>
          <small>{runnerControlSurface.grant.revoked ? "revoked start blocked" : "active scoped grant"}</small>
        </div>
        <div>
          <span>Start</span>
          <strong>{runnerControlSurface.startDecision.status}</strong>
          <small>{runnerControlSurface.startDecision.code}</small>
        </div>
        <div>
          <span>Stop mode</span>
          <strong>{runnerControlSurface.stopDecision.mode}</strong>
          <small>{runnerControlSurface.stopDecision.state}</small>
        </div>
        <div>
          <span>Cleanup</span>
          <strong>{runnerControlSurface.cleanup.status}</strong>
          <small>{runnerControlSurface.cleanup.resolutionReceipt.status}</small>
        </div>
        <div>
          <span>Retry</span>
          <strong>{runnerControlSurface.retry.status}</strong>
          <small>{runnerControlSurface.retry.blockedUntilCleanupResolved ? "retry blocked until cleanup" : "retry gate clear"}</small>
        </div>
        <div>
          <span>Audit</span>
          <strong>{runnerControlSurface.auditReceipts.length} receipt(s)</strong>
          <small>{runnerControlSurface.nativeReceipt.redacted ? "redacted native receipt" : "blocked receipt"}</small>
        </div>
      </div>
      <ol className="runner-event-list compact" aria-label="Runner revocation cancel audit receipts">
        {runnerControlSurface.auditReceipts.map((receipt: AnyRecord) => (
          <li className={receipt.kind} key={`${receipt.kind}-${receipt.path}`}>
            <span>{receipt.kind}</span>
            <strong>{receipt.redacted ? "redacted" : "blocked"}</strong>
            <small>{receipt.message}</small>
          </li>
        ))}
      </ol>
      <div className="runner-cleanup-receipt" aria-label="Runner cleanup retry gate">
        <span>{runnerControlSurface.nativeReceipt.kind}</span>
        <strong>{runnerControlSurface.nativeReceipt.reason}</strong>
        <small>{runnerControlSurface.retry.message}</small>
      </div>
    </div>
  );
}
