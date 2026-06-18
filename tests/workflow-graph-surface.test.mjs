import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("workflow graph surface exposes IR validation details", () => {
  const graph = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  for (const phrase of [
    "workspace.graph.caption",
    "workspace.graph.title",
    "workspace.graph.canvasControls",
    "workspace.graph.validationSummary",
    "workspace.graph.subtitle",
    "workspace.graph.capabilityMatrix",
    "Executable",
    "Permission required",
    "Blocked",
    "Handoff only",
    "workspace.graph.canvasLabel",
    "Zoom in",
    "Zoom out",
    "Fit graph",
    "Node inspector",
    "Validation risk and credential overlays",
    "Workflow editor state summary",
    "Workflow diff summary",
    "Raw external workflow mutation blocked",
    "Unsupported nodes fail closed",
    "guarded local execution can be reviewed"
  ]) {
    assert.match(graph, new RegExp(phrase));
  }
  assert.doesNotMatch(graph, /no workflow execution/iu);
  assert.match(graph, /useState\(nodes\[1\]\?\.id/u);
  assert.match(graph, /setSelectedNodeId\(node\.id\)/u);
  assert.match(graph, /handleCanvasPointerDown/u);
  assert.match(graph, /handleNodePointerDown/u);
  assert.match(graph, /handleCanvasWheel/u);
  assert.match(graph, /<svg/u);
  assert.match(graph, /<line/u);
  assert.match(graph, /<text/u);
});

test("workflow graph CSS provides bounded canvas layout", () => {
  const css = readStyleSourceBundle();
  assert.match(css, /\.workflow-canvas/u);
  assert.match(css, /\.graph-edge-layer/u);
  assert.match(css, /\.graph-node-button/u);
  assert.match(css, /\.graph-toolbar/u);
  assert.match(css, /\.graph-capability-matrix/u);
  assert.match(css, /\.graph-capability-row/u);
  assert.match(css, /\.node-inspector/u);
  assert.match(css, /\.editor-state/u);
  assert.doesNotMatch(css, /\.workflow-map/u);
  assert.doesNotMatch(css, /\.workflow-node/u);
});
