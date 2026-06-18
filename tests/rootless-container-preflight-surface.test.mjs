import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("run page exposes rootless container preflight evidence", () => {
  const app = [
    "src/workspaces/TrustRunSettingsTypes.ts",
    "src/workspaces/RootlessContainerPreflightGatePanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  for (const phrase of [
    "Rootless container preflight gate",
    "Preflight status",
    "Execution decision",
    "Runtime mode",
    "Rootless evidence",
    "Platform limitations",
    "Image trust",
    "Filesystem boundary",
    "Network policy",
    "Resource limits",
    "Cleanup receipts",
    "Permission preflight",
    "No-start receipt",
    "No-pull receipt",
    "No-build receipt",
    "Blocked unsafe container samples"
  ]) {
    assert.match(app, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  }
});

test("rootless container preflight surface stays review-only without runtime effects", () => {
  const browserSurface = [
    "src/workspaces/RootlessContainerPreflightGatePanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(
    browserSurface,
    /node:child_process|child_process|node:fs|writeFile|appendFile|createWriteStream|spawn\(|execFile\(|exec\(|fetch\(|WebSocket\(|invoke\(|Command\.create|new\s+Command|\b(?:docker|podman)\s+(?:run|pull|build|compose|start|create|exec)|docker-compose|compose\.ya?ml|containerd|nerdctl|npm install|postinstall|preinstall/u
  );
});
