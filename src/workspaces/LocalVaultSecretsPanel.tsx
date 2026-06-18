import type { AnyRecord } from "./TrustRunSettingsTypes";

type LocalVaultSecretsPanelProps = {
  localVaultSecretsUx: AnyRecord;
};

export function LocalVaultSecretsPanel({ localVaultSecretsUx }: LocalVaultSecretsPanelProps) {
  const review = localVaultSecretsUx.review ?? localVaultSecretsUx;
  const gate = localVaultSecretsUx.gate ?? {};
  const keychain = review.keychainFeasibility ?? {};
  const redaction = review.redactionEvidence ?? {};
  const supportBundle = review.supportBundle ?? {};
  const records = Array.isArray(review.records) ? review.records : [];
  const operations = Array.isArray(review.operations) ? review.operations : [];
  const deniedRows = Array.isArray(review.deniedAuthorities?.authorities) ? review.deniedAuthorities.authorities : [];
  const blockedSamples = [
    { label: "Inline secret material", status: gate.inlineSecretBlocked ? "blocked" : "missing", detail: "raw credential text cannot enter vault records." },
    { label: "Malformed vault reference", status: gate.malformedReferenceBlocked ? "blocked" : "missing", detail: "records must use opaque vault references only." },
    { label: "Native keychain overclaim", status: gate.unsupportedNativeClaimBlocked ? "blocked" : "missing", detail: "keychain feasibility is reviewed but not integrated." },
    { label: "Raw export or screenshot", status: gate.rawEvidenceBlocked ? "blocked" : "missing", detail: "exports logs screenshots and support bundles stay redacted." },
    {
      label: "Environment or browser import",
      status: gate.unsafeSourcesBlocked ? "blocked" : "missing",
      detail: "ambient env browser data cookies storage state and local secret files stay denied."
    }
  ];

  return (
    <div className="curated-adapter-lane-panel" aria-label="Local vault secrets UX gate">
      <div className="section-heading">
        <p className="caption">Local vault secrets UX</p>
        <h2>Reference-only secret review</h2>
      </div>
      <div className="curated-adapter-lane-grid" aria-label="Local vault status">
        <div>
          <span>Vault status</span>
          <strong>{review.status}</strong>
          <small>{review.storesSecretValues ? "stores secret values" : "reference-only records"}</small>
        </div>
        <div>
          <span>Keychain feasibility</span>
          <strong>{keychain.status}</strong>
          <small>{keychain.selectedStrategy}</small>
        </div>
        <div>
          <span>Native integration</span>
          <strong>{keychain.nativeIntegration ? "claimed" : "not integrated"}</strong>
          <small>{keychain.secretReadbackToWebLayer ? "readback available" : "no web-layer readback"}</small>
        </div>
        <div>
          <span>Support bundle</span>
          <strong>{supportBundle.status}</strong>
          <small>{supportBundle.pathNeutral ? "path neutral" : "blocked"}</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="Reference-only vault records">
        {records.map((record: AnyRecord) => (
          <li key={`${record.ref}-${record.status}`}>
            <span>{record.kind}</span>
            <strong>{record.status}</strong>
            <small>{`${record.label} / ${record.ref}`}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-evidence-list" aria-label="Vault lifecycle operations">
        {operations.map((operation: AnyRecord) => (
          <li key={`${operation.action}-${operation.receiptId}`}>
            <span>{operation.action}</span>
            <strong>{operation.status}</strong>
            <small>{operation.rawValueVisible ? "raw value visible" : `${operation.receiptId} / redacted evidence only`}</small>
          </li>
        ))}
      </ol>
      <div className="curated-adapter-lane-grid compact" aria-label="Vault redaction evidence">
        <div>
          <span>Previews</span>
          <strong>{redaction.previewsRedacted ? "redacted" : "blocked"}</strong>
          <small>{redaction.exportsRedacted ? "exports redacted" : "exports blocked"}</small>
        </div>
        <div>
          <span>Logs</span>
          <strong>{redaction.logsRedacted ? "redacted" : "blocked"}</strong>
          <small>{`${redaction.boundedBytes} byte bound`}</small>
        </div>
        <div>
          <span>Screenshots</span>
          <strong>{redaction.screenshotsMode}</strong>
          <small>{redaction.supportBundleRedacted ? "support bundle redacted" : "support bundle blocked"}</small>
        </div>
        <div>
          <span>Packaged secrets</span>
          <strong>{redaction.packagedSecretsIncluded ? "included" : "blocked"}</strong>
          <small>{redaction.pathNeutral ? "path neutral" : "path disclosure blocked"}</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="Denied vault authorities">
        {deniedRows.map((authority: string) => (
          <li key={authority}>
            <span>Denied authority</span>
            <strong>{authority}</strong>
            <small>blocked before secret handling can widen</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-block-list" aria-label="Blocked unsafe vault samples">
        {blockedSamples.map((sample) => (
          <li key={sample.label}>
            <span>{sample.label}</span>
            <strong>{sample.status}</strong>
            <small>{sample.detail}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
