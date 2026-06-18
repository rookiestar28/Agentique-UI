#!/usr/bin/env node
import fs from "node:fs";
import { reviewSecondaryWorkflowFormatCompatibilityGate } from "../src/core/secondary-workflow-format-compatibility.mjs";

const failures = [];
const review = reviewSecondaryWorkflowFormatCompatibilityGate();
const moduleText = readText("src/core/secondary-workflow-format-compatibility.mjs");
const tests = readText("tests/secondary-workflow-format-compatibility.test.mjs");
const docs = readText("docs/compatibility/secondary-workflow-formats.md");
const adapter = readText("src/core/platform-format-adapter.mjs");
const importer = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map(readText).join("\n");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message));
}

requireIncludes(moduleText, [
  "agentique.secondaryWorkflowFormatCompatibility.v1",
  "createSecondaryWorkflowFormatCompatibilityBacklog",
  "reviewSecondaryWorkflowFormatCompatibilityGate",
  "assertSecondaryWorkflowFormatCompatibilitySafe",
  "backlog-reference-only",
  "no-go-for-early-support",
  "adapter tests",
  "loss report mapping",
  "capability classification",
  "public-safe fixtures",
  "UI exposure review"
], "secondary format compatibility module");

requireIncludes(tests, [
  "secondary workflow format backlog covers every candidate with decision rows",
  "secondary formats remain backlog reference only with no UI support claims",
  "promotion evidence remains closed until adapter tests loss reports capability mapping and fixtures exist",
  "platform adapter and import workspace do not expose secondary formats as supported imports",
  "secondary workflow format compatibility safety rejects secrets paths commands internal markers and support claims",
  "secondary workflow format compatibility review gate passes"
], "secondary format compatibility tests");

requireIncludes(docs, [
  "Secondary Workflow Format Compatibility Backlog",
  "Backlog/reference only",
  "Node-RED",
  "Serverless Workflow",
  "Argo Workflows",
  "Flowise",
  "Langflow",
  "GitHub Actions",
  "Airflow",
  "BPMN",
  "Haystack",
  "Kestra",
  "AutoGen",
  "LlamaIndex Workflows",
  "CrewAI",
  "adapter tests",
  "loss report mapping",
  "capability classification",
  "public-safe fixtures",
  "UI exposure review"
], "secondary format compatibility docs");

if (!/supportedPlatforms = new Set\(\["n8n", "dify", "langgraph"\]\)/u.test(adapter)) {
  failures.push("platform-format-adapter must expose only n8n Dify LangGraph as supported platforms");
}

for (const label of ["Node-RED", "Serverless Workflow", "Argo Workflows", "Flowise", "Langflow", "GitHub Actions", "Airflow", "BPMN", "Haystack", "Kestra", "AutoGen", "LlamaIndex", "CrewAI"]) {
  if (adapter.includes(label)) {
    failures.push(`platform-format-adapter must not expose secondary format as supported: ${label}`);
  }
  if (importer.includes(label)) {
    failures.push(`Import workspace must not expose secondary format as supported: ${label}`);
  }
}

if (!String(packageJson.scripts?.["validate:secondary-format-compatibility"] ?? "").includes("check-secondary-format-compatibility.mjs")) {
  failures.push("package scripts must define validate:secondary-format-compatibility");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:secondary-format-compatibility")) {
  failures.push("validate script must include validate:secondary-format-compatibility");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/secondary-workflow-format-compatibility.mjs",
    "tests/secondary-workflow-format-compatibility.test.mjs",
    "docs/compatibility/secondary-workflow-formats.md",
    "src/core/platform-format-adapter.mjs",
    "src/workspaces/LibraryImportWorkspaces.tsx",
    "package.json"
  ],
  summary: review.summary
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
