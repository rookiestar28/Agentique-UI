#!/usr/bin/env node
import fs from "node:fs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];
const app = fs.readFileSync("src/App.tsx", "utf8");
const shell = fs.readFileSync("src/ui/WorkspaceShell.tsx", "utf8");
const graphWorkspace = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
const resourceImport = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
const previewHandoff = fs.readFileSync("src/workspaces/PreviewHandoffWorkspaces.tsx", "utf8");
const trustRunSettings = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/ExternalHandoffPanel.tsx", "src/workspaces/SettingsWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
const css = readStyleSourceBundle();
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const evidence = fs.readFileSync("docs/validation/visual-regression-evidence.md", "utf8");

requireIncludes(shell, [
  "app.ariaLabel",
  "shell.primaryNavigation",
  "command.ariaLabel",
  "id=\"active-workspace-page\""
], "workspace shell accessibility landmarks");

requireIncludes(app, [
  "GraphWorkspace",
  "PreviewWorkspace",
  "HandoffWorkspace"
], "workspace router");

requireIncludes(graphWorkspace, [
  "data-page=\"graph\"",
  "workspace.graph.canvasControls",
  "workspace.graph.canvasLabel",
  "aria-label=\"Node inspector\"",
  "role=\"status\""
], "graph accessibility landmarks");

requireIncludes(previewHandoff, [
  "data-page=\"preview\"",
  "data-page=\"handoff\"",
  "workspace.preview.staticFileTree",
  "workspace.handoff.descriptorReview",
  "role=\"status\""
], "preview handoff accessibility landmarks");

requireIncludes(trustRunSettings, [
  "data-page=\"verify\"",
  "data-page=\"run\"",
  "data-page=\"settings\"",
  "workspace.verify.caption",
  "settings.permissionPostureLabel",
  "role=\"status\""
], "trust run settings accessibility landmarks");

requireIncludes(resourceImport, [
  "data-page=\"library\"",
  "data-page=\"import\"",
  "aria-label=\"Import proof states\"",
  "workspace.library.proofSummary",
  "aria-labelledby=\"import-heading\"",
  "htmlFor=\"resource-intent\"",
  "role=\"status\""
], "resource import accessibility landmarks");

requireIncludes(resourceImport, [
  "resource-browser",
  "resource-table",
  "resource-detail",
  "session-ledger",
  "session-timeline",
  "import-flow",
  "intent-editor",
  "import-review",
  "proof-ledger",
  "external-intake-panel",
  "platform-adapter-panel",
  "platform-ir-panel",
  "platform-capability-panel",
  "source-roundtrip-panel"
], "library and import task-native layout contract");

requireIncludes(trustRunSettings, [
  "trust-summary",
  "check-list",
  "capability-list",
  "dry-run-state",
  "dry-run-checks",
  "dry-run-failures",
  "runner-control-panel",
  "runner-actions",
  "permission-preflight-panel",
  "runner-event-timeline",
  "approval-checkpoint-panel",
  "external-handoff-panel",
  "run-history-panel",
  "run-evidence-browser",
  "curated-adapter-lane-panel",
  "settings.release.summaryLabel",
  "settings.release.blockersLabel",
  "config-fields",
  "config-actions",
  "vault-summary",
  "vault-list",
  "vault-row"
], "verify run settings task-native layout contract");

requireIncludes(previewHandoff, [
  "safe-preview-note",
  "preview-workspace",
  "file-tree",
  "preview-reader",
  "preview-meta",
  "descriptor-grid",
  "descriptor-review",
  "field-list",
  "handoff-steps",
  "Agent client action plan",
  "External runtime compatibility report"
], "preview and handoff task-native layout contract");

requireIncludes(graphWorkspace, [
  "workflow-canvas",
  "graph-capability-matrix",
  "node-inspector",
  "graph-runner-toggle",
  "graph-evidence-disclosure"
], "graph task-native layout contract");

requireIncludes(css, [
  "@media (max-width: 840px)",
  "prefers-reduced-motion: reduce",
  "focus-visible",
  "overflow-wrap: anywhere",
  "overflow-x: auto",
  "text-overflow: ellipsis",
  "min-width: 0",
  "max-width: 100%"
], "responsive and accessibility CSS");

requireIncludes(evidence, [
  "Desktop viewport",
  "Mobile viewport",
  "visual-redesign-desktop.png",
  "visual-redesign-mobile.png",
  "No installer, updater, production desktop runtime, hosted runtime, universal runtime, or automatic arbitrary-resource execution capability is claimed by this evidence."
], "visual evidence document");

for (const artifact of [
  "docs/validation/artifacts/visual-redesign-desktop.png",
  "docs/validation/artifacts/visual-redesign-mobile.png"
]) {
  if (!fs.existsSync(artifact)) {
    failures.push(`missing screenshot artifact: ${artifact}`);
  } else if (fs.statSync(artifact).size < 1000) {
    failures.push(`screenshot artifact is unexpectedly small: ${artifact}`);
  }
}

if (app.includes("dangerouslySetInnerHTML")) {
  failures.push("app must not use dangerouslySetInnerHTML");
}

if (app.includes("Resource lifecycle") || app.includes("status-strip") || app.includes("content-grid")) {
  failures.push("non-functional lifecycle/status/bento shell must not be present");
}

if (shell.includes("Resource lifecycle") || shell.includes("status-strip") || shell.includes("content-grid")) {
  failures.push("non-functional lifecycle/status/bento shell must not be present");
}

for (const [label, text] of Object.entries({
  app,
  shell,
  graphWorkspace,
  resourceImport,
  previewHandoff,
  trustRunSettings
})) {
  forbidLayoutClassMarkers(text, label);
}

for (const marker of [
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
]) {
  if (new RegExp(`\\.${escapeRegExp(marker)}\\b`, "u").test(css)) {
    failures.push(`forbidden page-level card/bento selector returned: ${marker}`);
  }
}

if (/letter-spacing\s*:\s*-/iu.test(css)) {
  failures.push("negative letter spacing is not allowed");
}

if (/font-size\s*:[^;]*vw/iu.test(css)) {
  failures.push("viewport-width font sizing is not allowed");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:visual-redesign")) {
  failures.push("validate script must include validate:visual-redesign");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/App.tsx",
    "src/ui/WorkspaceShell.tsx",
    "src/workspaces/GraphWorkspace.tsx",
    "src/workspaces/LibraryImportWorkspaces.tsx",
    "src/workspaces/PreviewHandoffWorkspaces.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx",
    "src/styles.css",
    "docs/validation/visual-regression-evidence.md",
    "docs/validation/artifacts/visual-redesign-desktop.png",
    "docs/validation/artifacts/visual-redesign-mobile.png"
  ]
}, null, 2));

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}

function forbidLayoutClassMarkers(text, label) {
  for (const marker of [
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
  ]) {
    if (classNamePattern(marker).test(text)) {
      failures.push(`${label} must not use page-level card/bento class: ${marker}`);
    }
  }
}

function classNamePattern(className) {
  const escaped = escapeRegExp(className);
  return new RegExp(`className=(?:["'\`][^"'\`]*\\b${escaped}\\b[^"'\`]*["'\`]|\\{\\s*["'\`][^"'\`]*\\b${escaped}\\b)`, "u");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
