import type { AnyRecord, DurableRunLedgerAction } from "./TrustRunSettingsTypes";

type DurableRunLedgerPanelProps = {
  durableRunLedgerSurface: AnyRecord;
  onDurableRunLedgerAction: (action: DurableRunLedgerAction) => void;
};

export function DurableRunLedgerPanel({ durableRunLedgerSurface, onDurableRunLedgerAction }: DurableRunLedgerPanelProps) {
  const exported = durableRunLedgerSurface.export;

  return (
    <div className="runner-event-timeline" aria-label="Durable run ledger controls">
      <div className="section-heading">
        <p className="caption">Run ledger</p>
        <h2>Restart replay and export</h2>
      </div>
      <div className="runner-actions" aria-label="Durable run ledger action buttons">
        {durableRunLedgerSurface.controls.map((control: AnyRecord) => (
          <button
            aria-pressed={durableRunLedgerSurface.action === control.action}
            className="secondary-action"
            key={control.action}
            type="button"
            onClick={() => onDurableRunLedgerAction(control.action)}
          >
            {control.label}
          </button>
        ))}
      </div>
      <div className="run-history-grid compact" aria-label="Durable run ledger replay summary">
        <div>
          <span>Replay</span>
          <strong>{durableRunLedgerSurface.replay.status}</strong>
          <small>{`${durableRunLedgerSurface.replay.runs.length} replayed run(s)`}</small>
        </div>
        <div>
          <span>Schema</span>
          <strong>{durableRunLedgerSurface.replay.snapshot.schemaVersion}</strong>
          <small>{durableRunLedgerSurface.replay.snapshot.migration.changed ? "schema migration" : "current schema"}</small>
        </div>
        <div>
          <span>Recovery</span>
          <strong>{durableRunLedgerSurface.replay.snapshot.recovery.corruptFallback ? "corruption fallback" : "normal"}</strong>
          <small>{durableRunLedgerSurface.replay.snapshot.recovery.reason ?? "no fallback"}</small>
        </div>
        <div>
          <span>Retention</span>
          <strong>{durableRunLedgerSurface.replay.snapshot.retention.retainedRuns}</strong>
          <small>{`max ${durableRunLedgerSurface.replay.snapshot.retention.maxRuns}`}</small>
        </div>
        <div>
          <span>Export</span>
          <strong>{exported ? exported.summary.exportedRuns : "not requested"}</strong>
          <small>{exported?.summary.truncated ? "bounded export" : "no export sample"}</small>
        </div>
        <div>
          <span>Boundary</span>
          <strong>{durableRunLedgerSurface.boundary.noCloudSessionDependency ? "local only" : "blocked"}</strong>
          <small>{durableRunLedgerSurface.boundary.noSignedInstallerDependency ? "no signed installer" : "blocked"}</small>
        </div>
      </div>
      <ol className="runner-event-list compact" aria-label="Durable run ledger replayed runs">
        {(durableRunLedgerSurface.export?.runs ?? durableRunLedgerSurface.replay.runs).slice(0, 4).map((run: AnyRecord) => (
          <li className={run.state} key={run.runId}>
            <span>{run.runId}</span>
            <strong>{run.state}</strong>
            <small>{`${run.logs.length} redacted log(s) / ${run.artifacts.length} artifact(s)`}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
