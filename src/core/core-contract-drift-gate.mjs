import { importIntentContractVersion, validateImportIntent } from "./import-intent.mjs";
import {
  createResourceBundleFromSourceMetadata,
  resourceBundleSchemaVersion,
  sourceResourceBundleMapperVersion
} from "./source-resource-bundle-mapper.mjs";
import {
  createWorkflowGraphFromSourceGraph,
  sourceGraphContractVersion,
  sourceWorkflowGraphMapperVersion,
  workflowIrSchemaVersion
} from "./source-workflow-graph-mapper.mjs";

export const coreContractFixtureSetVersion = "agentique.coreContractFixtureSet.v1";

const expected = Object.freeze({
  origin: "https://www.agentique.io",
  resourceId: "agent:research.alpha",
  resourceVersion: "2026.06+alpha",
  issuedAt: "2026-06-11T00:00:00.000Z",
  expiresAt: "2026-06-11T00:10:00.000Z",
  observedAt: "2026-06-11T00:05:00.000Z",
  nonce: "Aq2ULu3DZpaS",
  digestA: "a".repeat(64),
  digestB: "b".repeat(64),
  digestC: "c".repeat(64)
});

const resourceIdPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|[._:-](?=[A-Za-z0-9])){0,127}$/u;
const resourceVersionPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|[._+-](?=[A-Za-z0-9])){0,95}$/u;
const noReleaseClaimKeys = [
  "pactBrokerPublished",
  "publicSdkReleased",
  "installerAvailable",
  "updaterAvailable",
  "nativeRunnerAvailable",
  "localExecutionAvailable",
  "directInstallVerified"
];

export function createCoreContractFixtureSet(options = {}) {
  const resourceId = options.resourceId ?? expected.resourceId;
  const resourceVersion = options.resourceVersion ?? expected.resourceVersion;
  const encodedResourceId = encodeURIComponent(resourceId);
  const routes = {
    readback: {
      method: "GET",
      path: `/api/public/v1/resources/${encodedResourceId}/readback`
    },
    downloadMetadata: {
      method: "GET",
      path: `/api/public/v1/resources/${encodedResourceId}/download`
    },
    importMetadata: {
      method: "GET",
      path: `/api/public/v1/resources/${encodedResourceId}/import-metadata`
    },
    downloadHandoff: {
      method: "POST",
      path: `/api/agents/${encodedResourceId}/download`
    },
    finalBytes: {
      method: "GET",
      urlIncludedInMetadata: false
    }
  };
  const sourceMetadata = createSourceMetadata({ resourceId, resourceVersion, routes });
  const resourceGraph = createSourceGraph({ resourceId });
  const importIntent = createImportIntent({ resourceId, resourceVersion, routes });
  const bundleResult = createResourceBundleFromSourceMetadata(sourceMetadata, { verifiedAt: expected.observedAt });
  const workflowResult = createWorkflowGraphFromSourceGraph(resourceGraph, { workflowId: resourceId });

  return {
    schemaVersion: coreContractFixtureSetVersion,
    generatedFor: "agentique-ui",
    deterministic: true,
    fixtureId: "agentique-ui-core-contract-fixture",
    resource: {
      id: resourceId,
      version: resourceVersion,
      title: "Research Alpha",
      origin: expected.origin
    },
    routes,
    contracts: {
      importIntent: importIntentContractVersion,
      resourceBundleMapper: sourceResourceBundleMapperVersion,
      resourceBundleSchema: resourceBundleSchemaVersion,
      resourceGraph: sourceGraphContractVersion,
      workflowGraphMapper: sourceWorkflowGraphMapperVersion,
      workflowIr: workflowIrSchemaVersion
    },
    importIntent,
    sourceMetadata,
    resourceGraph,
    projections: {
      bundle: bundleResult.ok ? bundleResult.projection : null,
      workflow: workflowResult.ok ? workflowResult.projection : null
    },
    driftExpectations: {
      exactMethods: {
        readback: "GET",
        downloadMetadata: "GET",
        importMetadata: "GET",
        downloadHandoff: "POST",
        finalBytes: "GET"
      },
      exactSchemas: {
        importIntent: importIntentContractVersion,
        resourceBundleMapper: sourceResourceBundleMapperVersion,
        resourceBundle: resourceBundleSchemaVersion,
        resourceGraph: sourceGraphContractVersion,
        workflowGraphMapper: sourceWorkflowGraphMapperVersion,
        workflowIr: workflowIrSchemaVersion
      },
      noScopedGetTicketEndpoint: true,
      noFinalByteUrlInMetadata: true
    },
    noReleaseClaims: createNoReleaseClaims()
  };
}

export function validateCoreContractFixtureSet(fixture) {
  const issues = [];
  if (!fixture || typeof fixture !== "object") {
    return { ok: false, issues: ["fixture_contract_drift"] };
  }

  validateFixtureIdentity(fixture, issues);
  validateRoutes(fixture, issues);
  validateImportIntentFixture(fixture, issues);
  validateResourceIdentity(fixture, issues);
  validateBundleProjection(fixture, issues);
  validateWorkflowProjection(fixture, issues);
  validateUnsafeText(fixture, issues);
  validateReleaseClaims(fixture, issues);

  const uniqueIssues = uniqueSorted(issues);
  return uniqueIssues.length > 0 ? { ok: false, issues: uniqueIssues } : { ok: true, issues: [] };
}

export function assertCoreContractFixtureSet(fixture = createCoreContractFixtureSet()) {
  const result = validateCoreContractFixtureSet(fixture);
  if (!result.ok) {
    const error = new Error(`Core contract fixture drift detected: ${result.issues.join(", ")}`);
    error.issues = result.issues;
    throw error;
  }
  return fixture;
}

function validateFixtureIdentity(fixture, issues) {
  if (
    fixture.schemaVersion !== coreContractFixtureSetVersion ||
    fixture.generatedFor !== "agentique-ui" ||
    fixture.deterministic !== true ||
    fixture.fixtureId !== "agentique-ui-core-contract-fixture"
  ) {
    issues.push("fixture_contract_drift");
  }
}

function validateRoutes(fixture, issues) {
  const encodedResourceId = encodeURIComponent(fixture.resource?.id ?? "");
  const expectedRoutes = {
    readback: { method: "GET", path: `/api/public/v1/resources/${encodedResourceId}/readback` },
    downloadMetadata: { method: "GET", path: `/api/public/v1/resources/${encodedResourceId}/download` },
    importMetadata: { method: "GET", path: `/api/public/v1/resources/${encodedResourceId}/import-metadata` },
    downloadHandoff: { method: "POST", path: `/api/agents/${encodedResourceId}/download` },
    finalBytes: { method: "GET", urlIncludedInMetadata: false }
  };

  for (const key of ["readback", "downloadMetadata", "importMetadata", "downloadHandoff"]) {
    if (fixture.routes?.[key]?.method !== expectedRoutes[key].method || fixture.routes?.[key]?.path !== expectedRoutes[key].path) {
      issues.push(key === "downloadHandoff" ? "download_method_drift" : "route_contract_drift");
    }
  }
  if (
    fixture.routes?.finalBytes?.method !== expectedRoutes.finalBytes.method ||
    fixture.routes?.finalBytes?.urlIncludedInMetadata !== false
  ) {
    issues.push("download_method_drift");
  }
  if (
    fixture.sourceMetadata?.downloadMetadata?.method !== "POST" ||
    fixture.sourceMetadata?.downloadMetadata?.downloadEndpoint !== expectedRoutes.downloadHandoff.path ||
    fixture.sourceMetadata?.downloadMetadata?.handoff?.method !== "POST" ||
    fixture.sourceMetadata?.downloadMetadata?.handoff?.endpoint !== expectedRoutes.downloadHandoff.path ||
    fixture.sourceMetadata?.downloadMetadata?.handoff?.finalByteUrl !== null ||
    fixture.sourceMetadata?.downloadMetadata?.handoff?.scopedTicketEndpoint !== undefined
  ) {
    issues.push("download_method_drift");
  }
}

function validateImportIntentFixture(fixture, issues) {
  if (
    fixture.contracts?.importIntent !== importIntentContractVersion ||
    fixture.importIntent?.version !== importIntentContractVersion ||
    fixture.importIntent?.action !== "import"
  ) {
    issues.push("deep_link_contract_drift");
    return;
  }

  const parsed = validateImportIntent(fixture.importIntent.uri, {
    now: expected.observedAt,
    expectedOrigin: expected.origin
  });
  if (
    !parsed.ok ||
    parsed.intent.resource.id !== fixture.resource?.id ||
    parsed.intent.resource.version !== fixture.resource?.version ||
    parsed.intent.security.grantsAuthorization !== false ||
    parsed.intent.security.grantsDownload !== false ||
    parsed.intent.security.grantsExecution !== false ||
    parsed.intent.security.grantsPermission !== false
  ) {
    issues.push("deep_link_contract_drift");
  }
}

function validateResourceIdentity(fixture, issues) {
  const resourceId = fixture.resource?.id;
  const resourceVersion = fixture.resource?.version;
  if (!resourceIdPattern.test(resourceId ?? "") || !resourceVersionPattern.test(resourceVersion ?? "")) {
    issues.push("resource_identity_contract_drift");
    return;
  }
  if (
    fixture.sourceMetadata?.readback?.id !== resourceId ||
    fixture.sourceMetadata?.importMetadata?.resourceId !== resourceId ||
    fixture.sourceMetadata?.downloadMetadata?.resourceId !== resourceId ||
    fixture.sourceMetadata?.readback?.latestVersion !== resourceVersion ||
    fixture.sourceMetadata?.importMetadata?.resourceVersion !== resourceVersion
  ) {
    issues.push("resource_identity_contract_drift");
  }
}

function validateBundleProjection(fixture, issues) {
  const bundleProjection = fixture.projections?.bundle;
  if (
    fixture.contracts?.resourceBundleMapper !== sourceResourceBundleMapperVersion ||
    fixture.contracts?.resourceBundleSchema !== resourceBundleSchemaVersion ||
    bundleProjection?.schemaVersion !== sourceResourceBundleMapperVersion ||
    bundleProjection?.bundle?.schemaVersion !== resourceBundleSchemaVersion ||
    bundleProjection?.bundle?.resource?.id !== fixture.resource?.id ||
    bundleProjection?.bundle?.resource?.version !== fixture.resource?.version ||
    bundleProjection?.handoff?.method !== "POST" ||
    bundleProjection?.handoff?.finalByteUrl !== null ||
    bundleProjection?.handoff?.scopedTicketEndpoint !== null ||
    bundleProjection?.noOverclaim?.scopedGetTicketEndpoint !== false ||
    bundleProjection?.noOverclaim?.finalByteUrlInMetadata !== false ||
    bundleProjection?.noOverclaim?.nativeRuntimeExecution !== false
  ) {
    issues.push("bundle_projection_contract_drift");
  }
}

function validateWorkflowProjection(fixture, issues) {
  const workflowProjection = fixture.projections?.workflow;
  if (
    fixture.contracts?.resourceGraph !== sourceGraphContractVersion ||
    fixture.contracts?.workflowGraphMapper !== sourceWorkflowGraphMapperVersion ||
    fixture.contracts?.workflowIr !== workflowIrSchemaVersion ||
    fixture.resourceGraph?.contractVersion !== sourceGraphContractVersion ||
    workflowProjection?.schemaVersion !== sourceWorkflowGraphMapperVersion ||
    workflowProjection?.workflowIr?.schemaVersion !== workflowIrSchemaVersion ||
    workflowProjection?.source?.contractVersion !== sourceGraphContractVersion ||
    workflowProjection?.noExecution?.workflowsExecuted !== false ||
    workflowProjection?.noExecution?.networkRequestsPerformed !== false ||
    workflowProjection?.noOverclaim?.localRunnerAvailable !== false ||
    workflowProjection?.noOverclaim?.credentialValuesAvailable !== false
  ) {
    issues.push("workflow_projection_contract_drift");
  }
}

function validateUnsafeText(fixture, issues) {
  if (unsafeFixturePattern().test(JSON.stringify(fixture))) {
    issues.push("unsafe_fixture_text");
  }
}

function validateReleaseClaims(fixture, issues) {
  if (!allReleaseClaimsFalse(fixture.noReleaseClaims)) {
    issues.push("unsupported_release_or_runtime_claim");
  }
}

function createImportIntent({ resourceId, resourceVersion, routes }) {
  const uri = [
    "agentique://import?",
    new URLSearchParams({
      version: importIntentContractVersion,
      action: "import",
      resourceId,
      resourceVersion,
      origin: expected.origin,
      readbackUrl: routes.readback.path,
      issuedAt: expected.issuedAt,
      expiresAt: expected.expiresAt,
      nonce: expected.nonce
    }).toString()
  ].join("");

  return {
    version: importIntentContractVersion,
    action: "import",
    uri,
    security: {
      grantsAuthorization: false,
      grantsDownload: false,
      grantsExecution: false,
      grantsPermission: false,
      requiresReadbackVerification: true
    }
  };
}

function createSourceMetadata({ resourceId, resourceVersion, routes }) {
  return {
    observedAt: expected.observedAt,
    readback: {
      id: resourceId,
      latestVersion: resourceVersion,
      title: "Research Alpha",
      summary: "Public metadata fixture for UI consumer contract drift detection.",
      links: {
        readback: routes.readback.path,
        download: routes.downloadMetadata.path,
        importMetadata: routes.importMetadata.path
      },
      compatibility: {
        agentiqueUi: ">=0.1.0",
        platforms: ["windows", "macos", "linux"]
      },
      manifest: {
        schemaVersion: "agentique.resourceManifest.v1",
        capabilities: ["read-docs", "summarize"],
        graph: { nodes: 3 }
      },
      versions: [
        {
          version: resourceVersion,
          files: [
            {
              id: "readme",
              fileName: "README.md",
              contentType: "text/markdown",
              byteSize: 2048,
              checksumSha256: expected.digestA
            }
          ]
        }
      ]
    },
    importMetadata: {
      resourceId,
      resourceVersion,
      status: "published",
      installTargets: [
        {
          targetId: "codex",
          status: "download-backed",
          download: {
            variantId: "source-package"
          }
        }
      ]
    },
    downloadMetadata: {
      resourceId,
      method: "POST",
      downloadEndpoint: routes.downloadHandoff.path,
      handoff: {
        method: "POST",
        endpoint: routes.downloadHandoff.path,
        finalByteMethod: "GET",
        finalByteUrl: null,
        expiresInSeconds: 600,
        ticket: {
          replayMitigation: "short_expiry_and_route_rate_limit"
        }
      },
      files: [
        {
          id: "readme",
          fileName: "README.md",
          contentType: "text/markdown",
          byteSize: 2048,
          checksumSha256: expected.digestA
        }
      ],
      sourcePackage: {
        platformId: "source-package",
        status: "DOWNLOADABLE"
      }
    },
    provenance: {
      sourceDigest: expected.digestB,
      publishedDigest: expected.digestC,
      verificationStatus: "reviewed",
      signer: "source-metadata"
    }
  };
}

function createSourceGraph({ resourceId }) {
  return {
    contractVersion: sourceGraphContractVersion,
    title: "Research Alpha Graph",
    sourceProvenance: {
      ecosystem: "autogen",
      sourceFormat: "json",
      parserId: resourceId
    },
    nodes: [
      { id: "intent", kind: "input", label: "Import intent", riskFlags: [] },
      { id: "verify", kind: "tool", label: "Verify package", riskFlags: ["unknown_vendor_node"] },
      { id: "provider-sync", kind: "http", label: "Provider sync", riskFlags: ["external_mutation", "credential_reference"] }
    ],
    edges: [
      { id: "edge-intent-verify", fromNodeId: "intent", toNodeId: "verify", label: "resource", kind: "data_flow" },
      { id: "edge-verify-provider", fromNodeId: "verify", toNodeId: "provider-sync", label: "verifiedResource", kind: "handoff" }
    ],
    variables: [
      {
        name: "PROVIDER_KEY",
        kind: "credential_name",
        required: true,
        publicValueAllowed: false,
        riskFlags: ["credential_reference"]
      }
    ],
    riskFlags: ["credential_reference", "external_mutation"],
    issues: [],
    evidenceCompleteness: "PARTIAL",
    staticAnalysisConfidence: "MEDIUM",
    noExecutionBoundary: {
      importedModules: false,
      packageManagersExecuted: false,
      lifecycleHooksExecuted: false,
      workflowsExecuted: false,
      mcpServersExecuted: false,
      notebookOutputsExecuted: false,
      dockerBuildsExecuted: false,
      networkRequestsPerformed: false,
      filesystemTraversalOutsidePackage: false
    }
  };
}

function createNoReleaseClaims() {
  return {
    pactBrokerPublished: false,
    publicSdkReleased: false,
    installerAvailable: false,
    updaterAvailable: false,
    nativeRunnerAvailable: false,
    localExecutionAvailable: false,
    directInstallVerified: false
  };
}

function allReleaseClaimsFalse(claims) {
  return Boolean(claims && noReleaseClaimKeys.every((key) => claims[key] === false));
}

function unsafeFixturePattern() {
  return new RegExp(
    [
      "sk-[A-Za-z0-9_-]{6,}",
      "ghp_[A-Za-z0-9_]{12,}",
      "github_pat_[A-Za-z0-9_]{12,}",
      "bearer\\s+[A-Za-z0-9._-]{12,}",
      "-----BEGIN [A-Z ]*PRIVATE KEY-----",
      "(?:^|[\\s\"'`(])[A-Za-z]:[\\\\/]",
      "(?:^|[\\s\"'`(])/(?:Users|home|private|tmp|var)/",
      "file://",
      "storageKey",
      "signedUrl",
      "rawCommand",
      "operatorNote",
      "privateEvidence",
      ["\\.plan", "ning"].join(""),
      ["ref", "erence[\\\\/]docs"].join("")
    ].join("|"),
    "iu"
  );
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
