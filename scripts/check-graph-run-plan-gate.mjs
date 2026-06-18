#!/usr/bin/env node
import fs from "node:fs";
import { reviewGraphRunPlanGate } from "../src/core/graph-run-plan.mjs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];
const moduleText = readText("src/core/graph-run-plan.mjs");
const tests = readText("tests/graph-run-plan.test.mjs");
const app = [readText("src/App.tsx"), readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx")].join("\n");
const runnerState = readText("src/app-state/useRunnerWorkspaceState.ts");
const graph = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map(readText).join("\n");
const run = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map(readText).join("\n");
const css = readStyleSourceBundle();
const packageJson = JSON.parse(readText("package.json"));

requireIncludes(moduleText, [
  "agentique.graphRunPlan.v1",
  "createGraphRunPlan",
  "reviewGraphRunPlanGate",
  "permission-required",
  "handoff-only",
  "graph-run-plan.dependency-blocked",
  "Workflow graph contains a cycle",
  "Workflow edge references an unknown node"
], "graph run-plan module");

requireIncludes(tests, [
  "valid sample graph produces deterministic accepted run plan",
  "unsupported and high-risk nodes fail closed with visible reasons",
  "credentialed supported nodes require scoped permission review",
  "dangling edges cycles and malformed input fail closed",
  "blocked upstream nodes propagate dependency blockers",
  "run-plan output is path-neutral and secret-free",
  "graph run-plan gate review proves accepted and blocked cases"
], "graph run-plan tests");

requireIncludes(app, [
  "const activeWorkflowIr = sampleSchedulableWorkflowIr",
  "const blockedWorkflowIr = sampleWorkflowIr",
  "graphRunPlan={graphRunPlan}",
  "blockedGraphRunPlan={blockedGraphRunPlan}"
], "app run-plan wiring");

requireIncludes(runnerState, [
  "createGraphRunPlan(activeWorkflowIr",
  "createGraphRunPlan(blockedWorkflowIr",
  "workflowIr: activeWorkflowIr"
], "runner state run-plan wiring");

requireIncludes(graph, [
  "graphRunPlan",
  "aria-label=\"Graph run plan gate\"",
  "aria-label=\"Graph run plan node classifications\"",
  "graphRunPlan.nodePlans"
], "graph run-plan surface");

requireIncludes(run, [
  "graphRunPlan",
  "aria-label=\"Run plan gate summary\"",
  "aria-label=\"Run plan classification counts\""
], "run workspace run-plan surface");

requireIncludes(css, [
  ".run-plan-gate",
  ".run-plan-node-list",
  ".run-plan-counts"
], "run-plan CSS");

const review = reviewGraphRunPlanGate();
if (!review.ok) {
  failures.push("graph run-plan gate review must pass");
}

if (!String(packageJson.scripts?.["validate:graph-run-plan"] ?? "").includes("check-graph-run-plan-gate.mjs")) {
  failures.push("package scripts must define validate:graph-run-plan");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:graph-run-plan")) {
  failures.push("validate script must include validate:graph-run-plan");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/graph-run-plan.mjs",
    "tests/graph-run-plan.test.mjs",
    "src/App.tsx",
    "src/app-state/useRunnerWorkspaceState.ts",
    "src/workspaces/GraphWorkspace.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx",
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
