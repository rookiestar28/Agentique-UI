#!/usr/bin/env node
import fs from "node:fs";
import { reviewPlatformIrNormalizerGate } from "../src/core/platform-ir-normalizer.mjs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];
const moduleText = readText("src/core/platform-ir-normalizer.mjs");
const tests = readText("tests/platform-ir-normalizer.test.mjs");
const app = [readText("src/App.tsx"), readText("src/workspaces/routes/LibraryWorkspaceAndImportWorkspaceRoute.tsx")].join("\n");
const workspace = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map(readText).join("\n");
const css = readStyleSourceBundle();
const packageJson = JSON.parse(readText("package.json"));

requireIncludes(moduleText, [
  "agentique.platformIrNormalization.v1",
  "agentique.workflowImportLossReport.v1",
  "normalizePlatformIntakeToWorkflowIr",
  "reviewPlatformIrNormalizerGate",
  "validateWorkflowIr",
  "preserved",
  "normalized",
  "degraded",
  "blocked",
  "handoff-only"
], "platform IR normalizer module");

requireIncludes(tests, [
  "first-class platform fixtures produce canonical workflow IR and loss reports",
  "loss report distinguishes preserved normalized degraded blocked and handoff-only states",
  "n8n normalization preserves source mapping while keeping expressions out of executable fields",
  "Dify and LangGraph platform-only semantics remain handoff-only",
  "blocked adapter output does not produce workflow IR",
  "normalization output is deterministic and path neutral"
], "platform IR normalizer tests");

requireIncludes(app, [
  "reviewPlatformIrNormalizerGate",
  "platformIrReview={platformIrReview}"
], "app platform IR normalizer wiring");

requireIncludes(workspace, [
  "platformIrReview",
  "aria-label=\"Canonical workflow IR loss report\"",
  "Canonical IR",
  "Loss states"
], "import workspace platform IR surface");

requireIncludes(css, [
  ".platform-ir-panel",
  ".platform-ir-grid"
], "platform IR CSS");

const review = reviewPlatformIrNormalizerGate();
if (!review.ok) {
  failures.push("platform IR normalizer review must pass");
}
for (const status of ["preserved", "semanticNormalized", "degraded", "handoffOnly"]) {
  if (!Number.isInteger(review.summary[status]) || review.summary[status] < 1) {
    failures.push(`platform IR normalizer review must include ${status} semantics`);
  }
}
if (!String(packageJson.scripts?.["validate:platform-ir-normalizer"] ?? "").includes("check-platform-ir-normalizer.mjs")) {
  failures.push("package scripts must define validate:platform-ir-normalizer");
}
if (!String(packageJson.scripts?.validate ?? "").includes("validate:platform-ir-normalizer")) {
  failures.push("validate script must include validate:platform-ir-normalizer");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/platform-ir-normalizer.mjs",
    "tests/platform-ir-normalizer.test.mjs",
    "src/App.tsx",
    "src/workspaces/LibraryImportWorkspaces.tsx",
    "src/styles.css",
    "package.json"
  ]
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
