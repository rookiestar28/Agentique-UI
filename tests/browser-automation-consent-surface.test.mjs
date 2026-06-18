import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("run page exposes browser automation consent evidence", () => {
  const app = [
    "src/workspaces/TrustRunSettingsTypes.ts",
    "src/workspaces/BrowserAutomationConsentGatePanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  for (const phrase of [
    "Browser automation strict consent gate",
    "Consent status",
    "Execution decision",
    "Context isolation",
    "Profile access",
    "Target URL",
    "Action scope",
    "Stop control",
    "Context close receipt",
    "Cleanup receipt",
    "Artifact/log redaction",
    "Permission preflight",
    "Denied browser authorities",
    "Blocked unsafe browser automation samples"
  ]) {
    assert.match(app, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  }
});

test("browser automation consent surface stays review-only without runtime effects", () => {
  const browserSurface = [
    "src/workspaces/BrowserAutomationConsentGatePanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(
    browserSurface,
    /from\s+["']playwright|chromium\.launch|firefox\.launch|webkit\.launch|launchPersistentContext|connectOverCDP|storageState\s*[:(]|addCookies\s*\(|cookies\s*\(|localStorage\s*[.:]|userDataDir\s*[:(]|--remote-debugging|remote-debugging-port|node:child_process|child_process|node:fs|writeFile|appendFile|createWriteStream|spawn\(|execFile\(|exec\(|fetch\(|WebSocket\(|invoke\(|Command\.create|new\s+Command/u
  );
});
