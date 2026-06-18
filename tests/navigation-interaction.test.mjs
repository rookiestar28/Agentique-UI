import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("left navigation uses stateful click handling instead of hard-coded active state", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const shell = fs.readFileSync("src/ui/WorkspaceShell.tsx", "utf8");
  const routeAdapter = fs.readFileSync("src/app-state/navigation-route.mjs", "utf8");
  const routeHook = fs.readFileSync("src/app-state/useNavigationRoute.ts", "utf8");
  assert.match(app, /const \{ activeNav, selectNav: handleNavSelect \} = useNavigationRoute\(\)/u);
  assert.match(routeAdapter, /normalizeNavigationKey/u);
  assert.match(routeAdapter, /readNavigationHash/u);
  assert.match(routeAdapter, /writeNavigationHash/u);
  assert.match(routeHook, /addEventListener\("hashchange"/u);
  assert.match(routeHook, /removeEventListener\("hashchange"/u);
  assert.match(shell, /handleNavigationSelect\(item\.key, closeOnSelect\)/u);
  assert.match(shell, /aria-pressed=\{isActive\}/u);
  assert.match(shell, /className=\{isActive \? "nav-item active" : "nav-item"\}/u);
  assert.doesNotMatch(app, /window\.location\.hash/u);
  assert.doesNotMatch(app, /window\.history\.replaceState/u);
  assert.doesNotMatch(app, /aria-pressed=\{index === 0\}/u);
  assert.doesNotMatch(app, /className=\{index === 0/u);
});

test("left navigation switches functional pages instead of scrolling within one page", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const shell = fs.readFileSync("src/ui/WorkspaceShell.tsx", "utf8");
  const graphWorkspace = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  const resourceImport = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  const previewHandoff = fs.readFileSync("src/workspaces/PreviewHandoffWorkspaces.tsx", "utf8");
  const trustRunSettings = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  const pageSource = `${app}\n${graphWorkspace}\n${resourceImport}\n${previewHandoff}\n${trustRunSettings}`;
  for (const page of ["library", "import", "verify", "preview", "graph", "run", "handoff", "settings"]) {
    assert.match(pageSource, new RegExp(`data-page="${page}"`, "u"));
  }
  assert.match(shell, /aria-controls="active-workspace-page"/u);
  assert.match(shell, /id="active-workspace-page" tabIndex=\{-1\}/u);
  assert.doesNotMatch(app, /navigationTargets/u);
  assert.doesNotMatch(app, /scrollIntoView/u);
  assert.doesNotMatch(app, /content-grid/u);
  assert.doesNotMatch(app, /Resource lifecycle/u);
});

test("workspace page switch and brand logo have focused styling", () => {
  const css = readStyleSourceBundle();
  const shell = fs.readFileSync("src/ui/WorkspaceShell.tsx", "utf8");
  assert.match(shell, /import brandLogo from "\.\.\/assets\/logo-mark\.svg"/u);
  assert.match(shell, /className="brand-logo"/u);
  assert.match(css, /\.brand-logo/u);
  assert.match(css, /\.workspace-page/u);
  assert.match(css, /\.workspace-section/u);
  assert.match(css, /\.workspace-page:focus-visible/u);
  assert.doesNotMatch(css, /\.page-panel/u);
  assert.doesNotMatch(css, /\.panel\b/u);
  assert.doesNotMatch(css, /\.lifecycle-rail/u);
  assert.doesNotMatch(css, /\.status-strip/u);
  assert.doesNotMatch(css, /\.content-grid/u);
});
