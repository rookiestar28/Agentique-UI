import { Activity, CheckCircle2, Clock3, RotateCcw, ShieldAlert, Trash2, XCircle } from "lucide-react";
import type { AnyRecord, RunDashboardScenario } from "./TrustRunSettingsTypes";

type RunDashboardQueueMonitorPanelProps = {
  runDashboardQueueMonitorSurface: AnyRecord;
  onRunDashboardScenario: (scenario: RunDashboardScenario) => void;
};

const scenarioIcons = {
  active: Activity,
  queued: Clock3,
  completed: CheckCircle2,
  canceled: XCircle,
  failed: ShieldAlert,
  "timed-out": Clock3,
  "cleanup-required": Trash2
};

export function RunDashboardQueueMonitorPanel({ runDashboardQueueMonitorSurface, onRunDashboardScenario }: RunDashboardQueueMonitorPanelProps) {
  return (
    <div className="run-evidence-browser" aria-label="Run dashboard and queue monitor" data-run-dashboard-status={runDashboardQueueMonitorSurface.activeScenario.status}>
      <div className="section-heading">
        <p className="caption">Run dashboard</p>
        <h2>Queue monitor and lifecycle</h2>
      </div>
      <div className="runner-actions" aria-label="Run dashboard scenario actions">
        {runDashboardQueueMonitorSurface.controls.map((control: AnyRecord) => {
          const Icon = scenarioIcons[control.scenario as RunDashboardScenario] ?? RotateCcw;
          return (
            <button
              aria-pressed={control.selected}
              className="secondary-action"
              key={control.scenario}
              type="button"
              onClick={() => onRunDashboardScenario(control.scenario as RunDashboardScenario)}
            >
              <Icon aria-hidden="true" size={16} />
              <span>{control.label}</span>
            </button>
          );
        })}
      </div>
      <div className="run-history-grid compact" aria-label="Run dashboard summary">
        <div>
          <span>Active</span>
          <strong>{runDashboardQueueMonitorSurface.summary.activeRuns}</strong>
          <small>{`${runDashboardQueueMonitorSurface.summary.queuedRuns} queued`}</small>
        </div>
        <div>
          <span>Terminal</span>
          <strong>{runDashboardQueueMonitorSurface.summary.completedRuns}</strong>
          <small>{`${runDashboardQueueMonitorSurface.summary.failedRuns} failed / ${runDashboardQueueMonitorSurface.summary.canceledRuns} canceled`}</small>
        </div>
        <div>
          <span>Timeout</span>
          <strong>{runDashboardQueueMonitorSurface.summary.timedOutRuns}</strong>
          <small>{`${runDashboardQueueMonitorSurface.summary.cleanupRequiredRuns} cleanup-required`}</small>
        </div>
        <div>
          <span>Events</span>
          <strong>{runDashboardQueueMonitorSurface.summary.eventIds}</strong>
          <small>{`${runDashboardQueueMonitorSurface.summary.boundedLogs} bounded log row(s)`}</small>
        </div>
      </div>
      <ol className="run-evidence-list compact" aria-label="Run dashboard lifecycle states">
        {runDashboardQueueMonitorSurface.runStates.map((entry: AnyRecord) => (
          <li className={entry.state} key={entry.state}>
            <span>{entry.state}</span>
            <strong>{entry.count}</strong>
            <small>{`${entry.status} / ${entry.receiptRef}`}</small>
          </li>
        ))}
      </ol>
      <ol className="run-evidence-list compact" aria-label="Queue monitor states">
        {runDashboardQueueMonitorSurface.queueStates.map((entry: AnyRecord) => (
          <li className={entry.state} key={entry.eventId}>
            <span>{entry.state}</span>
            <strong>{entry.eventId}</strong>
            <small>{entry.cleanupReceipt ? `${entry.label} / ${entry.cleanupReceipt.status}` : entry.label}</small>
          </li>
        ))}
      </ol>
      <ol className="run-evidence-list compact" aria-label="Run dashboard signal states">
        {runDashboardQueueMonitorSurface.signalStates.map((entry: AnyRecord) => (
          <li className={entry.status} key={entry.id}>
            <span>{entry.id}</span>
            <strong>{entry.status}</strong>
            <small>{entry.detail}</small>
          </li>
        ))}
      </ol>
      <ol className="run-evidence-list compact" aria-label="Run dashboard action states">
        {runDashboardQueueMonitorSurface.actionStates.map((entry: AnyRecord) => (
          <li className={entry.status} key={entry.id}>
            <span>{entry.id}</span>
            <strong>{entry.status}</strong>
            <small>{`${entry.retryStatus} / ${entry.receiptRef}`}</small>
          </li>
        ))}
      </ol>
      <div className="runner-cleanup-receipt" aria-label="Run dashboard authority boundary">
        <span>Authority</span>
        <strong>{runDashboardQueueMonitorSurface.boundary.nativeAuthorityRequired ? "native required" : "blocked"}</strong>
        <small>{runDashboardQueueMonitorSurface.boundary.frontendAuthority}</small>
      </div>
    </div>
  );
}
