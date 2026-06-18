import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("run page exposes repo local task runner lane evidence", () => {
  const app = [
    "src/workspaces/TrustRunSettingsTypes.ts",
    "src/workspaces/RepoLocalTaskRunnerLanePanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  for (const phrase of [
    "Repo-local task runner lane",
    "Repo-owned task manifests",
    "Approved fixed commands",
    "Dry-run and approval receipts",
    "Working directory scope",
    "Environment whitelist",
    "Artifact and cleanup receipts",
    "Task runner blocked reasons",
    "descriptor-only task review"
  ]) {
    assert.match(app, new RegExp(phrase));
  }
});

test("repo local task runner lane surface does not import command execution APIs", () => {
  const browserSurface = ["src/workspaces/RunWorkspace.tsx", "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx", "src/workspaces/TrustRunSettingsWorkspaces.tsx"]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(browserSurface, /node:child_process|child_process|node:fs|spawn\(|execFile\(|exec\(|python-adapter-runner|node-adapter-runner/u);
});
