import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("workspace shell exposes page switch and command bar", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const shell = fs.readFileSync("src/ui/WorkspaceShell.tsx", "utf8");
  const navigation = fs.readFileSync("src/ui/navigation.ts", "utf8");
  for (const label of ["command.ariaLabel", "active-workspace-page", "Import", "Verify", "Library", "Preview", "Graph", "Run", "Handoff"]) {
    assert.match(`${shell}\n${navigation}`, new RegExp(label));
  }
  assert.match(shell, /t\("command\.resetIntent"\)/u);
  assert.match(shell, /t\("command\.validateIntent"\)/u);
  assert.match(navigation, /pageMetadata/u);
  assert.match(app, /<WorkspaceShell/u);
  assert.doesNotMatch(app, /Resource lifecycle/u);
});

test("workspace shell removes non-functional bento status and lifecycle layouts", () => {
  const css = readStyleSourceBundle();
  const app = fs.readFileSync("src/App.tsx", "utf8");
  assert.match(css, /\.workspace-page/u);
  assert.match(css, /\.workspace-stack/u);
  assert.match(css, /\.workspace-section/u);
  assert.match(css, /@media \(max-width: 840px\)/u);
  assert.doesNotMatch(css, /\.page-panel/u);
  assert.doesNotMatch(css, /\.panel\b/u);
  assert.doesNotMatch(app, /status-strip/u);
  assert.doesNotMatch(app, /Local mode/u);
  assert.doesNotMatch(app, /Contracts verified/u);
  assert.doesNotMatch(css, /\.status-strip/u);
  assert.doesNotMatch(css, /\.lifecycle-rail/u);
  assert.doesNotMatch(css, /\.content-grid/u);
});
