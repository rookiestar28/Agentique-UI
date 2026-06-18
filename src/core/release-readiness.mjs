import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

const readinessSchemaVersion = "agentique.distributionReadiness.v1";
const requiredPlatforms = ["windows", "macos", "linux"];
const requiredEvidence = [
  "installerArtifact",
  "signature",
  "updateMetadata",
  "rollbackPlan",
  "vulnerabilityDisclosure",
  "provenance",
  "installSmoke",
  "uninstallSmoke",
  "cleanEnvironmentSmoke"
];
const unsafePathPattern = /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\)|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u;

export const sampleIncompleteDistributionEvidence = Object.freeze({
  schemaVersion: readinessSchemaVersion,
  releaseCandidate: "0.0.0-local",
  generatedAt: "2026-06-11T00:35:00.000Z",
  publishIntent: "blocked-until-evidence-complete",
  bundleActive: false,
  platforms: {
    windows: {
      installerArtifact: missing("no installer artifact generated"),
      signature: missing("no signing evidence"),
      updateMetadata: missing("no signed update metadata"),
      rollbackPlan: missing("no rollback test"),
      vulnerabilityDisclosure: present("SECURITY.md policy draft"),
      provenance: missing("no release provenance"),
      installSmoke: missing("no install smoke"),
      uninstallSmoke: missing("no uninstall smoke"),
      cleanEnvironmentSmoke: missing("no clean environment smoke")
    },
    macos: {},
    linux: {}
  }
});

export const sampleCompleteDistributionEvidence = Object.freeze({
  schemaVersion: readinessSchemaVersion,
  releaseCandidate: "0.1.0-candidate",
  generatedAt: "2026-06-11T00:36:00.000Z",
  publishIntent: "manual-review-required",
  bundleActive: true,
  platforms: Object.fromEntries(requiredPlatforms.map((platform) => [platform, completePlatformEvidence(platform)]))
});

export function evaluateDistributionReadiness(evidence = sampleIncompleteDistributionEvidence) {
  try {
    assertReleaseEvidenceSafe(evidence);
  } catch (error) {
    return failedReadiness(error.code ?? "distribution.unsafe-evidence", error.message);
  }

  const blockers = [];
  if (evidence?.schemaVersion !== readinessSchemaVersion) {
    blockers.push(issue("distribution.invalid-schema", "Distribution readiness schema is unsupported."));
  }
  if (evidence?.bundleActive !== true) {
    blockers.push(issue("distribution.bundle-disabled", "Desktop bundling remains disabled."));
  }

  for (const platform of requiredPlatforms) {
    const platformEvidence = evidence?.platforms?.[platform];
    if (!platformEvidence || typeof platformEvidence !== "object") {
      blockers.push(issue("distribution.platform-missing", `${platform} evidence is missing.`));
      continue;
    }
    for (const key of requiredEvidence) {
      const item = platformEvidence[key];
      if (!item || item.status !== "present") {
        blockers.push(issue(`distribution.${key}-missing`, `${platform} ${key} evidence is missing.`));
      }
    }
    if (platformEvidence.signature?.status === "present" && platformEvidence.signature?.verified !== true) {
      blockers.push(issue("distribution.signature-unverified", `${platform} signature evidence is not verified.`));
    }
    if (platformEvidence.updateMetadata?.status === "present" && platformEvidence.updateMetadata?.signed !== true) {
      blockers.push(issue("distribution.update-unsigned", `${platform} update metadata is not signed.`));
    }
    if (platformEvidence.rollbackPlan?.status === "present" && platformEvidence.rollbackPlan?.tested !== true) {
      blockers.push(issue("distribution.rollback-untested", `${platform} rollback evidence is not tested.`));
    }
  }

  return {
    ok: blockers.length === 0,
    schemaVersion: readinessSchemaVersion,
    releaseCandidate: redactText(evidence?.releaseCandidate ?? "unknown"),
    publishIntent: redactText(evidence?.publishIntent ?? "blocked"),
    bundleActive: evidence?.bundleActive === true,
    platforms: requiredPlatforms.map((platform) => summarizePlatform(platform, evidence?.platforms?.[platform])),
    blockers,
    summary: {
      requiredPlatforms: requiredPlatforms.length,
      readyPlatforms: requiredPlatforms.filter((platform) => platformReady(evidence?.platforms?.[platform])).length,
      blockers: blockers.length
    }
  };
}

export function assertReleaseEvidenceSafe(evidence) {
  assertNoInlineSecrets(evidence);
  const text = JSON.stringify(evidence);
  if (unsafePathPattern.test(text)) {
    throw issue("distribution.unsafe-path", "Distribution readiness evidence must not include local path material.");
  }
  if (text.includes([".", "planning"].join("")) || text.includes(["reference", "docs"].join("/"))) {
    throw issue("distribution.unsafe-output", "Distribution readiness evidence must not include private planning material.");
  }
  return true;
}

function summarizePlatform(platform, evidence = {}) {
  return {
    platform,
    presentEvidence: requiredEvidence.filter((key) => evidence?.[key]?.status === "present").length,
    requiredEvidence: requiredEvidence.length,
    ready: platformReady(evidence)
  };
}

function platformReady(evidence = {}) {
  return requiredEvidence.every((key) => evidence?.[key]?.status === "present") &&
    evidence?.signature?.verified === true &&
    evidence?.updateMetadata?.signed === true &&
    evidence?.rollbackPlan?.tested === true;
}

function completePlatformEvidence(platform) {
  return {
    installerArtifact: present(`${platform} installer artifact digest recorded`),
    signature: { ...present(`${platform} code signature verified`), verified: true, signer: "agentique-release" },
    updateMetadata: { ...present(`${platform} update metadata signed`), signed: true },
    rollbackPlan: { ...present(`${platform} rollback tested`), tested: true },
    vulnerabilityDisclosure: present("security contact and disclosure process documented"),
    provenance: present(`${platform} release provenance recorded`),
    installSmoke: present(`${platform} install smoke passed`),
    uninstallSmoke: present(`${platform} uninstall smoke passed`),
    cleanEnvironmentSmoke: present(`${platform} clean environment smoke passed`)
  };
}

function present(detail) {
  return {
    status: "present",
    detail
  };
}

function missing(detail) {
  return {
    status: "missing",
    detail
  };
}

function failedReadiness(code, message) {
  return {
    ok: false,
    schemaVersion: readinessSchemaVersion,
    releaseCandidate: "unknown",
    publishIntent: "blocked",
    bundleActive: false,
    platforms: [],
    blockers: [issue(code, message)],
    summary: { requiredPlatforms: requiredPlatforms.length, readyPlatforms: 0, blockers: 1 }
  };
}

function issue(code, message) {
  return { code, message: redactText(message) };
}
