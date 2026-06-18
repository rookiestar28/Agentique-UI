import type { AnyRecord } from "./TrustRunSettingsTypes";

type DiagnosticsSupportBundlePanelProps = {
  diagnosticsSupportBundle: AnyRecord;
};

export function DiagnosticsSupportBundlePanel({ diagnosticsSupportBundle }: DiagnosticsSupportBundlePanelProps) {
  const review = diagnosticsSupportBundle.review ?? diagnosticsSupportBundle;
  const gate = diagnosticsSupportBundle.gate ?? {};
  const identity = review.identity ?? {};
  const environment = review.environment ?? {};
  const validation = review.validation ?? {};
  const adapterStatus = review.adapterStatus ?? {};
  const drift = review.generatedAdapterDrift ?? {};
  const compatibility = review.hostCompatibility ?? {};
  const redaction = review.redaction ?? {};
  const contents = Array.isArray(review.contents) ? review.contents : [];
  const runIds = Array.isArray(review.runEvidence?.runIds) ? review.runEvidence.runIds : [];
  const cleanupReceipts = Array.isArray(review.cleanupReceipts) ? review.cleanupReceipts : [];
  const credentialRecords = Array.isArray(review.credentialReferences?.records) ? review.credentialReferences.records : [];
  const artifactRows = Array.isArray(review.artifactLifecycle?.artifacts) ? review.artifactLifecycle.artifacts : [];
  const deniedMaterials = Array.isArray(review.deniedMaterials) ? review.deniedMaterials : [];
  const blockedSamples = Array.isArray(review.blockedUnsafeSamples) ? review.blockedUnsafeSamples : [];

  return (
    <div className="curated-adapter-lane-panel" aria-label="Diagnostics support bundle gate">
      <div className="section-heading">
        <p className="caption">Diagnostics support bundle</p>
        <h2>Redacted support export</h2>
      </div>
      <div className="curated-adapter-lane-grid" aria-label="Diagnostics support bundle status">
        <div>
          <span>Bundle status</span>
          <strong>{review.status}</strong>
          <small>{identity.exportMode}</small>
        </div>
        <div>
          <span>Descriptor size</span>
          <strong>{`${identity.approxBytes ?? 0}/${identity.maxBytes ?? 0}`}</strong>
          <small>{identity.willUpload ? "upload enabled" : "no upload"}</small>
        </div>
        <div>
          <span>Validation summary</span>
          <strong>{validation.status}</strong>
          <small>{`${validation.stageCount ?? 0} stages / ${validation.commandCount ?? 0} commands`}</small>
        </div>
        <div>
          <span>Environment summary</span>
          <strong>{environment.runtimeReady ? "ready" : "review"}</strong>
          <small>{environment.includesEnvVars ? "env snapshot" : "version facts only"}</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="Bundle contents">
        {contents.map((entry: AnyRecord) => (
          <li key={entry.section}>
            <span>{entry.section}</span>
            <strong>{entry.mode}</strong>
            <small>{entry.redacted ? "redacted metadata" : "blocked"}</small>
          </li>
        ))}
      </ol>
      <div className="curated-adapter-lane-grid compact" aria-label="Run and cleanup evidence">
        <div>
          <span>Run ids</span>
          <strong>{runIds.length}</strong>
          <small>{runIds.slice(0, 2).join(" / ")}</small>
        </div>
        <div>
          <span>Cleanup receipts</span>
          <strong>{cleanupReceipts.length}</strong>
          <small>{cleanupReceipts[0]?.status ?? "reviewed"}</small>
        </div>
        <div>
          <span>Policy diffs</span>
          <strong>{review.policyDiffs?.status ?? "reviewed"}</strong>
          <small>{`${review.policyDiffs?.deniedFamilies?.length ?? 0} denied families`}</small>
        </div>
        <div>
          <span>Public-safe errors</span>
          <strong>{review.publicSafeErrors?.length ?? 0}</strong>
          <small>{review.publicSafeErrors?.[0]?.code ?? "none"}</small>
        </div>
      </div>
      <div className="curated-adapter-lane-grid compact" aria-label="Adapter drift and compatibility">
        <div>
          <span>Adapter status</span>
          <strong>{adapterStatus.status}</strong>
          <small>{adapterStatus.selectedAdapterId}</small>
        </div>
        <div>
          <span>Generated drift</span>
          <strong>{drift.driftStatus}</strong>
          <small>{drift.lifecycleHooks}</small>
        </div>
        <div>
          <span>Host compatibility</span>
          <strong>{compatibility.host}</strong>
          <small>{compatibility.runtimeReady ? "runtime ready" : "runtime review"}</small>
        </div>
        <div>
          <span>Credential reference summary</span>
          <strong>{credentialRecords.length}</strong>
          <small>{review.credentialReferences?.status}</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="Artifact lifecycle summary">
        {artifactRows.slice(0, 4).map((artifact: AnyRecord) => (
          <li key={artifact.artifactId}>
            <span>{artifact.mimeType}</span>
            <strong>{artifact.previewMode}</strong>
            <small>{artifact.rawBytesIncluded ? "raw bytes included" : `${artifact.sizeBytes} bytes / descriptor only`}</small>
          </li>
        ))}
      </ol>
      <div className="curated-adapter-lane-grid compact" aria-label="Support bundle redaction evidence">
        <div>
          <span>Logs</span>
          <strong>{redaction.logsRedacted ? "redacted" : "blocked"}</strong>
          <small>{review.artifactLifecycle?.includesRawLogs ? "raw logs included" : "no raw logs"}</small>
        </div>
        <div>
          <span>Artifacts</span>
          <strong>{redaction.artifactBytesExcluded ? "descriptor-only" : "blocked"}</strong>
          <small>{review.artifactLifecycle?.includesRawArtifactBytes ? "raw bytes included" : "no raw artifact bytes"}</small>
        </div>
        <div>
          <span>Credentials</span>
          <strong>{redaction.secretsRedacted ? "redacted" : "blocked"}</strong>
          <small>{redaction.tokensRedacted && redaction.cookiesRedacted ? "tokens and cookies redacted" : "unsafe"}</small>
        </div>
        <div>
          <span>Unsafe gate</span>
          <strong>{gate.ok ? "passed" : "blocked"}</strong>
          <small>{gate.descriptorOnly ? "descriptor-only" : "review required"}</small>
        </div>
      </div>
      <ol className="curated-adapter-block-list" aria-label="Denied support materials">
        {deniedMaterials.map((material: AnyRecord) => (
          <li key={material.material}>
            <span>{material.material}</span>
            <strong>{material.status}</strong>
            <small>excluded from support export</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-block-list" aria-label="Blocked unsafe support samples">
        {blockedSamples.map((sample: AnyRecord) => (
          <li key={sample.label}>
            <span>{sample.label}</span>
            <strong>{sample.status}</strong>
            <small>{sample.evidence}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
