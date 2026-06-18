import { reviewAdapterPack, sampleAdapterPack, sampleAdapterPolicy } from "./adapter-pack-policy.mjs";
import { redactText } from "./secret-vault.mjs";

const registrySchemaVersion = "agentique.adapterRegistry.v1";

export const adapterRegistryManifestTrustPolicySchemaVersion = "agentique.adapterRegistryManifestTrustPolicy.v1";

export const requiredAdapterRegistryTrustFields = Object.freeze([
  "signer",
  "digest",
  "version",
  "supportMode",
  "license",
  "provenance",
  "permissionCeiling",
  "compatibility",
  "revocation",
  "updatePolicy",
  "blockedStatus",
  "canonicalSourceId",
  "sourceDigest",
  "generatedAdapterDigest",
  "generatorVersion",
  "targetHost",
  "profileSupport",
  "modeSupport",
  "driftStatus"
]);

const defaultTrustedSigners = Object.freeze(["agentique-adapter-release"]);
const defaultSupportedLicenseExpressions = Object.freeze(["Apache-2.0", "MIT"]);
const defaultBlockedPermissionFamilies = Object.freeze(["shell", "environment", "browserData", "subprocess", "packageLifecycle", "containers"]);
const defaultTargetHosts = Object.freeze(["agentique-ui"]);
const defaultProfiles = Object.freeze(["review", "audit"]);
const defaultModes = Object.freeze(["local"]);
const defaultPermissionCeilingFamilies = Object.freeze({
  files: "ask",
  network: "ask",
  shell: "deny",
  environment: "deny",
  gpu: "deny",
  containers: "deny",
  externalProviders: "ask",
  secrets: "ask",
  sidecars: "ask",
  browserData: "deny",
  subprocess: "deny",
  packageLifecycle: "deny"
});

const noAuthorityWidening = Object.freeze({
  enablesNewRuntimeLane: false,
  autoInstallsAdapter: false,
  executesLifecycleHooks: false,
  runsPackageLifecycle: false,
  grantsNativePermission: false,
  importsBrowserData: false,
  forwardsAmbientEnvironment: false,
  startsContainer: false,
  pullsContainerImage: false,
  automatesExternalProvider: false
});

export const sampleAdapterRegistry = Object.freeze({
  schemaVersion: registrySchemaVersion,
  generatedAt: "2026-06-18T00:30:00.000Z",
  trustPolicy: {
    trustedSigners: [...defaultTrustedSigners],
    revocationCheckedAt: "2026-06-18T00:30:00.000Z",
    updateReviewRequired: true,
    supportedLicenseExpressions: [...defaultSupportedLicenseExpressions],
    requiredReviewStatus: "accepted",
    allowedTargetHosts: [...defaultTargetHosts],
    blockedPermissionFamilies: [...defaultBlockedPermissionFamilies],
    staleAfterDays: 180
  },
  entries: [
    {
      adapterId: "adapter.visual-python",
      runtime: "python",
      channel: "stable",
      versions: [
        adapterVersion({
          version: "0.0.9",
          digest: "9".repeat(64),
          status: "superseded",
          updateTo: "0.1.0",
          rollbackTo: null,
          sourceDigest: "8".repeat(64),
          generatedAdapterDigest: "9".repeat(64)
        }),
        adapterVersion({
          version: "0.1.0",
          digest: "a".repeat(64),
          status: "active",
          updateTo: null,
          rollbackTo: "0.0.9",
          sourceDigest: "b".repeat(64),
          generatedAdapterDigest: "a".repeat(64)
        })
      ],
      revokedDigests: ["f".repeat(64)]
    },
    {
      adapterId: "adapter.workflow-node",
      runtime: "node",
      channel: "stable",
      versions: [
        adapterVersion({
          version: "0.1.0",
          digest: "d".repeat(64),
          resourceTypes: ["dry-runnable"],
          supportMode: "dry-runnable",
          updateTo: null,
          rollbackTo: null,
          canonicalSourceId: "agentique.adapter.workflow-node.source",
          sourceDigest: "e".repeat(64),
          generatedAdapterDigest: "d".repeat(64)
        })
      ],
      revokedDigests: []
    }
  ]
});

export function reviewRegistryAdapter(registry = sampleAdapterRegistry, adapterPack = sampleAdapterPack, resource = {}, options = {}) {
  const normalized = normalizeRegistry(registry);
  const record = findRegisteredVersion(normalized, adapterPack);
  const adapterId = adapterPack?.adapter?.id ?? "";
  const version = adapterPack?.adapter?.version ?? "";
  const digest = adapterPack?.artifact?.digest ?? "";
  const policy = {
    ...sampleAdapterPolicy,
    trustedSigners: normalized.trustPolicy.trustedSigners,
    revokedDigests: [
      ...new Set([...(sampleAdapterPolicy.revokedDigests ?? []), ...(record.entry?.revokedDigests ?? []), ...normalized.entries.flatMap((item) => item.revokedDigests ?? [])])
    ]
  };
  const review = reviewAdapterPack(adapterPack, policy, resource);
  const errors = [...review.errors];

  if (!record.entry) {
    errors.push(issue("registry.unknown-adapter", "Adapter is not present in the registry."));
  }
  if (!record.version) {
    errors.push(issue("registry.version-missing", "Adapter version is not present in the registry."));
  }
  if ((record.entry?.revokedDigests ?? []).includes(digest) || record.version?.status === "revoked") {
    errors.push(issue("registry.revoked", "Registry revocation overrides adapter compatibility."));
  }

  const platform = options.platform ?? "windows";
  const resourceType = resource.supportMode ?? "visualizable";
  if (record.version && !record.version.platforms.includes(platform)) {
    errors.push(issue("registry.platform-incompatible", `Adapter is not compatible with ${platform}.`));
  }
  if (record.version && !record.version.resourceTypes.includes(resourceType)) {
    errors.push(issue("registry.resource-incompatible", `Adapter is not compatible with ${resourceType}.`));
  }

  return {
    schemaVersion: "agentique.adapterRegistryReview.v1",
    ok: errors.length === 0,
    adapter: {
      id: redactText(adapterId),
      version: redactText(version),
      digest: redactText(digest),
      runtime: redactText(adapterPack?.adapter?.runtime ?? "unknown")
    },
    registry: {
      registered: Boolean(record.entry && record.version),
      channel: record.entry?.channel ?? "unknown",
      status: record.version?.status ?? "missing",
      revocationCheckedAt: normalized.trustPolicy.revocationCheckedAt,
      updateReviewRequired: normalized.trustPolicy.updateReviewRequired
    },
    compatibility: {
      platform,
      resourceType,
      platforms: record.version?.platforms ?? [],
      resourceTypes: record.version?.resourceTypes ?? []
    },
    trustReview: review,
    errors,
    summary: {
      blockingErrors: errors.length,
      revocationStatus: errors.some((error) => error.code === "registry.revoked" || error.code === "adapter.revoked") ? "blocked" : "clear",
      registeredVersions: record.entry?.versions.length ?? 0
    }
  };
}

export function reviewAdapterRegistryManifestTrustPolicy(registry = sampleAdapterRegistry, adapterPack = sampleAdapterPack, resource = {}, options = {}) {
  const normalized = normalizeRegistry(registry);
  const registryReview = reviewRegistryAdapter(normalized, adapterPack, resource, options);
  const record = findRegisteredVersion(normalized, adapterPack);
  const version = record.version;
  const targetHost = options.targetHost ?? "agentique-ui";
  const profile = options.profile ?? "review";
  const mode = options.mode ?? "local";
  const blockedReasonSet = new Set(registryReview.errors.map((error) => error.code));
  const errors = [...registryReview.errors];

  if (version) {
    collectTrustPolicyErrors(normalized, version, { targetHost, profile, mode }, blockedReasonSet, errors);
  }

  const blockedReasons = [...blockedReasonSet].sort();
  const updateDecision = resolveAdapterUpdate(normalized, {
    adapterId: adapterPack?.adapter?.id ?? record.entry?.adapterId ?? "unknown",
    version: adapterPack?.adapter?.version ?? version?.version ?? "unknown"
  });

  const manifestTrust = buildManifestTrust(normalized, version, registryReview);
  const portability = buildPortability(version, { targetHost, profile, mode });

  return freeze({
    schemaVersion: adapterRegistryManifestTrustPolicySchemaVersion,
    ok: registryReview.ok && blockedReasons.length === 0,
    requiredFields: [...requiredAdapterRegistryTrustFields],
    trustPolicy: {
      requiredFields: [...requiredAdapterRegistryTrustFields],
      supportedLicenseExpressions: normalized.trustPolicy.supportedLicenseExpressions,
      requiredReviewStatus: normalized.trustPolicy.requiredReviewStatus,
      blockedPermissionFamilies: normalized.trustPolicy.blockedPermissionFamilies
    },
    adapter: registryReview.adapter,
    registry: registryReview.registry,
    registryReview,
    manifestTrust,
    portability,
    compatibility: manifestTrust.compatibility,
    blockedReasons,
    authority: { ...noAuthorityWidening },
    updateDecision,
    errors,
    summary: {
      blockingErrors: blockedReasons.length,
      requiredFields: requiredAdapterRegistryTrustFields.length,
      targetHost,
      profile,
      mode,
      driftStatus: portability.driftStatus,
      permissionCeiling: manifestTrust.permissionCeiling.status,
      reviewOnly: true
    }
  });
}

export function resolveAdapterUpdate(registry = sampleAdapterRegistry, currentRef, options = {}) {
  const normalized = normalizeRegistry(registry);
  const adapterId = requireText(currentRef?.adapterId, "adapterId");
  const currentVersion = requireText(currentRef?.version, "version");
  const entry = normalized.entries.find((item) => item.adapterId === adapterId);
  if (!entry) {
    return failedUpdate(adapterId, currentVersion, "registry.unknown-adapter", "Adapter is not present in the registry.");
  }

  const current = entry.versions.find((version) => version.version === currentVersion);
  if (!current) {
    return failedUpdate(adapterId, currentVersion, "registry.version-missing", "Current adapter version is not present in the registry.");
  }
  if (current.status === "revoked" || entry.revokedDigests.includes(current.digest)) {
    return failedUpdate(adapterId, currentVersion, "registry.revoked", "Current adapter version is revoked.");
  }

  const targetVersion = options.targetVersion ?? current.updateTo ?? latestActiveVersion(entry)?.version ?? current.version;
  const target = entry.versions.find((version) => version.version === targetVersion);
  if (!target) {
    return failedUpdate(adapterId, currentVersion, "registry.target-missing", "Target adapter version is not present in the registry.");
  }
  if (compareSemver(target.version, current.version) < 0) {
    return failedUpdate(adapterId, currentVersion, "registry.downgrade-blocked", "Adapter downgrade is blocked unless an explicit rollback plan is selected.");
  }
  if (target.status === "revoked" || entry.revokedDigests.includes(target.digest)) {
    return failedUpdate(adapterId, currentVersion, "registry.revoked", "Target adapter version is revoked.");
  }

  return {
    ok: true,
    schemaVersion: "agentique.adapterUpdateDecision.v1",
    adapterId,
    fromVersion: current.version,
    toVersion: target.version,
    fromDigest: current.digest,
    toDigest: target.digest,
    willInstall: false,
    requiresUserReview: true,
    rollback: {
      supported: Boolean(target.rollbackTo),
      version: target.rollbackTo
    },
    errors: []
  };
}

export function migrateAdapterRegistry(input) {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      errors: [issue("registry.invalid-state", "Adapter registry must be an object.")]
    };
  }
  if (input.schemaVersion === registrySchemaVersion) {
    return {
      ok: true,
      registry: normalizeRegistry(input),
      migration: { from: registrySchemaVersion, to: registrySchemaVersion, changed: false }
    };
  }
  if (input.schemaVersion === "agentique.adapterRegistry.v0") {
    const entries = Object.entries(input.adapters ?? {}).map(([adapterId, value]) => ({
      adapterId,
      runtime: value.runtime ?? "unknown",
      channel: value.channel ?? "stable",
      versions: (value.versions ?? []).map((version) => ({
        version: version.version,
        digest: version.digest,
        signature: version.signature ?? "verified",
        signer: version.signer ?? "agentique-adapter-release",
        platforms: version.platforms ?? [],
        resourceTypes: version.resourceTypes ?? [],
        status: version.status ?? "active",
        updateTo: version.updateTo ?? null,
        rollbackTo: version.rollbackTo ?? null
      })),
      revokedDigests: value.revokedDigests ?? []
    }));
    return {
      ok: true,
      registry: normalizeRegistry({
        schemaVersion: registrySchemaVersion,
        generatedAt: input.generatedAt ?? "2026-06-11T00:30:00.000Z",
        trustPolicy: {
          trustedSigners: input.trustedSigners ?? ["agentique-adapter-release"],
          revocationCheckedAt: input.revocationCheckedAt ?? "2026-06-11T00:30:00.000Z",
          updateReviewRequired: true
        },
        entries
      }),
      migration: { from: "agentique.adapterRegistry.v0", to: registrySchemaVersion, changed: true }
    };
  }
  return {
    ok: false,
    errors: [issue("registry.unsupported-schema", "Adapter registry schema is unsupported.")]
  };
}

function adapterVersion({
  version,
  digest,
  status = "active",
  updateTo = null,
  rollbackTo = null,
  platforms = ["windows", "macos", "linux"],
  resourceTypes = ["visualizable"],
  supportMode = "visualizable",
  canonicalSourceId = "agentique.adapter.visual-python.source",
  sourceDigest,
  generatedAdapterDigest
}) {
  return {
    version,
    digest,
    signature: "verified",
    signer: "agentique-adapter-release",
    platforms,
    resourceTypes,
    status,
    updateTo,
    rollbackTo,
    supportMode,
    license: {
      expression: "Apache-2.0",
      status: "supported"
    },
    provenance: {
      source: "agentique-adapter-pack",
      builder: "github-actions",
      predicateType: "https://slsa.dev/provenance/v1",
      reviewStatus: "accepted",
      reviewedAt: "2026-06-18T00:30:00.000Z"
    },
    permissionCeiling: {
      status: "minimal",
      families: { ...defaultPermissionCeilingFamilies }
    },
    compatibility: {
      host: "agentique-ui",
      platforms,
      resourceTypes
    },
    revocation: {
      status: "active",
      checkedAt: "2026-06-18T00:30:00.000Z"
    },
    updatePolicy: {
      channel: "stable",
      reviewRequired: true,
      autoInstall: false,
      lifecycleHooks: "blocked"
    },
    blockedStatus: "clear",
    portability: {
      canonicalSourceId,
      sourceDigest,
      generatedAdapterDigest,
      generatorVersion: "0.1.0",
      targetHost: "agentique-ui",
      profileSupport: [...defaultProfiles],
      modeSupport: [...defaultModes],
      driftStatus: "in-sync",
      lifecycleHooks: "descriptor-only"
    }
  };
}

function collectTrustPolicyErrors(registry, version, options, blockedReasonSet, errors) {
  addIf(
    version.signature !== "verified" || !registry.trustPolicy.trustedSigners.includes(version.signer),
    "registry.unsigned",
    "Registry version is unsigned or signer is untrusted."
  );
  addIf(version.status === "stale", "registry.stale", "Registry version is stale.");
  addIf(version.status === "revoked" || version.revocation.status === "revoked", "registry.revoked", "Registry version is revoked.");
  addIf(version.blockedStatus !== "clear", "registry.blocked", "Registry blocked status is not clear.");
  addIf(
    version.license.status !== "supported" || !registry.trustPolicy.supportedLicenseExpressions.includes(version.license.expression),
    "registry.unsupported-license",
    "Registry license policy does not support this adapter."
  );
  addIf(
    version.permissionCeiling.status !== "minimal" || hasBroadPermissionCeiling(registry, version.permissionCeiling),
    "registry.permission-ceiling-broad",
    "Registry permission ceiling is too broad."
  );
  addIf(version.portability.driftStatus !== "in-sync", "registry.drifted", "Generated adapter provenance has drifted from the canonical source.");
  addIf(version.provenance.reviewStatus !== registry.trustPolicy.requiredReviewStatus, "registry.unreviewed", "Registry provenance review has not been accepted.");
  addIf(
    version.portability.targetHost !== options.targetHost || !registry.trustPolicy.allowedTargetHosts.includes(version.portability.targetHost),
    "registry.host-incompatible",
    "Registry target host is incompatible."
  );
  addIf(!version.portability.profileSupport.includes(options.profile), "registry.profile-incompatible", "Requested adapter profile is unsupported.");
  addIf(!version.portability.modeSupport.includes(options.mode), "registry.mode-incompatible", "Requested adapter mode is unsupported.");

  function addIf(condition, code, message) {
    if (!condition) return;
    blockedReasonSet.add(code);
    errors.push(issue(code, message));
  }
}

function hasBroadPermissionCeiling(registry, permissionCeiling) {
  const families = permissionCeiling.families ?? {};
  if (Array.isArray(families)) return families.length > 0;
  for (const family of registry.trustPolicy.blockedPermissionFamilies) {
    const decision = families[family] ?? "deny";
    if (decision !== "deny") return true;
  }
  return false;
}

function buildManifestTrust(registry, version, registryReview) {
  const fallback = emptyVersion();
  const selected = version ?? fallback;
  return {
    signer: redactText(selected.signer),
    digest: redactText(selected.digest),
    version: redactText(selected.version),
    supportMode: redactText(selected.supportMode),
    license: selected.license,
    provenance: selected.provenance,
    permissionCeiling: selected.permissionCeiling,
    compatibility: selected.compatibility,
    revocation: {
      ...selected.revocation,
      registryStatus: registryReview.summary.revocationStatus,
      revocationCheckedAt: registry.trustPolicy.revocationCheckedAt
    },
    updatePolicy: selected.updatePolicy,
    blockedStatus: selected.blockedStatus
  };
}

function buildPortability(version, options) {
  const selected = version ?? emptyVersion();
  return {
    ...selected.portability,
    requestedProfile: options.profile,
    requestedMode: options.mode,
    requestedTargetHost: options.targetHost,
    profileSupported: selected.portability.profileSupport.includes(options.profile),
    modeSupported: selected.portability.modeSupport.includes(options.mode),
    hostSupported: selected.portability.targetHost === options.targetHost
  };
}

function emptyVersion() {
  return {
    version: "missing",
    digest: "0".repeat(64),
    signature: "missing",
    signer: "missing",
    supportMode: "unknown",
    license: { expression: "unknown", status: "unsupported" },
    provenance: { source: "unknown", builder: "unknown", predicateType: "missing", reviewStatus: "unreviewed", reviewedAt: null },
    permissionCeiling: { status: "missing", families: {} },
    compatibility: { host: "unknown", platforms: [], resourceTypes: [] },
    revocation: { status: "unknown", checkedAt: null },
    updatePolicy: { channel: "unknown", reviewRequired: true, autoInstall: false, lifecycleHooks: "blocked" },
    blockedStatus: "missing",
    portability: {
      canonicalSourceId: "missing",
      sourceDigest: "0".repeat(64),
      generatedAdapterDigest: "0".repeat(64),
      generatorVersion: "unknown",
      targetHost: "unknown",
      profileSupport: [],
      modeSupport: [],
      driftStatus: "missing",
      lifecycleHooks: "blocked"
    }
  };
}

function normalizeRegistry(registry) {
  if (!registry || typeof registry !== "object") {
    throw issue("registry.invalid-state", "Adapter registry must be an object.");
  }
  if (registry.schemaVersion !== registrySchemaVersion) {
    const migrated = migrateAdapterRegistry(registry);
    if (!migrated.ok) {
      throw issue(migrated.errors[0].code, migrated.errors[0].message);
    }
    return migrated.registry;
  }
  return {
    schemaVersion: registrySchemaVersion,
    generatedAt: isoDate(registry.generatedAt),
    trustPolicy: normalizeTrustPolicy(registry.trustPolicy),
    entries: (registry.entries ?? []).map(normalizeEntry).sort((left, right) => left.adapterId.localeCompare(right.adapterId))
  };
}

function normalizeTrustPolicy(trustPolicy) {
  return {
    trustedSigners: normalizeTextArrayOrDefault(trustPolicy?.trustedSigners, defaultTrustedSigners),
    revocationCheckedAt: isoDate(trustPolicy?.revocationCheckedAt ?? "2026-06-18T00:30:00.000Z"),
    updateReviewRequired: trustPolicy?.updateReviewRequired !== false,
    supportedLicenseExpressions: normalizeTextArrayOrDefault(trustPolicy?.supportedLicenseExpressions, defaultSupportedLicenseExpressions),
    requiredReviewStatus: requireText(trustPolicy?.requiredReviewStatus ?? "accepted", "requiredReviewStatus"),
    allowedTargetHosts: normalizeTextArrayOrDefault(trustPolicy?.allowedTargetHosts, defaultTargetHosts),
    blockedPermissionFamilies: normalizeTextArrayOrDefault(trustPolicy?.blockedPermissionFamilies, defaultBlockedPermissionFamilies),
    staleAfterDays: Number.isFinite(Number(trustPolicy?.staleAfterDays)) ? Number(trustPolicy.staleAfterDays) : 180
  };
}

function normalizeEntry(entry) {
  return {
    adapterId: requireText(entry.adapterId, "adapterId"),
    runtime: requireText(entry.runtime, "runtime"),
    channel: requireText(entry.channel ?? "stable", "channel"),
    versions: (entry.versions ?? []).map((version) => normalizeVersion(version, entry)).sort((left, right) => compareSemver(left.version, right.version)),
    revokedDigests: (entry.revokedDigests ?? []).map((digest) => requireDigest(digest, "revokedDigest"))
  };
}

function normalizeVersion(version, entry) {
  const platforms = normalizeTextArrayOrDefault(version.platforms, ["windows", "macos", "linux"]);
  const resourceTypes = normalizeTextArrayOrDefault(version.resourceTypes, ["visualizable"]);
  const digest = requireDigest(version.digest, "digest");
  const supportMode = requireText(version.supportMode ?? resourceTypes[0] ?? "visualizable", "supportMode");

  return {
    version: requireText(version.version, "version"),
    digest,
    signature: requireText(version.signature ?? "verified", "signature"),
    signer: requireText(version.signer ?? "agentique-adapter-release", "signer"),
    platforms,
    resourceTypes,
    status: requireText(version.status ?? "active", "status"),
    updateTo: version.updateTo ?? null,
    rollbackTo: version.rollbackTo ?? null,
    supportMode,
    license: normalizeLicense(version.license),
    provenance: normalizeProvenance(version.provenance),
    permissionCeiling: normalizePermissionCeiling(version.permissionCeiling),
    compatibility: normalizeCompatibility(version.compatibility, platforms, resourceTypes),
    revocation: normalizeRevocation(version.revocation),
    updatePolicy: normalizeUpdatePolicy(version.updatePolicy),
    blockedStatus: requireText(version.blockedStatus ?? "clear", "blockedStatus"),
    portability: normalizePortability(version.portability, entry, digest)
  };
}

function normalizeLicense(license) {
  return {
    expression: requireText(license?.expression ?? "Apache-2.0", "license.expression"),
    status: requireText(license?.status ?? "supported", "license.status")
  };
}

function normalizeProvenance(provenance) {
  return {
    source: requireText(provenance?.source ?? "agentique-adapter-pack", "provenance.source"),
    builder: requireText(provenance?.builder ?? "github-actions", "provenance.builder"),
    predicateType: requireText(provenance?.predicateType ?? "https://slsa.dev/provenance/v1", "provenance.predicateType"),
    reviewStatus: requireText(provenance?.reviewStatus ?? "accepted", "provenance.reviewStatus"),
    reviewedAt: isoDate(provenance?.reviewedAt ?? "2026-06-18T00:30:00.000Z")
  };
}

function normalizePermissionCeiling(permissionCeiling) {
  return {
    status: requireText(permissionCeiling?.status ?? "minimal", "permissionCeiling.status"),
    families: normalizePermissionFamilies(permissionCeiling?.families)
  };
}

function normalizePermissionFamilies(families) {
  if (Array.isArray(families)) return families.map((family) => requireText(family, "permissionCeiling.family"));
  if (families && typeof families === "object") {
    return Object.fromEntries(
      Object.entries({ ...defaultPermissionCeilingFamilies, ...families }).map(([family, decision]) => [family, requireText(decision, `permissionCeiling.${family}`)])
    );
  }
  return { ...defaultPermissionCeilingFamilies };
}

function normalizeCompatibility(compatibility, platforms, resourceTypes) {
  return {
    host: requireText(compatibility?.host ?? "agentique-ui", "compatibility.host"),
    platforms: normalizeTextArrayOrDefault(compatibility?.platforms, platforms),
    resourceTypes: normalizeTextArrayOrDefault(compatibility?.resourceTypes, resourceTypes)
  };
}

function normalizeRevocation(revocation) {
  return {
    status: requireText(revocation?.status ?? "active", "revocation.status"),
    checkedAt: isoDate(revocation?.checkedAt ?? "2026-06-18T00:30:00.000Z")
  };
}

function normalizeUpdatePolicy(updatePolicy) {
  return {
    channel: requireText(updatePolicy?.channel ?? "stable", "updatePolicy.channel"),
    reviewRequired: updatePolicy?.reviewRequired !== false,
    autoInstall: updatePolicy?.autoInstall === true,
    lifecycleHooks: requireText(updatePolicy?.lifecycleHooks ?? "blocked", "updatePolicy.lifecycleHooks")
  };
}

function normalizePortability(portability, entry, digest) {
  return {
    canonicalSourceId: requireText(portability?.canonicalSourceId ?? `agentique.${entry.adapterId}.source`, "portability.canonicalSourceId"),
    sourceDigest: requireDigest(portability?.sourceDigest ?? digest, "portability.sourceDigest"),
    generatedAdapterDigest: requireDigest(portability?.generatedAdapterDigest ?? digest, "portability.generatedAdapterDigest"),
    generatorVersion: requireText(portability?.generatorVersion ?? "0.1.0", "portability.generatorVersion"),
    targetHost: requireText(portability?.targetHost ?? "agentique-ui", "portability.targetHost"),
    profileSupport: normalizeTextArrayOrDefault(portability?.profileSupport, defaultProfiles),
    modeSupport: normalizeTextArrayOrDefault(portability?.modeSupport, defaultModes),
    driftStatus: requireText(portability?.driftStatus ?? "in-sync", "portability.driftStatus"),
    lifecycleHooks: requireText(portability?.lifecycleHooks ?? "descriptor-only", "portability.lifecycleHooks")
  };
}

function findRegisteredVersion(registry, adapterPack) {
  const adapterId = adapterPack?.adapter?.id ?? "";
  const version = adapterPack?.adapter?.version ?? "";
  const digest = adapterPack?.artifact?.digest ?? "";
  const entry = registry.entries.find((item) => item.adapterId === adapterId);
  return {
    entry,
    version: entry?.versions.find((item) => item.version === version && item.digest === digest)
  };
}

function latestActiveVersion(entry) {
  return [...entry.versions].reverse().find((version) => version.status === "active");
}

function failedUpdate(adapterId, currentVersion, code, message) {
  return {
    ok: false,
    schemaVersion: "agentique.adapterUpdateDecision.v1",
    adapterId: redactText(adapterId ?? "unknown"),
    fromVersion: redactText(currentVersion ?? "unknown"),
    toVersion: null,
    fromDigest: null,
    toDigest: null,
    willInstall: false,
    requiresUserReview: true,
    rollback: { supported: false, version: null },
    errors: [issue(code, message)]
  };
}

function compareSemver(left, right) {
  const leftParts = String(left)
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  const rightParts = String(right)
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < 3; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw issue("registry.invalid-field", `${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function requireDigest(value, fieldName) {
  const text = requireText(value, fieldName).toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(text)) {
    throw issue("registry.invalid-digest", `${fieldName} must be a SHA-256 digest.`);
  }
  return text;
}

function normalizeTextArray(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw issue("registry.invalid-field", "Expected an array of strings.");
  }
  return value.map((item) => item.trim());
}

function normalizeTextArrayOrDefault(value, fallback) {
  return value === undefined ? [...fallback] : normalizeTextArray(value);
}

function isoDate(value) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    throw issue("registry.invalid-date", "Registry date must be an ISO date.");
  }
  return time.toISOString();
}

function issue(code, message) {
  return { code, message: redactText(message) };
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
