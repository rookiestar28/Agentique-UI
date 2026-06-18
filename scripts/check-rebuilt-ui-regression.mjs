#!/usr/bin/env node
import fs from "node:fs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];

const app = readText("src/App.tsx");
const navigationRoute = readText("src/app-state/navigation-route.mjs");
const navigationRouteHook = readText("src/app-state/useNavigationRoute.ts");
const shell = readText("src/ui/WorkspaceShell.tsx");
const navigation = readText("src/ui/navigation.ts");
const graphWorkspace = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map(readText).join("\n");
const resourceImport = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map(readText).join("\n");
const previewHandoff = readText("src/workspaces/PreviewHandoffWorkspaces.tsx");
const trustRunSettings = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map(readText).join("\n");
const css = readStyleSourceBundle();
const evidence = readText("docs/validation/rebuilt-ui-regression-evidence.md");
const packageJson = JSON.parse(readText("package.json"));

const sourceSurface = [
  app,
  shell,
  navigation,
  graphWorkspace,
  resourceImport,
  previewHandoff,
  trustRunSettings
].join("\n");

requireIncludes(app, [
  "useNavigationRoute",
  "GraphWorkspace",
  "PreviewWorkspace",
  "HandoffWorkspace"
], "workspace composition");

requireIncludes(navigationRoute, [
  "navigationRouteSchemaVersion",
  "fallbackNavigationKey",
  "readNavigationHash",
  "writeNavigationHash",
  "replaceState"
], "navigation route adapter");

requireIncludes(navigationRouteHook, [
  "useNavigationRoute",
  "readNavigationHash(window.location)",
  "window.addEventListener(\"hashchange\"",
  "writeNavigationHash(window.history"
], "navigation route hook");

requireIncludes(shell, [
  "shell.primaryNavigation",
  "aria-controls=\"active-workspace-page\"",
  "aria-pressed={isActive}"
], "workspace shell");

requireIncludes(graphWorkspace, [
  "workspace.graph.caption",
  "workspace.graph.canvasControls",
  "Zoom in",
  "Zoom out",
  "Fit graph",
  "setViewport",
  "handleCanvasWheel",
  "handleNodePointerDown",
  "setSelectedNodeId",
  "aria-label=\"Node inspector\"",
  "aria-label=\"Validation risk and credential overlays\"",
  "Raw external workflow mutation blocked",
  "workspace.graph.subtitle",
  "workspace.graph.capabilityMatrix",
  "guarded local execution can be reviewed"
], "graph workspace");

if (/no workflow execution/iu.test(graphWorkspace)) {
  failures.push("graph workspace must not retain the old no-workflow-execution claim");
}

requireIncludes(sourceSurface, [
  "data-page=\"library\"",
  "data-page=\"import\"",
  "data-page=\"verify\"",
  "data-page=\"preview\"",
  "data-page=\"graph\"",
  "data-page=\"run\"",
  "data-page=\"handoff\"",
  "data-page=\"settings\""
], "workspace pages");

requireIncludes(css, [
  "focus-visible",
  "prefers-reduced-motion: reduce",
  "@media (max-width: 840px)",
  ".workflow-canvas",
  ".graph-toolbar",
  ".graph-node-button",
  ".node-inspector",
  ".graph-layout",
  "overflow-x: auto",
  "min-width: 0"
], "responsive accessibility CSS");

requireIncludes(evidence, [
  "Rebuilt UI Regression Evidence",
  "Desktop Graph viewport",
  "Narrow Graph viewport",
  "rebuilt-ui-graph-desktop.png",
  "rebuilt-ui-graph-mobile.png",
  "No installer, updater, production desktop runtime, hosted runtime, universal runtime, or automatic arbitrary-resource execution capability is claimed by this evidence."
], "rebuilt UI evidence");

for (const artifact of [
  "docs/validation/artifacts/rebuilt-ui-graph-desktop.png",
  "docs/validation/artifacts/rebuilt-ui-graph-mobile.png"
]) {
  if (!fs.existsSync(artifact)) {
    failures.push(`missing screenshot artifact: ${artifact}`);
  } else if (fs.statSync(artifact).size < 1000) {
    failures.push(`screenshot artifact is unexpectedly small: ${artifact}`);
  }
}

if (sourceSurface.includes("dangerouslySetInnerHTML")) {
  failures.push("rebuilt UI must not use dangerouslySetInnerHTML");
}

if (css.includes(".workflow-map") || css.includes(".workflow-node")) {
  failures.push("old static graph card selectors must not return");
}

if (app.includes("content-grid") || app.includes("Resource lifecycle") || app.includes("status-strip")) {
  failures.push("old bento/lifecycle shell must not return");
}

if (!String(packageJson.scripts?.["validate:rebuilt-ui"] ?? "").includes("check-rebuilt-ui-regression.mjs")) {
  failures.push("package scripts must define validate:rebuilt-ui");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:rebuilt-ui")) {
  failures.push("validate script must include validate:rebuilt-ui");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/App.tsx",
    "src/app-state/navigation-route.mjs",
    "src/app-state/useNavigationRoute.ts",
    "src/ui/WorkspaceShell.tsx",
    "src/workspaces/GraphWorkspace.tsx",
    "src/workspaces/LibraryImportWorkspaces.tsx",
    "src/workspaces/PreviewHandoffWorkspaces.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx",
    "src/styles.css",
    "docs/validation/rebuilt-ui-regression-evidence.md",
    "docs/validation/artifacts/rebuilt-ui-graph-desktop.png",
    "docs/validation/artifacts/rebuilt-ui-graph-mobile.png"
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
