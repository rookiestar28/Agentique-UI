import { useMemo } from "react";
import { sampleLibraryState } from "../../core/library-store.mjs";
import { createLocalVaultSecretsReview } from "../../core/local-vault-secrets-ux.mjs";
import { evaluateDistributionReadiness, sampleIncompleteDistributionEvidence } from "../../core/release-readiness.mjs";
import { buildRedactionReport, sampleVaultState } from "../../core/secret-vault.mjs";
import { exportDraft, sampleConfigDraft, sampleUiSchema, validateConfigDraft } from "../../core/ui-schema-config.mjs";
import { SettingsWorkspace } from "../TrustRunSettingsWorkspaces";

export default function SettingsWorkspaceRoute() {
  const primaryResource = sampleLibraryState.resources[0];
  const configDraft = useMemo(() => validateConfigDraft(sampleUiSchema, sampleConfigDraft), []);
  const configExport = useMemo(() => exportDraft(sampleUiSchema, sampleConfigDraft), []);
  const redactionReport = useMemo(() => buildRedactionReport(sampleVaultState.records), []);
  const distributionReadiness = useMemo(() => evaluateDistributionReadiness(sampleIncompleteDistributionEvidence), []);
  const localVaultSecretsUx = useMemo(() => createLocalVaultSecretsReview(), []);

  return (
    <SettingsWorkspace
      configDraft={configDraft}
      configExport={configExport}
      distributionReadiness={distributionReadiness}
      primaryResource={primaryResource}
      redactionReport={redactionReport}
      sampleUiSchema={sampleUiSchema}
      sampleVaultState={sampleVaultState}
      localVaultSecretsUx={localVaultSecretsUx}
    />
  );
}
