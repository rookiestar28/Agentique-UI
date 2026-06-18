import fs from "node:fs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const releaseSmokeSchemaVersion = "agentique.releaseSmokeGate.v1";
export const requiredSmokePlatforms = Object.freeze(["windows", "macos", "linux"]);
const localPathPattern = /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\|\/[A-Za-z0-9_.-])|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u;

export const sampleSmokeBlockedEvidence = Object.freeze({
  schemaVersion: "agentique.releaseSmokeEvidence.v1",
  releaseVersion: "0.1.0",
  platforms: {
    windows: {},
    macos: {},
    linux: {}
  }
});

export const sampleSmokeReadyEvidence = Object.freeze({
  schemaVersion: "agentique.releaseSmokeEvidence.v1",
  releaseVersion: "0.1.0",
  platforms: Object.fromEntries(requiredSmokePlatforms.map((platform) => [platform, {
    artifact: true,
    signature: true,
    install: true,
    launch: true,
    version: true,
    update: true,
    uninstall: true,
    cleanup: true,
    redactedLogs: true,
    logSummary: `${platform} redacted smoke log`
  }]))
});

export function readReleaseSmokeInputs({
  specPath = "release/smoke-plan.spec.json",
  packagePath = "package.json"
} = {}) {
  return {
    spec: JSON.parse(fs.readFileSync(specPath, "utf8")),
    packageJson: JSON.parse(fs.readFileSync(packagePath, "utf8")),
    scripts: Object.fromEntries([
      ["windows", "scripts/release-smoke-windows.ps1"],
      ["macos", "scripts/release-smoke-macos.sh"],
      ["linux", "scripts/release-smoke-linux.sh"]
    ].map(([platform, scriptPath]) => [platform, fs.readFileSync(scriptPath, "utf8")]))
  };
}

export function validateReleaseSmokeGate({ spec, packageJson, scripts, evidence = sampleSmokeBlockedEvidence } = readReleaseSmokeInputs()) {
  const gateFindings = [];
  const blockers = [];

  try {
    assertSmokeEvidenceSafe(evidence);
  } catch (error) {
    gateFindings.push(issue(error.code ?? "smoke.evidence-unsafe", error.message));
  }

  if (spec?.schemaVersion !== releaseSmokeSchemaVersion) {
    gateFindings.push(issue("smoke.schema", "Release smoke spec schema version is unsupported."));
  }
  if (!String(packageJson?.scripts?.["validate:release-smoke"] ?? "").includes("validate-release-smoke.mjs")) {
    gateFindings.push(issue("smoke.package-script", "package.json must expose release smoke validation."));
  }
  for (const platform of requiredSmokePlatforms) {
    const platformSpec = spec?.platforms?.[platform];
    if (!platformSpec?.script || !scripts?.[platform]) {
      gateFindings.push(issue("smoke.script-missing", `${platform} smoke script is missing.`));
      continue;
    }
    const scriptText = scripts[platform];
    for (const phrase of ["artifact", "version", "update", "uninstall", "cleanup"]) {
      if (!scriptText.toLowerCase().includes(phrase)) {
        gateFindings.push(issue("smoke.script-check-missing", `${platform} smoke script missing ${phrase} check.`));
      }
    }
    if (platform === "windows" && !scriptText.includes("Get-AuthenticodeSignature")) {
      gateFindings.push(issue("smoke.signature-check-missing", "Windows smoke script must verify Authenticode signature."));
    }
    if (platform === "macos" && (!scriptText.includes("codesign --verify") || !scriptText.includes("spctl --assess"))) {
      gateFindings.push(issue("smoke.signature-check-missing", "macOS smoke script must verify codesign and Gatekeeper assessment."));
    }
    if (platform === "linux" && !scriptText.includes("*.AppImage")) {
      gateFindings.push(issue("smoke.appimage-check-missing", "Linux smoke script must handle AppImage artifacts."));
    }
  }
  for (const [condition, required] of Object.entries(spec?.failClosed ?? {})) {
    if (required !== true) {
      gateFindings.push(issue("smoke.fail-closed", `Smoke fail-closed condition is not enabled: ${condition}.`));
    }
  }

  for (const platform of requiredSmokePlatforms) {
    const platformEvidence = evidence?.platforms?.[platform] ?? {};
    for (const check of spec?.requiredChecks ?? []) {
      const key = check === "redacted-logs" ? "redactedLogs" : check;
      if (platformEvidence[key] !== true) {
        blockers.push(issue("smoke.evidence-missing", `${platform} smoke evidence missing: ${check}.`));
      }
    }
  }

  const ok = gateFindings.length === 0;
  const ready = ok && blockers.length === 0;
  return {
    ok,
    ready,
    publicationAllowed: ready,
    status: ready ? "ready" : "blocked",
    gateFindings,
    blockers,
    summary: {
      platforms: requiredSmokePlatforms.length,
      scripts: Object.keys(scripts ?? {}).length,
      requiredChecks: spec?.requiredChecks?.length ?? 0
    }
  };
}

export function assertSmokeEvidenceSafe(evidence) {
  assertNoInlineSecrets(evidence);
  const text = JSON.stringify(evidence);
  if (localPathPattern.test(text)) {
    throw issue("smoke.local-path", "Release smoke evidence must not include local paths.");
  }
  if (text.includes([".", "planning"].join("")) || text.includes(["reference", "docs"].join("/"))) {
    throw issue("smoke.private-reference", "Release smoke evidence must not include private planning references.");
  }
  return true;
}

function issue(code, message) {
  return { code, message: redactText(message) };
}
