import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("graph inspector overlay has working hide and show controls", () => {
  const graph = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  const css = readStyleSourceBundle();

  assert.match(graph, /const \[isInspectorOpen, setIsInspectorOpen\] = useState\(true\)/u);
  assert.match(graph, /const handleToggleInspector = \(\) =>/u);
  assert.match(graph, /aria-pressed=\{isInspectorOpen\}/u);
  assert.match(graph, /onClick=\{handleToggleInspector\}/u);
  assert.match(graph, /aria-label=\{isInspectorOpen \? "Hide graph inspector" : "Show graph inspector"\}/u);
  assert.match(graph, /aria-label="Close node inspector"/u);
  assert.match(graph, /onClick=\{\(\) => setIsInspectorOpen\(false\)\}/u);
  assert.match(graph, /\{isInspectorOpen \? \(/u);
  assert.match(graph, /setIsRunnerPanelExpanded\(false\)/u);
  assert.match(css, /\.graph-panel-header/u);
  assert.match(css, /\.graph-panel-icon-button/u);
});

test("graph runner controls can be minimized and expanded without removing runner actions", () => {
  const graph = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  const css = readStyleSourceBundle();

  assert.match(graph, /const \[isRunnerPanelExpanded, setIsRunnerPanelExpanded\] = useState\(false\)/u);
  assert.match(graph, /const handleExpandRunnerPanel = \(\) =>/u);
  assert.match(graph, /aria-label="Expand graph runner controls"/u);
  assert.match(graph, /aria-label="Minimize graph runner controls"/u);
  assert.match(graph, /aria-controls="graph-runner-controls"/u);
  assert.match(graph, /id="graph-runner-controls"/u);
  assert.match(graph, /onClick=\{handleExpandRunnerPanel\}/u);
  assert.match(graph, /setIsInspectorOpen\(false\)/u);
  assert.match(graph, /onClick=\{\(\) => setIsRunnerPanelExpanded\(false\)\}/u);
  assert.match(graph, /aria-label="Start reviewed run"/u);
  assert.match(graph, /aria-label="Cancel active run"/u);
  assert.match(graph, /Approve scoped grants/u);
  assert.match(graph, /aria-label="Graph runner logs and artifacts"/u);
  assert.match(css, /\.graph-runner-toggle/u);
  assert.match(css, /\.graph-runner-panel/u);
});

test("floating graph controls are excluded from canvas panning", () => {
  const graph = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");

  assert.match(graph, /closest\("\.graph-node-button"\)/u);
  assert.match(graph, /\.graph-runner-panel, \.graph-runner-toggle, \.node-inspector, \.graph-side-tools/u);
  assert.doesNotMatch(graph, /role="button"/u);
});

test("graph quick tools start below the canvas toolbar stack", () => {
  const css = readStyleSourceBundle();

  assert.match(css, /\.graph-side-tools\s*\{[\s\S]*?top: 188px/u);
});
