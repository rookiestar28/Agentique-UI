import type { AnyRecord } from "./TrustRunSettingsTypes";

type ExternalAgentClientPackExpansionPanelProps = {
  externalAgentClientPackExpansion: AnyRecord;
};

export function ExternalAgentClientPackExpansionPanel({ externalAgentClientPackExpansion }: ExternalAgentClientPackExpansionPanelProps) {
  return (
    <div className="curated-adapter-lane-panel" aria-label="External agent-client packs">
      <div className="section-heading">
        <p className="caption">Client pack export</p>
        <h2>External agent-client packs</h2>
      </div>
      <div className="curated-adapter-lane-grid" aria-label="Static review-only output">
        <div>
          <span>Static review-only output</span>
          <strong>{externalAgentClientPackExpansion.summary.packRows}</strong>
          <small>descriptor-only client pack review</small>
        </div>
        <div>
          <span>Canonical provenance</span>
          <strong>{externalAgentClientPackExpansion.summary.provenanceRows}</strong>
          <small>{`${externalAgentClientPackExpansion.summary.compatibilityWarnings} compatibility warning(s)`}</small>
        </div>
        <div>
          <span>Drift status</span>
          <strong>{externalAgentClientPackExpansion.summary.driftReviewRequired}</strong>
          <small>rows require review before import</small>
        </div>
        <div>
          <span>Destination action</span>
          <strong>{externalAgentClientPackExpansion.summary.explicitUserActionRows}</strong>
          <small>explicit user action required</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="External client pack targets">
        {externalAgentClientPackExpansion.packs.map((pack: AnyRecord) => (
          <li key={pack.id}>
            <span>{pack.target.label}</span>
            <strong>{pack.output.installMode}</strong>
            <small>{`${pack.output.fileName} / ${pack.target.family}`}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-evidence-list" aria-label="Compatibility warnings">
        {externalAgentClientPackExpansion.packs.map((pack: AnyRecord) => (
          <li key={`${pack.id}-compatibility`}>
            <span>{pack.drift.status}</span>
            <strong>{pack.provenance.canonicalSource.sourceId}</strong>
            <small>{pack.compatibility.warnings[0]}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-evidence-list" aria-label="Destination open folder and deep link policy">
        {externalAgentClientPackExpansion.packs.map((pack: AnyRecord) => (
          <li key={`${pack.id}-destination`}>
            <span>{pack.destination.openFolder.automatic ? "auto open" : "manual open"}</span>
            <strong>{pack.destination.deepLink.opensAutomatically ? "auto deep link" : "manual deep link"}</strong>
            <small>{pack.destination.appWritesFiles ? "app writes files" : "user-owned destination only"}</small>
          </li>
        ))}
      </ol>
      <div className="curated-adapter-lane-grid compact" aria-label="Cleanup and rollback">
        <div>
          <span>Cleanup and rollback</span>
          <strong>{`${externalAgentClientPackExpansion.summary.cleanupReadyRows}/${externalAgentClientPackExpansion.summary.rollbackRows}`}</strong>
          <small>receipt and rollback review required</small>
        </div>
        <div>
          <span>Automatic install</span>
          <strong>{externalAgentClientPackExpansion.packs.some((pack: AnyRecord) => pack.authority.automaticInstall) ? "enabled" : "blocked"}</strong>
          <small>no client install from app</small>
        </div>
        <div>
          <span>Runtime bridge</span>
          <strong>{externalAgentClientPackExpansion.packs.some((pack: AnyRecord) => pack.authority.startsBridge) ? "starts" : "disabled"}</strong>
          <small>hidden bridge execution denied</small>
        </div>
        <div>
          <span>Browser data</span>
          <strong>{externalAgentClientPackExpansion.packs.some((pack: AnyRecord) => pack.authority.browserDataAccess) ? "available" : "blocked"}</strong>
          <small>no browser profile transfer</small>
        </div>
      </div>
      <ol className="curated-adapter-block-list" aria-label="Blocked install samples">
        {externalAgentClientPackExpansion.blockedSamples.map((sample: AnyRecord) => (
          <li key={sample.reason}>
            <span>{sample.reason}</span>
            <strong>{sample.status}</strong>
            <small>{sample.message}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
