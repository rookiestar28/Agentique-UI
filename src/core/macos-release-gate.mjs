import fs from "node:fs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const macosReleaseSchemaVersion = "agentique.macosReleaseGate.v1";
export const requiredMacosTargets = Object.freeze(["app", "dmg"]);
const localPathPattern = /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\|\/[A-Za-z0-9_.-])|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;

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
  const blockers = [];

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
  for (const target of requiredMacosTargets) {
    if (!Array.isArray(spec?.bundleTargets) || !spec.bundleTargets.includes(target)) {
      gateFindings.push(issue("macos.spec-target-missing", `macOS release spec missing ${target} target.`));
    }
    if (!Array.isArray(tauriConfig?.bundle?.targets) || !tauriConfig.bundle.targets.includes(target)) {
      gateFindings.push(issue("macos.tauri-target-missing", `Tauri bundle targets missing ${target}.`));
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

  const artifacts = Array.isArray(evidence?.artifacts) ? evidence.artifacts : [];
  for (const target of requiredMacosTargets) {
    const artifact = artifacts.find((candidate) => candidate?.target === target);
    if (!artifact) {
      blockers.push(issue("macos.artifact-missing", `${target} artifact evidence is missing.`));
      continue;
    }
    if (!safeArtifactName(artifact.fileName)) {
      blockers.push(issue("macos.artifact-name", `${target} artifact name is not path-neutral or has an unsupported extension.`));
    }
    if (!sha256Pattern.test(String(artifact.sha256 ?? ""))) {
      blockers.push(issue("macos.checksum", `${target} artifact must include a sha256 digest.`));
    }
  }

  if (evidence?.signing?.status !== "verified") {
    blockers.push(issue("macos.signature-missing", "macOS Developer ID signature evidence is missing."));
  }
  if (evidence?.signing?.identityKind !== "Developer ID Application") {
    blockers.push(issue("macos.identity-missing", "macOS Developer ID Application identity evidence is missing."));
  }
  if (evidence?.notarization?.status !== "accepted") {
    blockers.push(issue("macos.notarization-missing", "macOS notarization acceptance evidence is missing."));
  }
  if (evidence?.notarization?.stapled !== true) {
    blockers.push(issue("macos.stapling-missing", "macOS stapled ticket evidence is missing."));
  }

  for (const check of spec?.smoke?.requiredChecks ?? []) {
    if (evidence?.smoke?.[check] !== true) {
      blockers.push(issue("macos.smoke-missing", `macOS ${check} smoke evidence is missing.`));
    }
  }
  if (evidence?.smoke?.cleanup !== true) {
    blockers.push(issue("macos.cleanup-missing", "macOS smoke cleanup evidence is missing."));
  }
  if (evidence?.smoke?.redactedLogs !== true) {
    blockers.push(issue("macos.redaction-missing", "macOS smoke logs must be redacted before evidence is recorded."));
  }

  const ok = gateFindings.length === 0;
  const ready = ok && blockers.length === 0;
  return {
    ok,
    ready,
    publicationAllowed: ready,
    platform: "macos",
    bundleTargets: requiredMacosTargets,
    status: ready ? "ready" : "blocked",
    gateFindings,
    blockers,
    summary: {
      configuredTargets: requiredMacosTargets.filter((target) => tauriConfig?.bundle?.targets?.includes(target)).length,
      artifactEvidence: artifacts.length,
      signing: evidence?.signing?.status === "verified" ? "verified" : "blocked",
      notarization: evidence?.notarization?.status === "accepted" ? "accepted" : "blocked",
      smoke: evidence?.smoke?.status === "passed" ? "passed" : "blocked"
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

function safeArtifactName(fileName) {
  const text = String(fileName ?? "");
  return /^[A-Za-z0-9._ -]+\.(app|dmg)$/u.test(text) && !localPathPattern.test(text);
}

function issue(code, message) {
  return { code, message: redactText(message) };
}
