import { coreContractFixtureSetVersion } from "./core-contract-drift-gate.mjs";
import { importIntentContractVersion } from "./import-intent.mjs";
import { localIntegrationSmokeVersion } from "./local-integration-smoke.mjs";
import { resourceBundleSchemaVersion, sourceResourceBundleMapperVersion } from "./source-resource-bundle-mapper.mjs";
import {
  sourceGraphContractVersion,
  sourceWorkflowGraphMapperVersion,
  workflowIrSchemaVersion
} from "./source-workflow-graph-mapper.mjs";

export const coreAlignmentReadinessVersion = "agentique.coreAlignmentReadiness.v1";

const requiredSurfaceIds = Object.freeze([
  "public-readback-envelope",
  "download-post-handoff",
  "import-intent-deep-link",
  "resource-bundle-projection",
  "workflow-graph-projection",
  "contract-fixture-drift-gate",
  "local-import-smoke"
]);

const blockedClaimKeys = Object.freeze([
  "publicSdkReleased",
  "pactBrokerPublished",
  "signedInstallerAvailable",
  "updaterAvailable",
  "nativeRunnerAvailable",
  "productionDesktopRuntimeAvailable",
  "hostedExecutionAvailable",
  "broadLiveDownloadAvailable",
  "directInstallVerified",
  "localExecutionAvailable"
]);

export function createCoreAlignmentReadiness() {
  return {
    schemaVersion: coreAlignmentReadinessVersion,
    generatedFor: "agentique-ui-public-core-alignment",
    status: "completed",
    surfaces: [
      {
        id: "public-readback-envelope",
        status: "completed",
        contractVersions: [coreContractFixtureSetVersion, sourceResourceBundleMapperVersion],
        evidenceLevel: "provider-and-consumer-validation"
      },
      {
        id: "download-post-handoff",
        status: "completed",
        contractVersions: [coreContractFixtureSetVersion],
        evidenceLevel: "provider-and-consumer-validation"
      },
      {
        id: "import-intent-deep-link",
        status: "completed",
        contractVersions: [importIntentContractVersion],
        evidenceLevel: "provider-and-consumer-validation"
      },
      {
        id: "resource-bundle-projection",
        status: "completed",
        contractVersions: [sourceResourceBundleMapperVersion, resourceBundleSchemaVersion],
        evidenceLevel: "consumer-validation"
      },
      {
        id: "workflow-graph-projection",
        status: "completed",
        contractVersions: [sourceGraphContractVersion, sourceWorkflowGraphMapperVersion, workflowIrSchemaVersion],
        evidenceLevel: "consumer-validation"
      },
      {
        id: "contract-fixture-drift-gate",
        status: "completed",
        contractVersions: [coreContractFixtureSetVersion],
        evidenceLevel: "consumer-validation"
      },
      {
        id: "local-import-smoke",
        status: "completed",
        contractVersions: [localIntegrationSmokeVersion],
        evidenceLevel: "consumer-validation"
      }
    ],
    noGoClaims: createNoGoClaims(),
    publicClaimBoundary: {
      canClaimCoreContractsAligned: true,
      canClaimFixtureBackedLocalImportSmoke: true,
      canClaimLiveProductionByteTransfer: false,
      canClaimReleasedDesktopRuntime: false,
      canClaimInstallerOrUpdater: false,
      canClaimNativeExecution: false
    }
  };
}

export function validateCoreAlignmentReadiness(readiness) {
  const issues = [];
  if (!readiness || typeof readiness !== "object") {
    return { ok: false, issues: ["readiness_contract_drift"] };
  }

  if (
    readiness.schemaVersion !== coreAlignmentReadinessVersion ||
    readiness.generatedFor !== "agentique-ui-public-core-alignment" ||
    readiness.status !== "completed"
  ) {
    issues.push("readiness_contract_drift");
  }

  const completedSurfaceIds = new Set(
    Array.isArray(readiness.surfaces)
      ? readiness.surfaces.filter((surface) => surface.status === "completed").map((surface) => surface.id)
      : []
  );
  if (!requiredSurfaceIds.every((id) => completedSurfaceIds.has(id))) {
    issues.push("missing_alignment_surface");
  }

  if (
    !allBlockedClaimsFalse(readiness.noGoClaims) ||
    readiness.publicClaimBoundary?.canClaimLiveProductionByteTransfer !== false ||
    readiness.publicClaimBoundary?.canClaimReleasedDesktopRuntime !== false ||
    readiness.publicClaimBoundary?.canClaimInstallerOrUpdater !== false ||
    readiness.publicClaimBoundary?.canClaimNativeExecution !== false
  ) {
    issues.push("unsupported_claim_enabled");
  }

  if (unsafeReadinessPattern().test(JSON.stringify(readiness))) {
    issues.push("unsafe_readiness_text");
  }

  const uniqueIssues = uniqueSorted(issues);
  return uniqueIssues.length > 0 ? { ok: false, issues: uniqueIssues } : { ok: true, issues: [] };
}

function createNoGoClaims() {
  return Object.fromEntries(blockedClaimKeys.map((key) => [key, false]));
}

function allBlockedClaimsFalse(claims) {
  return Boolean(claims && blockedClaimKeys.every((key) => claims[key] === false));
}

function unsafeReadinessPattern() {
  return new RegExp(
    [
      "sk-[A-Za-z0-9_-]{6,}",
      "ghp_[A-Za-z0-9_]{12,}",
      "github_pat_[A-Za-z0-9_]{12,}",
      "bearer\\s+[A-Za-z0-9._-]{12,}",
      "-----BEGIN [A-Z ]*PRIVATE KEY-----",
      "(?:^|[\\s\"'`(])[A-Za-z]:[\\\\/]",
      "(?:^|[\\s\"'`(])/(?:Users|home|private|tmp|var)/",
      ["file", "://"].join(""),
      "storageKey",
      "signedUrl",
      "rawCommand",
      "operatorNote",
      "privateEvidence",
      ["\\b", "R", "\\d{4}\\b"].join(""),
      ["\\.plan", "ning"].join(""),
      ["ref", "erence[\\\\/]docs"].join("")
    ].join("|"),
    "iu"
  );
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
