export const runtimeFoundationContractVersions = Object.freeze({
  runProtocol: "agentique.runProtocolEvent.v1",
  runAddress: "agentique.runAddress.v1",
  nativeConsent: "agentique.nativeApprovalConsent.v1",
  asyncLifecycle: "agentique.asyncRunLifecycle.v1",
  productProjection: "agentique.productResultProjection.v1",
  workingSetCheckpoint: "agentique.workingSetCheckpoint.v1",
  evaluationCase: "agentique.agentEvaluationCase.v1",
  evaluationReport: "agentique.agentEvaluationReport.v1"
});

const acceptedCapabilities = Object.freeze([
  "canonical-run-protocol",
  "native-explicit-consent",
  "async-fixed-lane-coordination",
  "durable-product-projection",
  "bounded-working-set-checkpoint",
  "offline-agent-evaluation"
]);

const blockedClaims = Object.freeze([
  "cross-platform-packaged-desktop",
  "signed-installer-updater",
  "hosted-runtime",
  "universal-agent-execution",
  "generic-shell-process",
  "arbitrary-filesystem-network",
  "automatic-execution",
  "production-runtime"
]);

export function buildRuntimeFoundationManifest({ candidateDigest = `sha256:${"a".repeat(64)}` } = {}) {
  return {
    schemaVersion: "agentique.runtimeFoundationManifest.v1",
    candidate: { repository: "agentique-ui", revisionKind: "uncommitted-candidate", digest: candidateDigest },
    predecessors: ["protocol", "package-feasibility", "consent", "async-lifecycle", "product-projection", "checkpoint", "evaluation"].map((id) => ({
      id,
      planFinalized: true,
      recordPresent: true,
      commandLogPresent: true,
      acceptanceMapped: true,
      candidateBound: true,
      fullGatePassed: true
    })),
    contracts: { ...runtimeFoundationContractVersions },
    packageDisposition: "NO_ADOPT",
    packageState: { runtimeDependencyPresent: false, staleExperimentArtifacts: 0, externalImplementationTypesExposed: false },
    semantics: {
      exactAddress: true,
      explicitConsentBeforeStart: true,
      singleTerminal: true,
      projectionBeforeTerminal: true,
      checkpointBeforeProjection: true,
      cleanupFailureCannotPass: true,
      humanReviewIndependent: true
    },
    migrations: { legacyProjection: "explicit-bounded", unknownSchema: "fail-closed", effectReplay: false },
    rollback: {
      order: ["evaluation", "checkpoint-writes", "projection-writes"],
      retainCommittedEvidenceReadOnly: true,
      consentDefaultDenyRetained: true,
      partialStateBecomesSuccess: false,
      deletesUserLocation: false
    },
    security: { secrets: 0, absolutePaths: 0, rawProcessDetails: 0, browserData: 0, unsafeInternalMaterial: 0 },
    capabilities: {
      fixedWindowsPythonLane: true,
      genericShell: false,
      arbitraryFilesystem: false,
      arbitraryNetwork: false,
      ambientEnvironment: false,
      browserProfile: false,
      externalEffectReplay: false,
      downloadedAutoExecution: false
    },
    claims: {
      windowsFixedLane: "accepted-local-only",
      crossPlatformPackagedDesktop: "blocked",
      signedInstallerAndUpdater: "blocked",
      hostedRuntime: "blocked",
      productionRuntime: "blocked"
    },
    overlaps: [
      "command-transition",
      "native-event-ui",
      "permission-revocation",
      "run-folder-product-journey",
      "process-tree-recovery",
      "durable-registry",
      "true-runner-e2e",
      "public-claim-boundary",
      "checkpoint-time-travel"
    ].map((area) => ({ area, sharedEvidenceCount: 1, residualStatus: "open" })),
    validation: { targeted: "passed", native: "passed", ui: "passed", windowsFullGate: "passed", publicBoundary: "passed" }
  };
}

export function reviewRuntimeFoundationAcceptance(manifest) {
  const failures = [];
  if (!manifest || manifest.schemaVersion !== "agentique.runtimeFoundationManifest.v1") failures.push(failure("manifest.schema", "Manifest schema is unsupported."));
  if (
    manifest?.candidate?.repository !== "agentique-ui" ||
    manifest?.candidate?.revisionKind !== "uncommitted-candidate" ||
    !/^sha256:[a-f0-9]{64}$/.test(manifest?.candidate?.digest ?? "")
  )
    failures.push(failure("manifest.candidate", "Exact candidate digest is required."));
  if (!Array.isArray(manifest?.predecessors) || manifest.predecessors.length !== 7) failures.push(failure("manifest.predecessors", "All seven predecessor rows are required."));
  for (const predecessor of manifest?.predecessors ?? []) {
    for (const field of ["planFinalized", "recordPresent", "commandLogPresent", "acceptanceMapped", "candidateBound", "fullGatePassed"]) {
      if (predecessor[field] !== true) failures.push(failure(`predecessor.${field}`, `${predecessor.id} is missing ${field}.`));
    }
  }
  for (const [name, version] of Object.entries(runtimeFoundationContractVersions)) {
    if (manifest?.contracts?.[name] !== version) failures.push(failure("contract.version", `${name} contract version drifted.`));
  }
  if (Object.keys(manifest?.contracts ?? {}).length !== Object.keys(runtimeFoundationContractVersions).length)
    failures.push(failure("contract.set", "Contract set is incomplete or contains an unknown member."));
  for (const field of [
    "exactAddress",
    "explicitConsentBeforeStart",
    "singleTerminal",
    "projectionBeforeTerminal",
    "checkpointBeforeProjection",
    "cleanupFailureCannotPass",
    "humanReviewIndependent"
  ]) {
    if (manifest?.semantics?.[field] !== true) failures.push(failure("semantics.drift", `${field} is not proven.`));
  }
  if (
    manifest?.packageDisposition !== "NO_ADOPT" ||
    manifest?.packageState?.runtimeDependencyPresent !== false ||
    manifest?.packageState?.staleExperimentArtifacts !== 0 ||
    manifest?.packageState?.externalImplementationTypesExposed !== false
  )
    failures.push(failure("package.disposition", "Package state does not match the no-adoption disposition."));
  if (manifest?.migrations?.legacyProjection !== "explicit-bounded" || manifest?.migrations?.unknownSchema !== "fail-closed" || manifest?.migrations?.effectReplay !== false)
    failures.push(failure("migration.boundary", "Migration boundary is incomplete."));
  if (
    manifest?.rollback?.order?.join(",") !== "evaluation,checkpoint-writes,projection-writes" ||
    manifest?.rollback?.retainCommittedEvidenceReadOnly !== true ||
    manifest?.rollback?.consentDefaultDenyRetained !== true ||
    manifest?.rollback?.partialStateBecomesSuccess !== false ||
    manifest?.rollback?.deletesUserLocation !== false
  )
    failures.push(failure("rollback.boundary", "Rollback does not preserve fail-closed evidence authority."));
  if (Object.values(manifest?.security ?? {}).some((value) => value !== 0)) failures.push(failure("security.material", "Unsafe evidence material is present."));
  if (
    manifest?.capabilities?.fixedWindowsPythonLane !== true ||
    Object.entries(manifest?.capabilities ?? {}).some(([name, value]) => name !== "fixedWindowsPythonLane" && value !== false)
  )
    failures.push(failure("capability.widening", "Aggregate manifest widens runtime authority."));
  const expectedClaims = {
    windowsFixedLane: "accepted-local-only",
    crossPlatformPackagedDesktop: "blocked",
    signedInstallerAndUpdater: "blocked",
    hostedRuntime: "blocked",
    productionRuntime: "blocked"
  };
  for (const [name, value] of Object.entries(expectedClaims)) if (manifest?.claims?.[name] !== value) failures.push(failure("claim.boundary", `${name} claim is unsupported.`));
  if (!Array.isArray(manifest?.overlaps) || manifest.overlaps.length !== 9 || manifest.overlaps.some((row) => row.sharedEvidenceCount !== 1 || row.residualStatus !== "open"))
    failures.push(failure("overlap.double-count", "Shared evidence or downstream residual state is incorrect."));
  if (["targeted", "native", "ui", "windowsFullGate", "publicBoundary"].some((field) => manifest?.validation?.[field] !== "passed"))
    failures.push(failure("validation.missing", "Aggregate validation evidence is incomplete."));

  return Object.freeze({
    schemaVersion: "agentique.runtimeFoundationAcceptance.v1",
    ok: failures.length === 0,
    disposition: failures.length === 0 ? "repository-side-accepted-local-only" : "pending",
    failures: Object.freeze(failures),
    acceptedCapabilities,
    blockedClaims,
    packageDisposition: manifest?.packageDisposition ?? "unknown",
    rollbackReady: failures.every((item) => !item.code.startsWith("rollback.")),
    downstreamResidualsOpen: manifest?.overlaps?.every((row) => row.residualStatus === "open") === true
  });
}

function failure(code, message) {
  return Object.freeze({ code, message });
}
