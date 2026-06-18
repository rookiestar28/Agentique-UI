import type { AnyRecord } from "./TrustRunSettingsTypes";

type WasmWasiSandboxGatePanelProps = {
  wasmWasiSandboxGate: AnyRecord;
};

export function WasmWasiSandboxGatePanel({ wasmWasiSandboxGate }: WasmWasiSandboxGatePanelProps) {
  const review = wasmWasiSandboxGate.review ?? wasmWasiSandboxGate;
  const gate = wasmWasiSandboxGate.gate ?? {};
  const limits = review.limits ?? {};
  const wasi = review.wasi ?? {};
  const artifacts = review.artifacts ?? {};
  const permissions = review.permissions ?? {};
  const claims = review.claims ?? {};
  const networkAllow = Array.isArray(wasi.network?.allow) ? wasi.network.allow : [];
  const fileRows = Array.isArray(wasi.files) ? wasi.files : [];
  const permissionRows = Array.isArray(permissions.decisions) ? permissions.decisions : [];
  const userActions = Array.isArray(review.userActions) ? review.userActions : [];
  const blockedSamples = [
    {
      label: "Broad host filesystem",
      status: gate.broadHostAccessBlocked ? "blocked" : "missing",
      detail: "drive roots, home paths, and traversal stay outside the workspace grant."
    },
    {
      label: "Missing instruction metering",
      status: gate.missingMeteringBlocked ? "blocked" : "missing",
      detail: "wall-clock-only metering cannot pass sandbox preflight."
    },
    {
      label: "Public network access",
      status: gate.publicNetworkBlocked ? "blocked" : "missing",
      detail: "public endpoints remain denied until a separate gate accepts runtime evidence."
    }
  ];

  return (
    <div className="curated-adapter-lane-panel" aria-label="WASM/WASI sandbox gate">
      <div className="section-heading">
        <p className="caption">WASM/WASI sandbox gate</p>
        <h2>Sandbox preflight review</h2>
      </div>
      <div className="curated-adapter-lane-grid" aria-label="WASM WASI sandbox status">
        <div>
          <span>Preflight status</span>
          <strong>{review.status}</strong>
          <small>{review.ok ? "deterministic review ready" : "blocked before launch"}</small>
        </div>
        <div>
          <span>Execution decision</span>
          <strong>{review.executionDecision}</strong>
          <small>{review.enabledForExecution ? "runtime enabled" : "execution disabled"}</small>
        </div>
        <div>
          <span>Host imports</span>
          <strong>explicit only</strong>
          <small>no ambient authority or hidden host API</small>
        </div>
        <div>
          <span>Watchdog</span>
          <strong>{limits.maxExecutionMs} ms</strong>
          <small>bounded runtime window before any future execution gate</small>
        </div>
      </div>
      <div className="curated-adapter-lane-grid compact" aria-label="Resource limits">
        <div>
          <span>Resource limits</span>
          <strong>{`${Math.round(Number(limits.memoryBytes ?? 0) / 1048576)} MiB`}</strong>
          <small>{`${limits.maxStdoutBytes} stdout / ${limits.maxStderrBytes} stderr bytes`}</small>
        </div>
        <div>
          <span>Instruction metering</span>
          <strong>{limits.instructionMetering?.mode}</strong>
          <small>{`${limits.instructionMetering?.maxUnits ?? 0} units / refill ${String(limits.instructionMetering?.refill)}`}</small>
        </div>
        <div>
          <span>Artifact limit</span>
          <strong>{limits.maxArtifacts}</strong>
          <small>{`${limits.maxArtifactBytes} bytes per artifact`}</small>
        </div>
        <div>
          <span>No universal runtime claim</span>
          <strong>{claims.universalWasmRuntime ? "claimed" : "blocked"}</strong>
          <small>{claims.productionDesktopRuntime ? "production claimed" : "no production runtime claim"}</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="Filesystem grants">
        {fileRows.map((entry: AnyRecord) => (
          <li key={`${entry.access}-${entry.path}`}>
            <span>Filesystem grants</span>
            <strong>{entry.access}</strong>
            <small>{entry.path}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-evidence-list" aria-label="Network grants">
        {(networkAllow.length > 0 ? networkAllow : [{ protocol: "none", host: "disabled", port: 0 }]).map((entry: AnyRecord) => (
          <li key={`${entry.protocol}-${entry.host}-${entry.port}`}>
            <span>Network grants</span>
            <strong>{wasi.network?.mode}</strong>
            <small>{entry.port ? `${entry.protocol}://${entry.host}:${entry.port}` : "no network grant"}</small>
          </li>
        ))}
      </ol>
      <div className="curated-adapter-lane-grid compact" aria-label="WASI host capability controls">
        <div>
          <span>Environment</span>
          <strong>{wasi.environment?.mode}</strong>
          <small>{Array.isArray(wasi.environment?.variables) ? wasi.environment.variables.join(" / ") : "empty"}</small>
        </div>
        <div>
          <span>Clock and random</span>
          <strong>{`${wasi.clocks} / ${wasi.random}`}</strong>
          <small>host clock and host random are not accepted</small>
        </div>
        <div>
          <span>Subprocess shell</span>
          <strong>{`${wasi.subprocess} / ${wasi.shell}`}</strong>
          <small>host execution is denied</small>
        </div>
        <div>
          <span>Browser data</span>
          <strong>{wasi.browserData}</strong>
          <small>profile, cookies, and storage are not imported</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="WASM permission preflight">
        {permissionRows.map((decision: AnyRecord) => (
          <li key={`${decision.family}-${decision.action}-${decision.target}`}>
            <span>{decision.family}</span>
            <strong>{decision.status}</strong>
            <small>{`${decision.action} / ${decision.target}`}</small>
          </li>
        ))}
      </ol>
      <div className="curated-adapter-lane-grid compact" aria-label="Artifact receipts">
        <div>
          <span>Artifact receipts</span>
          <strong>{artifacts.cleanupStatus}</strong>
          <small>{artifacts.cleanupReceiptRequired ? "cleanup receipt required" : "cleanup receipt missing"}</small>
        </div>
        <div>
          <span>Redaction</span>
          <strong>{artifacts.redaction}</strong>
          <small>{artifacts.contract}</small>
        </div>
        <div>
          <span>Bounded outputs</span>
          <strong>{Array.isArray(artifacts.outputPaths) ? artifacts.outputPaths.length : 0}</strong>
          <small>{Array.isArray(artifacts.outputPaths) ? artifacts.outputPaths.join(" / ") : "none"}</small>
        </div>
        <div>
          <span>User actions</span>
          <strong>{userActions.length}</strong>
          <small>{userActions[0] ?? "review required"}</small>
        </div>
      </div>
      <ol className="curated-adapter-block-list" aria-label="Blocked unsafe WASM samples">
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
