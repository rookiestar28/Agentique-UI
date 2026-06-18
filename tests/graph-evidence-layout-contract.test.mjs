import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const forbiddenGraphEvidenceCardClasses = [
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
];

test("graph execution evidence stays collapsed instead of returning as card or bento modules", () => {
  const graph = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");

  assert.match(graph, /<details className="graph-evidence-disclosure">/u);
  assert.match(graph, /<summary>/u);
  assert.match(graph, /className="graph-evidence-summary"/u);
  assert.match(graph, /className="graph-evidence-body"/u);
  assert.match(graph, /className="graph-evidence-section"/u);
  assert.match(graph, /className="graph-evidence-row"/u);
  assert.match(graph, /className="graph-evidence-list"/u);
  assert.match(graph, /className="graph-evidence-status"/u);
  assert.doesNotMatch(graph, /<details[^>]*className="graph-evidence-disclosure"[^>]*open/u);

  for (const ariaLabel of [
    "Graph run plan gate",
    "Graph run plan node classifications",
    "Graph approval checkpoint evidence",
    "Graph permission preflight review",
    "Graph required runner grants",
    "Blocked high-risk run plan sample",
    "Graph external handoff descriptors",
    "Graph runner node result evidence",
    "Graph runner cleanup receipt",
    "Workflow editor state summary",
    "Workflow diff summary"
  ]) {
    assert.match(graph, new RegExp(`aria-label="${escapeRegExp(ariaLabel)}"`, "u"));
  }

  for (const className of forbiddenGraphEvidenceCardClasses) {
    assert.doesNotMatch(graph, classNamePattern(className), `${className} must not return to GraphWorkspace`);
  }
});

test("graph evidence CSS is disclosure and row based rather than page-level cards", () => {
  const css = readStyleSourceBundle();

  assert.match(css, latestRulePattern(".graph-evidence-disclosure", ["border-block", "background: rgba(3, 6, 11, 0.2)"]));
  assert.match(css, latestRulePattern(".graph-evidence-disclosure > summary", ["display: flex", "list-style: none"]));
  assert.match(css, /\.graph-evidence-row,\n\.graph-evidence-list li\s*\{[\s\S]*?border-bottom: 1px solid rgba\(255, 255, 255, 0\.06\)/u);
  assert.match(css, /\.graph-evidence-disclosure\[open\] > summary::after/u);

  for (const selector of [
    ".graph-workspace .editor-state",
    ".graph-workspace .diff-list",
    ".graph-workspace .fail-closed"
  ]) {
    assert.doesNotMatch(css, new RegExp(escapeRegExp(selector), "u"), `${selector} must not be retained as a Graph layout hook`);
  }
});

function classNamePattern(className) {
  const escaped = escapeRegExp(className);
  return new RegExp(`className=(?:["'\`][^"'\`]*\\b${escaped}\\b[^"'\`]*["'\`]|\\{\\s*["'\`][^"'\`]*\\b${escaped}\\b)`, "u");
}

function latestRulePattern(selector, declarations) {
  return new RegExp(`${escapeRegExp(selector)}\\s*\\{(?=[\\s\\S]*?${declarations.map(escapeRegExp).join(")(?=[\\s\\S]*?")})[\\s\\S]*?\\}`, "u");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
