import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("run page exposes mcp bridge readiness descriptor evidence", () => {
  const app = [
    "src/workspaces/TrustRunSettingsTypes.ts",
    "src/workspaces/McpBridgeReadinessPanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  for (const phrase of [
    "MCP bridge readiness",
    "Server trust states",
    "Tool listings",
    "Resource listings",
    "Prompt listings",
    "Vault references",
    "User action gates",
    "Audit receipts",
    "Blocked MCP samples",
    "descriptor-only MCP review"
  ]) {
    assert.match(app, new RegExp(phrase));
  }
});

test("mcp bridge readiness surface does not import runtime network or token effects", () => {
  const browserSurface = [
    "src/workspaces/McpBridgeReadinessPanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(
    browserSurface,
    /node:child_process|child_process|node:fs|writeFile|appendFile|createWriteStream|spawn\(|execFile\(|exec\(|fetch\(|WebSocket\(|invoke\(|Authorization:|Bearer |access_token|refresh_token|client_secret|npm install|postinstall|preinstall/u
  );
});
