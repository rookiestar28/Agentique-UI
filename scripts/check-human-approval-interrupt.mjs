#!/usr/bin/env node
import fs from "node:fs";
import { reviewHumanApprovalInterruptGate } from "../src/core/human-approval-interrupt.mjs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];
const review = reviewHumanApprovalInterruptGate();
const moduleText = readText("src/core/human-approval-interrupt.mjs");
const tests = readText("tests/human-approval-interrupt.test.mjs");
const app = [readText("src/App.tsx"), readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx")].join("\n");
const runnerState = readText("src/app-state/useRunnerWorkspaceState.ts");
const graph = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map(readText).join("\n");
const run = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map(readText).join("\n");
const css = readStyleSourceBundle();
const evidence = readText("docs/validation/runner-ui-execution-evidence.md");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message));
}

requireIncludes(moduleText, [
  "agentique.humanApprovalInterrupt.v1",
  "createHumanApprovalInterrupt",
  "reviewHumanApprovalInterruptGate",
  "approval.resume-mismatch",
  "externalRuntimeStarted: false",
  "browserWritesFiles: false"
], "human approval interrupt module");

requireIncludes(tests, [
  "sample graph pauses at approval checkpoint",
  "approval resumes only with matching run checkpoint and interrupt ids",
  "rejection reaches terminal canceled state without running paused node",
  "edited input is redacted validated and recorded",
  "handoff decision remains descriptor only",
  "approval interrupt output is path neutral and secret free"
], "human approval interrupt tests");

requireIncludes(app, [
  "humanApprovalInterrupt",
  "handleHumanApprovalAction",
  "humanApprovalInterrupt={humanApprovalInterrupt}"
], "app approval wiring");

requireIncludes(runnerState, [
  "createHumanApprovalInterrupt",
  "humanApprovalAction",
  "handleHumanApprovalAction"
], "runner state approval wiring");

requireIncludes(graph, [
  "humanApprovalInterrupt",
  "aria-label=\"Graph approval checkpoint evidence\""
], "graph approval UI");

requireIncludes(run, [
  "humanApprovalInterrupt",
  "aria-label=\"Human approval checkpoint\"",
  "aria-label=\"Approval interrupt controls\"",
  "aria-label=\"Approval resume gate\"",
  "aria-label=\"Approval checkpoint timeline\"",
  "aria-label=\"Approval edited input evidence\"",
  "Approve checkpoint",
  "Reject checkpoint",
  "Edit input sample",
  "Handoff decision",
  "Mismatch resume sample"
], "run approval UI");

requireIncludes(css, [
  ".approval-checkpoint-panel",
  ".approval-checkpoint-grid",
  ".approval-action-list",
  ".approval-timeline-list"
], "approval CSS");

requireIncludes(evidence, [
  "human approval checkpoint",
  "resume requires matching run id, checkpoint id, and pending interrupt id",
  "descriptor-only handoff"
], "runner evidence doc");

if (!String(packageJson.scripts?.["validate:human-approval-interrupt"] ?? "").includes("check-human-approval-interrupt.mjs")) {
  failures.push("package scripts must define validate:human-approval-interrupt");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:human-approval-interrupt")) {
  failures.push("validate script must include validate:human-approval-interrupt");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/human-approval-interrupt.mjs",
    "tests/human-approval-interrupt.test.mjs",
    "src/App.tsx",
    "src/app-state/useRunnerWorkspaceState.ts",
    "src/workspaces/GraphWorkspace.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx",
    "src/styles.css",
    "docs/validation/runner-ui-execution-evidence.md",
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
