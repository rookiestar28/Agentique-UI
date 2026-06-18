import type { AnyRecord } from "./TrustRunSettingsTypes";

type MultiLaneExecutionReadinessPanelProps = {
  multiLaneExecutionReadinessSurface: AnyRecord;
};

export function MultiLaneExecutionReadinessPanel({ multiLaneExecutionReadinessSurface }: MultiLaneExecutionReadinessPanelProps) {
  return (
    <div className="run-evidence-browser" aria-label="Multi-lane execution readiness matrix">
      <div className="section-heading">
        <p className="caption">Execution lanes</p>
        <h2>Readiness matrix</h2>
      </div>
      <div className="run-history-grid compact" aria-label="Multi-lane readiness summary">
        <div>
          <span>Lanes</span>
          <strong>{multiLaneExecutionReadinessSurface.summary.lanes}</strong>
          <small>{`${multiLaneExecutionReadinessSurface.summary.preflightOnly} preflight-only`}</small>
        </div>
        <div>
          <span>Accepted local</span>
          <strong>{multiLaneExecutionReadinessSurface.summary.acceptedLocal}</strong>
          <small>{`${multiLaneExecutionReadinessSurface.summary.executionEnabled} fixed lane(s)`}</small>
        </div>
        <div>
          <span>Future enabled</span>
          <strong>{multiLaneExecutionReadinessSurface.summary.futureLanesExecutionEnabled}</strong>
          <small>disabled-by-default</small>
        </div>
        <div>
          <span>Blockers</span>
          <strong>{multiLaneExecutionReadinessSurface.summary.blockers}</strong>
          <small>promotion evidence required</small>
        </div>
      </div>
      <ol className="run-evidence-list compact" aria-label="Multi-lane disabled future lanes">
        {multiLaneExecutionReadinessSurface.laneRows.map((row: AnyRecord) => (
          <li className={row.status} key={row.id}>
            <span>{row.label}</span>
            <strong>{row.executionEnabled ? "enabled" : row.status}</strong>
            <small>{row.blockers.length > 0 ? row.blockers[0] : "accepted fixed lane"}</small>
          </li>
        ))}
      </ol>
      <div className="run-history-grid compact" aria-label="Multi-lane side-effect boundary">
        <div>
          <span>Runtime starts</span>
          <strong>{multiLaneExecutionReadinessSurface.boundary.sideEffects.startsRuntime ? "starts" : "blocked"}</strong>
          <small>matrix evidence only</small>
        </div>
        <div>
          <span>Containers</span>
          <strong>{multiLaneExecutionReadinessSurface.boundary.sideEffects.startsContainer ? "starts" : "blocked"}</strong>
          <small>{multiLaneExecutionReadinessSurface.boundary.sideEffects.pullsImage ? "image pull" : "no image pull"}</small>
        </div>
        <div>
          <span>Packages</span>
          <strong>{multiLaneExecutionReadinessSurface.boundary.sideEffects.installsPackages ? "installs" : "blocked"}</strong>
          <small>{multiLaneExecutionReadinessSurface.boundary.sideEffects.runsPackageLifecycle ? "lifecycle runs" : "no lifecycle"}</small>
        </div>
        <div>
          <span>Browser data</span>
          <strong>{multiLaneExecutionReadinessSurface.boundary.sideEffects.forwardsBrowserData ? "forwarded" : "blocked"}</strong>
          <small>{multiLaneExecutionReadinessSurface.boundary.sideEffects.executesDownloadedWorkflow ? "download execution" : "no downloaded execution"}</small>
        </div>
      </div>
    </div>
  );
}
