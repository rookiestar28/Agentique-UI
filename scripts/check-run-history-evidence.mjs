#!/usr/bin/env node
import fs from "node:fs";
import { reviewRunHistoryEvidenceGate } from "../src/core/run-history-evidence.mjs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];
const review = reviewRunHistoryEvidenceGate();
const moduleText = readText("src/core/run-history-evidence.mjs");
const tests = readText("tests/run-history-evidence.test.mjs");
const app = [readText("src/App.tsx"), readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx")].join("\n");
const runnerState = readText("src/app-state/useRunnerWorkspaceState.ts");
const run = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map(readText).join("\n");
const css = readStyleSourceBundle();
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message));
}

requireIncludes(moduleText, [
  "agentique.runHistoryEvidence.v1",
  "createRunHistoryEvidence",
  "reviewRunHistoryEvidenceGate",
  "cleanup-again",
  "run-history-success-rerun-001",
  "stale-incomplete-run",
  "browserWritesFiles: false",
  "nativeBacked: true",
  "descriptorOnly: false",
  "viewerMetadata"
], "run history evidence module");

requireIncludes(tests, [
  "run history exposes all required terminal and recovery states",
  "evidence browser renders logs outputs artifacts cleanup digest and timeline",
  "evidence browser is redacted and path-neutral",
  "cleanup action can be repeated idempotently",
  "rerun creates new run id and preserves prior evidence",
  "stale incomplete run recovery is visible with cleanup required"
], "run history evidence tests");

requireIncludes(app, [
  "handleRunHistoryAction",
  "runHistoryEvidence={runHistoryEvidence}"
], "app run history wiring");

requireIncludes(runnerState, [
  "createRunHistoryEvidence",
  "runHistoryEvidenceAction",
  "handleRunHistoryAction"
], "runner state run history wiring");

requireIncludes(run, [
  "aria-label=\"Run history records\"",
  "aria-label=\"Run evidence browser\"",
  "aria-label=\"Run evidence logs\"",
  "aria-label=\"Run evidence outputs\"",
  "aria-label=\"Run evidence artifacts\"",
  "aria-label=\"Run evidence timeline\"",
  "aria-label=\"Run cleanup and rerun actions\"",
  "native backed",
  "Cleanup again",
  "Rerun selected",
  "Recover stale run"
], "run workspace history UI");

requireIncludes(css, [
  ".run-history-panel",
  ".run-history-grid",
  ".run-history-list",
  ".run-evidence-browser",
  ".run-evidence-list",
  ".run-history-actions"
], "run history CSS");

if (!String(packageJson.scripts?.["validate:run-history-evidence"] ?? "").includes("check-run-history-evidence.mjs")) {
  failures.push("package scripts must define validate:run-history-evidence");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:run-history-evidence")) {
  failures.push("validate script must include validate:run-history-evidence");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/run-history-evidence.mjs",
    "tests/run-history-evidence.test.mjs",
    "src/App.tsx",
    "src/app-state/useRunnerWorkspaceState.ts",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx",
    "src/styles.css",
    "package.json"
  ],
  summary: review.checks
}, null, 2));

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}
