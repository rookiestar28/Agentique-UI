#!/usr/bin/env node
import fs from "node:fs";
import { createRepoLocalTaskRunnerLane, repoLocalTaskRunnerLaneSchemaVersion, reviewRepoLocalTaskRunnerLane } from "../src/core/repo-local-task-runner-lane.mjs";

const failures = [];
const review = createRepoLocalTaskRunnerLane();
const validation = reviewRepoLocalTaskRunnerLane();
const moduleText = readText("src/core/repo-local-task-runner-lane.mjs");
const tests = readText("tests/repo-local-task-runner-lane.test.mjs");
const surfaceTests = readText("tests/repo-local-task-runner-surface.test.mjs");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const runWorkspace = readText("src/workspaces/RunWorkspace.tsx");
const panel = readText("src/workspaces/RepoLocalTaskRunnerLanePanel.tsx");
const stageReporting = readText("src/core/validation-stage-reporting.mjs");
const packageJson = JSON.parse(readText("package.json"));

if (!validation.ok) {
  failures.push(...validation.errors.map((error) => error.message));
}

requireIncludes(
  moduleText,
  [
    "agentique.repoLocalTaskRunnerLane.v1",
    "createRepoLocalTaskRunnerLane",
    "reviewRepoLocalTaskRunnerLane",
    "arbitrary-shell",
    "package-install",
    "generated-adapter-hook",
    "downloaded-workflow",
    "approval-receipt.json",
    "forwardedAmbient"
  ],
  "repo local task runner lane module"
);

if (/node:child_process|child_process|node:fs|spawn\(|execFile\(|exec\(/u.test(moduleText)) {
  failures.push("repo local task runner lane module must stay browser safe and not import command execution APIs");
}

requireIncludes(
  tests,
  ["accepts only repo-owned fixed task manifests", "dry-run approval scope env artifact cleanup and audit evidence", "blocks unsafe samples before launch"],
  "repo local task runner lane tests"
);
requireIncludes(surfaceTests, ["Repo-local task runner lane", "descriptor-only task review"], "repo local task runner lane surface tests");
requireIncludes(route, ["createRepoLocalTaskRunnerLane", "repoLocalTaskRunnerLane={repoLocalTaskRunnerLane}"], "graph/run route");
requireIncludes(runWorkspace, ["RepoLocalTaskRunnerLanePanel", "repoLocalTaskRunnerLane={repoLocalTaskRunnerLane}"], "run workspace mount");
requireIncludes(
  panel,
  [
    "Repo-local task runner lane",
    "Repo-owned task manifests",
    "Approved fixed commands",
    "Dry-run and approval receipts",
    "Working directory scope",
    "Environment whitelist",
    "Artifact and cleanup receipts",
    "Task runner blocked reasons",
    "descriptor-only task review"
  ],
  "repo local task runner lane panel"
);
requireIncludes(stageReporting, ["validate:repo-local-task-runner-lane"], "validation stage reporting");

if (!String(packageJson.scripts?.["validate:repo-local-task-runner-lane"] ?? "").includes("check-repo-local-task-runner-lane.mjs")) {
  failures.push("package scripts must define validate:repo-local-task-runner-lane");
}
if (!String(packageJson.scripts?.validate ?? "").includes("validate:repo-local-task-runner-lane")) {
  failures.push("full validate script must include validate:repo-local-task-runner-lane");
}

if (review.schemaVersion !== repoLocalTaskRunnerLaneSchemaVersion || review.tasks.length !== 2 || validation.checks.blockedBeforeLaunch !== 16) {
  failures.push("review must expose two accepted repo-owned tasks and sixteen blocked samples");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      schemaVersion: repoLocalTaskRunnerLaneSchemaVersion,
      summary: validation.checks,
      blockedCases: review.blockedSamples.length,
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
