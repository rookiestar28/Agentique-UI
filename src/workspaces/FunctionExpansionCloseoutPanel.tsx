import type { AnyRecord } from "./TrustRunSettingsTypes";

type FunctionExpansionCloseoutPanelProps = {
  functionExpansionCloseout: AnyRecord;
};

export function FunctionExpansionCloseoutPanel({ functionExpansionCloseout }: FunctionExpansionCloseoutPanelProps) {
  const review = functionExpansionCloseout.review ?? functionExpansionCloseout;
  const gate = functionExpansionCloseout.gate ?? {};
  const summary = review.summary ?? {};
  const featureFamilies = Array.isArray(review.featureFamilies?.items) ? review.featureFamilies.items : [];
  const portabilityRows = Array.isArray(review.portabilityMapping?.items) ? review.portabilityMapping.items : [];
  const graphRows = Array.isArray(review.graphBlockHandoff?.items) ? review.graphBlockHandoff.items : [];
  const noGoClaims = Object.entries(review.noGoClaims ?? {}).filter(([key]) => key !== "allBlocked");
  const validationEvidence = review.validationEvidence ?? {};
  const claimSync = review.claimSync ?? {};

  return (
    <div className="curated-adapter-lane-panel" aria-label="Function expansion closeout gate">
      <div className="section-heading">
        <p className="caption">Function expansion closeout</p>
        <h2>Claim sync review</h2>
      </div>
      <div className="curated-adapter-lane-grid" aria-label="Function expansion closeout status">
        <div>
          <span>Closeout status</span>
          <strong>{review.status}</strong>
          <small>{review.sourceScope?.runtimeScope}</small>
        </div>
        <div>
          <span>Accepted families</span>
          <strong>{`${summary.acceptedFeatureFamilies ?? 0}/${summary.featureFamilies ?? 0}`}</strong>
          <small>{claimSync.featureEvidenceMapped}</small>
        </div>
        <div>
          <span>Portability mapping</span>
          <strong>{`${summary.portabilityRows ?? 0} rows`}</strong>
          <small>{claimSync.portabilityRequirementsMapped}</small>
        </div>
        <div>
          <span>Graph handoff</span>
          <strong>{`${summary.graphBlockRows ?? 0} rows`}</strong>
          <small>{claimSync.graphBlockRequirementsMapped}</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="Accepted evidence families">
        {featureFamilies.map((feature: AnyRecord) => (
          <li key={feature.id}>
            <span>{feature.label}</span>
            <strong>{feature.status}</strong>
            <small>{feature.releaseClaimAllowed ? "release claim allowed" : "local review only"}</small>
          </li>
        ))}
      </ol>
      <div className="curated-adapter-lane-grid compact" aria-label="Closeout validation evidence">
        <div>
          <span>Full validation</span>
          <strong>{validationEvidence.agentiqueUiFullValidation}</strong>
          <small>{validationEvidence.coreFullGate}</small>
        </div>
        <div>
          <span>Public safety</span>
          <strong>{review.publicSafety?.status}</strong>
          <small>{validationEvidence.publicBoundaryScan}</small>
        </div>
        <div>
          <span>Desktop and narrow evidence</span>
          <strong>{review.interactionEvidence?.status}</strong>
          <small>{validationEvidence.desktopNarrowInteractionEvidence}</small>
        </div>
        <div>
          <span>Unsafe gate</span>
          <strong>{gate.ok ? "passed" : "blocked"}</strong>
          <small>{gate.overclaimBlocked ? "overclaims blocked" : "review required"}</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="Portability drift profile mapping">
        {portabilityRows.map((row: AnyRecord) => (
          <li key={row.id}>
            <span>{row.label}</span>
            <strong>{row.status}</strong>
            <small>{row.lifecycleHooksTrusted ? "lifecycle trusted" : "no lifecycle trust"}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-evidence-list" aria-label="Graph block runtime handoff">
        {graphRows.map((row: AnyRecord) => (
          <li key={row.id}>
            <span>{row.label}</span>
            <strong>{row.status}</strong>
            <small>{row.runtimeAuthority ? "runtime authority" : `${row.uiSurface} / typed IR`}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-block-list" aria-label="No-Go claims">
        {noGoClaims.map(([claim, status]) => (
          <li key={claim}>
            <span>{claim}</span>
            <strong>{String(status)}</strong>
            <small>requires separate accepted evidence</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
