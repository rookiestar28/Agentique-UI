import fs from "node:fs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const macosReleaseSchemaVersion = "agentique.macosReleaseGate.v1";
export const requiredMacosTargets = Object.freeze(["app", "dmg"]);
const localPathPattern = /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\|\/[A-Za-z0-9_.-])|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u;

export const sampleMacosBlockedEvidence = Object.freeze({
  schemaVersion: "agentique.macosReleaseEvidence.v1",
  releaseVersion: "0.1.0",
  artifacts: [],
  signing: { status: "missing" },
  notarization: { status: "missing", stapled: false },
  smoke: { status: "missing", redactedLogs: true }
});

export const sampleMacosReadyEvidence = Object.freeze({
  schemaVersion: "agentique.macosReleaseEvidence.v1",
  releaseVersion: "0.1.0",
  artifacts: [
    {
      target: "app",
      fileName: "Agentique UI.app",
      sha256: "c".repeat(64)
    },
    {
      target: "dmg",
      fileName: "Agentique UI_0.1.0_aarch64.dmg",
      sha256: "d".repeat(64)
    }
  ],
  signing: {
    status: "verified",
    identityKind: "Developer ID Application"
  },
  notarization: {
    status: "accepted",
    stapled: true
  },
  smoke: {
    status: "passed",
    quarantine: true,
    launch: true,
    version: true,
    uninstall: true,
    cleanup: true,
    redactedLogs: true
  }
});

export function readMacosReleaseInputs({
  specPath = "release/macos-distribution.spec.json",
  tauriPath = "src-tauri/tauri.conf.json",
  packagePath = "package.json"
} = {}) {
  return {
    spec: JSON.parse(fs.readFileSync(specPath, "utf8")),
    tauriConfig: JSON.parse(fs.readFileSync(tauriPath, "utf8")),
    packageJson: JSON.parse(fs.readFileSync(packagePath, "utf8"))
  };
}

export function validateMacosReleaseGate({ spec, tauriConfig, packageJson, evidence = sampleMacosBlockedEvidence } = readMacosReleaseInputs()) {
  const gateFindings = [];
  const blockers = [issue("macos.owner-skipped", "macOS packaging and environment validation are explicitly skipped and unverified.")];

  try {
    assertMacosEvidenceSafe(evidence);
  } catch (error) {
    gateFindings.push(issue(error.code ?? "macos.evidence-unsafe", error.message));
  }

  if (spec?.schemaVersion !== macosReleaseSchemaVersion) {
    gateFindings.push(issue("macos.schema", "macOS release spec schema version is unsupported."));
  }
  if (spec?.platform !== "macos") {
    gateFindings.push(issue("macos.platform", "macOS release spec must target macos."));
  }
  if (spec?.scopeStatus !== "skipped-unverified") {
    gateFindings.push(issue("macos.scope-status", "macOS release scope must remain explicitly skipped and unverified."));
  }
  for (const target of requiredMacosTargets) {
    if (!Array.isArray(spec?.bundleTargets) || !spec.bundleTargets.includes(target)) {
      gateFindings.push(issue("macos.spec-target-missing", `macOS release spec missing ${target} target.`));
    }
  }
  if (spec?.buildCommand !== "npm run tauri:build:macos") {
    gateFindings.push(issue("macos.build-command", "macOS release spec must point at the public macOS build command."));
  }
  if (!String(packageJson?.scripts?.["tauri:build:macos"] ?? "").includes("--bundles app,dmg")) {
    gateFindings.push(issue("macos.package-script", "package.json must expose a macOS app/DMG build command."));
  }
  if (spec?.signing?.requiredForPublicRelease !== true || spec?.notarization?.requiredForPublicRelease !== true) {
    gateFindings.push(issue("macos.trust-policy", "macOS public release must require Developer ID signing and notarization."));
  }
  if (spec?.notarization?.staplingRequired !== true) {
    gateFindings.push(issue("macos.stapling-policy", "macOS public release must require stapling."));
  }
  if (spec?.artifactPolicy?.commitArtifacts !== false) {
    gateFindings.push(issue("macos.artifact-policy", "macOS artifacts must not be committed."));
  }

  const ok = gateFindings.length === 0;
  const ready = false;
  return {
    ok,
    ready,
    publicationAllowed: false,
    platform: "macos",
    bundleTargets: requiredMacosTargets,
    status: "skipped",
    gateFindings,
    blockers,
    summary: {
      configuredTargets: requiredMacosTargets.filter((target) => tauriConfig?.bundle?.targets?.includes(target)).length,
      artifactEvidence: 0,
      signing: "skipped",
      notarization: "skipped",
      smoke: "skipped",
      macosVerified: false
    }
  };
}

export function assertMacosEvidenceSafe(evidence) {
  assertNoInlineSecrets(evidence);
  const text = JSON.stringify(evidence);
  if (localPathPattern.test(text)) {
    throw issue("macos.local-path", "macOS release evidence must use artifact names, not local paths.");
  }
  if (text.includes([".", "planning"].join("")) || text.includes(["reference", "docs"].join("/"))) {
    throw issue("macos.private-reference", "macOS release evidence must not include private planning references.");
  }
  return true;
}

function issue(code, message) {
  return { code, message: redactText(message) };
}
