import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("mobile workspace navigation uses disclosure semantics", () => {
  const shell = fs.readFileSync("src/ui/WorkspaceShell.tsx", "utf8");
  const css = readStyleSourceBundle();

  assert.match(shell, /const \[isMobileNavOpen, setIsMobileNavOpen\] = useState\(false\)/u);
  assert.match(shell, /aria-controls="mobile-workspace-navigation"/u);
  assert.match(shell, /aria-expanded=\{isMobileNavOpen\}/u);
  assert.match(shell, /hidden=\{!isMobileNavOpen\}/u);
  assert.match(shell, /aria-label=\{t\("shell\.mobileWorkspaceNavigation"\)\}/u);
  assert.match(shell, /renderNavigationItems\(true\)/u);
  assert.match(shell, /setIsMobileNavOpen\(false\)/u);
  assert.doesNotMatch(shell, /role="menu"/u);
  assert.doesNotMatch(shell, /role="menuitem"/u);

  assert.match(css, /\.mobile-nav-toggle/u);
  assert.match(css, /\.mobile-nav-panel:not\(\[hidden\]\)/u);
  assert.match(css, /\.desktop-nav\s*\{\s*display: none;/u);
  assert.match(css, /\.mobile-nav-panel \.nav-item\s*\{[^}]*min-height: 44px;/us);
});

test("mobile navigation disclosure reuses centralized workspace navigation", () => {
  const shell = fs.readFileSync("src/ui/WorkspaceShell.tsx", "utf8");
  const navigation = fs.readFileSync("src/ui/navigation.ts", "utf8");

  for (const label of ["Library", "Import", "Verify", "Preview", "Graph", "Run", "Handoff", "Settings"]) {
    assert.match(navigation, new RegExp(label, "u"));
  }

  assert.match(shell, /navigation\.map\(\(item\) =>/u);
  assert.match(shell, /<nav className="nav-list desktop-nav" aria-label=\{t\("shell\.workspacePages"\)\}>/u);
  assert.match(shell, /className="mobile-nav-panel"/u);
  assert.match(shell, /onClick=\{\(\) => handleNavigationSelect\(item\.key, closeOnSelect\)\}/u);
});
