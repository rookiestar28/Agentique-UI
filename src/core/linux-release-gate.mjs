import fs from "node:fs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const linuxReleaseSchemaVersion = "agentique.linuxReleaseGate.v1";
export const requiredLinuxTargets = Object.freeze(["deb", "rpm", "appimage"]);
const localPathPattern = /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\|\/[A-Za-z0-9_.-])|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;

export const sampleLinuxBlockedEvidence = Object.freeze({
  schemaVersion: "agentique.linuxReleaseEvidence.v1",
  releaseVersion: "0.1.0",
  artifacts: [],
  packageMetadata: { status: "missing" },
  dependencyCheck: { status: "missing" },
  appImageCompatibility: { status: "missing" },
  smoke: { status: "missing", redactedLogs: true },
  updaterArtifact: { selected: "appimage", verified: false }
});

export const sampleLinuxReadyEvidence = Object.freeze({
  schemaVersion: "agentique.linuxReleaseEvidence.v1",
  releaseVersion: "0.1.0",
  artifacts: [
    {
      target: "deb",
      fileName: "agentique-ui_0.1.0_amd64.deb",
      sha256: "e".repeat(64)
    },
    {
      target: "rpm",
      fileName: "agentique-ui-0.1.0-1.x86_64.rpm",
      sha256: "f".repeat(64)
    },
    {
      target: "appimage",
      fileName: "agentique-ui_0.1.0_amd64.AppImage",
      sha256: "1".repeat(64)
    }
  ],
  packageMetadata: {
    status: "verified",
    name: true,
    version: true,
    architecture: true,
    dependencies: true,
    desktopEntry: true
  },
  dependencyCheck: {
    status: "verified",
    webkitgtk: true,
    glibc: true
  },
  appImageCompatibility: {
    status: "passed",
    webkitgtk: true,
    glibc: true,
    sandboxWarningReview: true
  },
  smoke: {
    status: "passed",
    launch: true,
    uninstall: true,
    cleanup: true,
    redactedLogs: true
  },
  updaterArtifact: {
    selected: "appimage",
    verified: true
  }
});

export function readLinuxReleaseInputs({
  specPath = "release/linux-packages.spec.json",
  tauriPath = "src-tauri/tauri.conf.json",
  packagePath = "package.json"
} = {}) {
  return {
    spec: JSON.parse(fs.readFileSync(specPath, "utf8")),
    tauriConfig: JSON.parse(fs.readFileSync(tauriPath, "utf8")),
    packageJson: JSON.parse(fs.readFileSync(packagePath, "utf8"))
  };
}

export function validateLinuxReleaseGate({ spec, tauriConfig, packageJson, evidence = sampleLinuxBlockedEvidence } = readLinuxReleaseInputs()) {
  const gateFindings = [];
  const blockers = [];

  try {
    assertLinuxEvidenceSafe(evidence);
  } catch (error) {
    gateFindings.push(issue(error.code ?? "linux.evidence-unsafe", error.message));
  }

  if (spec?.schemaVersion !== linuxReleaseSchemaVersion) {
    gateFindings.push(issue("linux.schema", "Linux release spec schema version is unsupported."));
  }
  if (spec?.platform !== "linux") {
    gateFindings.push(issue("linux.platform", "Linux release spec must target linux."));
  }
  for (const target of requiredLinuxTargets) {
    if (!Array.isArray(spec?.bundleTargets) || !spec.bundleTargets.includes(target)) {
      gateFindings.push(issue("linux.spec-target-missing", `Linux release spec missing ${target} target.`));
    }
    if (!Array.isArray(tauriConfig?.bundle?.targets) || !tauriConfig.bundle.targets.includes(target)) {
      gateFindings.push(issue("linux.tauri-target-missing", `Tauri bundle targets missing ${target}.`));
    }
  }
  if (spec?.buildCommand !== "npm run tauri:build:linux") {
    gateFindings.push(issue("linux.build-command", "Linux release spec must point at the public Linux build command."));
  }
  if (!String(packageJson?.scripts?.["tauri:build:linux"] ?? "").includes("--bundles deb,rpm,appimage")) {
    gateFindings.push(issue("linux.package-script", "package.json must expose a Linux deb/rpm/AppImage build command."));
  }
  if (spec?.updater?.firstSupportedArtifact !== "appimage") {
    gateFindings.push(issue("linux.updater-policy", "Linux updater artifact selection must start with AppImage until other paths are proven."));
  }
  if (spec?.artifactPolicy?.commitArtifacts !== false) {
    gateFindings.push(issue("linux.artifact-policy", "Linux artifacts must not be committed."));
  }
  if (spec?.baseline?.requiresWebKitGtk !== true || spec?.baseline?.requiresGlibcCompatibility !== true) {
    gateFindings.push(issue("linux.baseline", "Linux baseline must require WebKitGTK and GLib compatibility review."));
  }

  const artifacts = Array.isArray(evidence?.artifacts) ? evidence.artifacts : [];
  for (const target of requiredLinuxTargets) {
    const artifact = artifacts.find((candidate) => candidate?.target === target);
    if (!artifact) {
      blockers.push(issue("linux.artifact-missing", `${target} artifact evidence is missing.`));
      continue;
    }
    if (!safeArtifactName(artifact.fileName)) {
      blockers.push(issue("linux.artifact-name", `${target} artifact name is not path-neutral or has an unsupported extension.`));
    }
    if (!sha256Pattern.test(String(artifact.sha256 ?? ""))) {
      blockers.push(issue("linux.checksum", `${target} artifact must include a sha256 digest.`));
    }
  }

  for (const check of spec?.packageMetadata?.requiredChecks ?? []) {
    const key = check === "desktop-entry" ? "desktopEntry" : check;
    if (evidence?.packageMetadata?.[key] !== true) {
      blockers.push(issue("linux.metadata-missing", `Linux package metadata check missing: ${check}.`));
    }
  }
  if (evidence?.dependencyCheck?.webkitgtk !== true) {
    blockers.push(issue("linux.webkitgtk-missing", "Linux WebKitGTK dependency evidence is missing."));
  }
  if (evidence?.dependencyCheck?.glibc !== true) {
    blockers.push(issue("linux.glibc-missing", "Linux GLib compatibility evidence is missing."));
  }
  if (evidence?.appImageCompatibility?.status !== "passed") {
    blockers.push(issue("linux.appimage-smoke-missing", "Linux AppImage compatibility smoke evidence is missing."));
  }
  for (const check of spec?.compatibilitySmoke?.requiredChecks ?? []) {
    const key = check === "sandbox-warning-review" ? "sandboxWarningReview" : check;
    const source = ["webkitgtk", "glibc", "sandboxWarningReview"].includes(key) ? evidence?.appImageCompatibility : evidence?.smoke;
    if (source?.[key] !== true) {
      blockers.push(issue("linux.smoke-missing", `Linux ${check} smoke evidence is missing.`));
    }
  }
  if (evidence?.smoke?.cleanup !== true) {
    blockers.push(issue("linux.cleanup-missing", "Linux smoke cleanup evidence is missing."));
  }
  if (evidence?.smoke?.redactedLogs !== true) {
    blockers.push(issue("linux.redaction-missing", "Linux smoke logs must be redacted before evidence is recorded."));
  }
  if (evidence?.updaterArtifact?.selected !== "appimage" || evidence?.updaterArtifact?.verified !== true) {
    blockers.push(issue("linux.updater-artifact-missing", "Linux AppImage updater artifact selection is not verified."));
  }

  const ok = gateFindings.length === 0;
  const ready = ok && blockers.length === 0;
  return {
    ok,
    ready,
    publicationAllowed: ready,
    platform: "linux",
    bundleTargets: requiredLinuxTargets,
    status: ready ? "ready" : "blocked",
    gateFindings,
    blockers,
    summary: {
      configuredTargets: requiredLinuxTargets.filter((target) => tauriConfig?.bundle?.targets?.includes(target)).length,
      artifactEvidence: artifacts.length,
      packageMetadata: evidence?.packageMetadata?.status === "verified" ? "verified" : "blocked",
      compatibility: evidence?.appImageCompatibility?.status === "passed" ? "passed" : "blocked",
      updaterArtifact: evidence?.updaterArtifact?.verified === true ? "appimage" : "blocked"
    }
  };
}

export function assertLinuxEvidenceSafe(evidence) {
  assertNoInlineSecrets(evidence);
  const text = JSON.stringify(evidence);
  if (localPathPattern.test(text)) {
    throw issue("linux.local-path", "Linux release evidence must use artifact names, not local paths.");
  }
  if (text.includes([".", "planning"].join("")) || text.includes(["reference", "docs"].join("/"))) {
    throw issue("linux.private-reference", "Linux release evidence must not include private planning references.");
  }
  return true;
}

function safeArtifactName(fileName) {
  const text = String(fileName ?? "");
  return /^[A-Za-z0-9._ -]+\.(deb|rpm|AppImage)$/u.test(text) && !localPathPattern.test(text);
}

function issue(code, message) {
  return { code, message: redactText(message) };
}
