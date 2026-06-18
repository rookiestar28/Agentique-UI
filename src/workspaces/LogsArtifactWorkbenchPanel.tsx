import { Download, EyeOff, FileText, Filter, ShieldCheck } from "lucide-react";
import type { AnyRecord, LogsArtifactFilter } from "./TrustRunSettingsTypes";

type LogsArtifactWorkbenchPanelProps = {
  logsArtifactWorkbenchSurface: AnyRecord;
  onLogsArtifactFilter: (filter: LogsArtifactFilter) => void;
};

const filterIcons = {
  all: Filter,
  run: FileText,
  resource: FileText,
  mime: ShieldCheck,
  viewer: EyeOff,
  cleanup: ShieldCheck,
  retention: ShieldCheck,
  "risky-preview": EyeOff,
  stale: EyeOff
};

export function LogsArtifactWorkbenchPanel({ logsArtifactWorkbenchSurface, onLogsArtifactFilter }: LogsArtifactWorkbenchPanelProps) {
  const activeLog = logsArtifactWorkbenchSurface.logs[0];
  const activeArtifact = logsArtifactWorkbenchSurface.artifacts[0];

  return (
    <div className="run-evidence-browser" aria-label="Logs and artifact workbench" data-workbench-filter={logsArtifactWorkbenchSurface.activeFilter.id}>
      <div className="section-heading">
        <p className="caption">Logs and artifacts</p>
        <h2>Workbench filters and safe previews</h2>
      </div>
      <div className="runner-actions" aria-label="Logs artifact filter actions">
        {logsArtifactWorkbenchSurface.filters.map((filter: AnyRecord) => {
          const Icon = filterIcons[filter.id as LogsArtifactFilter] ?? Filter;
          return (
            <button aria-pressed={filter.selected} className="secondary-action" key={filter.id} type="button" onClick={() => onLogsArtifactFilter(filter.id as LogsArtifactFilter)}>
              <Icon aria-hidden="true" size={16} />
              <span>{filter.label}</span>
            </button>
          );
        })}
      </div>
      <div className="run-history-grid compact" aria-label="Logs artifact workbench summary">
        <div>
          <span>Run</span>
          <strong>{logsArtifactWorkbenchSurface.identity.runId}</strong>
          <small>{logsArtifactWorkbenchSurface.identity.resourceId}</small>
        </div>
        <div>
          <span>Logs</span>
          <strong>{logsArtifactWorkbenchSurface.summary.logs}</strong>
          <small>{`${activeLog?.maxBytes ?? 0} byte cap`}</small>
        </div>
        <div>
          <span>Artifacts</span>
          <strong>{logsArtifactWorkbenchSurface.summary.artifacts}</strong>
          <small>{activeArtifact?.mimeType ?? "metadata"}</small>
        </div>
        <div>
          <span>Preview</span>
          <strong>{logsArtifactWorkbenchSurface.summary.metadataOnlyPreviews}</strong>
          <small>{`${logsArtifactWorkbenchSurface.summary.blockedPreviews} blocked`}</small>
        </div>
        <div>
          <span>Cleanup</span>
          <strong>{logsArtifactWorkbenchSurface.summary.cleanupAware}</strong>
          <small>{`${logsArtifactWorkbenchSurface.summary.staleCleanup} stale`}</small>
        </div>
        <div>
          <span>Export</span>
          <strong>{logsArtifactWorkbenchSurface.exportReview.allowed ? "redacted" : "blocked"}</strong>
          <small>{`${logsArtifactWorkbenchSurface.exportReview.denials.length} denial(s)`}</small>
        </div>
      </div>
      <ol className="run-evidence-list compact" aria-label="Bounded redacted log rows">
        {logsArtifactWorkbenchSurface.logs.map((entry: AnyRecord) => (
          <li className={entry.severity} key={entry.id}>
            <span>{entry.name}</span>
            <strong>{entry.source}</strong>
            <small>{entry.text}</small>
          </li>
        ))}
      </ol>
      <ol className="run-evidence-list compact" aria-label="Artifact descriptor rows">
        {logsArtifactWorkbenchSurface.artifacts.map((artifact: AnyRecord) => (
          <li className={artifact.cleanupState} key={artifact.artifactId}>
            <span>{artifact.artifactId}</span>
            <strong>{artifact.mimeType}</strong>
            <small>{`${artifact.path} / ${artifact.digest.slice(0, 12)}`}</small>
          </li>
        ))}
      </ol>
      <ol className="run-evidence-list compact" aria-label="Artifact preview policy rows">
        {logsArtifactWorkbenchSurface.previews.map((preview: AnyRecord) => (
          <li className={preview.mode} key={preview.id}>
            <span>{preview.family}</span>
            <strong>{preview.mode}</strong>
            <small>{preview.renderable ? preview.text : preview.reason}</small>
          </li>
        ))}
      </ol>
      <div className="runner-cleanup-receipt" aria-label="Logs artifact export review">
        <span>Export review</span>
        <strong>{logsArtifactWorkbenchSurface.exportReview.redacted ? "redacted" : "blocked"}</strong>
        <small>{logsArtifactWorkbenchSurface.exportReview.denials.join(", ") || logsArtifactWorkbenchSurface.exportReview.exportPath}</small>
        <Download aria-hidden="true" size={16} />
      </div>
    </div>
  );
}
