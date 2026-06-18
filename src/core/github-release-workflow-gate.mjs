import fs from "node:fs";
import { redactText } from "./secret-vault.mjs";

export const githubReleaseWorkflowSchemaVersion = "agentique.githubReleaseWorkflowGate.v1";
const forbiddenTextPattern = new RegExp(`(?:${"R"}\\d{4}|\\.${"plan"}${"ning"}|${"reference"}/${"docs"}|[A-Za-z]:[\\\\/])`, "u");

export function readGithubReleaseWorkflowInputs({
  specPath = "release/github-release-workflow.spec.json"
} = {}) {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  return {
    spec,
    workflowText: fs.readFileSync(spec.workflowPath, "utf8"),
    packageJson: JSON.parse(fs.readFileSync("package.json", "utf8"))
  };
}

export function validateGithubReleaseWorkflowGate({ spec, workflowText, packageJson } = readGithubReleaseWorkflowInputs()) {
  const findings = [];
  const blockers = [];

  if (spec?.schemaVersion !== githubReleaseWorkflowSchemaVersion) {
    findings.push(issue("workflow.schema", "GitHub release workflow spec schema version is unsupported."));
  }
  if (forbiddenTextPattern.test(workflowText)) {
    findings.push(issue("workflow.private-marker", "Workflow must not include private planning markers or local paths."));
  }
  if (!workflowText.includes("workflow_dispatch:")) {
    findings.push(issue("workflow.trigger", "Release workflow must be manually dispatched."));
  }
  if (workflowText.includes("pull_request_target:") || workflowText.includes("schedule:")) {
    findings.push(issue("workflow.unsafe-trigger", "Release workflow must not use unsafe automatic release triggers."));
  }
  for (const [permission, level] of Object.entries(spec?.permissions ?? {})) {
    if (!new RegExp(`${escapeRegExp(permission)}:\\s*${escapeRegExp(level)}`, "u").test(workflowText)) {
      findings.push(issue("workflow.permission-missing", `Workflow permission missing: ${permission}:${level}.`));
    }
  }
  for (const runner of spec?.requiredRunners ?? []) {
    if (!workflowText.includes(runner)) {
      findings.push(issue("workflow.runner-missing", `Workflow runner missing: ${runner}.`));
    }
  }
  for (const script of spec?.requiredBuildScripts ?? []) {
    if (!workflowText.includes(script) || !workflowText.includes("npm run ${{ matrix.build_script }}") || !packageJson?.scripts?.[script]) {
      findings.push(issue("workflow.build-script-missing", `Workflow build script missing: ${script}.`));
    }
  }

  const requiredPhrases = [
    "npm run validate",
    "npm sbom --json",
    "cargo metadata",
    "Get-FileHash",
    "actions/upload-artifact",
    "actions/download-artifact",
    "actions/attest-build-provenance",
    "gh release create",
    "--draft",
    "validate:release-${{ matrix.platform }}"
  ];
  for (const phrase of requiredPhrases) {
    if (!workflowText.includes(phrase)) {
      findings.push(issue("workflow.evidence-missing", `Workflow missing evidence step: ${phrase}.`));
    }
  }

  const actionRefs = [...workflowText.matchAll(/uses:\s*([^\s]+)/gu)].map((match) => match[1]);
  for (const ref of actionRefs) {
    const owner = ref.split("/")[0];
    if (!spec?.allowedActionOwners?.includes(owner)) {
      findings.push(issue("workflow.unreviewed-action", `Workflow action owner is not allowlisted: ${owner}.`));
    }
    if (!/@v\d+$/u.test(ref)) {
      findings.push(issue("workflow.action-version", `Workflow action must be major-version pinned or reviewed: ${ref}.`));
    }
  }

  if (workflowText.includes("gh release upload") && !workflowText.includes("--draft")) {
    blockers.push(issue("workflow.release-mode", "Workflow must remain draft-only."));
  }
  if (!String(packageJson?.scripts?.["validate:release-workflow"] ?? "").includes("validate-release-workflow.mjs")) {
    findings.push(issue("workflow.package-script", "package.json must expose release workflow validation."));
  }

  return {
    ok: findings.length === 0,
    ready: findings.length === 0 && blockers.length === 0,
    publicationAllowed: false,
    status: findings.length === 0 ? "configured" : "invalid",
    findings,
    blockers,
    summary: {
      actionRefs,
      runners: spec?.requiredRunners ?? [],
      buildScripts: spec?.requiredBuildScripts ?? [],
      evidence: spec?.requiredEvidence ?? []
    }
  };
}

function issue(code, message) {
  return { code, message: redactText(message) };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
