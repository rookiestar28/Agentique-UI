import type { AnyRecord } from "./TrustRunSettingsTypes";

type PythonNodeAdapterPackExpansionPanelProps = {
  adapterPackExpansion: AnyRecord;
};

export function PythonNodeAdapterPackExpansionPanel({ adapterPackExpansion }: PythonNodeAdapterPackExpansionPanelProps) {
  return (
    <div className="curated-adapter-lane-panel" aria-label="Python and Node adapter pack expansion">
      <div className="section-heading">
        <p className="caption">Adapter pack expansion</p>
        <h2>Python and Node adapter pack expansion</h2>
      </div>
      <div className="curated-adapter-lane-grid" aria-label="Fixed allowlisted adapter packs">
        <div>
          <span>Fixed allowlisted adapter packs</span>
          <strong>{adapterPackExpansion.summary.fixedAllowlistedPacks}</strong>
          <small>{`${adapterPackExpansion.summary.signedManifests} signed manifest(s)`}</small>
        </div>
        <div>
          <span>Host prerequisite receipts</span>
          <strong>{adapterPackExpansion.summary.hostPrerequisites}</strong>
          <small>source checkout and runtime receipts</small>
        </div>
        <div>
          <span>Artifact and cleanup receipts</span>
          <strong>{`${adapterPackExpansion.summary.artifactReceipts}/${adapterPackExpansion.summary.cleanupReceipts}`}</strong>
          <small>path-neutral run-folder evidence</small>
        </div>
        <div>
          <span>Package lifecycle denial</span>
          <strong>blocked</strong>
          <small>descriptor-only pack review</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="Adapter pack expansion accepted packs">
        {adapterPackExpansion.packs.map((pack: AnyRecord) => (
          <li key={pack.adapterId}>
            <span>{pack.runtime}</span>
            <strong>{pack.adapterId}</strong>
            <small>{`${pack.manifest.signature} / ${pack.manifest.digest} / ${pack.validationCommand}`}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-evidence-list" aria-label="Permission ceiling">
        {adapterPackExpansion.packs.map((pack: AnyRecord) => (
          <li key={`${pack.adapterId}-permission-ceiling`}>
            <span>{pack.runtime}</span>
            <strong>{`${pack.permissionCeiling.shell} shell / ${pack.permissionCeiling.environment} env`}</strong>
            <small>{`${pack.permissionCeiling.browserData} browser data / ${pack.permissionCeiling.containers} containers / ${pack.permissionCeiling.externalProviders} providers`}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-evidence-list" aria-label="Watchdog and native event receipts">
        {adapterPackExpansion.packs.map((pack: AnyRecord) => (
          <li key={`${pack.adapterId}-watchdog-events`}>
            <span>{pack.watchdog.status}</span>
            <strong>{pack.nativeEvents.transport}</strong>
            <small>{`${pack.watchdog.heartbeatReceipt} / ${pack.nativeEvents.replayReceipt}`}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-block-list" aria-label="Adapter pack blocked reasons">
        {adapterPackExpansion.blockedSamples.map((sample: AnyRecord) => (
          <li key={sample.reason}>
            <span>{sample.reason}</span>
            <strong>{sample.status}</strong>
            <small>{sample.message}</small>
          </li>
        ))}
      </ol>
      <div className="curated-adapter-lane-grid compact" aria-label="Adapter pack authority boundary">
        {adapterPackExpansion.packs.map((pack: AnyRecord) => (
          <div key={`${pack.adapterId}-authority`}>
            <span>{pack.runtime}</span>
            <strong>{pack.authority.newRuntimeLane ? "new lane" : "no new lane"}</strong>
            <small>{pack.environment.forwardedAmbient.length === 0 ? "no ambient environment forwarded" : "ambient blocked"}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
