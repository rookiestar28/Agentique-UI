import { useI18n } from "../i18n/I18nProvider";
import type { LibraryWorkspaceProps } from "./LibraryImportWorkspaceTypes";

export function LibraryWorkspace({
  companionAcquisitionProof,
  companionReadbackReview,
  libraryRows,
  libraryUpdateLifecycle,
  primaryResource,
  sessionEvents,
  sessionSummary
}: LibraryWorkspaceProps) {
  const { t } = useI18n();
  const updateStates = [...new Set(libraryUpdateLifecycle.entries.map((entry) => entry.state))];
  const updatePreview = libraryUpdateLifecycle.entries.find((entry) => entry.state === "available");
  const offlineEntry = libraryUpdateLifecycle.entries.find((entry) => entry.state === "offline");

  return (
    <div className="workspace-stack" data-page="library">
      <section className="workspace-section library-workspace" aria-labelledby="library-heading">
        <div className="section-heading">
          <p className="caption">{t("workspace.library.caption")}</p>
          <h2 id="library-heading">{t("workspace.library.title")}</h2>
        </div>

        <div className="resource-browser" aria-label={t("workspace.library.proofSummary")}>
          <div className="table-scroll resource-table">
            <table>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Mode</th>
                  <th>Digest</th>
                  <th>Readback</th>
                  <th>Access</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {libraryRows.map((resource) => (
                  <tr key={resource.key}>
                    <td>
                      <strong>{resource.title}</strong>
                      <span className="row-subtitle">
                        {resource.resourceId}@{resource.version}
                      </span>
                    </td>
                    <td>
                      <span className="badge warm">{resource.supportMode}</span>
                    </td>
                    <td>
                      <code className="digest-code">{resource.digest.slice(0, 12)}</code>
                    </td>
                    <td>
                      <span className="badge success">{companionReadbackReview.badge.label}</span>
                    </td>
                    <td>
                      {resource.permissionState.files}/{resource.permissionState.network}
                    </td>
                    <td>
                      <span className="badge success">{resource.provenance.verificationStatus}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="resource-detail" aria-label="Selected resource detail">
            <div className="detail-header">
              <span>{libraryRows.length} versioned record</span>
              <strong>{primaryResource.title}</strong>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Companion readback</dt>
                <dd>{companionReadbackReview.badge.state}</dd>
              </div>
              <div>
                <dt>Download proof</dt>
                <dd>{companionReadbackReview.download.downloadKind}</dd>
              </div>
              <div>
                <dt>Acquisition proof</dt>
                <dd>{companionAcquisitionProof.decision}</dd>
              </div>
              <div>
                <dt>Acquisition target</dt>
                <dd>{companionAcquisitionProof.plan.finalPathReference}</dd>
              </div>
              <div>
                <dt>Parser variant</dt>
                <dd>{companionReadbackReview.parserVariant.state}</dd>
              </div>
              <div>
                <dt>Agent-native</dt>
                <dd>{companionReadbackReview.agentNative.state}</dd>
              </div>
              <div>
                <dt>installState.status</dt>
                <dd>{primaryResource.installState.status}</dd>
              </div>
              <div>
                <dt>Signer</dt>
                <dd>{primaryResource.provenance.signer}</dd>
              </div>
              <div>
                <dt>Shell access</dt>
                <dd>{primaryResource.permissionState.shell}</dd>
              </div>
              <div>
                <dt>Cleanup</dt>
                <dd>{primaryResource.cleanupState.status}</dd>
              </div>
              <div>
                <dt>Update states</dt>
                <dd>{updateStates.join(" / ")}</dd>
              </div>
              <div>
                <dt>Update preview</dt>
                <dd>{updatePreview ? `${updatePreview.preview.decision} / review-only` : "current-local-version"}</dd>
              </div>
              <div>
                <dt>Rollback target</dt>
                <dd>{updatePreview?.rollback.targetVersion ?? primaryResource.version}</dd>
              </div>
              <div>
                <dt>Cleanup receipt</dt>
                <dd>{updatePreview?.cleanup.receipt.kind ?? "library-cleanup"}</dd>
              </div>
              <div>
                <dt>Offline</dt>
                <dd>{offlineEntry?.offline.cloudSessionState ?? "not-required"}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <section className="workspace-section session-workspace" aria-labelledby="session-heading">
        <div className="section-heading">
          <p className="caption">Session</p>
          <h2 id="session-heading">Local run draft</h2>
        </div>
        <dl className="session-ledger" aria-label="Local session summary">
          <div>
            <dt>Events</dt>
            <dd>{sessionSummary.eventCount}</dd>
          </div>
          <div>
            <dt>Artifacts</dt>
            <dd>{sessionSummary.artifacts}</dd>
          </div>
          <div>
            <dt>Failures</dt>
            <dd>{sessionSummary.failures}</dd>
          </div>
          <div>
            <dt>Cleanup</dt>
            <dd>{sessionSummary.cleanupStatus}</dd>
          </div>
        </dl>
        <ol className="session-timeline" aria-label="Preview validation dry-run handoff log artifact cleanup timeline">
          {sessionEvents.map((entry) => (
            <li key={`${entry.type}-${entry.label}`}>
              <span>{entry.type}</span>
              <strong>{entry.label}</strong>
            </li>
          ))}
        </ol>
        <div className="fail-closed" role="status">
          <strong>Local-only session record</strong>
          <span>No cloud session is required; logs, artifacts, exports, and failure records stay redacted.</span>
        </div>
      </section>
    </div>
  );
}
