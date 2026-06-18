#!/usr/bin/env node
import fs from "node:fs";
import { reviewCuratedAdapterExecutionLane } from "../src/core/curated-adapter-execution-lane.mjs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];
const review = reviewCuratedAdapterExecutionLane();
const moduleText = readText("src/core/curated-adapter-execution-lane.mjs");
const tests = readText("tests/curated-adapter-execution-lane.test.mjs");
const app = [readText("src/App.tsx"), readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx")].join("\n");
const runnerState = readText("src/app-state/useRunnerWorkspaceState.ts");
const run = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map(readText).join("\n");
const css = readStyleSourceBundle();
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message));
}

requireIncludes(moduleText, [
  "agentique.curatedAdapterExecutionLane.v1",
  "reviewCuratedAdapterExecutionLane",
  "blocked-before-launch",
  "unsafe-package-policy",
  "timed-out-cleaned",
  "canceled-cleaned",
  "React bundle must not import Node-only adapter runner modules"
], "curated adapter lane module");

if (/from\s+["'][^"']*(?:python|node)-adapter-runner|import\s*\([^)]*(?:python|node)-adapter-runner|node:child_process|node:fs/u.test(moduleText)) {
  failures.push("curated adapter lane module must stay browser safe and not import Node-only runners");
}

requireIncludes(tests, [
  "curated adapter lane exposes signed allowlisted Python and Node samples",
  "curated adapter lane blocks unsafe samples before launch",
  "curated adapter lane environment forwarding stays adapter-scoped",
  "curated adapter lane exposes timeout and cancellation cleanup receipts",
  "curated adapter lane review passes and remains browser safe"
], "curated adapter lane tests");

requireIncludes(app, [
  "curatedAdapterRuntime",
  "handleSelectCuratedAdapterLane",
  "curatedAdapterLane={curatedAdapterLane}"
], "app curated adapter lane wiring");

requireIncludes(runnerState, [
  "createCuratedAdapterExecutionLane",
  "curatedAdapterRuntime",
  "handleSelectCuratedAdapterLane"
], "runner state curated adapter lane wiring");

requireIncludes(run, [
  "aria-label=\"Curated adapter execution lane\"",
  "Run Python sample",
  "Run Node sample",
  "Blocked pack sample",
  "aria-label=\"Curated adapter lane evidence\"",
  "aria-label=\"Curated adapter blocked samples\"",
  "aria-label=\"Curated adapter cleanup receipts\"",
  "aria-label=\"Curated adapter environment evidence\""
], "run workspace curated adapter lane UI");

requireIncludes(css, [
  ".curated-adapter-lane-panel",
  ".curated-adapter-lane-grid",
  ".curated-adapter-evidence-list",
  ".curated-adapter-block-list"
], "curated adapter lane CSS");

if (!String(packageJson.scripts?.["validate:curated-adapter-lane"] ?? "").includes("check-curated-adapter-lane.mjs")) {
  failures.push("package scripts must define validate:curated-adapter-lane");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:curated-adapter-lane")) {
  failures.push("validate script must include validate:curated-adapter-lane");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/curated-adapter-execution-lane.mjs",
    "tests/curated-adapter-execution-lane.test.mjs",
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
