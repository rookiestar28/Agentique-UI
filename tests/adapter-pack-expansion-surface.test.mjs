import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("run page exposes python node adapter pack expansion evidence", () => {
  const app = [
    "src/workspaces/TrustRunSettingsWorkspaces.tsx",
    "src/workspaces/TrustRunSettingsTypes.ts",
    "src/workspaces/PythonNodeAdapterPackExpansionPanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  for (const phrase of [
    "Python and Node adapter pack expansion",
    "Fixed allowlisted adapter packs",
    "Host prerequisite receipts",
    "Permission ceiling",
    "Watchdog and native event receipts",
    "Artifact and cleanup receipts",
    "Package lifecycle denial",
    "Adapter pack blocked reasons",
    "descriptor-only pack review"
  ]) {
    assert.match(app, new RegExp(phrase));
  }
});

test("adapter pack expansion surface does not import node-only runner modules", () => {
  const browserSurface = ["src/workspaces/RunWorkspace.tsx", "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx", "src/workspaces/TrustRunSettingsWorkspaces.tsx"]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(browserSurface, /node:child_process|node:fs|python-adapter-runner|node-adapter-runner/u);
});
