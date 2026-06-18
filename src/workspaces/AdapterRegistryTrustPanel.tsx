import type { AnyRecord } from "./TrustRunSettingsTypes";

type AdapterRegistryTrustPanelProps = {
  adapterUpdateDecision: AnyRecord;
  registryReview: AnyRecord;
};

export function AdapterRegistryTrustPanel({ adapterUpdateDecision, registryReview }: AdapterRegistryTrustPanelProps) {
  const trust = registryReview.manifestTrust ?? {};
  const portability = registryReview.portability ?? {};
  const authority = registryReview.authority ?? {};
  const blockedReasons = Array.isArray(registryReview.blockedReasons) ? registryReview.blockedReasons : [];
  const permissionFamilies = Object.entries(trust.permissionCeiling?.families ?? {}).slice(0, 8);

  return (
    <>
      <div className="section-heading">
        <p className="caption">Adapter registry</p>
        <h2>Adapter registry manifest trust policy</h2>
      </div>
      <div className="run-state" aria-label="Adapter registry review summary">
        <span>{registryReview.registry.status} registry status</span>
        <span>{registryReview.registryReview?.summary?.registeredVersions ?? registryReview.summary.registeredVersions ?? 0} versions</span>
        <span>{registryReview.registryReview?.summary?.revocationStatus ?? registryReview.summary.revocationStatus ?? "clear"} revocation</span>
        <span>{adapterUpdateDecision.requiresUserReview ? "review required" : "auto update"}</span>
      </div>
      <div className="field-list" aria-label="Adapter trust policy summary">
        <div>
          <span>Signer</span>
          <strong>{trust.signer ?? "missing"}</strong>
        </div>
        <div>
          <span>License</span>
          <strong>{trust.license?.expression ?? "unknown"}</strong>
        </div>
        <div>
          <span>Permission ceiling</span>
          <strong>{trust.permissionCeiling?.status ?? "missing"}</strong>
        </div>
        <div>
          <span>Review status</span>
          <strong>{trust.provenance?.reviewStatus ?? "unreviewed"}</strong>
        </div>
      </div>
      <div className="field-list" aria-label="Adapter portability and drift status">
        <div>
          <span>Canonical source</span>
          <strong>{portability.canonicalSourceId ?? "missing"}</strong>
        </div>
        <div>
          <span>Target host</span>
          <strong>{portability.targetHost ?? "unknown"}</strong>
        </div>
        <div>
          <span>Profiles</span>
          <strong>{(portability.profileSupport ?? []).join(" / ") || "none"}</strong>
        </div>
        <div>
          <span>Drift</span>
          <strong>{portability.driftStatus ?? "unknown"}</strong>
        </div>
      </div>
      <div className="capability-list" aria-label="Adapter registry permission ceiling">
        {permissionFamilies.map(([family, decision]) => (
          <div className={`capability-row ${decision}`} key={family}>
            <div>
              <strong>{family}</strong>
              <span>registry ceiling</span>
            </div>
            <span className="decision-pill">{String(decision)}</span>
          </div>
        ))}
      </div>
      <div className="run-state" aria-label="Adapter authority boundary summary">
        <span>{authority.enablesNewRuntimeLane ? "lane enabled" : "no new lane"}</span>
        <span>{authority.autoInstallsAdapter ? "auto install" : "no auto install"}</span>
        <span>{authority.executesLifecycleHooks ? "hooks execute" : "hooks blocked"}</span>
        <span>{authority.forwardsAmbientEnvironment ? "ambient env" : "no ambient env"}</span>
      </div>
      <div className="field-list" aria-label="Adapter update decision">
        <div>
          <span>From</span>
          <strong>{adapterUpdateDecision.fromVersion}</strong>
        </div>
        <div>
          <span>To</span>
          <strong>{adapterUpdateDecision.toVersion ?? "blocked"}</strong>
        </div>
        <div>
          <span>Install</span>
          <strong>{adapterUpdateDecision.willInstall ? "enabled" : "not installed"}</strong>
        </div>
        <div>
          <span>Rollback</span>
          <strong>{adapterUpdateDecision.rollback.supported ? adapterUpdateDecision.rollback.version : "unavailable"}</strong>
        </div>
      </div>
      <ol className="permission-grant-list compact" aria-label="Adapter blocked trust reasons">
        {(blockedReasons.length > 0 ? blockedReasons : ["clear"]).map((reason) => (
          <li className={reason === "clear" ? "allowed" : "blocked"} key={reason}>
            <span>trust policy</span>
            <strong>{reason}</strong>
            <small>{reason === "clear" ? "Manifest trust policy accepted for review-only display." : "Adapters fail closed before launch planning."}</small>
          </li>
        ))}
      </ol>
      <div className="fail-closed" role="status">
        <strong>Revocation overrides compatibility</strong>
        <span>
          Registry decisions are local review contracts only; revoked, downgraded, missing, drifted, unreviewed, or incompatible adapter versions fail closed before launch
          planning.
        </span>
      </div>
    </>
  );
}
