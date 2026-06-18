#!/usr/bin/env node
import fs from "node:fs";
import { reviewPlatformFormatAdapterGate } from "../src/core/platform-format-adapter.mjs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];
const moduleText = readText("src/core/platform-format-adapter.mjs");
const tests = readText("tests/platform-format-adapter.test.mjs");
const app = [readText("src/App.tsx"), readText("src/workspaces/routes/LibraryWorkspaceAndImportWorkspaceRoute.tsx")].join("\n");
const workspace = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map(readText).join("\n");
const css = readStyleSourceBundle();
const packageJson = JSON.parse(readText("package.json"));

requireIncludes(moduleText, [
  "agentique.platformAdapterIntake.v1",
  "parsePlatformWorkflow",
  "parseN8nWorkflowJson",
  "parseDifyDslYaml",
  "parseLangGraphManifest",
  "reviewPlatformFormatAdapterGate",
  "parseOnly",
  "noExecution",
  "platform.dangling-edge",
  "platform.cycle",
  "platform.executable-node"
], "platform adapter module");

requireIncludes(tests, [
  "platform adapter review accepts n8n Dify and LangGraph samples as parse-only data",
  "n8n workflow JSON preserves ids edges credentials and expressions without execution",
  "Dify DSL YAML preserves graph topology provider metadata and template expressions",
  "LangGraph manifest preserves graph names while redacting platform source references",
  "malformed invalid and ambiguous platform input fails closed",
  "dangling edges cycles and executable nodes are blocked",
  "oversized secrets traversal environment and container markers fail before preservation"
], "platform adapter tests");

requireIncludes(app, [
  "reviewPlatformFormatAdapterGate",
  "platformAdapterReview={platformAdapterReview}"
], "app platform adapter wiring");

requireIncludes(workspace, [
  "platformAdapterReview",
  "aria-label=\"Platform format adapter intake\"",
  "Adapter platforms",
  "Parse-only boundary"
], "import workspace platform adapter surface");

requireIncludes(css, [
  ".platform-adapter-panel",
  ".platform-adapter-grid"
], "platform adapter CSS");

const review = reviewPlatformFormatAdapterGate();
if (!review.ok) {
  failures.push("platform adapter review must pass");
}
if (review.boundary.noExecution !== true || review.boundary.noNetwork !== true || review.boundary.noPackageInstall !== true) {
  failures.push("platform adapter review must preserve no-execution/no-network/no-install boundary");
}
if (!String(packageJson.dependencies?.yaml ?? "").startsWith("2.")) {
  failures.push("package dependencies must include yaml 2.x");
}
if (!String(packageJson.scripts?.["validate:platform-format-adapter"] ?? "").includes("check-platform-format-adapter.mjs")) {
  failures.push("package scripts must define validate:platform-format-adapter");
}
if (!String(packageJson.scripts?.validate ?? "").includes("validate:platform-format-adapter")) {
  failures.push("validate script must include validate:platform-format-adapter");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/platform-format-adapter.mjs",
    "tests/platform-format-adapter.test.mjs",
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
