import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("graph interaction hotfix validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-graph-interaction-hotfix.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.ok(result.checked.includes("src/workspaces/GraphWorkspace.tsx"));
});

test("graph workspace uses pointer and wheel interaction state", () => {
  const graph = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  assert.match(graph, /handleCanvasPointerDown/u);
  assert.match(graph, /handleNodePointerDown/u);
  assert.match(graph, /handleCanvasWheel/u);
  assert.match(graph, /setNodePositions/u);
  assert.match(graph, /setViewport/u);
  assert.match(graph, /data-graph-viewport="interactive"/u);
});

test("workspace CSS resets card-like page and command wrappers", () => {
  const css = readStyleSourceBundle();
  assert.match(css, /\.workspace-page\s*\{[\s\S]*?box-shadow: none/u);
  assert.match(css, /\.resource-command\s*\{[\s\S]*?background: transparent/u);
  assert.match(css, /\.proof-ledger div,\n\.detail-list div,\n\.session-ledger div/u);
  assert.match(css, /\.import-result-line,\n\.import-result-line\.ok,\n\.import-result-line\.error/u);
  assert.match(css, /\.preview-meta span,\n\.warning-list li,\n\.capability-summary span/u);
  assert.match(css, /\.graph-node-button\.risk-high,\n\.graph-node-button\.unsupported/u);
});
