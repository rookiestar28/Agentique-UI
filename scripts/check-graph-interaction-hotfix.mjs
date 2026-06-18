#!/usr/bin/env node
import fs from "node:fs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];

const graph = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map(readText).join("\n");
const css = readStyleSourceBundle();
const packageJson = JSON.parse(readText("package.json"));

requireIncludes(graph, [
  "type GraphViewport",
  "type GraphDragState",
  "nodePositions",
  "dragState",
  "handleCanvasPointerDown",
  "handleNodePointerDown",
  "handlePointerMove",
  "handlePointerEnd",
  "handleCanvasWheel",
  "setPointerCapture",
  "closest(\".graph-node-button\")",
  "setNodePositions",
  "setViewport",
  "onPointerDown={handleCanvasPointerDown}",
  "onWheel={handleCanvasWheel}",
  "data-graph-viewport=\"interactive\"",
  "onPointerDown={(event) => handleNodePointerDown(event, node.id)}",
  "data-node-id={node.id}",
  "clamp("
], "Graph workspace interaction model");

requireIncludes(css, [
  ".graph-viewport",
  "transform: translate(var(--graph-pan-x), var(--graph-pan-y)) scale(var(--graph-scale))",
  "touch-action: none",
  "cursor: grab",
  "overflow: hidden",
  ".workflow-canvas:active",
  ".graph-node-button:active"
], "Graph canvas CSS");

requireLatestRule(".workspace-page", [
  "border: 0",
  "border-radius: 0",
  "background: transparent",
  "box-shadow: none",
  "padding: 0"
]);

requireLatestRule(".resource-command", [
  "border: 0",
  "border-bottom: 1px solid var(--agent-border)",
  "border-radius: 0",
  "background: transparent",
  "box-shadow: none"
]);

requireIncludes(css, [
  ".proof-ledger div,\n.detail-list div,\n.session-ledger div,\n.trust-summary div,\n.check-list li",
  ".import-result-line,\n.import-result-line.ok,\n.import-result-line.error,\n.dry-run-check.fail",
  ".file-tree,\n.descriptor-grid,\n.safe-preview-note,\n.diff-list,\n.fail-closed",
  ".preview-meta span,\n.warning-list li,\n.capability-summary span,\n.decision-pill",
  ".detail-header span,\n.digest-code",
  ".graph-node-button.risk-high,\n.graph-node-button.unsupported",
  "border-bottom: 1px solid var(--agent-border)",
  "min-height: auto"
], "App-wide de-card CSS");

requireIncludes(graph, [
  "<details className=\"graph-evidence-disclosure\">",
  "<summary>",
  "className=\"graph-evidence-summary\"",
  "className=\"graph-evidence-body\"",
  "className=\"graph-evidence-section\"",
  "className=\"graph-evidence-row\"",
  "className=\"graph-evidence-list\"",
  "className=\"graph-evidence-status\"",
  "aria-label=\"Graph run plan gate\"",
  "aria-label=\"Graph approval checkpoint evidence\"",
  "aria-label=\"Graph permission preflight review\"",
  "aria-label=\"Graph external handoff descriptors\""
], "Graph collapsed evidence disclosure contract");

requireIncludes(css, [
  ".graph-evidence-disclosure",
  ".graph-evidence-disclosure > summary",
  ".graph-evidence-disclosure[open] > summary::after",
  ".graph-evidence-row,\n.graph-evidence-list li"
], "Graph evidence disclosure CSS contract");

for (const forbidden of [
  "Static workflow graph nodes and edges",
  ".workflow-map",
  ".workflow-node"
]) {
  if (graph.includes(forbidden) || css.includes(forbidden)) {
    failures.push(`forbidden static graph/card marker returned: ${forbidden}`);
  }
}

for (const className of [
  "run-plan-gate",
  "approval-checkpoint-grid",
  "permission-preflight-strip",
  "permission-grant-list",
  "run-plan-node-list",
  "run-plan-node",
  "blocked-run-plan-strip",
  "external-handoff-grid",
  "runner-node-result-list",
  "runner-cleanup-receipt",
  "platform-capability-strip",
  "editor-state",
  "diff-list",
  "fail-closed"
]) {
  if (classNamePattern(className).test(graph)) {
    failures.push(`Graph workspace evidence must not return to card/bento class: ${className}`);
  }
}

for (const selector of [
  ".graph-workspace .editor-state",
  ".graph-workspace .diff-list",
  ".graph-workspace .fail-closed"
]) {
  if (css.includes(selector)) {
    failures.push(`Graph CSS must not retain old card wall layout hook: ${selector}`);
  }
}

if (!String(packageJson.scripts?.["validate:graph-interaction-hotfix"] ?? "").includes("check-graph-interaction-hotfix.mjs")) {
  failures.push("package scripts must define validate:graph-interaction-hotfix");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:graph-interaction-hotfix")) {
  failures.push("validate script must include validate:graph-interaction-hotfix");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/workspaces/GraphWorkspace.tsx",
    "src/styles.css",
    "package.json"
  ]
}, null, 2));

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}

function requireLatestRule(selector, requiredDeclarations) {
  const rule = latestRule(selector);
  if (!rule) {
    failures.push(`CSS missing rule for ${selector}`);
    return;
  }
  for (const declaration of requiredDeclarations) {
    if (!rule.includes(declaration)) {
      failures.push(`${selector} latest rule missing declaration: ${declaration}`);
    }
  }
}

function latestRule(selector) {
  const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, "gu");
  let latest = "";
  for (const match of css.matchAll(pattern)) {
    latest = match[1];
  }
  return latest;
}

function classNamePattern(className) {
  const escaped = escapeRegExp(className);
  return new RegExp(`className=(?:["'\`][^"'\`]*\\b${escaped}\\b[^"'\`]*["'\`]|\\{\\s*["'\`][^"'\`]*\\b${escaped}\\b)`, "u");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
