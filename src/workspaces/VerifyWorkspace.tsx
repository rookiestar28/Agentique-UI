import { SlidersHorizontal } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import type { VerifyWorkspaceProps } from "./TrustRunSettingsTypes";

export function VerifyWorkspace({ capabilityReview, capabilityRows, dryRunReport, primaryResource, validation, verificationChecklist }: VerifyWorkspaceProps) {
  const activeNav = "verify";
  const { t } = useI18n();

  return (
    <>
      {activeNav === "verify" ? (
        <div className="workspace-stack" data-page="verify">
          <section className="workspace-section verification-workspace" aria-labelledby="verify-heading">
            <div className="section-heading">
              <p className="caption">{t("workspace.verify.caption")}</p>
              <h2 id="verify-heading">{t("workspace.verify.title")}</h2>
            </div>
            <div className="trust-summary" aria-label="Verification proof summary">
              <div>
                <span>Digest proof</span>
                <strong>{primaryResource.digest.slice(0, 12)}</strong>
              </div>
              <div>
                <span>Provenance signer</span>
                <strong>{primaryResource.provenance.signer}</strong>
              </div>
              <div>
                <span>Permission posture</span>
                <strong>
                  {primaryResource.permissionState.files}/{primaryResource.permissionState.network}
                </strong>
              </div>
              <div>
                <span>Loading state</span>
                <strong>Idle</strong>
              </div>
              <div>
                <span>Empty state</span>
                <strong>{validation.ok ? "Accepted intent present" : "No accepted intent"}</strong>
              </div>
            </div>
            <ol className="check-list">
              {verificationChecklist.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.status}</strong>
                </li>
              ))}
            </ol>
          </section>

          <section className="workspace-section capability-workspace" aria-labelledby="capability-heading">
            <div className="section-heading">
              <p className="caption">Permission review</p>
              <h2 id="capability-heading">Capability manifest</h2>
            </div>
            <div className="capability-summary" aria-label="Capability review summary">
              <span>
                <SlidersHorizontal size={15} aria-hidden="true" /> {capabilityReview.summary.deny} denied
              </span>
              <span>{capabilityReview.summary.ask} ask before use</span>
              <span>{capabilityReview.summary.allow} allowed now</span>
              <span>Revocation ready</span>
            </div>
            <div className="capability-list" aria-label="Default-deny capability decisions">
              {capabilityRows.map((capability) => (
                <div className={`capability-row ${capability.decision}`} key={capability.family}>
                  <div>
                    <strong>{capability.family}</strong>
                    <span>{capability.scope}</span>
                  </div>
                  <span className="decision-pill">{capability.decision}</span>
                </div>
              ))}
            </div>
            <div className="fail-closed" role="status">
              <strong>Review only</strong>
              <span>Capability decisions are displayed for audit and revocation; no native permission is granted by this screen.</span>
            </div>
          </section>

          <section className="workspace-section dry-run-workspace" aria-labelledby="dry-run-heading">
            <div className="section-heading">
              <p className="caption">Validate-only</p>
              <h2 id="dry-run-heading">Dry-run report</h2>
            </div>
            <div className="dry-run-state" aria-label="Dry-run validation summary">
              <span>{dryRunReport.operationMode}</span>
              <span>{dryRunReport.summary.checks} checks</span>
              <span>{dryRunReport.summary.failed} blocked</span>
              <span>{dryRunReport.sideEffects.length} side effects</span>
            </div>
            <div className="dry-run-checks" aria-label="Schema Capability Compatibility Dependency Missing-secret Unsupported-node Artifact-contract">
              {dryRunReport.checks.map((check: { family: string; status: string; issueCount: number }) => (
                <article className={`dry-run-check ${check.status}`} key={check.family}>
                  <span>{check.family}</span>
                  <strong>{check.status}</strong>
                  <small>{check.issueCount} issue</small>
                </article>
              ))}
            </div>
            <ol className="dry-run-failures" aria-label="Redacted dry-run failure report">
              {dryRunReport.failures.slice(0, 4).map((failure: { family: string; code: string; message: string }) => (
                <li key={`${failure.family}-${failure.code}`}>
                  <span>{failure.family}</span>
                  <strong>{failure.code}</strong>
                  <small>{failure.message}</small>
                </li>
              ))}
            </ol>
            <div className="fail-closed" role="status">
              <strong>Side effects remain empty</strong>
              <span>Failures are redacted before display. No adapter start, file write, network fetch, or shell command is performed.</span>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
