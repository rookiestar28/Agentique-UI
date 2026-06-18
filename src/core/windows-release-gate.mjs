import fs from "node:fs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const windowsReleaseSchemaVersion = "agentique.windowsReleaseGate.v1";
export const requiredWindowsTargets = Object.freeze(["nsis", "msi"]);
const localPathPattern = /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\)|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;

export const sampleWindowsBlockedEvidence = Object.freeze({
  schemaVersion: "agentique.windowsReleaseEvidence.v1",
  releaseVersion: "0.1.0",
  installerArtifacts: [],
  signing: { status: "missing" },
  smoke: { status: "missing", redactedLogs: true }
});

export const sampleWindowsReadyEvidence = Object.freeze({
  schemaVersion: "agentique.windowsReleaseEvidence.v1",
  releaseVersion: "0.1.0",
  installerArtifacts: [
    {
      target: "nsis",
      fileName: "Agentique_UI_0.1.0_x64-setup.exe",
      sha256: "a".repeat(64)
    },
    {
      target: "msi",
      fileName: "Agentique_UI_0.1.0_x64_en-US.msi",
      sha256: "b".repeat(64)
    }
  ],
  signing: {
    status: "verified",
    timestamped: true,
    signer: "Agentique release signer"
  },
  smoke: {
    status: "passed",
    install: true,
    launch: true,
    version: true,
    uninstall: true,
    cleanup: true,
    redactedLogs: true
  }
});

export function readWindowsReleaseInputs({
  specPath = "release/windows-installer.spec.json",
  tauriPath = "src-tauri/tauri.conf.json",
  packagePath = "package.json"
} = {}) {
  return {
    spec: JSON.parse(fs.readFileSync(specPath, "utf8")),
    tauriConfig: JSON.parse(fs.readFileSync(tauriPath, "utf8")),
    packageJson: JSON.parse(fs.readFileSync(packagePath, "utf8"))
  };
}

export function validateWindowsReleaseGate({ spec, tauriConfig, packageJson, evidence = sampleWindowsBlockedEvidence } = readWindowsReleaseInputs()) {
  const gateFindings = [];
  const blockers = [];

  try {
    assertReleaseEvidenceSafe(evidence);
  } catch (error) {
    gateFindings.push(issue(error.code ?? "windows.evidence-unsafe", error.message));
  }

  if (spec?.schemaVersion !== windowsReleaseSchemaVersion) {
    gateFindings.push(issue("windows.schema", "Windows release spec schema version is unsupported."));
  }
  if (spec?.platform !== "windows") {
    gateFindings.push(issue("windows.platform", "Windows release spec must target windows."));
  }
  for (const target of requiredWindowsTargets) {
    if (!Array.isArray(spec?.bundleTargets) || !spec.bundleTargets.includes(target)) {
      gateFindings.push(issue("windows.spec-target-missing", `Windows release spec missing ${target} target.`));
    }
    if (!Array.isArray(tauriConfig?.bundle?.targets) || !tauriConfig.bundle.targets.includes(target)) {
      gateFindings.push(issue("windows.tauri-target-missing", `Tauri bundle targets missing ${target}.`));
    }
  }
  if (spec?.buildCommand !== "npm run tauri:build:windows") {
    gateFindings.push(issue("windows.build-command", "Windows release spec must point at the public Windows build command."));
  }
  if (!String(packageJson?.scripts?.["tauri:build:windows"] ?? "").includes("--bundles nsis,msi")) {
    gateFindings.push(issue("windows.package-script", "package.json must expose a Windows NSIS/MSI build command."));
  }
  if (spec?.signing?.requiredForPublicRelease !== true || spec?.signing?.timestampRequired !== true) {
    gateFindings.push(issue("windows.signing-policy", "Windows public release must require signature and timestamp verification."));
  }
  if (spec?.artifactPolicy?.commitArtifacts !== false) {
    gateFindings.push(issue("windows.artifact-policy", "Windows installer artifacts must not be committed."));
  }
  if (!String(spec?.smartScreen?.caveat ?? "").includes("SmartScreen")) {
    gateFindings.push(issue("windows.smartscreen", "Windows release docs must preserve SmartScreen caveat."));
  }

  const artifacts = Array.isArray(evidence?.installerArtifacts) ? evidence.installerArtifacts : [];
  for (const target of requiredWindowsTargets) {
    const artifact = artifacts.find((candidate) => candidate?.target === target);
    if (!artifact) {
      blockers.push(issue("windows.artifact-missing", `${target} installer artifact evidence is missing.`));
      continue;
    }
    if (!safeArtifactName(artifact.fileName)) {
      blockers.push(issue("windows.artifact-name", `${target} artifact name is not path-neutral or has an unsupported extension.`));
    }
    if (!sha256Pattern.test(String(artifact.sha256 ?? ""))) {
      blockers.push(issue("windows.checksum", `${target} artifact must include a sha256 digest.`));
    }
  }

  if (evidence?.signing?.status !== "verified") {
    blockers.push(issue("windows.signature-missing", "Windows signature verification evidence is missing."));
  }
  if (evidence?.signing?.timestamped !== true) {
    blockers.push(issue("windows.timestamp-missing", "Windows trusted timestamp evidence is missing."));
  }

  for (const check of spec?.smoke?.requiredChecks ?? []) {
    if (evidence?.smoke?.[check] !== true) {
      blockers.push(issue("windows.smoke-missing", `Windows ${check} smoke evidence is missing.`));
    }
  }
  if (evidence?.smoke?.cleanup !== true) {
    blockers.push(issue("windows.cleanup-missing", "Windows smoke cleanup evidence is missing."));
  }
  if (evidence?.smoke?.redactedLogs !== true) {
    blockers.push(issue("windows.redaction-missing", "Windows smoke logs must be redacted before evidence is recorded."));
  }

  const ok = gateFindings.length === 0;
  const ready = ok && blockers.length === 0;
  return {
    ok,
    ready,
    publicationAllowed: ready,
    platform: "windows",
    bundleTargets: requiredWindowsTargets,
    status: ready ? "ready" : "blocked",
    gateFindings,
    blockers,
    summary: {
      configuredTargets: requiredWindowsTargets.filter((target) => tauriConfig?.bundle?.targets?.includes(target)).length,
      artifactEvidence: artifacts.length,
      signature: evidence?.signing?.status === "verified" ? "verified" : "blocked",
      smoke: evidence?.smoke?.status === "passed" ? "passed" : "blocked"
    }
  };
}

export function assertReleaseEvidenceSafe(evidence) {
  assertNoInlineSecrets(evidence);
  const text = JSON.stringify(evidence);
  if (localPathPattern.test(text)) {
    throw issue("windows.local-path", "Windows release evidence must use artifact names, not local paths.");
  }
  if (text.includes([".", "planning"].join("")) || text.includes(["reference", "docs"].join("/"))) {
    throw issue("windows.private-reference", "Windows release evidence must not include private planning references.");
  }
  return true;
}

function safeArtifactName(fileName) {
  const text = String(fileName ?? "");
  return /^[A-Za-z0-9._ -]+\.(exe|msi)$/u.test(text) && !localPathPattern.test(text);
}

function issue(code, message) {
  return { code, message: redactText(message) };
}
