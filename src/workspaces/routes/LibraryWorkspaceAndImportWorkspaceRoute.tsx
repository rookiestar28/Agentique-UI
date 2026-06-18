import { useMemo } from "react";
import {
  createCompanionArtifactAcquisitionProof,
  createCompanionDownloadAcquisitionPlan,
  sampleCompanionAcquisitionRequest,
  sampleCompanionAcquisitionResult
} from "../../core/companion-download-acquisition.mjs";
import { createCompanionReadbackReview, sampleCompanionReadback } from "../../core/companion-readback-adapter.mjs";
import { createCompanionUploaderPreview, sampleCompanionUploaderPreviewInput } from "../../core/companion-uploader-preview.mjs";
import { createCompanionValidatorImportProof, sampleCompanionValidatorReport } from "../../core/companion-validator-adapter.mjs";
import { sampleLibraryUpdateLifecycle } from "../../core/library-update-lifecycle.mjs";
import { sampleLibraryState } from "../../core/library-store.mjs";
import { reviewPlatformCapabilityClassifierGate } from "../../core/platform-capability-classifier.mjs";
import { reviewPlatformFormatAdapterGate } from "../../core/platform-format-adapter.mjs";
import { reviewPlatformIrNormalizerGate } from "../../core/platform-ir-normalizer.mjs";
import { createSourceRoundTripHandoff } from "../../core/source-roundtrip-handoff.mjs";
import { sampleSession, summarizeSession } from "../../core/session-store.mjs";
import type { ImportWorkspaceState } from "../../app-state/useImportWorkspaceState";
import type { NavigationKey } from "../../ui/navigation";
import { ImportWorkspace, LibraryWorkspace } from "../LibraryImportWorkspaces";
import type { ImportValidation } from "../LibraryImportWorkspaceTypes";

type LibraryImportRouteProps = {
  activeNav: Extract<NavigationKey, "library" | "import">;
  importState: ImportWorkspaceState;
  selectedResource: string;
  validation: ImportValidation;
};

export default function LibraryWorkspaceAndImportWorkspaceRoute({ activeNav, importState, selectedResource, validation }: LibraryImportRouteProps) {
  const companionReadbackReview = useMemo(() => createCompanionReadbackReview(sampleCompanionReadback, { now: "2026-06-13T00:05:00.000Z" }), []);
  const companionValidatorProof = useMemo(() => createCompanionValidatorImportProof(sampleCompanionValidatorReport, { checkedAt: "2026-06-13T00:10:00.000Z" }), []);
  const companionAcquisitionPlan = useMemo(
    () =>
      createCompanionDownloadAcquisitionPlan(sampleCompanionReadback, sampleCompanionAcquisitionRequest, {
        checkedAt: "2026-06-13T00:15:00.000Z"
      }),
    []
  );
  const companionAcquisitionProof = useMemo(
    () =>
      createCompanionArtifactAcquisitionProof(companionAcquisitionPlan, sampleCompanionAcquisitionResult, {
        checkedAt: "2026-06-13T00:16:00.000Z"
      }),
    [companionAcquisitionPlan]
  );
  const companionUploaderPreview = useMemo(
    () =>
      createCompanionUploaderPreview(sampleCompanionUploaderPreviewInput, {
        checkedAt: "2026-06-13T00:20:00.000Z"
      }),
    []
  );
  const platformAdapterReview = useMemo(() => reviewPlatformFormatAdapterGate(), []);
  const platformIrReview = useMemo(() => reviewPlatformIrNormalizerGate(), []);
  const platformCapabilityReview = useMemo(() => reviewPlatformCapabilityClassifierGate(), []);
  const sourceRoundTripHandoff = useMemo(() => createSourceRoundTripHandoff(), []);
  const sessionSummary = useMemo(() => summarizeSession(sampleSession), []);
  const libraryUpdateLifecycle = useMemo(() => sampleLibraryUpdateLifecycle, []);
  const libraryRows = sampleLibraryState.resources;
  const primaryResource = libraryRows[0];

  if (activeNav === "library") {
    return (
      <LibraryWorkspace
        libraryRows={libraryRows}
        libraryUpdateLifecycle={libraryUpdateLifecycle}
        companionAcquisitionProof={companionAcquisitionProof}
        companionReadbackReview={companionReadbackReview}
        primaryResource={primaryResource}
        sessionEvents={sampleSession.events}
        sessionSummary={sessionSummary}
      />
    );
  }

  return (
    <ImportWorkspace
      intentText={importState.intentText}
      onIntentTextChange={importState.setIntentText}
      onLoadExample={importState.resetIntent}
      onValidateIntent={importState.validateIntentText}
      companionAcquisitionProof={companionAcquisitionProof}
      companionReadbackReview={companionReadbackReview}
      companionUploaderPreview={companionUploaderPreview}
      companionValidatorProof={companionValidatorProof}
      externalIntakeError={importState.externalIntakeError}
      externalIntakeReport={importState.externalIntakeReport}
      externalIntakeScanState={importState.externalIntakeScanState}
      externalIntakeSelectedCount={importState.externalIntakeSelectedCount}
      onExternalIntakeFilesSelected={importState.handleExternalIntakeFilesSelected}
      onLoadBlockedExternalIntakeSample={importState.loadBlockedExternalIntakeSample}
      onLoadExternalIntakeSample={importState.loadExternalIntakeSample}
      onResetExternalIntake={importState.resetExternalIntake}
      onRunExternalIntakeScan={importState.runExternalIntakeScan}
      platformAdapterReview={platformAdapterReview}
      platformCapabilityReview={platformCapabilityReview}
      platformIrReview={platformIrReview}
      primaryResource={primaryResource}
      selectedResource={selectedResource}
      sourceRoundTripHandoff={sourceRoundTripHandoff}
      validation={validation}
    />
  );
}
