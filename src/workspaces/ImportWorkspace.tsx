import { useI18n } from "../i18n/I18nProvider";
import type {
  AnyRecord,
  CompanionAcquisitionProof,
  CompanionUploaderPreview,
  CompanionValidatorProof,
  ExternalIntakeFinding,
  ExternalIntakeReport,
  ImportWorkspaceProps
} from "./LibraryImportWorkspaceTypes";

export function ImportWorkspace({
  companionAcquisitionProof,
  companionReadbackReview,
  companionUploaderPreview,
  companionValidatorProof,
  externalIntakeError,
  externalIntakeReport,
  externalIntakeScanState,
  externalIntakeSelectedCount,
  intentText,
  onExternalIntakeFilesSelected,
  onIntentTextChange,
  onLoadBlockedExternalIntakeSample,
  onLoadExample,
  onLoadExternalIntakeSample,
  onResetExternalIntake,
  onRunExternalIntakeScan,
  onValidateIntent,
  platformAdapterReview,
  platformCapabilityReview,
  platformIrReview,
  primaryResource,
  selectedResource,
  sourceRoundTripHandoff,
  validation
}: ImportWorkspaceProps) {
  const { t } = useI18n();
  const intent = validation.ok ? validation.intent : undefined;
  const directoryInputProps = { webkitdirectory: "", directory: "" } as Record<string, string>;
  const externalFindings = externalIntakeReport.findings.slice(0, 6);
  const platformCapabilityRows = platformCapabilityReview.matrixRows.slice(0, 6);
  const sourceRoundTripRows = sourceRoundTripHandoff.exports.slice(0, 3);
  const sourcePlatformHandoffs = sourceRoundTripHandoff.sourcePlatformHandoffs.slice(0, 5);

  return (
    <div className="workspace-stack" data-page="import">
      <section className="workspace-section import-workspace" aria-labelledby="import-heading">
        <div className="section-heading">
          <p className="caption">{t("workspace.import.caption")}</p>
          <h2 id="import-heading">{t("workspace.import.title")}</h2>
        </div>

        <div className="import-flow">
          <div className="intent-editor">
            <label className="input-label" htmlFor="resource-intent">
              {t("workspace.import.intentLabel")}
            </label>
            <textarea id="resource-intent" spellCheck="false" value={intentText} onChange={(event) => onIntentTextChange(event.currentTarget.value)} />
            <div className="button-row">
              <button className="primary-action" type="button" onClick={onValidateIntent}>
                {t("command.validateIntent")}
              </button>
              <button className="secondary-action" type="button" onClick={onLoadExample}>
                {t("workspace.import.loadExample")}
              </button>
            </div>
            <div className="external-intake-panel" aria-label={t("workspace.import.externalIntakeLabel")}>
              <label className="input-label" htmlFor="external-intake-files">
                {t("workspace.import.externalIntakeLabel")}
              </label>
              <input
                id="external-intake-files"
                className="local-file-picker"
                type="file"
                multiple
                {...directoryInputProps}
                onChange={(event) => onExternalIntakeFilesSelected(event.currentTarget.files)}
              />
              <div className="button-row">
                <button className="primary-action" type="button" onClick={onRunExternalIntakeScan}>
                  {externalIntakeScanState === "scanning" ? "Scanning" : t("workspace.import.runStaticScan")}
                </button>
                <button className="secondary-action" type="button" onClick={onLoadExternalIntakeSample}>
                  {t("workspace.import.loadSafeSample")}
                </button>
                <button className="secondary-action" type="button" onClick={onLoadBlockedExternalIntakeSample}>
                  Load blocked sample
                </button>
                <button className="secondary-action" type="button" onClick={onResetExternalIntake}>
                  Reset scanner
                </button>
              </div>
              <p className="external-intake-status" role="status">
                {externalIntakeError || `${externalIntakeSelectedCount} selected file(s); scan state ${externalIntakeScanState}.`}
              </p>
            </div>
          </div>

          <aside className="import-review">
            <div className={validation.ok ? "import-result-line ok" : "import-result-line error"} role="status">
              {validation.ok ? (
                <span>Intent accepted for {selectedResource}; queued for proof review before any download.</span>
              ) : (
                <span>{validation.errors?.[0]?.message ?? "Intent rejected."}</span>
              )}
            </div>
            <dl className="proof-ledger" aria-label="Import proof states">
              <div>
                <dt>Scoped origin</dt>
                <dd>{intent ? intent.origin : "Rejected before download"}</dd>
              </div>
              <div>
                <dt>Audience</dt>
                <dd>{intent ? intent.audience : "agentique-ui required"}</dd>
              </div>
              <div>
                <dt>Nonce</dt>
                <dd>{intent ? intent.nonce.slice(0, 10) : "Unavailable"}</dd>
              </div>
              <div>
                <dt>Cleanup state</dt>
                <dd>{primaryResource.cleanupState.status}</dd>
              </div>
              <div>
                <dt>Companion readback</dt>
                <dd>{companionReadbackReview.badge.label}</dd>
              </div>
              <div>
                <dt>Read-only client</dt>
                <dd>{companionReadbackReview.readOnly.mutationMethods ? "Blocked" : "GET-only"}</dd>
              </div>
              <div>
                <dt>Trust state</dt>
                <dd>{companionReadbackReview.trust.platformState}</dd>
              </div>
              <div>
                <dt>Agent-native private boundary</dt>
                <dd>{companionReadbackReview.agentNative.privateAvailability}</dd>
              </div>
              <div>
                <dt>Validator import proof</dt>
                <dd>{companionValidatorProof.decision}</dd>
              </div>
              <div>
                <dt>Manifest/schema</dt>
                <dd>{statusForProofRow(companionValidatorProof, "Manifest/schema")}</dd>
              </div>
              <div>
                <dt>Hash/inventory</dt>
                <dd>{statusForProofRow(companionValidatorProof, "Hash/inventory")}</dd>
              </div>
              <div>
                <dt>Secret/overclaim gate</dt>
                <dd>{[statusForProofRow(companionValidatorProof, "Secret/redaction"), statusForProofRow(companionValidatorProof, "Overclaim gate")].join(" / ")}</dd>
              </div>
              <div>
                <dt>Parser/agent-native proof</dt>
                <dd>
                  {companionValidatorProof.summary.parserVariantState}/{companionValidatorProof.summary.agentNativeState}
                </dd>
              </div>
              <div>
                <dt>No-execution validator</dt>
                <dd>{statusForProofRow(companionValidatorProof, "No execution")}</dd>
              </div>
              <div>
                <dt>Acquisition bridge</dt>
                <dd>{companionAcquisitionProof.decision}</dd>
              </div>
              <div>
                <dt>Destination boundary</dt>
                <dd>{statusForAcquisitionRow(companionAcquisitionProof, "Destination boundary")}</dd>
              </div>
              <div>
                <dt>No-overwrite default</dt>
                <dd>{statusForAcquisitionRow(companionAcquisitionProof, "No-overwrite default")}</dd>
              </div>
              <div>
                <dt>Atomic write</dt>
                <dd>{statusForAcquisitionRow(companionAcquisitionProof, "Atomic write")}</dd>
              </div>
              <div>
                <dt>Byte/digest proof</dt>
                <dd>
                  {[
                    companionAcquisitionProof.integrity.sizeMatches ? "size-pass" : "size-blocked",
                    companionAcquisitionProof.integrity.digestMatches ? "digest-pass" : "digest-blocked"
                  ].join(" / ")}
                </dd>
              </div>
              <div>
                <dt>Cleanup receipt</dt>
                <dd>{companionAcquisitionProof.cleanup.status}</dd>
              </div>
              <div>
                <dt>Install boundary</dt>
                <dd>{statusForAcquisitionRow(companionAcquisitionProof, "Install boundary")}</dd>
              </div>
              <div>
                <dt>Uploader boundary</dt>
                <dd>{companionUploaderPreview.decision}</dd>
              </div>
              <div>
                <dt>submissionMode</dt>
                <dd>{companionUploaderPreview.boundary.submissionMode}</dd>
              </div>
              <div>
                <dt>liveUploadAvailable</dt>
                <dd>{String(companionUploaderPreview.boundary.liveUploadAvailable)}</dd>
              </div>
              <div>
                <dt>Upload plan preview</dt>
                <dd>{statusForUploaderRow(companionUploaderPreview, "Upload plan preview")}</dd>
              </div>
              <div>
                <dt>Import plan preview</dt>
                <dd>
                  {[
                    statusForUploaderRow(companionUploaderPreview, "Import plan preview"),
                    companionUploaderPreview.plans.import.sourceEcosystem,
                    companionUploaderPreview.plans.import.sourceFormat
                  ]
                    .filter(Boolean)
                    .join(" / ")}
                </dd>
              </div>
              <div>
                <dt>Variant plan preview</dt>
                <dd>
                  {[`${companionUploaderPreview.plans.variant.sourceOnlyCount} source-only`, `${companionUploaderPreview.plans.variant.readyForDownloadCount} download-ready`].join(
                    " / "
                  )}
                </dd>
              </div>
              <div>
                <dt>Agent-native plan preview</dt>
                <dd>{statusForUploaderRow(companionUploaderPreview, "Agent-native plan preview")}</dd>
              </div>
              <div>
                <dt>Draft preview</dt>
                <dd>
                  {[
                    statusForUploaderRow(companionUploaderPreview, "Draft preview"),
                    companionUploaderPreview.draft.draftOnly ? "draftOnly" : "blocked",
                    companionUploaderPreview.draft.submitted ? "submitted" : "submitted=false"
                  ].join(" / ")}
                </dd>
              </div>
              <div>
                <dt>Patch/delta preview</dt>
                <dd>
                  {[
                    statusForUploaderRow(companionUploaderPreview, "Patch/delta preview"),
                    companionUploaderPreview.patchDelta.partialUpdateOnly ? "partialUpdateOnly" : "blocked",
                    companionUploaderPreview.patchDelta.submitted ? "submitted" : "submitted=false"
                  ].join(" / ")}
                </dd>
              </div>
              <div>
                <dt>No submit action</dt>
                <dd>{statusForUploaderRow(companionUploaderPreview, "No submit action")}</dd>
              </div>
              <div>
                <dt>External intake decision</dt>
                <dd>{externalIntakeReport.decision}</dd>
              </div>
              <div>
                <dt>External intake schema</dt>
                <dd>{externalIntakeReport.schemaVersion}</dd>
              </div>
              <div>
                <dt>Selected intake files</dt>
                <dd>{`${externalIntakeReport.summary.files} files / ${externalIntakeReport.summary.bytes} bytes`}</dd>
              </div>
              <div>
                <dt>Intake limits</dt>
                <dd>{`${externalIntakeReport.policy.maxFiles} files / ${externalIntakeReport.policy.maxBytes} bytes`}</dd>
              </div>
              <div>
                <dt>Intake license state</dt>
                <dd>{licenseSummary(externalIntakeReport)}</dd>
              </div>
              <div>
                <dt>Intake findings</dt>
                <dd>{`${externalIntakeReport.summary.blockingFindings} blocking / ${externalIntakeReport.summary.findings} total`}</dd>
              </div>
              <div>
                <dt>No-execution intake</dt>
                <dd>{externalIntakeReport.boundary.noExecution && externalIntakeReport.boundary.noNetwork ? "local-only / no-execution / no-network" : "blocked"}</dd>
              </div>
              <div>
                <dt>No-upload intake</dt>
                <dd>{externalIntakeReport.boundary.noUpload && externalIntakeReport.boundary.advisoryOnly ? "advisory-only / no-upload" : "blocked"}</dd>
              </div>
              <div>
                <dt>Adapter platforms</dt>
                <dd>{`${platformAdapterReview.summary.platforms} formats / ${platformAdapterReview.summary.accepted} accepted`}</dd>
              </div>
              <div>
                <dt>Parse-only boundary</dt>
                <dd>{platformAdapterReview.boundary.parseOnly && platformAdapterReview.boundary.noExecution ? "parse-only / no-execution" : "blocked"}</dd>
              </div>
              <div>
                <dt>Canonical IR</dt>
                <dd>{`${platformIrReview.summary.nodes} nodes / ${platformIrReview.summary.edges} edges`}</dd>
              </div>
              <div>
                <dt>Loss states</dt>
                <dd>
                  {[
                    `${platformIrReview.summary.preserved} preserved`,
                    `${platformIrReview.summary.semanticNormalized} normalized`,
                    `${platformIrReview.summary.degraded} degraded`,
                    `${platformIrReview.summary.handoffOnly} handoff`
                  ].join(" / ")}
                </dd>
              </div>
            </dl>
            <div className="external-intake-findings" aria-label="Redacted findings">
              <strong>Redacted findings</strong>
              {externalFindings.length > 0 ? (
                <ol>
                  {externalFindings.map((finding) => (
                    <li key={`${finding.code}-${finding.path}-${String(finding.details?.line ?? "")}`}>
                      <span>{finding.code}</span>
                      <code>{finding.path}</code>
                      <small>{findingDetail(finding)}</small>
                    </li>
                  ))}
                </ol>
              ) : (
                <span>No findings recorded.</span>
              )}
            </div>
            <div className="platform-adapter-panel" aria-label="Platform format adapter intake">
              <strong>Platform format adapter intake</strong>
              <dl className="platform-adapter-grid">
                <div>
                  <dt>Decision</dt>
                  <dd>{platformAdapterReview.decision}</dd>
                </div>
                <div>
                  <dt>Schema</dt>
                  <dd>{platformAdapterReview.schemaVersion}</dd>
                </div>
                <div>
                  <dt>Boundary</dt>
                  <dd>{platformAdapterReview.boundary.noNetwork && platformAdapterReview.boundary.noPackageInstall ? "no-network / no-install" : "blocked"}</dd>
                </div>
                <div>
                  <dt>Runtime claim</dt>
                  <dd>{platformAdapterReview.boundary.grantsRuntimeCompatibility ? "blocked" : "not granted"}</dd>
                </div>
              </dl>
              <ol>
                {platformAdapterReview.platformRows.map((row) => (
                  <li key={row.platform}>
                    <span>{row.label}</span>
                    <strong>{row.decision}</strong>
                    <small>{`${row.nodes} nodes / ${row.edges} edges / ${row.blockedFindings} blockers`}</small>
                  </li>
                ))}
              </ol>
            </div>
            <div className="platform-ir-panel" aria-label="Canonical workflow IR loss report">
              <strong>Canonical workflow IR loss report</strong>
              <dl className="platform-ir-grid">
                <div>
                  <dt>Schema</dt>
                  <dd>{platformIrReview.schemaVersion}</dd>
                </div>
                <div>
                  <dt>Boundary</dt>
                  <dd>{platformIrReview.boundary.reviewOnly && platformIrReview.boundary.noSchedulerStart ? "review-only / no-scheduler" : "blocked"}</dd>
                </div>
                <div>
                  <dt>Runtime claim</dt>
                  <dd>{platformIrReview.boundary.grantsRuntimeCompatibility ? "blocked" : "not granted"}</dd>
                </div>
                <div>
                  <dt>Blocked semantics</dt>
                  <dd>{platformIrReview.summary.blocked}</dd>
                </div>
              </dl>
              <ol>
                {platformIrReview.platformRows.map((row) => (
                  <li key={row.platform}>
                    <span>{row.platform}</span>
                    <strong>{row.decision}</strong>
                    <small>{`${row.nodes} nodes / ${row.preserved} preserved / ${row.normalized} normalized / ${row.degraded} degraded / ${row.handoffOnly} handoff`}</small>
                  </li>
                ))}
              </ol>
            </div>
            <div className="platform-capability-panel" aria-label="Platform capability classification review">
              <strong>Platform capability classification review</strong>
              <dl className="platform-capability-grid">
                <div>
                  <dt>Schema</dt>
                  <dd>{platformCapabilityReview.schemaVersion}</dd>
                </div>
                <div>
                  <dt>Boundary</dt>
                  <dd>{platformCapabilityReview.boundary.reviewOnly && platformCapabilityReview.boundary.noSchedulerStart ? "review-only / no-scheduler" : "blocked"}</dd>
                </div>
                <div>
                  <dt>Families</dt>
                  <dd>{platformCapabilityReview.summary.sourceFamilies}</dd>
                </div>
                <div>
                  <dt>Runtime claim</dt>
                  <dd>{platformCapabilityReview.boundary.grantsRuntimeCompatibility ? "blocked" : "not granted"}</dd>
                </div>
              </dl>
              <ol>
                {platformCapabilityRows.map((row, index) => (
                  <li key={`${row.platform}-${row.sourceFamily}-${index}`}>
                    <span>{`${row.platform} / ${row.sourceFamily}`}</span>
                    <strong>{row.primaryClassification}</strong>
                    <small>{`${row.nodes} node / ${row.executionLane}`}</small>
                  </li>
                ))}
              </ol>
            </div>
            <div className="source-roundtrip-panel" aria-label="Source-preserving round-trip export">
              <strong>Source-preserving round-trip export</strong>
              <dl className="source-roundtrip-grid">
                <div>
                  <dt>Status</dt>
                  <dd>{sourceRoundTripHandoff.status}</dd>
                </div>
                <div>
                  <dt>Source files</dt>
                  <dd>{`${sourceRoundTripHandoff.summary.sourceFilesPreserved}/${sourceRoundTripHandoff.summary.platforms} preserved`}</dd>
                </div>
                <div>
                  <dt>Source maps</dt>
                  <dd>{`${sourceRoundTripHandoff.summary.sourceMapEntries} entries`}</dd>
                </div>
                <div>
                  <dt>Loss entries</dt>
                  <dd>{sourceRoundTripHandoff.summary.lossEntries}</dd>
                </div>
              </dl>
              <ol className="source-roundtrip-list">
                {sourceRoundTripRows.map((entry: AnyRecord) => (
                  <li key={entry.id}>
                    <span>{`${entry.platform} / ${entry.sourceFile.format}`}</span>
                    <strong>{entry.sourceFile.sourceIdentity}</strong>
                    <small>{`${entry.sourceEnvelope.sourceMapNodes} node maps / ${entry.agentiqueMetadata.lossReport.degraded} degraded / ${entry.agentiqueMetadata.lossReport.handoffOnly} handoff`}</small>
                  </li>
                ))}
              </ol>
            </div>
            <div className="source-roundtrip-panel" aria-label="Source platform handoff requirements">
              <strong>Source platform handoff requirements</strong>
              <dl className="source-roundtrip-grid compact">
                <div>
                  <dt>Local subset</dt>
                  <dd>{`${sourceRoundTripHandoff.summary.localExecutableNodes} executable`}</dd>
                </div>
                <div>
                  <dt>Blocked nodes</dt>
                  <dd>{sourceRoundTripHandoff.summary.blockedNodes}</dd>
                </div>
                <div>
                  <dt>Handoff needs</dt>
                  <dd>{sourceRoundTripHandoff.summary.handoffNeeds}</dd>
                </div>
              </dl>
              <ol className="source-roundtrip-list compact">
                {sourcePlatformHandoffs.map((handoff: AnyRecord) => (
                  <li className={handoff.classification} key={handoff.id}>
                    <span>{`${handoff.platform} / ${handoff.sourceFamily}`}</span>
                    <strong>{handoff.targetCategory}</strong>
                    <small>{`${handoff.permissionFamilies.join(", ") || "no scoped grant"} / ${handoff.blockedLocalReasons[0]?.code ?? "review-only"}`}</small>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function statusForProofRow(proof: CompanionValidatorProof, label: string) {
  return proof.proofRows.find((row) => row.label === label)?.status ?? "missing";
}

function statusForAcquisitionRow(proof: CompanionAcquisitionProof, label: string) {
  return proof.proofRows.find((row) => row.label === label)?.status ?? "missing";
}

function statusForUploaderRow(preview: CompanionUploaderPreview, label: string) {
  return preview.previewRows.find((row) => row.label === label)?.status ?? "missing";
}

function licenseSummary(report: ExternalIntakeReport) {
  if (report.licenses.length === 0) {
    return "no license signal";
  }
  const policies = [...new Set(report.licenses.map((license) => license.policy))].sort();
  const normalized = report.licenses
    .map((license) => license.normalized)
    .filter(Boolean)
    .join(", ");
  return [policies.join("+"), normalized].filter(Boolean).join(" / ");
}

function findingDetail(finding: ExternalIntakeFinding) {
  const detail = finding.details ?? {};
  if (typeof detail.redacted === "string") {
    return detail.redacted;
  }
  if (typeof detail.category === "string") {
    return detail.category;
  }
  if (typeof detail.policy === "string") {
    return detail.policy;
  }
  if (typeof detail.snippet === "string") {
    return detail.snippet;
  }
  return finding.severity;
}
