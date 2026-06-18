import { companionDownloadAcquisitionVersion } from "./companion-download-acquisition.mjs";
import { externalIntakeSchemaVersion } from "./companion-external-intake-scanner.mjs";
import { companionReadbackAdapterVersion } from "./companion-readback-adapter.mjs";
import { companionUploaderPreviewVersion } from "./companion-uploader-preview.mjs";
import { companionValidatorAdapterVersion } from "./companion-validator-adapter.mjs";
import { redactText } from "./secret-vault.mjs";

const schemaVersion = "agentique.companionIntegrationCloseout.v1";
const requiredSourcePin = Object.freeze({
  repository: "https://github.com/rookiestar28/Agentique.git",
  branch: "main",
  revision: "2621a33ba9cd83b125ffaabeec7817abc3c52719",
  packageVersion: "0.2.1",
  worktreeState: "clean"
});
const requiredValidationSteps = Object.freeze([
  "validate:companion-integration-closeout",
  "validate:public",
  "npm test",
  "npm run validate"
]);
const requiredPackages = Object.freeze([
  packageRequirement("@agentique.io/readback", ["read-only-client-normalizers-badges", "download-metadata-acquisition-proof"], [
    companionReadbackAdapterVersion,
    companionDownloadAcquisitionVersion
  ]),
  packageRequirement("@agentique.io/validator", ["static-validator-report", "browser-local-external-intake"], [
    companionValidatorAdapterVersion,
    externalIntakeSchemaVersion
  ]),
  packageRequirement("@agentique.io/uploader", ["review-only-uploader-preview"], [
    companionUploaderPreviewVersion
  ]),
  packageRequirement("@agentique.io/action", ["ci-reference-only"], [])
]);
const requiredCapabilities = Object.freeze([
  capabilityRequirement("readback-badge-projection", "@agentique.io/readback", companionReadbackAdapterVersion),
  capabilityRequirement("validator-import-proof", "@agentique.io/validator", companionValidatorAdapterVersion),
  capabilityRequirement("download-acquisition-proof", "@agentique.io/readback", companionDownloadAcquisitionVersion),
  capabilityRequirement("review-only-uploader-preview", "@agentique.io/uploader", companionUploaderPreviewVersion),
  capabilityRequirement("external-intake-scanner", "@agentique.io/validator", externalIntakeSchemaVersion)
]);
const requiredDeferredCapabilities = Object.freeze([
  "authenticated-review-submission",
  "upload-status-polling",
  "upload-token-vault",
  "github-action-runtime",
  "release-governance-ui",
  "registry-package-publication",
  "live-upload-availability"
]);
const blockedClaimKeys = Object.freeze([
  "liveUploadAvailable",
  "authenticatedUpload",
  "uploadStatusPolling",
  "reviewApproval",
  "moderationApproval",
  "publication",
  "registryPackagePublication",
  "releaseGovernance",
  "githubActionRuntime",
  "packageLifecycleExecution",
  "arbitraryExecution",
  "installerUpdater",
  "hostedRuntime",
  "universalRuntime",
  "directInstall",
  "platformDownloadReadiness",
  "productionDesktopRuntime"
]);
const pathNeutralReferencePattern = /^(docs\/validation\/[A-Za-z0-9._/-]+|docs\/contracts\/[A-Za-z0-9._/-]+|docs\/security\/[A-Za-z0-9._/-]+|scripts\/[A-Za-z0-9._/-]+|tests\/[A-Za-z0-9._/-]+)$/u;
const privatePlanMarker = "\\." + "planning";
const privateSessionMarker = "\\." + "sessions";
const privateReferenceDocsMarker = "reference" + "\\/" + "docs";
const privateReferenceDocsBackslashMarker = "reference" + "\\\\" + "docs";
const internalItemCodePattern = "\\b" + "R" + "\\d{4}\\b";
const unsafeTextPattern = new RegExp(
  [
    "(?<![A-Za-z])[A-Za-z]:[\\\\/]",
    "\\\\\\\\",
    "(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)",
    "\\.\\.[\\\\/]",
    privatePlanMarker,
    privateSessionMarker,
    privateReferenceDocsMarker,
    privateReferenceDocsBackslashMarker,
    internalItemCodePattern,
    "bearer\\s+[A-Za-z0-9._-]{12,}",
    "sk-[A-Za-z0-9]{20,}",
    "ghp_[A-Za-z0-9_]{20,}",
    "github_pat_[A-Za-z0-9_]{20,}",
    "ya29\\.",
    "-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----"
  ].join("|"),
  "iu"
);

export const sampleCompanionIntegrationCloseout = deepFreeze({
  schemaVersion,
  sourcePin: requiredSourcePin,
  validationSteps: [...requiredValidationSteps],
  packages: requiredPackages.map((pkg) => ({
    name: pkg.name,
    version: requiredSourcePin.packageVersion,
    sourceRevision: requiredSourcePin.revision,
    consumedSurfaces: [...pkg.surfaces],
    adapterSchemas: [...pkg.adapterSchemas],
    integrationMode: pkg.name === "@agentique.io/action" ? "deferred-reference-only" : "local-static-adapter"
  })),
  capabilities: Object.fromEntries(requiredCapabilities.map((capability) => [
    capability.id,
    {
      status: "accepted",
      sourcePackage: capability.sourcePackage,
      adapterSchema: capability.adapterSchema,
      evidenceRef: "docs/validation/companion-integration-closeout.md"
    }
  ])),
  deferredCapabilities: Object.fromEntries(requiredDeferredCapabilities.map((id) => [
    id,
    { status: "deferred", requiresSeparateGate: true }
  ])),
  claimBoundary: Object.fromEntries(blockedClaimKeys.map((key) => [key, false])),
  publicSafety: {
    publicBoundaryScan: "passed",
    noSecretScan: "passed",
    privateMarkersAbsent: true,
    publicDocsNoInternalCodes: true,
    evidenceRefsPathNeutral: true
  },
  worktreeEvidence: {
    expectedChangeSetOnly: true,
    unrelatedDirtyFilesExcluded: true,
    sourcePinClean: true,
    uiCommitPublicSafe: true
  }
});

export function reviewCompanionIntegrationCloseout(closeout = sampleCompanionIntegrationCloseout) {
  const errors = [];
  if (!closeout || typeof closeout !== "object" || Array.isArray(closeout)) {
    return blockedReview([issue("companion-closeout.invalid", "Companion closeout must be an object.")]);
  }

  assertNoUnsafeText(closeout, errors);
  if (closeout.schemaVersion !== schemaVersion) {
    errors.push(issue("companion-closeout.schema", "Companion closeout schema is unsupported."));
  }

  const sourcePin = reviewSourcePin(closeout.sourcePin, errors);
  const validation = reviewValidationSteps(closeout.validationSteps, errors);
  const packages = reviewPackages(closeout.packages, errors);
  const capabilities = reviewCapabilities(closeout.capabilities, errors);
  const deferredCapabilities = reviewDeferredCapabilities(closeout.deferredCapabilities, errors);
  const claimBoundary = reviewClaimBoundary(closeout.claimBoundary, errors);
  const publicSafety = reviewPublicSafety(closeout.publicSafety, errors);
  const worktreeEvidence = reviewWorktreeEvidence(closeout.worktreeEvidence, errors);
  const ok = errors.length === 0;

  return {
    schemaVersion: "agentique.companionIntegrationCloseoutReview.v1",
    ok,
    status: ok ? "accepted" : "blocked",
    sourcePin,
    validation,
    packages,
    capabilities,
    deferredCapabilities,
    claimBoundary,
    publicSafety,
    worktreeEvidence,
    summary: {
      sourceRevision: sourcePin.revision,
      packageVersion: sourcePin.packageVersion,
      acceptedCapabilities: capabilities.accepted,
      deferredCapabilities: deferredCapabilities.deferred,
      blockedClaims: claimBoundary.blocked,
      publicSafety: publicSafety.status,
      sourcePinClean: worktreeEvidence.sourcePinClean
    },
    errors: errors.map((error) => ({ code: error.code, message: redactText(error.message) }))
  };
}

export function reviewCompanionIntegrationCloseoutGate() {
  const accepted = reviewCompanionIntegrationCloseout();
  const sourceDrift = reviewCompanionIntegrationCloseout({
    ...sampleCompanionIntegrationCloseout,
    sourcePin: {
      ...sampleCompanionIntegrationCloseout.sourcePin,
      revision: "0".repeat(40)
    }
  });
  const packageDrift = reviewCompanionIntegrationCloseout({
    ...sampleCompanionIntegrationCloseout,
    packages: sampleCompanionIntegrationCloseout.packages.map((pkg) => (
      pkg.name === "@agentique.io/validator" ? { ...pkg, version: "9.9.9" } : pkg
    ))
  });
  const missingEvidence = reviewCompanionIntegrationCloseout({
    ...sampleCompanionIntegrationCloseout,
    capabilities: {
      ...sampleCompanionIntegrationCloseout.capabilities,
      "validator-import-proof": { status: "blocked", sourcePackage: "@agentique.io/validator", adapterSchema: companionValidatorAdapterVersion }
    }
  });
  const overclaim = reviewCompanionIntegrationCloseout({
    ...sampleCompanionIntegrationCloseout,
    claimBoundary: {
      ...sampleCompanionIntegrationCloseout.claimBoundary,
      authenticatedUpload: true,
      publication: true,
      githubActionRuntime: true,
      universalRuntime: true
    }
  });
  const unsafeReference = reviewCompanionIntegrationCloseout({
    ...sampleCompanionIntegrationCloseout,
    capabilities: {
      ...sampleCompanionIntegrationCloseout.capabilities,
      "external-intake-scanner": {
        status: "accepted",
        sourcePackage: "@agentique.io/validator",
        adapterSchema: externalIntakeSchemaVersion,
        evidenceRef: ["C", ":\\private\\companion.log"].join("")
      }
    }
  });
  const completedDeferredCapability = reviewCompanionIntegrationCloseout({
    ...sampleCompanionIntegrationCloseout,
    deferredCapabilities: {
      ...sampleCompanionIntegrationCloseout.deferredCapabilities,
      "authenticated-review-submission": { status: "accepted", requiresSeparateGate: false }
    }
  });

  return {
    schemaVersion: "agentique.companionIntegrationCloseoutGateReview.v1",
    ok:
      accepted.ok &&
      !sourceDrift.ok &&
      !packageDrift.ok &&
      !missingEvidence.ok &&
      !overclaim.ok &&
      !unsafeReference.ok &&
      !completedDeferredCapability.ok,
    acceptedStatus: accepted.status,
    sourceDriftBlocked: sourceDrift.errors.some((error) => error.code === "companion-closeout.source-pin"),
    packageDriftBlocked: packageDrift.errors.some((error) => error.code === "companion-closeout.package-version"),
    missingEvidenceBlocked: missingEvidence.errors.some((error) => error.code === "companion-closeout.capability-status"),
    overclaimBlocked: overclaim.errors.some((error) => error.code === "companion-closeout.claim-boundary"),
    unsafeReferenceBlocked: unsafeReference.errors.some((error) => error.code === "companion-closeout.evidence-ref"),
    completedDeferredCapabilityBlocked: completedDeferredCapability.errors.some((error) => error.code === "companion-closeout.deferred-capability"),
    summary: accepted.summary
  };
}

function reviewSourcePin(pin = {}, errors) {
  const output = {
    repository: safeText(pin.repository),
    branch: safeText(pin.branch),
    revision: safeText(pin.revision),
    packageVersion: safeText(pin.packageVersion),
    worktreeState: safeText(pin.worktreeState)
  };
  for (const [key, expected] of Object.entries(requiredSourcePin)) {
    if (output[key] !== expected) {
      errors.push(issue("companion-closeout.source-pin", `Companion source pin drift: ${key} must match the accepted source pin.`));
    }
  }
  if (!/^[a-f0-9]{40}$/u.test(output.revision ?? "")) {
    errors.push(issue("companion-closeout.source-pin", "Companion source revision must be a full SHA-1 commit."));
  }
  return output;
}

function reviewValidationSteps(steps, errors) {
  const list = Array.isArray(steps) ? steps.map(String) : [];
  for (const step of requiredValidationSteps) {
    if (!list.includes(step)) {
      errors.push(issue("companion-closeout.validation-step", `Required companion closeout validation step is missing: ${step}.`));
    }
  }
  return {
    present: list,
    missing: requiredValidationSteps.filter((step) => !list.includes(step))
  };
}

function reviewPackages(packages = [], errors) {
  const list = Array.isArray(packages) ? packages.filter(isRecord) : [];
  const byName = new Map(list.map((pkg) => [pkg.name, pkg]));
  const reviewed = {};
  for (const requirement of requiredPackages) {
    const pkg = byName.get(requirement.name);
    if (!pkg) {
      errors.push(issue("companion-closeout.package-missing", `${requirement.name} package evidence is missing.`));
      reviewed[requirement.name] = { status: "missing", consumedSurfaces: [], adapterSchemas: [] };
      continue;
    }
    const consumedSurfaces = Array.isArray(pkg.consumedSurfaces) ? pkg.consumedSurfaces.map(String) : [];
    const adapterSchemas = Array.isArray(pkg.adapterSchemas) ? pkg.adapterSchemas.map(String) : [];
    if (pkg.version !== requiredSourcePin.packageVersion) {
      errors.push(issue("companion-closeout.package-version", `${requirement.name} version must match the pinned companion package version.`));
    }
    if (pkg.sourceRevision !== requiredSourcePin.revision) {
      errors.push(issue("companion-closeout.package-source", `${requirement.name} source revision must match the pinned companion source revision.`));
    }
    for (const surface of requirement.surfaces) {
      if (!consumedSurfaces.includes(surface)) {
        errors.push(issue("companion-closeout.package-surface", `${requirement.name} consumed surface is missing: ${surface}.`));
      }
    }
    for (const schema of requirement.adapterSchemas) {
      if (!adapterSchemas.includes(schema)) {
        errors.push(issue("companion-closeout.package-schema", `${requirement.name} adapter schema is missing: ${schema}.`));
      }
    }
    if (requirement.name === "@agentique.io/action" && pkg.integrationMode !== "deferred-reference-only") {
      errors.push(issue("companion-closeout.action-boundary", "GitHub Action package must remain deferred reference-only in the desktop app."));
    }
    reviewed[requirement.name] = {
      status: "present",
      version: safeText(pkg.version),
      sourceRevision: safeText(pkg.sourceRevision),
      consumedSurfaces,
      adapterSchemas,
      integrationMode: safeText(pkg.integrationMode)
    };
  }
  return reviewed;
}

function reviewCapabilities(capabilities = {}, errors) {
  let accepted = 0;
  const items = {};
  for (const requirement of requiredCapabilities) {
    const capability = capabilities[requirement.id] ?? {};
    if (capability.status !== "accepted") {
      errors.push(issue("companion-closeout.capability-status", `${requirement.id} must be accepted before closeout.`));
    } else {
      accepted += 1;
    }
    if (capability.sourcePackage !== requirement.sourcePackage) {
      errors.push(issue("companion-closeout.capability-source", `${requirement.id} source package drifted.`));
    }
    if (capability.adapterSchema !== requirement.adapterSchema) {
      errors.push(issue("companion-closeout.capability-schema", `${requirement.id} adapter schema drifted.`));
    }
    validateEvidenceRef(capability.evidenceRef, errors);
    items[requirement.id] = {
      status: capability.status === "accepted" ? "accepted" : "blocked",
      sourcePackage: safeText(capability.sourcePackage),
      adapterSchema: safeText(capability.adapterSchema),
      evidenceRef: redactText(String(capability.evidenceRef ?? ""))
    };
  }
  return {
    accepted,
    required: requiredCapabilities.length,
    items
  };
}

function reviewDeferredCapabilities(deferredCapabilities = {}, errors) {
  let deferred = 0;
  const items = {};
  for (const id of requiredDeferredCapabilities) {
    const capability = deferredCapabilities[id] ?? {};
    if (capability.status !== "deferred" || capability.requiresSeparateGate !== true) {
      errors.push(issue("companion-closeout.deferred-capability", `${id} must remain deferred behind a separate gate.`));
    } else {
      deferred += 1;
    }
    items[id] = {
      status: capability.status === "deferred" ? "deferred" : "unsafe",
      requiresSeparateGate: capability.requiresSeparateGate === true
    };
  }
  return {
    deferred,
    required: requiredDeferredCapabilities.length,
    items
  };
}

function reviewClaimBoundary(claims = {}, errors) {
  const output = {};
  let blocked = 0;
  for (const key of blockedClaimKeys) {
    const enabled = claims[key] === true;
    if (enabled) {
      errors.push(issue("companion-closeout.claim-boundary", `${key} must remain false at companion closeout.`));
    } else {
      blocked += 1;
    }
    output[key] = enabled;
  }
  output.blocked = blocked;
  output.requiredBlocked = blockedClaimKeys.length;
  return output;
}

function reviewPublicSafety(safety = {}, errors) {
  if (
    safety.publicBoundaryScan !== "passed" ||
    safety.noSecretScan !== "passed" ||
    safety.privateMarkersAbsent !== true ||
    safety.publicDocsNoInternalCodes !== true ||
    safety.evidenceRefsPathNeutral !== true
  ) {
    errors.push(issue("companion-closeout.public-safety", "Companion closeout public-safety checks must pass."));
  }
  return {
    publicBoundaryScan: safety.publicBoundaryScan === "passed" ? "passed" : "blocked",
    noSecretScan: safety.noSecretScan === "passed" ? "passed" : "blocked",
    privateMarkersAbsent: safety.privateMarkersAbsent === true,
    publicDocsNoInternalCodes: safety.publicDocsNoInternalCodes === true,
    evidenceRefsPathNeutral: safety.evidenceRefsPathNeutral === true,
    status:
      safety.publicBoundaryScan === "passed" &&
      safety.noSecretScan === "passed" &&
      safety.privateMarkersAbsent === true &&
      safety.publicDocsNoInternalCodes === true &&
      safety.evidenceRefsPathNeutral === true
        ? "passed"
        : "blocked"
  };
}

function reviewWorktreeEvidence(evidence = {}, errors) {
  const output = {
    expectedChangeSetOnly: evidence.expectedChangeSetOnly === true,
    unrelatedDirtyFilesExcluded: evidence.unrelatedDirtyFilesExcluded === true,
    sourcePinClean: evidence.sourcePinClean === true,
    uiCommitPublicSafe: evidence.uiCommitPublicSafe === true
  };
  if (!output.expectedChangeSetOnly || !output.unrelatedDirtyFilesExcluded || !output.sourcePinClean || !output.uiCommitPublicSafe) {
    errors.push(issue("companion-closeout.worktree-evidence", "Companion closeout worktree evidence must prove expected changes only."));
  }
  return output;
}

function validateEvidenceRef(reference, errors) {
  const text = String(reference ?? "");
  if (!pathNeutralReferencePattern.test(text) || text.includes("..") || unsafeTextPattern.test(text)) {
    errors.push(issue("companion-closeout.evidence-ref", "Companion closeout evidence references must be path-neutral and public-safe."));
  }
}

function assertNoUnsafeText(value, errors) {
  if (value == null) return;
  if (typeof value === "string") {
    if (unsafeTextPattern.test(value)) {
      errors.push(issue("companion-closeout.unsafe-text", "Companion closeout contains unsafe public text."));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertNoUnsafeText(entry, errors);
    return;
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value)) assertNoUnsafeText(entry, errors);
  }
}

function blockedReview(errors) {
  return {
    schemaVersion: "agentique.companionIntegrationCloseoutReview.v1",
    ok: false,
    status: "blocked",
    sourcePin: {},
    validation: { present: [], missing: [...requiredValidationSteps] },
    packages: {},
    capabilities: { accepted: 0, required: requiredCapabilities.length, items: {} },
    deferredCapabilities: { deferred: 0, required: requiredDeferredCapabilities.length, items: {} },
    claimBoundary: { blocked: 0, requiredBlocked: blockedClaimKeys.length },
    publicSafety: { status: "blocked" },
    worktreeEvidence: {},
    summary: {
      sourceRevision: null,
      packageVersion: null,
      acceptedCapabilities: 0,
      deferredCapabilities: 0,
      blockedClaims: 0,
      publicSafety: "blocked",
      sourcePinClean: false
    },
    errors: errors.map((error) => ({ code: error.code, message: redactText(error.message) }))
  };
}

function packageRequirement(name, surfaces, adapterSchemas) {
  return Object.freeze({
    name,
    surfaces: Object.freeze([...surfaces]),
    adapterSchemas: Object.freeze([...adapterSchemas])
  });
}

function capabilityRequirement(id, sourcePackage, adapterSchema) {
  return Object.freeze({ id, sourcePackage, adapterSchema });
}

function safeText(value) {
  return redactText(String(value ?? ""));
}

function issue(code, message) {
  const error = new Error(redactText(message));
  error.code = code;
  return error;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return value;
}
