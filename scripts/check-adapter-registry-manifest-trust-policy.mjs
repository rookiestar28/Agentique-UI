#!/usr/bin/env node
import fs from "node:fs";
import {
  adapterRegistryManifestTrustPolicySchemaVersion,
  requiredAdapterRegistryTrustFields,
  reviewAdapterRegistryManifestTrustPolicy,
  sampleAdapterRegistry
} from "../src/core/adapter-registry.mjs";
import { sampleAdapterPack } from "../src/core/adapter-pack-policy.mjs";

const failures = [];
const visualResource = Object.freeze({ supportMode: "visualizable" });
const review = reviewAdapterRegistryManifestTrustPolicy(sampleAdapterRegistry, sampleAdapterPack, visualResource, {
  platform: "windows",
  targetHost: "agentique-ui",
  profile: "review",
  mode: "local"
});
const moduleText = readText("src/core/adapter-registry.mjs");
const tests = readText("tests/adapter-registry.test.mjs");
const surfaceTest = readText("tests/adapter-registry-surface.test.mjs");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const runWorkspace = readText("src/workspaces/RunWorkspace.tsx");
const panel = readText("src/workspaces/AdapterRegistryTrustPanel.tsx");
const stageReporting = readText("src/core/validation-stage-reporting.mjs");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message ?? error.code));
}

requireIncludes(
  moduleText,
  [
    "agentique.adapterRegistryManifestTrustPolicy.v1",
    "requiredAdapterRegistryTrustFields",
    "reviewAdapterRegistryManifestTrustPolicy",
    "registry.permission-ceiling-broad",
    "registry.host-incompatible",
    "registry.profile-incompatible",
    "enablesNewRuntimeLane: false",
    "autoInstallsAdapter: false",
    "executesLifecycleHooks: false"
  ],
  "adapter registry module"
);

requireIncludes(
  tests,
  [
    "manifest trust policy records portability license permission and drift metadata",
    "manifest trust policy fails closed on unsigned stale broad unlicensed drifted unreviewed and host-incompatible adapters",
    "profile and mode support are explicit compatibility gates"
  ],
  "adapter registry tests"
);

requireIncludes(
  surfaceTest,
  ["Adapter registry manifest trust policy", "Adapter trust policy summary", "Adapter portability and drift status", "Adapter blocked trust reasons"],
  "adapter registry surface tests"
);
requireIncludes(route, ["reviewAdapterRegistryManifestTrustPolicy", 'targetHost: "agentique-ui"', 'profile: "review"', 'mode: "local"'], "graph/run route");
requireIncludes(runWorkspace, ["AdapterRegistryTrustPanel", "registryReview={registryReview}", "adapterUpdateDecision={adapterUpdateDecision}"], "run workspace mount");
requireIncludes(
  panel,
  [
    "Adapter registry manifest trust policy",
    "Adapter trust policy summary",
    "Adapter portability and drift status",
    "Adapter blocked trust reasons",
    "Revocation overrides compatibility"
  ],
  "adapter registry trust panel"
);
requireIncludes(stageReporting, ["validate:adapter-registry-manifest-trust-policy"], "validation stage reporting");

if (!String(packageJson.scripts?.["validate:adapter-registry-manifest-trust-policy"] ?? "").includes("check-adapter-registry-manifest-trust-policy.mjs")) {
  failures.push("package scripts must define validate:adapter-registry-manifest-trust-policy");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:adapter-registry-manifest-trust-policy")) {
  failures.push("full validate script must include validate:adapter-registry-manifest-trust-policy");
}

for (const field of requiredAdapterRegistryTrustFields) {
  if (!review.requiredFields.includes(field)) {
    failures.push(`review missing required trust field: ${field}`);
  }
}

for (const [code, registry] of Object.entries({
  "registry.unsigned": overrideVisualPythonVersion({ signature: "unsigned" }),
  "registry.stale": overrideVisualPythonVersion({ status: "stale" }),
  "registry.unsupported-license": overrideVisualPythonVersion({ license: { expression: "LicenseRef-unknown", status: "unsupported" } }),
  "registry.permission-ceiling-broad": overrideVisualPythonVersion({ permissionCeiling: { status: "broad", families: ["files", "subprocess", "browserData"] } }),
  "registry.drifted": overrideVisualPythonVersion({ portability: { driftStatus: "drifted" } }),
  "registry.unreviewed": overrideVisualPythonVersion({ provenance: { reviewStatus: "unreviewed" } }),
  "registry.host-incompatible": overrideVisualPythonVersion({ portability: { targetHost: "other-host" } })
})) {
  const blockedReview = reviewAdapterRegistryManifestTrustPolicy(registry, sampleAdapterPack, visualResource, {
    platform: "windows",
    targetHost: "agentique-ui",
    profile: "review",
    mode: "local"
  });
  if (blockedReview.ok || !blockedReview.blockedReasons.includes(code)) {
    failures.push(`manifest trust policy did not fail closed with ${code}`);
  }
}

if (
  review.authority.enablesNewRuntimeLane ||
  review.authority.autoInstallsAdapter ||
  review.authority.executesLifecycleHooks ||
  review.authority.runsPackageLifecycle ||
  review.authority.importsBrowserData ||
  review.authority.forwardsAmbientEnvironment ||
  review.updateDecision.willInstall
) {
  failures.push("manifest trust policy must remain review-only and must not widen runtime authority");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      schemaVersion: adapterRegistryManifestTrustPolicySchemaVersion,
      requiredFields: requiredAdapterRegistryTrustFields.length,
      blockedCases: 7,
      summary: review.summary,
      failures: []
    },
    null,
    2
  )
);

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

function readText(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}
