import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const workspaceSources = {
  app: fs.readFileSync("src/App.tsx", "utf8"),
  graph: ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n"),
  libraryImport: ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n"),
  previewHandoff: fs.readFileSync("src/workspaces/PreviewHandoffWorkspaces.tsx", "utf8"),
  trustRunSettings: ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/ExternalHandoffPanel.tsx", "src/workspaces/SettingsWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n")
};

const allWorkspaceSource = Object.values(workspaceSources).join("\n");

const pageContracts = {
  library: {
    source: workspaceSources.libraryImport,
    anchors: [
      'data-page="library"',
      "resource-browser",
      "resource-table",
      "resource-detail",
      "session-ledger",
      "session-timeline"
    ]
  },
  import: {
    source: workspaceSources.libraryImport,
    anchors: [
      'data-page="import"',
      "import-flow",
      "intent-editor",
      "import-review",
      "proof-ledger",
      "external-intake-panel",
      "platform-adapter-panel",
      "platform-ir-panel",
      "platform-capability-panel",
      "source-roundtrip-panel"
    ]
  },
  verify: {
    source: workspaceSources.trustRunSettings,
    anchors: [
      'data-page="verify"',
      "trust-summary",
      "check-list",
      "capability-list",
      "dry-run-state",
      "dry-run-checks",
      "dry-run-failures"
    ]
  },
  graph: {
    source: workspaceSources.graph,
    anchors: [
      'data-page="graph"',
      "workflow-canvas",
      "graph-capability-matrix",
      "node-inspector",
      "graph-runner-toggle",
      "graph-evidence-disclosure"
    ]
  },
  run: {
    source: workspaceSources.trustRunSettings,
    anchors: [
      'data-page="run"',
      "runner-control-panel",
      "runner-actions",
      "permission-preflight-panel",
      "runner-event-timeline",
      "approval-checkpoint-panel",
      "external-handoff-panel",
      "run-history-panel",
      "run-evidence-browser",
      "curated-adapter-lane-panel",
      "permission-audit"
    ]
  },
  handoff: {
    source: workspaceSources.previewHandoff,
    anchors: [
      'data-page="handoff"',
      "descriptor-grid",
      "descriptor-review",
      "field-list",
      "handoff-steps",
      "workspace.handoff.agentClientTitle",
      "External runtime compatibility report"
    ]
  },
  preview: {
    source: workspaceSources.previewHandoff,
    anchors: [
      'data-page="preview"',
      "safe-preview-note",
      "preview-workspace",
      "file-tree",
      "preview-reader",
      "preview-meta"
    ]
  },
  settings: {
    source: workspaceSources.trustRunSettings,
    anchors: [
      'data-page="settings"',
      "field-list",
      "settings.release.summaryLabel",
      "settings.release.blockersLabel",
      "config-fields",
      "config-actions",
      "vault-summary",
      "vault-list",
      "vault-row"
    ]
  }
};

const forbiddenLayoutClassTokens = [
  "bento",
  "bento-grid",
  "card",
  "card-grid",
  "content-grid",
  "dashboard",
  "dashboard-grid",
  "lifecycle-rail",
  "metric-card",
  "page-panel",
  "stat-card",
  "status-card",
  "status-strip",
  "summary-card"
];

test("all workspace tabs keep task-native layout anchors", () => {
  for (const [page, contract] of Object.entries(pageContracts)) {
    for (const anchor of contract.anchors) {
      assert.match(contract.source, new RegExp(escapeRegExp(anchor), "u"), `${page} missing layout anchor: ${anchor}`);
    }
  }
});

test("high-risk workspaces keep actions and evidence rows instead of static metric tiles", () => {
  for (const anchor of [
    "Run start cancel controls",
    "Approve scoped grants",
    "Cancel active run",
    "Run history records",
    "Run cleanup and rerun actions",
    "Default-deny capability decisions",
    "Redacted dry-run failure report",
    "settings.config.exportRedactedDraft",
    "settings.vault.listLabel",
    "Source-preserving round-trip export",
    "workspace.import.externalIntakeLabel"
  ]) {
    assert.match(allWorkspaceSource, new RegExp(escapeRegExp(anchor), "u"));
  }
});

test("workspace sources reject page-level card and bento regression markers", () => {
  for (const classToken of forbiddenLayoutClassTokens) {
    assert.doesNotMatch(allWorkspaceSource, classNamePattern(classToken), `forbidden layout class returned: ${classToken}`);
  }
});

test("workspace CSS keeps pages unframed and forbids card or bento shell selectors", () => {
  const css = readStyleSourceBundle();

  assert.match(css, /\.workspace-page\s*\{[\s\S]*?box-shadow: none/u);
  assert.match(css, /\.resource-command\s*\{[\s\S]*?background: transparent/u);
  assert.match(css, /\.proof-ledger div,\n\.detail-list div,\n\.session-ledger div/u);
  assert.match(css, /\.field-list/u);
  assert.match(css, /\.permission-audit/u);
  assert.match(css, /\.safe-preview-note/u);

  for (const classToken of forbiddenLayoutClassTokens) {
    assert.doesNotMatch(css, selectorPattern(classToken), `forbidden layout selector returned: ${classToken}`);
  }
});

function classNamePattern(className) {
  const escaped = escapeRegExp(className);
  return new RegExp(`className=(?:["'\`][^"'\`]*\\b${escaped}\\b[^"'\`]*["'\`]|\\{\\s*["'\`][^"'\`]*\\b${escaped}\\b)`, "u");
}

function selectorPattern(className) {
  return new RegExp(`\\.${escapeRegExp(className)}\\b`, "u");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
