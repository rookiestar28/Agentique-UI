import assert from "node:assert/strict";
import test from "node:test";
import {
  adapterRegistryManifestTrustPolicySchemaVersion,
  migrateAdapterRegistry,
  requiredAdapterRegistryTrustFields,
  reviewAdapterRegistryManifestTrustPolicy,
  resolveAdapterUpdate,
  reviewRegistryAdapter,
  sampleAdapterRegistry
} from "../src/core/adapter-registry.mjs";
import { sampleAdapterPack } from "../src/core/adapter-pack-policy.mjs";

const visualResource = Object.freeze({ supportMode: "visualizable" });

test("registry review records versions signatures compatibility and revocations", () => {
  const review = reviewRegistryAdapter(sampleAdapterRegistry, sampleAdapterPack, visualResource, { platform: "windows" });

  assert.equal(review.ok, true);
  assert.equal(review.registry.registered, true);
  assert.equal(review.registry.status, "active");
  assert.equal(review.summary.registeredVersions, 2);
  assert.equal(review.summary.revocationStatus, "clear");
  assert.equal(review.compatibility.platform, "windows");
});

test("registry revocation overrides adapter compatibility", () => {
  const revokedPack = {
    ...sampleAdapterPack,
    artifact: { ...sampleAdapterPack.artifact, digest: "f".repeat(64) },
    signature: { ...sampleAdapterPack.signature, subjectDigest: "f".repeat(64) }
  };
  const review = reviewRegistryAdapter(sampleAdapterRegistry, revokedPack, visualResource);

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "adapter.revoked"));
  assert.ok(review.errors.some((error) => error.code === "registry.version-missing"));
});

test("platform and resource incompatibility fail closed", () => {
  const platformReview = reviewRegistryAdapter(sampleAdapterRegistry, sampleAdapterPack, visualResource, { platform: "freebsd" });
  assert.equal(platformReview.ok, false);
  assert.ok(platformReview.errors.some((error) => error.code === "registry.platform-incompatible"));

  const resourceReview = reviewRegistryAdapter(sampleAdapterRegistry, sampleAdapterPack, { supportMode: "external-handoff" });
  assert.equal(resourceReview.ok, false);
  assert.ok(resourceReview.errors.some((error) => error.code === "registry.resource-incompatible"));
});

test("update decisions are deterministic and do not install", () => {
  const decision = resolveAdapterUpdate(sampleAdapterRegistry, {
    adapterId: "adapter.visual-python",
    version: "0.0.9"
  });

  assert.equal(decision.ok, true);
  assert.equal(decision.fromVersion, "0.0.9");
  assert.equal(decision.toVersion, "0.1.0");
  assert.equal(decision.willInstall, false);
  assert.equal(decision.requiresUserReview, true);
  assert.equal(decision.rollback.supported, true);
});

test("downgrade and revoked update targets fail closed", () => {
  const downgrade = resolveAdapterUpdate(sampleAdapterRegistry, {
    adapterId: "adapter.visual-python",
    version: "0.1.0"
  }, { targetVersion: "0.0.9" });
  assert.equal(downgrade.ok, false);
  assert.equal(downgrade.errors[0].code, "registry.downgrade-blocked");

  const revokedRegistry = {
    ...sampleAdapterRegistry,
    entries: sampleAdapterRegistry.entries.map((entry) => (
      entry.adapterId === "adapter.visual-python"
        ? {
            ...entry,
            versions: entry.versions.map((version) => (
              version.version === "0.1.0" ? { ...version, status: "revoked" } : version
            ))
          }
        : entry
    ))
  };
  const revokedTarget = resolveAdapterUpdate(revokedRegistry, {
    adapterId: "adapter.visual-python",
    version: "0.0.9"
  });
  assert.equal(revokedTarget.ok, false);
  assert.equal(revokedTarget.errors[0].code, "registry.revoked");
});

test("legacy registry migration is deterministic", () => {
  const legacy = {
    schemaVersion: "agentique.adapterRegistry.v0",
    adapters: {
      "adapter.visual-python": {
        runtime: "python",
        versions: [
          {
            version: "0.1.0",
            digest: "a".repeat(64),
            platforms: ["windows"],
            resourceTypes: ["visualizable"]
          }
        ]
      }
    }
  };

  const first = migrateAdapterRegistry(legacy);
  const second = migrateAdapterRegistry(legacy);

  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
  assert.equal(first.migration.changed, true);
  assert.equal(first.registry.schemaVersion, "agentique.adapterRegistry.v1");
});

test("manifest trust policy records portability license permission and drift metadata", () => {
  const review = reviewAdapterRegistryManifestTrustPolicy(sampleAdapterRegistry, sampleAdapterPack, visualResource, {
    platform: "windows",
    targetHost: "agentique-ui",
    profile: "review",
    mode: "local"
  });

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.schemaVersion, adapterRegistryManifestTrustPolicySchemaVersion);
  assert.deepEqual(requiredAdapterRegistryTrustFields, [
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
  assert.equal(review.manifestTrust.license.expression, "Apache-2.0");
  assert.equal(review.manifestTrust.permissionCeiling.status, "minimal");
  assert.equal(review.portability.canonicalSourceId, "agentique.adapter.visual-python.source");
  assert.equal(review.portability.targetHost, "agentique-ui");
  assert.equal(review.portability.driftStatus, "in-sync");
  assert.equal(review.authority.enablesNewRuntimeLane, false);
  assert.equal(review.authority.executesLifecycleHooks, false);
  assert.equal(review.updateDecision.willInstall, false);
});

test("manifest trust policy fails closed on unsigned stale broad unlicensed drifted unreviewed and host-incompatible adapters", () => {
  const cases = [
    ["unsigned", { signature: "unsigned" }, "registry.unsigned"],
    ["stale", { status: "stale" }, "registry.stale"],
    ["unsupported license", { license: { expression: "LicenseRef-unknown", status: "unsupported" } }, "registry.unsupported-license"],
    ["broad permission", { permissionCeiling: { status: "broad", families: ["files", "subprocess", "browserData"] } }, "registry.permission-ceiling-broad"],
    ["drifted", { portability: { driftStatus: "drifted" } }, "registry.drifted"],
    ["unreviewed", { provenance: { reviewStatus: "unreviewed" } }, "registry.unreviewed"],
    ["host incompatible", { portability: { targetHost: "other-host" } }, "registry.host-incompatible"]
  ];

  for (const [label, override, code] of cases) {
    const registry = overrideVisualPythonVersion(override);
    const review = reviewAdapterRegistryManifestTrustPolicy(registry, sampleAdapterPack, visualResource, {
      platform: "windows",
      targetHost: "agentique-ui",
      profile: "review",
      mode: "local"
    });

    assert.equal(review.ok, false, label);
    assert.ok(review.blockedReasons.includes(code), `${label} missing ${code}: ${JSON.stringify(review.blockedReasons)}`);
    assert.equal(review.authority.enablesNewRuntimeLane, false);
    assert.equal(review.authority.autoInstallsAdapter, false);
  }
});

test("profile and mode support are explicit compatibility gates", () => {
  const profile = reviewAdapterRegistryManifestTrustPolicy(sampleAdapterRegistry, sampleAdapterPack, visualResource, {
    profile: "debt",
    mode: "local",
    targetHost: "agentique-ui"
  });
  const mode = reviewAdapterRegistryManifestTrustPolicy(sampleAdapterRegistry, sampleAdapterPack, visualResource, {
    profile: "review",
    mode: "remote",
    targetHost: "agentique-ui"
  });

  assert.equal(profile.ok, false);
  assert.ok(profile.blockedReasons.includes("registry.profile-incompatible"));
  assert.equal(mode.ok, false);
  assert.ok(mode.blockedReasons.includes("registry.mode-incompatible"));
});

function overrideVisualPythonVersion(override) {
  return {
    ...sampleAdapterRegistry,
    entries: sampleAdapterRegistry.entries.map((entry) =>
      entry.adapterId === "adapter.visual-python"
        ? {
            ...entry,
            versions: entry.versions.map((version) =>
              version.version === "0.1.0"
                ? {
                    ...version,
                    ...override,
                    license: { ...version.license, ...override.license },
                    provenance: { ...version.provenance, ...override.provenance },
                    permissionCeiling: { ...version.permissionCeiling, ...override.permissionCeiling },
                    portability: { ...version.portability, ...override.portability }
                  }
                : version
            )
          }
        : entry
    )
  };
}
