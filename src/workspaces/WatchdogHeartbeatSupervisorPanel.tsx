import type { AnyRecord, WatchdogSupervisorScenario } from "./TrustRunSettingsTypes";

type WatchdogHeartbeatSupervisorPanelProps = {
  watchdogSupervisorSurface: AnyRecord;
  onWatchdogSupervisorScenario: (scenario: WatchdogSupervisorScenario) => void;
};

export function WatchdogHeartbeatSupervisorPanel({ watchdogSupervisorSurface, onWatchdogSupervisorScenario }: WatchdogHeartbeatSupervisorPanelProps) {
  const supervisor = watchdogSupervisorSurface.supervisor;

  return (
    <div className="runner-event-timeline" aria-label="Watchdog heartbeat supervisor controls">
      <div className="section-heading">
        <p className="caption">Watchdog</p>
        <h2>Heartbeat and cleanup supervisor</h2>
      </div>
      <div className="runner-actions" aria-label="Watchdog heartbeat supervisor scenario buttons">
        {watchdogSupervisorSurface.controls.map((control: AnyRecord) => (
          <button
            aria-pressed={watchdogSupervisorSurface.scenario === control.scenario}
            className="secondary-action"
            key={control.scenario}
            type="button"
            onClick={() => onWatchdogSupervisorScenario(control.scenario)}
          >
            {control.label}
          </button>
        ))}
      </div>
      <div className="run-history-grid compact" aria-label="Watchdog heartbeat supervisor summary">
        <div>
          <span>Heartbeat</span>
          <strong>{`${watchdogSupervisorSurface.summary.heartbeatCadenceMs}ms`}</strong>
          <small>{`${watchdogSupervisorSurface.summary.heartbeatReceipts} receipt(s) / cadence ${supervisor.heartbeat.cadenceOk ? "ok" : "blocked"}`}</small>
        </div>
        <div>
          <span>Timeout</span>
          <strong>{supervisor.timeout.enforced ? "enforced" : "open"}</strong>
          <small>{`${supervisor.timeout.elapsedMs}/${supervisor.timeout.budgetMs}ms`}</small>
        </div>
        <div>
          <span>Cancel</span>
          <strong>{supervisor.cancel.escalated ? "escalated" : "graceful"}</strong>
          <small>{`${supervisor.cancel.elapsedMs}/${supervisor.cancel.gracefulWindowMs}ms`}</small>
        </div>
        <div>
          <span>Cleanup</span>
          <strong>{supervisor.cleanup.forced ? "forced" : "not required"}</strong>
          <small>{`${supervisor.cleanup.orphanCount} orphan(s) / ${supervisor.cleanup.transition}`}</small>
        </div>
        <div>
          <span>Terminal</span>
          <strong>{supervisor.terminal.state}</strong>
          <small>{watchdogSupervisorSurface.summary.terminalIdempotent ? "idempotent receipts" : "blocked"}</small>
        </div>
        <div>
          <span>Boundary</span>
          <strong>{watchdogSupervisorSurface.boundary.noGenericProcessManager ? "fixed lane" : "blocked"}</strong>
          <small>{watchdogSupervisorSurface.boundary.noShellPlugin ? "no shell plugin" : "blocked"}</small>
        </div>
      </div>
      <ol className="runner-event-list compact" aria-label="Watchdog heartbeat receipts">
        {supervisor.heartbeat.receipts.map((receipt: AnyRecord) => (
          <li className={receipt.state} key={receipt.sequence}>
            <span>{`#${receipt.sequence} ${receipt.offsetMs}ms`}</span>
            <strong>{receipt.nativeOwned ? "native" : "blocked"}</strong>
            <small>{receipt.receiptRef}</small>
          </li>
        ))}
      </ol>
      <div className="runner-cleanup-receipt" aria-label="Watchdog cleanup receipt">
        <span>Cleanup receipt</span>
        <strong>{supervisor.cleanup.processTreeCleanup ? "process-tree cleanup" : "blocked"}</strong>
        <small>{supervisor.cleanup.receiptRef}</small>
      </div>
    </div>
  );
}
