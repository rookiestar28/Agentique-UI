import { useMemo } from "react";
import { reviewCapabilityManifest, sampleCapabilityManifest } from "../../core/capability-policy.mjs";
import { sampleLibraryState } from "../../core/library-store.mjs";
import { verificationChecklist } from "../../core/package-verifier.mjs";
import { createValidateOnlyDryRun, sampleDryRunInput } from "../../core/validate-dry-run.mjs";
import { VerifyWorkspace } from "../TrustRunSettingsWorkspaces";

type VerifyWorkspaceRouteProps = {
  validation: { ok: boolean };
};

export default function VerifyWorkspaceRoute({ validation }: VerifyWorkspaceRouteProps) {
  const capabilityReview = useMemo(() => reviewCapabilityManifest(sampleCapabilityManifest), []);
  const capabilityRows = Object.values(capabilityReview.capabilities);
  const dryRunReport = useMemo(() => createValidateOnlyDryRun(sampleDryRunInput), []);
  const primaryResource = sampleLibraryState.resources[0];

  return (
    <VerifyWorkspace
      capabilityReview={capabilityReview}
      capabilityRows={capabilityRows}
      dryRunReport={dryRunReport}
      primaryResource={primaryResource}
      validation={validation}
      verificationChecklist={verificationChecklist}
    />
  );
}
