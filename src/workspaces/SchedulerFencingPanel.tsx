import { useMemo, useState } from "react";
import { createSchedulerFencingSurface } from "../core/scheduler-fencing.mjs";

type SchedulerFencingScenario = "startup-closed" | "ready" | "claimed" | "stale-writer" | "canceled" | "rollback";

export function SchedulerFencingPanel() {
  const [scenario, setScenario] = useState<SchedulerFencingScenario>("startup-closed");
  const surface = useMemo(() => createSchedulerFencingSurface({ scenario }), [scenario]);

  return (
    <section className="evidence-panel" aria-labelledby="scheduler-fencing-heading" data-admission={surface.admission.state}>
      <div className="section-heading compact-heading">
        <p className="caption">Scheduler safety</p>
        <h3 id="scheduler-fencing-heading">Scheduler admission and fencing</h3>
      </div>
      <div className="runner-status-grid">
        <div>
          <span>Admission</span>
          <strong>{surface.admission.state}</strong>
        </div>
        <div>
          <span>Tasks</span>
          <strong>{surface.summary.tasks}</strong>
        </div>
        <div>
          <span>Active claims</span>
          <strong>{surface.summary.activeClaims}</strong>
        </div>
        <div>
          <span>Runtime</span>
          <strong>{surface.boundary.schedulerStarted ? "started" : "disabled"}</strong>
        </div>
      </div>
      <div className="runner-actions" aria-label="Scheduler fencing scenarios">
        {surface.controls.map((control: { scenario: SchedulerFencingScenario; label: string }) => (
          <button aria-pressed={scenario === control.scenario} className="secondary-action" key={control.scenario} type="button" onClick={() => setScenario(control.scenario)}>
            {control.label}
          </button>
        ))}
      </div>
      <ol className="runner-event-list compact" aria-label="Scheduler fencing audit history">
        {surface.history.map((entry: { sequence: number; type: string; subjectId: string }) => (
          <li key={`${entry.sequence}-${entry.type}`}>
            <span>#{entry.sequence}</span>
            <strong>{entry.type}</strong>
            <small>{entry.subjectId}</small>
          </li>
        ))}
      </ol>
      <p className="surface-note">
        Execution remains disabled until the separately governed workflow-runtime prerequisite is accepted. This review surface cannot open product admission or launch hidden work.
      </p>
    </section>
  );
}
