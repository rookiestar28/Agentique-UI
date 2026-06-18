import fs from "node:fs";
import { readGithubReleaseWorkflowInputs, validateGithubReleaseWorkflowGate } from "./github-release-workflow-gate.mjs";
import { readLinuxReleaseInputs, validateLinuxReleaseGate } from "./linux-release-gate.mjs";
import { readMacosReleaseInputs, validateMacosReleaseGate } from "./macos-release-gate.mjs";
import { readReleaseDocsInputs, validateReleaseDocsGate } from "./release-docs-gate.mjs";
import { readReleaseMetadata, validateReleaseMetadata } from "./release-metadata.mjs";
import { readReleaseSmokeInputs, validateReleaseSmokeGate } from "./release-smoke-gate.mjs";
import { readUpdaterReleaseInputs, validateUpdaterReleaseGate } from "./updater-release-gate.mjs";
import { readWindowsReleaseInputs, validateWindowsReleaseGate } from "./windows-release-gate.mjs";
import { redactText } from "./secret-vault.mjs";

export const finalReleaseSchemaVersion = "agentique.finalReleaseGate.v1";

export function readFinalReleaseInputs({
  specPath = "release/final-readiness.spec.json",
  packagePath = "package.json"
} = {}) {
  return {
    spec: JSON.parse(fs.readFileSync(specPath, "utf8")),
    packageJson: JSON.parse(fs.readFileSync(packagePath, "utf8"))
  };
}

export function validateFinalReleaseGate(inputs = readFinalReleaseInputs()) {
  const findings = [];
  if (inputs.spec?.schemaVersion !== finalReleaseSchemaVersion) {
    findings.push(issue("final.schema", "Final release spec schema version is unsupported."));
  }
  if (!String(inputs.packageJson?.scripts?.["validate:release-final"] ?? "").includes("validate-release-final.mjs")) {
    findings.push(issue("final.package-script", "package.json must expose final release validation."));
  }

  const gates = buildGateResults();
  const gateNames = gates.map((gate) => gate.name);
  const requiredGates = Array.isArray(inputs.spec?.requiredGates) ? inputs.spec.requiredGates : [];
  const missingRequiredGates = requiredGates.filter((gate) => !gateNames.includes(gate));
  const unexpectedGates = gateNames.filter((gate) => !requiredGates.includes(gate));
  for (const gate of missingRequiredGates) {
    findings.push(issue("final.required-gate-missing", `Final release gate is missing required gate: ${gate}.`));
  }
  for (const gate of unexpectedGates) {
    findings.push(issue("final.unexpected-gate", `Final release gate has an unexpected gate: ${gate}.`));
  }
  if (inputs.spec?.decisionPolicy?.goRequiresEveryGateReady !== true || inputs.spec?.decisionPolicy?.noGoWhenAnyGateBlocked !== true) {
    findings.push(issue("final.decision-policy", "Final release decision policy must require every gate to be ready and no-go when any gate is blocked."));
  }
  if (inputs.spec?.decisionPolicy?.requirePublicSafeWorkflowRunIdForGo !== true) {
    findings.push(issue("final.workflow-run-id-policy", "Final release policy must require a public-safe workflow run id before go."));
  }
  for (const [claim, value] of Object.entries(inputs.spec?.publicationClaims ?? {})) {
    if (value !== false) {
      findings.push(issue("final.publication-claim", `Unsupported publication claim must remain false: ${claim}.`));
    }
  }

  const blockers = [];
  for (const gate of gates) {
    if (!gate.ok) {
      blockers.push(issue("final.gate-invalid", `${gate.name} gate is invalid.`));
    }
    if (!gate.ready) {
      blockers.push(issue("final.gate-blocked", `${gate.name} gate is not ready.`));
    }
  }

  const ok = findings.length === 0 && gates.every((gate) => gate.ok);
  const ready = ok && blockers.length === 0;
  return {
    ok,
    ready,
    publicationAllowed: ready,
    decision: ready ? "go" : "no-go",
    status: ready ? "ready" : "blocked",
    findings,
    blockers,
    gates,
    summary: {
      totalGates: gates.length,
      readyGates: gates.filter((gate) => gate.ready).length,
      blockedGates: gates.filter((gate) => !gate.ready).length,
      requiredGates,
      missingRequiredGates,
      unexpectedGates,
      supplyChainEvidence: gates.find((gate) => gate.name === "workflow")?.evidence ?? []
    }
  };
}

function buildGateResults() {
  const releaseMetadata = validateReleaseMetadata(readReleaseMetadata());
  const windows = validateWindowsReleaseGate(readWindowsReleaseInputs());
  const macos = validateMacosReleaseGate(readMacosReleaseInputs());
  const linux = validateLinuxReleaseGate(readLinuxReleaseInputs());
  const updater = validateUpdaterReleaseGate(readUpdaterReleaseInputs());
  const workflow = validateGithubReleaseWorkflowGate(readGithubReleaseWorkflowInputs());
  const smoke = validateReleaseSmokeGate(readReleaseSmokeInputs());
  const docs = validateReleaseDocsGate(readReleaseDocsInputs());

  return [
    normalizeGate("release-metadata", releaseMetadata, releaseMetadata.ok),
    normalizeGate("windows", windows, windows.ready),
    normalizeGate("macos", macos, macos.ready),
    normalizeGate("linux", linux, linux.ready),
    normalizeGate("updater", updater, updater.ready),
    normalizeGate("workflow", workflow, workflow.ready),
    normalizeGate("smoke", smoke, smoke.ready),
    normalizeGate("docs", docs, docs.ready)
  ];
}

function normalizeGate(name, result, ready) {
  return {
    name,
    ok: result.ok === true,
    ready: ready === true,
    status: result.status ?? (ready ? "ready" : "blocked"),
    blockers: result.blockers?.length ?? 0,
    findings: result.findings?.length ?? result.gateFindings?.length ?? 0,
    evidence: result.summary?.evidence ?? []
  };
}

function issue(code, message) {
  return { code, message: redactText(message) };
}
