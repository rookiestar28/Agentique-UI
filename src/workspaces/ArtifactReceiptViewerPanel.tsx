import type { AnyRecord, ArtifactReceiptScenario } from "./TrustRunSettingsTypes";

type ArtifactReceiptViewerPanelProps = {
  artifactReceiptViewerSurface: AnyRecord;
  onArtifactReceiptScenario: (scenario: ArtifactReceiptScenario) => void;
};

export function ArtifactReceiptViewerPanel({ artifactReceiptViewerSurface, onArtifactReceiptScenario }: ArtifactReceiptViewerPanelProps) {
  const receipt = artifactReceiptViewerSurface.binding.receipts[0];

  return (
    <div className="run-evidence-browser" aria-label="Artifact receipt viewer controls">
      <div className="section-heading">
        <p className="caption">Artifact receipts</p>
        <h2>Safe viewer policy</h2>
      </div>
      <div className="runner-actions" aria-label="Artifact receipt viewer scenario buttons">
        {artifactReceiptViewerSurface.controls.map((control: AnyRecord) => (
          <button
            aria-pressed={artifactReceiptViewerSurface.scenario === control.scenario}
            className="secondary-action"
            key={control.scenario}
            type="button"
            onClick={() => onArtifactReceiptScenario(control.scenario)}
          >
            {control.label}
          </button>
        ))}
      </div>
      <div className="run-history-grid compact" aria-label="Artifact receipt binding summary">
        <div>
          <span>Run</span>
          <strong>{receipt.runId}</strong>
          <small>{receipt.runState}</small>
        </div>
        <div>
          <span>Artifact</span>
          <strong>{receipt.artifactId}</strong>
          <small>{receipt.artifactPath}</small>
        </div>
        <div>
          <span>MIME</span>
          <strong>{receipt.mimeType}</strong>
          <small>{`${receipt.sizeBytes} bytes`}</small>
        </div>
        <div>
          <span>Viewer</span>
          <strong>{receipt.viewer.previewMode}</strong>
          <small>{receipt.viewer.family}</small>
        </div>
        <div>
          <span>Cleanup</span>
          <strong>{receipt.cleanup.state}</strong>
          <small>{receipt.cleanup.cleanupRequired ? "cleanup required" : receipt.retention.state}</small>
        </div>
        <div>
          <span>Boundary</span>
          <strong>{artifactReceiptViewerSurface.boundary.noRawArtifactBytes ? "metadata only" : "blocked"}</strong>
          <small>{artifactReceiptViewerSurface.boundary.noScriptExecution ? "no active scripts" : "blocked"}</small>
        </div>
      </div>
      <ol className="run-evidence-list" aria-label="Artifact receipt state matrix">
        {artifactReceiptViewerSurface.stateMatrix.map((entry: AnyRecord) => (
          <li className={entry.runState} key={`${entry.runId}-${entry.runState}`}>
            <span>{entry.runState}</span>
            <strong>{entry.previewMode}</strong>
            <small>{entry.cleanupRequired ? "cleanup required" : entry.cleanupState}</small>
          </li>
        ))}
      </ol>
      <div className="runner-cleanup-receipt" aria-label="Artifact receipt preview evidence">
        <span>Preview</span>
        <strong>{receipt.preview.renderable ? "safe preview" : receipt.preview.reason}</strong>
        <small>{receipt.preview.text}</small>
      </div>
    </div>
  );
}
