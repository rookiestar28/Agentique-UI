#!/usr/bin/env node
import fs from "node:fs";
import { logsArtifactWorkbenchSchemaVersion, requiredWorkbenchFilters, reviewLogsArtifactWorkbench } from "../src/core/logs-artifact-workbench.mjs";

const failures = [];
const review = reviewLogsArtifactWorkbench();
const moduleText = readText("src/core/logs-artifact-workbench.mjs");
const tests = readText("tests/logs-artifact-workbench.test.mjs");
const hook = readText("src/app-state/useRunnerWorkspaceState.ts");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const workspace = readText("src/workspaces/RunWorkspace.tsx");
const panel = readText("src/workspaces/LogsArtifactWorkbenchPanel.tsx");
const stageReporting = readText("src/core/validation-stage-reporting.mjs");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message ?? error.code));
}

requireIncludes(
  moduleText,
  [
    "agentique.logsArtifactWorkbench.v1",
    "createLogsArtifactWorkbenchSurface",
    "reviewLogsArtifactWorkbench",
    "validateLogsArtifactWorkbenchSurface",
    "bounded and redacted",
    "metadata-only",
    "unsafe-content",
    "raw-log-export",
    "signed-url",
    "storePluginEnabled: false",
    "sqlPluginEnabled: false",
    "fileSystemPluginEnabled: false",
    "rawArtifactBytes: false"
  ],
  "logs artifact workbench module"
);

requireIncludes(
  tests,
  [
    "logs artifact workbench validation gate passes",
    "workbench exposes bounded redacted logs and identity descriptors",
    "artifact filters cover receipt cleanup retention mime viewer and stale states",
    "preview policy blocks unsafe content and keeps risky families metadata only",
    "export review redacts sensitive and path material",
    "workbench preserves authority boundary without storage or filesystem widening",
    "run workspace renders logs artifact workbench with accessible filters"
  ],
  "logs artifact workbench tests"
);

requireIncludes(hook, ["createLogsArtifactWorkbenchSurface", "logsArtifactWorkbenchSurface", "handleLogsArtifactFilter"], "runner workspace state hook");
requireIncludes(route, ["logsArtifactWorkbenchSurface", "handleLogsArtifactFilter"], "graph/run workspace route");
requireIncludes(types, ["logsArtifactWorkbenchSurface", "onLogsArtifactFilter", "LogsArtifactFilter"], "run workspace prop types");
requireIncludes(workspace, ["LogsArtifactWorkbenchPanel", "logsArtifactWorkbenchSurface", "onLogsArtifactFilter"], "run workspace workbench mount");
requireIncludes(
  panel,
  ["Logs and artifact workbench", "Logs artifact filter actions", "logsArtifactWorkbenchSurface.filters.map", "onLogsArtifactFilter(filter.id as LogsArtifactFilter)"],
  "logs artifact workbench panel"
);
requireIncludes(stageReporting, ["validate:logs-artifact-workbench"], "validation stage reporting");

if (!String(packageJson.scripts?.["validate:logs-artifact-workbench"] ?? "").includes("check-logs-artifact-workbench.mjs")) {
  failures.push("package scripts must define validate:logs-artifact-workbench");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:logs-artifact-workbench")) {
  failures.push("full validate script must include validate:logs-artifact-workbench");
}

if (!review.checks.baseValid || !review.checks.exportDenial || !review.checks.riskyMetadataOnly || !review.checks.noCapabilityWidening || !review.checks.publicSafe) {
  failures.push("logs artifact workbench gate must prove bounded logs, filters, preview/export redaction, public safety, and no capability widening");
}

if (review.surface.summary.filters !== requiredWorkbenchFilters.length) {
  failures.push("logs artifact workbench must expose every required filter");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      schemaVersion: logsArtifactWorkbenchSchemaVersion,
      summary: review.surface.summary,
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
