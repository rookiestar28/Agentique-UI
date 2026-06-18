import type { AnyRecord } from "./TrustRunSettingsTypes";

type ExternalHandoffPanelProps = {
  externalHandoffDescriptors: AnyRecord;
};

export function ExternalHandoffPanel({ externalHandoffDescriptors }: ExternalHandoffPanelProps) {
  const firstDescriptor = externalHandoffDescriptors.descriptors[0];

  return (
    <div className="external-handoff-panel" aria-label="External handoff descriptor evidence">
      <div className="section-heading">
        <p className="caption">External handoff</p>
        <h2>Descriptor evidence</h2>
      </div>
      <div className="external-handoff-grid">
        <div>
          <span>Descriptors</span>
          <strong>{externalHandoffDescriptors.summary.descriptors}</strong>
          <small>{externalHandoffDescriptors.status}</small>
        </div>
        <div>
          <span>Blocked</span>
          <strong>{externalHandoffDescriptors.summary.blocked}</strong>
          <small>{externalHandoffDescriptors.summary.handoffOnly} handoff-only</small>
        </div>
        <div>
          <span>Permission route</span>
          <strong>{externalHandoffDescriptors.summary.permissionRequired}</strong>
          <small>permission review or external handoff</small>
        </div>
        <div>
          <span>Runtime starts</span>
          <strong>{externalHandoffDescriptors.summary.runtimeStarts}</strong>
          <small>descriptor-only review</small>
        </div>
      </div>
      <ol className="external-handoff-list">
        {externalHandoffDescriptors.descriptors.slice(0, 5).map((descriptor: AnyRecord) => (
          <li className={descriptor.classification} key={descriptor.id}>
            <span>{descriptor.nodeLabel}</span>
            <strong>{descriptor.targetCategory}</strong>
            <small>{descriptor.reasons[0]?.message ?? descriptor.requiredBoundary}</small>
          </li>
        ))}
      </ol>
      <div className="external-handoff-grid compact" aria-label="External handoff partial execution evidence">
        <div>
          <span>Linked run</span>
          <strong>{firstDescriptor?.partialEvidence.linkedRunId ?? "not-started"}</strong>
          <small>{firstDescriptor?.partialEvidence.localRunStatus ?? "not-started"}</small>
        </div>
        <div>
          <span>Upstream completed</span>
          <strong>{firstDescriptor?.partialEvidence.upstreamCompleted ?? 0}</strong>
          <small>{`${firstDescriptor?.partialEvidence.skippedDependencies ?? 0} skipped dependencies`}</small>
        </div>
        <div>
          <span>Artifact links</span>
          <strong>{firstDescriptor?.partialEvidence.artifactDescriptors.length ?? 0}</strong>
          <small>redacted descriptors only</small>
        </div>
      </div>
      <div className="external-handoff-grid compact" aria-label="External handoff bridge boundary">
        <div>
          <span>Bridge</span>
          <strong>{externalHandoffDescriptors.bridgeBoundary.startsBridge ? "starts" : "disabled"}</strong>
          <small>{externalHandoffDescriptors.bridgeBoundary.requiresSeparateBridgeGate ? "separate bridge gate required" : "no bridge gate"}</small>
        </div>
        <div>
          <span>External runtime</span>
          <strong>{externalHandoffDescriptors.bridgeBoundary.startsRuntime ? "starts" : "not started"}</strong>
          <small>{externalHandoffDescriptors.bridgeBoundary.makesNetworkRequest ? "network request" : "no network request"}</small>
        </div>
        <div>
          <span>Browser data</span>
          <strong>{externalHandoffDescriptors.bridgeBoundary.browserDataAccess ? "available" : "blocked"}</strong>
          <small>{externalHandoffDescriptors.bridgeBoundary.ambientEnvironment ? "ambient env" : "no ambient env"}</small>
        </div>
      </div>
      <div className="external-handoff-grid compact" aria-label="External handoff destination policy">
        <div>
          <span>Client</span>
          <strong>{externalHandoffDescriptors.destinationReview.client.status}</strong>
          <small>{externalHandoffDescriptors.destinationReview.client.reason}</small>
        </div>
        <div>
          <span>Export folder</span>
          <strong>{externalHandoffDescriptors.destinationReview.exportFolder.status}</strong>
          <small>{externalHandoffDescriptors.destinationReview.exportFolder.writesFilesFromApp ? "app writes files" : "user action only"}</small>
        </div>
        <div>
          <span>Localhost</span>
          <strong>{externalHandoffDescriptors.destinationReview.localhost.allowed ? "constrained" : "blocked"}</strong>
          <small>{externalHandoffDescriptors.destinationReview.localhost.startsServer ? "starts server" : "no server start"}</small>
        </div>
        <div>
          <span>Deep link</span>
          <strong>{externalHandoffDescriptors.destinationReview.deepLink.allowed ? "constrained" : "blocked"}</strong>
          <small>{externalHandoffDescriptors.destinationReview.deepLink.opensAutomatically ? "auto open" : "explicit action"}</small>
        </div>
      </div>
      <div className="external-handoff-grid compact" aria-label="External handoff cleanup readiness">
        <div>
          <span>User action</span>
          <strong>{firstDescriptor?.destinationPolicy.requiresExplicitUserAction ? "required" : "blocked"}</strong>
          <small>{firstDescriptor?.userAction.intent ?? "review first"}</small>
        </div>
        <div>
          <span>Payload</span>
          <strong>{externalHandoffDescriptors.destinationReview.payload.status}</strong>
          <small>{externalHandoffDescriptors.destinationReview.payload.credentialsForwarded ? "credentials forwarded" : "no credentials"}</small>
        </div>
        <div>
          <span>Shutdown</span>
          <strong>{externalHandoffDescriptors.destinationReview.clientCloseout.ready ? "ready" : "blocked"}</strong>
          <small>{externalHandoffDescriptors.destinationReview.clientCloseout.appTerminatesClient ? "app terminates client" : "user-owned cleanup"}</small>
        </div>
        <div>
          <span>Cleanup</span>
          <strong>{externalHandoffDescriptors.destinationReview.cleanup.ready ? "ready" : "blocked"}</strong>
          <small>{externalHandoffDescriptors.destinationReview.cleanup.receiptRequired ? "receipt required" : "blocked"}</small>
        </div>
      </div>
    </div>
  );
}
