import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("app shell source contains required UI Lite regions", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const shell = fs.readFileSync("src/ui/WorkspaceShell.tsx", "utf8");
  const navigation = fs.readFileSync("src/ui/navigation.ts", "utf8");
  const previewHandoff = fs.readFileSync("src/workspaces/PreviewHandoffWorkspaces.tsx", "utf8");
  for (const label of ["Library", "Import", "Verify", "Preview", "Graph", "Run", "Handoff", "Settings"]) {
    assert.match(navigation, new RegExp(label));
  }
  assert.match(shell, /active-workspace-page/);
  assert.match(previewHandoff, /Not executed/);
  assert.match(app, /<WorkspaceShell/u);
});

test("tauri config has release bundle metadata and loopback-only dev server", () => {
  const config = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
  assert.equal(config.bundle.active, true);
  assert.equal(config.bundle.createUpdaterArtifacts, false);
  assert.equal(config.build.devUrl, "http://127.0.0.1:5173");
  assert.match(config.app.security.csp, /default-src 'self'/);
});

test("default Tauri capability grants no resource execution permission", () => {
  const capability = JSON.parse(fs.readFileSync("src-tauri/capabilities/default.json", "utf8"));
  assert.deepEqual(capability.permissions, []);
  assert.match(capability.description, /no resource execution/i);
});
