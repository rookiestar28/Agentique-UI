#!/usr/bin/env node
import fs from "node:fs";
import { reviewBrowserAutomationConsentGate } from "../src/core/browser-automation-consent-gate.mjs";

const failures = [];
const moduleText = readText("src/core/browser-automation-consent-gate.mjs");
const tests = readText("tests/browser-automation-consent-gate.test.mjs");
const surfaceTests = readText("tests/browser-automation-consent-surface.test.mjs");
const docs = readText("docs/contracts/browser-automation-consent-gate.md");
const panel = readText("src/workspaces/BrowserAutomationConsentGatePanel.tsx");
const runWorkspace = readText("src/workspaces/RunWorkspace.tsx");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const packageJson = JSON.parse(readText("package.json"));
const review = reviewBrowserAutomationConsentGate();

requireIncludes(
  moduleText,
  [
    "agentique.browserAutomationConsentGate.v1",
    "isolated-non-persistent",
    "persistentContext: false",
    "startsBrowser: false",
    "review-only-no-browser-start",
    "storageStateImported",
    "remoteDebuggingAttach",
    "existingBrowserConnection",
    "evaluateRunStartGrants",
    "assertBrowserAutomationPolicySafe"
  ],
  "browser automation consent module"
);

requireIncludes(
  tests,
  [
    "complete browser automation consent contract is ready without starting a browser",
    "persistent context default profile and user data directory fail closed",
    "cookie storage state local storage credential and session forwarding are rejected",
    "existing browser extension current tab remote debugging and cdp attachment are rejected",
    "broad target url action scope and hidden automation fail closed",
    "explicit consent stop cleanup and timeout receipts are mandatory",
    "artifact and log redaction blocks raw downloads profile capture and storage state capture",
    "permission preflight and denied authority list must pass before consent readiness",
    "unsupported browser automation runtime claims are rejected"
  ],
  "browser automation consent tests"
);

requireIncludes(
  surfaceTests,
  [
    "run page exposes browser automation consent evidence",
    "browser automation consent surface stays review-only without runtime effects",
    "Browser automation strict consent gate",
    "Consent status",
    "Context isolation",
    "Denied browser authorities",
    "Blocked unsafe browser automation samples",
    "launchPersistentContext",
    "connectOverCDP"
  ],
  "browser automation consent surface tests"
);

requireIncludes(
  docs,
  [
    "Browser Automation Strict Consent Gate Contract",
    "guarded consent review only",
    "isolated non-persistent context only",
    "no persistent context and no user data directory",
    "no cookie, local storage, storage state, credential, or session import/export",
    "startsBrowser: false",
    "does not start a browser"
  ],
  "browser automation consent docs"
);

requireIncludes(
  panel,
  [
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
    "Storage state and cookies",
    "Existing browser or remote debugging",
    "Blocked unsafe browser automation samples"
  ],
  "browser automation consent panel"
);

requireIncludes(runWorkspace, ["BrowserAutomationConsentGatePanel", "browserAutomationConsentGate"], "Run workspace browser automation consent wiring");

requireIncludes(
  route,
  ["createBrowserAutomationConsentReview", "reviewBrowserAutomationConsentGate", "browserAutomationConsentGate", "browserAutomationConsentGate={browserAutomationConsentGate}"],
  "Run route browser automation consent wiring"
);

requireIncludes(types, ["browserAutomationConsentGate: AnyRecord"], "Run workspace props");

const browserSurface = [panel, runWorkspace, route].join("\n");
const forbiddenBrowserRuntime =
  /from\s+["']playwright|chromium\.launch|firefox\.launch|webkit\.launch|launchPersistentContext|connectOverCDP|storageState\s*[:(]|addCookies\s*\(|cookies\s*\(|localStorage\s*[.:]|userDataDir\s*[:(]|--remote-debugging|remote-debugging-port|node:child_process|child_process|node:fs|writeFile|appendFile|createWriteStream|spawn\(|execFile\(|exec\(|fetch\(|WebSocket\(|invoke\(|Command\.create|new\s+Command/u;
if (forbiddenBrowserRuntime.test(browserSurface)) {
  failures.push("browser automation consent browser surface must stay review-only and avoid runtime-effect APIs");
}

if (!review.ok || review.approvedStatus !== "consent-ready" || review.startsBrowser !== false) {
  failures.push("browser automation consent review must prove consent readiness without starting a browser");
}

if (
  !review.persistentProfileBlocked ||
  !review.storageForwardingBlocked ||
  !review.broadScopeBlocked ||
  !review.existingBrowserBlocked ||
  !review.hiddenAutomationBlocked ||
  !review.missingStopCleanupBlocked
) {
  failures.push("browser automation consent review must prove profile, storage, broad-scope, existing-browser, hidden automation, and cleanup blockers");
}

if (!String(packageJson.scripts?.["validate:browser-automation-consent-gate"] ?? "").includes("check-browser-automation-consent-gate.mjs")) {
  failures.push("package scripts must define validate:browser-automation-consent-gate");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:browser-automation-consent-gate")) {
  failures.push("validate script must include validate:browser-automation-consent-gate");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: [
        "src/core/browser-automation-consent-gate.mjs",
        "tests/browser-automation-consent-gate.test.mjs",
        "tests/browser-automation-consent-surface.test.mjs",
        "src/workspaces/BrowserAutomationConsentGatePanel.tsx",
        "src/workspaces/RunWorkspace.tsx",
        "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx",
        "src/workspaces/TrustRunSettingsTypes.ts",
        "docs/contracts/browser-automation-consent-gate.md"
      ],
      summary: review.summary
    },
    null,
    2
  )
);

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
