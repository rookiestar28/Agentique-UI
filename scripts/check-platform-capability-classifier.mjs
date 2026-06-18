#!/usr/bin/env node
import fs from "node:fs";
import { reviewPlatformCapabilityClassifierGate } from "../src/core/platform-capability-classifier.mjs";

const failures = [];
const moduleText = readText("src/core/platform-capability-classifier.mjs");
const normalizer = readText("src/core/platform-ir-normalizer.mjs");
const runPlan = readText("src/core/graph-run-plan.mjs");
const tests = readText("tests/platform-capability-classifier.test.mjs");
const graph = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map(readText).join("\n");
const run = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map(readText).join("\n");
const imports = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map(readText).join("\n");
const app = [
  readText("src/App.tsx"),
  readText("src/workspaces/routes/LibraryWorkspaceAndImportWorkspaceRoute.tsx"),
  readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx")
].join("\n");
const packageJson = JSON.parse(readText("package.json"));

requireIncludes(moduleText, [
  "agentique.platformCapabilityMatrix.v1",
  "classifyPlatformIntakeCapabilities",
  "reviewPlatformCapabilityClassifierGate",
  "credentialed-operation",
  "shell-process",
  "package-manager",
  "browser-data",
  "ambient-environment",
  "downloaded-workflow",
  "unknown-provider",
  "external-effect",
  "grantsRuntimeCompatibility: false"
], "platform capability classifier module");

requireIncludes(normalizer, [
  "classifyPlatformIntakeCapabilities",
  "capabilityMatrix",
  "agentique.platformNodeCapability.v1"
], "platform IR normalizer capability wiring");

requireIncludes(runPlan, [
  "sourcePlatform",
  "sourceFamily",
  "executionLane",
  "handoffDescriptor",
  "primaryClassification"
], "graph run-plan capability evidence");

requireIncludes(tests, [
  "every imported node receives exactly one primary classification",
  "unsafe platform node families cannot become local executable",
  "credentialed networked provider and external-effect nodes require permission or handoff",
  "capability metadata flows into canonical IR and graph run-plan evidence"
], "platform capability classifier tests");

requireIncludes(graph, [
  "platformCapabilityReview",
  "aria-label=\"Platform capability classification matrix\""
], "graph capability review surface");

requireIncludes(run, [
  "platformCapabilityReview",
  "aria-label=\"Run platform capability classifications\""
], "run capability review surface");

requireIncludes(imports, [
  "platformCapabilityReview",
  "aria-label=\"Platform capability classification review\""
], "import capability review surface");

requireIncludes(app, [
  "reviewPlatformCapabilityClassifierGate",
  "platformCapabilityReview={platformCapabilityReview}"
], "app capability review wiring");

const review = reviewPlatformCapabilityClassifierGate();
if (!review.ok) {
  failures.push("platform capability classifier review must pass");
}
if (review.summary.sourceFamilies < 20) {
  failures.push("platform capability classifier review must cover required source families");
}
if (!String(packageJson.scripts?.["validate:platform-capability-classifier"] ?? "").includes("check-platform-capability-classifier.mjs")) {
  failures.push("package scripts must define validate:platform-capability-classifier");
}
if (!String(packageJson.scripts?.validate ?? "").includes("validate:platform-capability-classifier")) {
  failures.push("validate script must include validate:platform-capability-classifier");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/platform-capability-classifier.mjs",
    "src/core/platform-ir-normalizer.mjs",
    "src/core/graph-run-plan.mjs",
    "tests/platform-capability-classifier.test.mjs",
    "src/workspaces/GraphWorkspace.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx",
    "src/workspaces/LibraryImportWorkspaces.tsx",
    "src/App.tsx",
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
