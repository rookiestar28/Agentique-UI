import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("run page exposes external agent client pack review evidence", () => {
  const app = [
    "src/workspaces/TrustRunSettingsTypes.ts",
    "src/workspaces/ExternalAgentClientPackExpansionPanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  for (const phrase of [
    "External agent-client packs",
    "Static review-only output",
    "Canonical provenance",
    "Compatibility warnings",
    "Drift status",
    "Destination action",
    "Cleanup and rollback",
    "Blocked install samples",
    "descriptor-only client pack review"
  ]) {
    assert.match(app, new RegExp(phrase));
  }
});

test("external agent client pack surface does not import runtime or filesystem effects", () => {
  const browserSurface = [
    "src/workspaces/ExternalAgentClientPackExpansionPanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(
    browserSurface,
    /node:child_process|child_process|node:fs|writeFile|appendFile|createWriteStream|spawn\(|execFile\(|exec\(|fetch\(|WebSocket\(|invoke\(|npm install|postinstall|preinstall/u
  );
});
