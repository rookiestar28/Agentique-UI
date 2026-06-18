import type { AnyRecord, RuntimePrerequisiteScenario } from "./TrustRunSettingsTypes";

type RuntimePrerequisiteReadinessPanelProps = {
  runtimePrerequisiteReadinessSurface: AnyRecord;
  onRuntimePrerequisiteScenario: (scenario: RuntimePrerequisiteScenario) => void;
};

export function RuntimePrerequisiteReadinessPanel({ runtimePrerequisiteReadinessSurface, onRuntimePrerequisiteScenario }: RuntimePrerequisiteReadinessPanelProps) {
  return (
    <div className="run-evidence-browser" aria-label="Runtime prerequisite readiness controls">
      <div className="section-heading">
        <p className="caption">Runtime readiness</p>
        <h2>Source checkout prerequisites</h2>
      </div>
      <div className="runner-actions" aria-label="Runtime prerequisite scenario buttons">
        {runtimePrerequisiteReadinessSurface.controls.map((control: AnyRecord) => (
          <button
            aria-pressed={runtimePrerequisiteReadinessSurface.scenario === control.scenario}
            className="secondary-action"
            key={control.scenario}
            type="button"
            onClick={() => onRuntimePrerequisiteScenario(control.scenario)}
          >
            {control.label}
          </button>
        ))}
      </div>
      <div className="run-history-grid compact" aria-label="Runtime readiness summary">
        <div>
          <span>Mode</span>
          <strong>{runtimePrerequisiteReadinessSurface.readiness.sourceCheckout.mode}</strong>
          <small>{runtimePrerequisiteReadinessSurface.readiness.sourceCheckout.platform}</small>
        </div>
        <div>
          <span>Ready</span>
          <strong>{runtimePrerequisiteReadinessSurface.summary.ready ? "ready" : "blocked"}</strong>
          <small>{`${runtimePrerequisiteReadinessSurface.summary.runtimeReceipts} runtime receipt(s)`}</small>
        </div>
        <div>
          <span>Adapters</span>
          <strong>{runtimePrerequisiteReadinessSurface.summary.adapterReady}</strong>
          <small>{`${runtimePrerequisiteReadinessSurface.summary.adapterBlocked} blocked`}</small>
        </div>
        <div>
          <span>Package policy</span>
          <strong>{runtimePrerequisiteReadinessSurface.readiness.packagePolicy.executesCommands ? "blocked" : "denied"}</strong>
          <small>{`${runtimePrerequisiteReadinessSurface.summary.packageDenials} denial rows`}</small>
        </div>
        <div>
          <span>Bootstrap</span>
          <strong>{`${runtimePrerequisiteReadinessSurface.summary.bootstrapReceipts - runtimePrerequisiteReadinessSurface.summary.blockingDiagnostics}/${runtimePrerequisiteReadinessSurface.summary.bootstrapReceipts}`}</strong>
          <small>{`${runtimePrerequisiteReadinessSurface.summary.blockingDiagnostics} blocker(s)`}</small>
        </div>
        <div>
          <span>Export</span>
          <strong>{runtimePrerequisiteReadinessSurface.bootstrapExport.redacted ? "redacted" : "blocked"}</strong>
          <small>{runtimePrerequisiteReadinessSurface.bootstrapExport.path}</small>
        </div>
      </div>
      <ol className="run-evidence-list" aria-label="First-run bootstrap diagnostics">
        {runtimePrerequisiteReadinessSurface.bootstrapRows.map((row: AnyRecord) => (
          <li className={row.status} key={row.kind}>
            <span>{row.label}</span>
            <strong>{row.status}</strong>
            <small>{`${row.version} / ${row.remediation}`}</small>
          </li>
        ))}
      </ol>
      <ol className="run-evidence-list" aria-label="Host runtime detection receipts">
        {runtimePrerequisiteReadinessSurface.runtimeRows.map((row: AnyRecord) => (
          <li className={row.status} key={`${row.lane}-${row.runtime}`}>
            <span>{row.lane}</span>
            <strong>{row.status}</strong>
            <small>{`${row.runtime} ${row.version} / ${row.remediation}`}</small>
          </li>
        ))}
      </ol>
      <ol className="run-evidence-list compact" aria-label="Adapter readiness rows">
        {runtimePrerequisiteReadinessSurface.adapterRows.map((row: AnyRecord) => (
          <li className={row.status} key={`${row.adapterId}-${row.runtime}`}>
            <span>{row.runtime}</span>
            <strong>{row.startAllowed ? "start allowed" : "blocked"}</strong>
            <small>{`${row.adapterId} / compatible ${row.compatible} / revoked ${row.revoked}`}</small>
          </li>
        ))}
      </ol>
      <ol className="run-evidence-list compact" aria-label="Package lifecycle denial rows">
        {runtimePrerequisiteReadinessSurface.packageRows.map((row: AnyRecord) => (
          <li className={row.status} key={row.kind}>
            <span>{row.kind}</span>
            <strong>{row.status}</strong>
            <small>{row.message}</small>
          </li>
        ))}
      </ol>
      <div className="runner-cleanup-receipt" aria-label="Runtime readiness boundary">
        <span>Boundary</span>
        <strong>{runtimePrerequisiteReadinessSurface.boundary.noDependencyInstall ? "no install" : "blocked"}</strong>
        <small>{runtimePrerequisiteReadinessSurface.boundary.noPackagedRuntimeClaim ? "source checkout only" : "blocked"}</small>
      </div>
      <div className="runner-cleanup-receipt" aria-label="Runtime bootstrap export receipt">
        <span>Bootstrap export</span>
        <strong>{runtimePrerequisiteReadinessSurface.bootstrapExport.exportable ? "exportable" : "blocked"}</strong>
        <small>{`${runtimePrerequisiteReadinessSurface.bootstrapExport.path} / ${runtimePrerequisiteReadinessSurface.bootstrapExport.entries} receipt(s)`}</small>
      </div>
    </div>
  );
}
