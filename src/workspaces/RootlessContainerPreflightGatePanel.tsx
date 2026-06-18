import type { AnyRecord } from "./TrustRunSettingsTypes";

type RootlessContainerPreflightGatePanelProps = {
  rootlessContainerPreflightGate: AnyRecord;
};

export function RootlessContainerPreflightGatePanel({ rootlessContainerPreflightGate }: RootlessContainerPreflightGatePanelProps) {
  const review = rootlessContainerPreflightGate.review ?? rootlessContainerPreflightGate;
  const gate = rootlessContainerPreflightGate.gate ?? {};
  const host = review.host ?? {};
  const image = review.image ?? {};
  const filesystem = review.filesystem ?? {};
  const network = review.network ?? {};
  const resources = review.resources ?? {};
  const cleanup = review.cleanup ?? {};
  const permissions = review.permissions ?? {};
  const claims = review.claims ?? {};
  const volumes = Array.isArray(filesystem.volumes) ? filesystem.volumes : [];
  const publishes = Array.isArray(network.publish) ? network.publish : [];
  const permissionRows = Array.isArray(permissions.decisions) ? permissions.decisions : [];
  const smokeChecks = Array.isArray(host.platformSmoke?.checks) ? host.platformSmoke.checks : [];
  const userActions = Array.isArray(review.userActions) ? review.userActions : [];
  const blockedSamples = [
    {
      label: "Rootful daemon",
      status: gate.rootfulBlocked ? "blocked" : "missing",
      detail: "system daemon mode and system sockets cannot pass preflight."
    },
    {
      label: "Unsigned latest image",
      status: gate.untrustedImageBlocked ? "blocked" : "missing",
      detail: "tags without immutable digest, signature, provenance, and SBOM stay blocked."
    },
    {
      label: "Broad host volume",
      status: gate.broadVolumeBlocked ? "blocked" : "missing",
      detail: "daemon sockets, drive roots, home paths, and privileged mounts stay denied."
    },
    {
      label: "Host networking",
      status: gate.hostNetworkBlocked ? "blocked" : "missing",
      detail: "host network mode and public port publishing remain denied."
    }
  ];

  return (
    <div className="curated-adapter-lane-panel" aria-label="Rootless container preflight gate">
      <div className="section-heading">
        <p className="caption">Rootless container preflight gate</p>
        <h2>No-start container review</h2>
      </div>
      <div className="curated-adapter-lane-grid" aria-label="Rootless container status">
        <div>
          <span>Preflight status</span>
          <strong>{review.status}</strong>
          <small>{review.ok ? "deterministic review ready" : "blocked before launch"}</small>
        </div>
        <div>
          <span>Execution decision</span>
          <strong>{review.executionDecision}</strong>
          <small>{review.startsContainer ? "container start enabled" : "container start disabled"}</small>
        </div>
        <div>
          <span>Runtime mode</span>
          <strong>{host.runtime}</strong>
          <small>{`${host.runtimeVersion ?? "unknown"} / ${host.daemonMode}`}</small>
        </div>
        <div>
          <span>Rootless evidence</span>
          <strong>{host.rootless ? "rootless" : "blocked"}</strong>
          <small>{`${host.userNamespace ? "user namespace" : "missing namespace"} / ${host.socketScope} socket`}</small>
        </div>
      </div>
      <div className="curated-adapter-lane-grid compact" aria-label="Platform limitations">
        <div>
          <span>Platform limitations</span>
          <strong>{host.platform}</strong>
          <small>{`${host.cgroupMode} cgroup / resource limits require platform proof`}</small>
        </div>
        <div>
          <span>Security posture</span>
          <strong>{host.security?.seccomp}</strong>
          <small>{host.security?.noNewPrivileges ? "no-new-privileges" : "privilege escalation blocked"}</small>
        </div>
        <div>
          <span>Platform smoke</span>
          <strong>{host.platformSmoke?.status}</strong>
          <small>{smokeChecks.join(" / ")}</small>
        </div>
        <div>
          <span>No universal runtime claim</span>
          <strong>{claims.universalContainerRuntime ? "claimed" : "blocked"}</strong>
          <small>{claims.productionDesktopRuntime ? "production claimed" : "no production runtime claim"}</small>
        </div>
      </div>
      <div className="curated-adapter-lane-grid compact" aria-label="No start pull build receipts">
        <div>
          <span>No-start receipt</span>
          <strong>{review.startsContainer ? "missing" : "ready"}</strong>
          <small>container start remains disabled</small>
        </div>
        <div>
          <span>No-pull receipt</span>
          <strong>ready</strong>
          <small>image pull is not invoked from the browser surface</small>
        </div>
        <div>
          <span>No-build receipt</span>
          <strong>ready</strong>
          <small>image build and compose execution remain blocked</small>
        </div>
        <div>
          <span>User actions</span>
          <strong>{userActions.length}</strong>
          <small>{userActions[0] ?? "review required"}</small>
        </div>
      </div>
      <div className="curated-adapter-lane-grid compact" aria-label="Image trust">
        <div>
          <span>Image trust</span>
          <strong>{image.signature}</strong>
          <small>{image.reference}</small>
        </div>
        <div>
          <span>Provenance</span>
          <strong>{image.provenance}</strong>
          <small>{image.sbom ? "SBOM present" : "SBOM missing"}</small>
        </div>
        <div>
          <span>Revocation</span>
          <strong>{image.revocation}</strong>
          <small>{`digest ${image.digest}`}</small>
        </div>
        <div>
          <span>Resource limits</span>
          <strong>{`${Math.round(Number(resources.memoryBytes ?? 0) / 1048576)} MiB`}</strong>
          <small>{`${resources.cpus} CPU / ${resources.pidsLimit} PIDs / ${resources.timeoutMs} ms`}</small>
        </div>
      </div>
      <div className="curated-adapter-lane-grid compact" aria-label="Filesystem boundary">
        <div>
          <span>Filesystem boundary</span>
          <strong>{filesystem.readOnlyRootFilesystem ? "read-only root" : "blocked"}</strong>
          <small>{filesystem.privileged ? "privileged" : "unprivileged"}</small>
        </div>
        <div>
          <span>Capabilities</span>
          <strong>{Array.isArray(filesystem.capabilitiesDrop) ? filesystem.capabilitiesDrop.join(", ") : "missing"}</strong>
          <small>{filesystem.daemonSocketMounted ? "daemon socket mounted" : "no daemon socket"}</small>
        </div>
        <div>
          <span>Network policy</span>
          <strong>{network.mode}</strong>
          <small>{publishes.length > 0 ? `${publishes.length} loopback publish rule(s)` : "no public port publishing"}</small>
        </div>
        <div>
          <span>Cleanup receipts</span>
          <strong>{cleanup.status}</strong>
          <small>{cleanup.receiptRequired ? "receipt required" : "receipt missing"}</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="Container volume grants">
        {volumes.map((volume: AnyRecord) => (
          <li key={`${volume.source}-${volume.target}`}>
            <span>Scoped volume</span>
            <strong>{volume.mode}</strong>
            <small>{`${volume.source} -> ${volume.target}`}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-evidence-list" aria-label="Permission preflight">
        {permissionRows.map((decision: AnyRecord) => (
          <li key={`${decision.family}-${decision.action}-${decision.target}`}>
            <span>{decision.family}</span>
            <strong>{decision.status}</strong>
            <small>{`${decision.action} / ${decision.target}`}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-block-list" aria-label="Blocked unsafe container samples">
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
