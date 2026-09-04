import type { AnyRecord } from "./TrustRunSettingsTypes";

type AgentProtocolBridgePanelProps = {
  agentProtocolBridge: AnyRecord;
};

export function AgentProtocolBridgePanel({ agentProtocolBridge }: AgentProtocolBridgePanelProps) {
  return (
    <div className="curated-adapter-lane-panel" aria-label="Agent protocol bridge">
      <div className="section-heading">
        <p className="caption">Host-scoped protocol</p>
        <h2>Agent protocol bridge</h2>
      </div>
      <div className="curated-adapter-lane-grid" aria-label="Agent protocol bridge status">
        <div>
          <span>Signed extension</span>
          <strong>{agentProtocolBridge.surface.trust}</strong>
          <small>reviewed signer, digest, revocation, and source state</small>
        </div>
        <div>
          <span>Capability scope</span>
          <strong>{agentProtocolBridge.checks.capabilities}</strong>
          <small>fixed runner and evidence capabilities only</small>
        </div>
        <div>
          <span>Explicit permission</span>
          <strong>{agentProtocolBridge.snapshot.permittedCapabilities.length}</strong>
          <small>product-issued and run-bound receipts</small>
        </div>
        <div>
          <span>Lifecycle</span>
          <strong>{agentProtocolBridge.snapshot.status}</strong>
          <small>{`${agentProtocolBridge.checks.acceptedMessages} ordered messages accepted`}</small>
        </div>
      </div>
      <div className="curated-adapter-lane-grid compact" aria-label="Agent protocol bridge authority">
        <div>
          <span>Host-owned dispatch</span>
          <strong>{agentProtocolBridge.surface.hostDispatchOwnership}</strong>
          <small>extensions cannot select commands or executable details</small>
        </div>
        <div>
          <span>Generic authority denied</span>
          <strong>{agentProtocolBridge.checks.deniedAuthority}</strong>
          <small>shell, process, package, environment, browser, network, and provider remain denied</small>
        </div>
        <div>
          <span>No package bridge adopted</span>
          <strong>{agentProtocolBridge.checks.handoffPackageAdopted ? "adopted" : "not adopted"}</strong>
          <small>Agentique-owned contract; no sidecar or run-client dependency</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="Agent protocol operations">
        {agentProtocolBridge.operations.map((operation: string, index: number) => (
          <li key={operation}>
            <span>{`#${index + 1}`}</span>
            <strong>{operation}</strong>
            <small>exact-key, session-bound, fail-closed</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
