import type { AnyRecord } from "./TrustRunSettingsTypes";

type McpBridgeReadinessPanelProps = {
  mcpBridgeReadiness: AnyRecord;
};

export function McpBridgeReadinessPanel({ mcpBridgeReadiness }: McpBridgeReadinessPanelProps) {
  return (
    <div className="curated-adapter-lane-panel" aria-label="MCP bridge readiness">
      <div className="section-heading">
        <p className="caption">MCP descriptor gate</p>
        <h2>MCP bridge readiness</h2>
      </div>
      <div className="curated-adapter-lane-grid" aria-label="Server trust states">
        <div>
          <span>Server trust states</span>
          <strong>{mcpBridgeReadiness.summary.serverRows}</strong>
          <small>descriptor-only MCP review</small>
        </div>
        <div>
          <span>Tool listings</span>
          <strong>{mcpBridgeReadiness.summary.toolRows}</strong>
          <small>metadata only, no invocation</small>
        </div>
        <div>
          <span>Resource listings</span>
          <strong>{mcpBridgeReadiness.summary.resourceRows}</strong>
          <small>resource reads disabled</small>
        </div>
        <div>
          <span>Prompt listings</span>
          <strong>{mcpBridgeReadiness.summary.promptRows}</strong>
          <small>prompt retrieval disabled</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="MCP server identity rows">
        {mcpBridgeReadiness.servers.map((server: AnyRecord) => (
          <li key={server.id}>
            <span>{server.trust.state}</span>
            <strong>{server.identity.displayName}</strong>
            <small>{`${server.identity.transport} / ${server.identity.protocolVersion}`}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-evidence-list" aria-label="Vault references">
        {mcpBridgeReadiness.servers.map((server: AnyRecord) => (
          <li key={`${server.id}-vault`}>
            <span>{server.credentials.mode}</span>
            <strong>{server.credentials.preview}</strong>
            <small>{server.authPolicy.kind}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-evidence-list" aria-label="User action gates">
        {mcpBridgeReadiness.servers.flatMap((server: AnyRecord) =>
          Object.entries(server.userActionGates as Record<string, AnyRecord>).map(([gateId, gate]) => (
            <li key={`${server.id}-${gateId}`}>
              <span>{gateId}</span>
              <strong>{gate.automatic ? "automatic" : "manual"}</strong>
              <small>{gate.intent}</small>
            </li>
          ))
        )}
      </ol>
      <div className="curated-adapter-lane-grid compact" aria-label="Audit receipts">
        {mcpBridgeReadiness.servers.map((server: AnyRecord) => (
          <div key={`${server.id}-audit`}>
            <span>Audit receipts</span>
            <strong>{server.audit.redacted ? "redacted" : "blocked"}</strong>
            <small>{server.audit.receipt}</small>
          </div>
        ))}
      </div>
      <div className="curated-adapter-lane-grid compact" aria-label="MCP denied authority">
        <div>
          <span>Connect</span>
          <strong>{mcpBridgeReadiness.servers.some((server: AnyRecord) => server.authority.startsBridge) ? "enabled" : "blocked"}</strong>
          <small>no bridge or server start</small>
        </div>
        <div>
          <span>Tool invocation</span>
          <strong>{mcpBridgeReadiness.servers.some((server: AnyRecord) => server.authority.invokesTools) ? "enabled" : "blocked"}</strong>
          <small>no automatic tool calls</small>
        </div>
        <div>
          <span>Network</span>
          <strong>{mcpBridgeReadiness.servers.some((server: AnyRecord) => server.authority.makesNetworkRequest) ? "enabled" : "blocked"}</strong>
          <small>no metadata fetch</small>
        </div>
        <div>
          <span>Browser data</span>
          <strong>{mcpBridgeReadiness.servers.some((server: AnyRecord) => server.authority.browserDataAccess) ? "available" : "blocked"}</strong>
          <small>no profile or cookie import</small>
        </div>
      </div>
      <ol className="curated-adapter-block-list" aria-label="Blocked MCP samples">
        {mcpBridgeReadiness.blockedSamples.map((sample: AnyRecord) => (
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
