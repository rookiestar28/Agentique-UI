#!/usr/bin/env node
import fs from "node:fs";
import {
  humanApprovalResumeRerunUxSchemaVersion,
  requiredHumanApprovalResumeRerunScenarios,
  reviewHumanApprovalResumeRerunUx
} from "../src/core/human-approval-resume-rerun-ux.mjs";

const failures = [];
const review = reviewHumanApprovalResumeRerunUx();
const moduleText = readText("src/core/human-approval-resume-rerun-ux.mjs");
const tests = readText("tests/human-approval-resume-rerun-ux.test.mjs");
const hook = readText("src/app-state/useRunnerWorkspaceState.ts");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const runWorkspace = readText("src/workspaces/RunWorkspace.tsx");
const panel = readText("src/workspaces/HumanApprovalResumeRerunPanel.tsx");
const stageReporting = readText("src/core/validation-stage-reporting.mjs");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message ?? error.code));
}

requireIncludes(
  moduleText,
  [
    "agentique.humanApprovalResumeRerunUx.v1",
    "requiredHumanApprovalResumeRerunScenarios",
    "createHumanApprovalResumeRerunUxSurface",
    "reviewHumanApprovalResumeRerunUx",
    "validateHumanApprovalResumeRerunUxSurface",
    "staleApprovalReuseDenied",
    "forcedCleanupBlocksRetry",
    "noCapabilityWidening",
    "browserWritesFiles: false",
    "externalRuntimeStarted: false"
  ],
  "human approval resume rerun module"
);

requireIncludes(
  tests,
  [
    "human approval resume rerun UX review gate passes",
    "scenario catalog covers approval resume rerun cancel and cleanup states",
    "denied approval and resume mismatch cannot run paused node",
    "stale approval reuse is blocked before start with audit receipts",
    "rerun retry cancel and cleanup transitions map to ledger or run-folder receipts",
    "surface validation rejects unsafe receipt references and authority widening",
    "Run workspace exposes interactive approval resume rerun panel wiring"
  ],
  "human approval resume rerun tests"
);

requireIncludes(hook, ["createHumanApprovalResumeRerunUxSurface", "humanApprovalResumeRerunSurface", "handleHumanApprovalResumeRerunScenario"], "runner state hook");
requireIncludes(types, ["HumanApprovalResumeRerunScenario", "humanApprovalResumeRerunSurface", "onHumanApprovalResumeRerunScenario"], "run workspace types");
requireIncludes(route, ["humanApprovalResumeRerunSurface", "handleHumanApprovalResumeRerunScenario"], "graph/run route");
requireIncludes(runWorkspace, ["HumanApprovalResumeRerunPanel", "humanApprovalResumeRerunSurface"], "run workspace mount");
requireIncludes(
  panel,
  [
    "Human approval resume rerun UX",
    "Approval resume rerun controls",
    "Approval resume rerun receipt ledger",
    "onHumanApprovalResumeRerunScenario(scenario.id as HumanApprovalResumeRerunScenario)"
  ],
  "human approval resume rerun panel"
);
requireIncludes(stageReporting, ["validate:human-approval-resume-rerun-ux"], "validation stage reporting");

if (!String(packageJson.scripts?.["validate:human-approval-resume-rerun-ux"] ?? "").includes("check-human-approval-resume-rerun-ux.mjs")) {
  failures.push("package scripts must define validate:human-approval-resume-rerun-ux");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:human-approval-resume-rerun-ux")) {
  failures.push("full validate script must include validate:human-approval-resume-rerun-ux");
}

for (const scenario of requiredHumanApprovalResumeRerunScenarios) {
  if (!review.surfaces.some((surface) => surface.scenario === scenario)) {
    failures.push(`review surface missing scenario: ${scenario}`);
  }
}

if (
  !review.checks.scenarioCoverage ||
  !review.checks.deniedApprovalBlocksResume ||
  !review.checks.staleApprovalReuseDenied ||
  !review.checks.rerunRetryCancelLedgerMapped ||
  !review.checks.forcedCleanupBlocksRetry ||
  !review.checks.receiptIdempotency ||
  !review.checks.noCapabilityWidening ||
  !review.checks.publicSafe
) {
  failures.push(
    "review gate must prove coverage, denied resume blocking, stale approval denial, receipt mapping, cleanup retry blocking, idempotency, no authority widening, and public safety"
  );
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      schemaVersion: humanApprovalResumeRerunUxSchemaVersion,
      scenarios: requiredHumanApprovalResumeRerunScenarios.length,
      summary: review.summary,
      failures: []
    },
    null,
    2
  )
);

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
