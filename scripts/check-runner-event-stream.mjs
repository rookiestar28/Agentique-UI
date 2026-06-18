#!/usr/bin/env node
import fs from "node:fs";
import { reviewRunnerEventStreamGate } from "../src/core/runner-event-stream.mjs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];
const review = reviewRunnerEventStreamGate();
const moduleText = readText("src/core/runner-event-stream.mjs");
const tests = readText("tests/runner-event-stream.test.mjs");
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
  "agentique.runnerEventStream.v1",
  "createRunnerEventStream",
  "reviewRunnerEventStreamGate",
  "adapterEventsFor",
  "dependencyChainsFor",
  "boundedLogPreview",
  "stable",
  "liveTransport: false"
], "runner event stream module");

requireIncludes(tests, [
  "runner event stream exposes ordered stable event ids",
  "active sample shows running progress and terminal consistency",
  "retry failure and skipped dependency chains are visible per node",
  "canceled runs include canceled node event and cleanup event",
  "adapter lane event timeline is descriptor-only and ordered",
  "bounded logs are redacted and path neutral"
], "runner event stream tests");

requireIncludes(app, [
  "runnerEventStream",
  "runnerEventStream={runnerEventStream}"
], "app runner event stream wiring");

requireIncludes(runnerState, [
  "createRunnerEventStream",
  "runnerEventStream"
], "runner state event stream wiring");

requireIncludes(graph, [
  "runnerEventStream",
  "aria-label=\"Graph runner compact timeline\"",
  "runnerEventStream.schedulerEvents"
], "graph runner event stream UI");

requireIncludes(run, [
  "runnerEventStream",
  "aria-label=\"Run streaming timeline\"",
  "aria-label=\"Run per-node execution evidence\"",
  "aria-label=\"Run dependency chain evidence\"",
  "aria-label=\"Run bounded redacted log preview\"",
  "aria-label=\"Adapter lane event timeline\"",
  "aria-label=\"Run cleanup stream evidence\""
], "run runner event stream UI");

requireIncludes(css, [
  ".runner-timeline-strip",
  ".runner-event-timeline",
  ".runner-event-list",
  ".runner-node-timeline",
  ".runner-dependency-chain",
  ".runner-log-preview"
], "runner event stream CSS");

requireIncludes(evidence, [
  "per-node streaming timeline",
  "bounded redacted log preview",
  "dependency-chain evidence"
], "runner evidence doc");

if (!String(packageJson.scripts?.["validate:runner-event-stream"] ?? "").includes("check-runner-event-stream.mjs")) {
  failures.push("package scripts must define validate:runner-event-stream");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:runner-event-stream")) {
  failures.push("validate script must include validate:runner-event-stream");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/runner-event-stream.mjs",
    "tests/runner-event-stream.test.mjs",
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
