#!/usr/bin/env node
import fs from "node:fs";
import { reviewExternalHandoffDescriptorGate } from "../src/core/external-handoff-descriptors.mjs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];
const review = reviewExternalHandoffDescriptorGate();
const moduleText = readText("src/core/external-handoff-descriptors.mjs");
const tests = readText("tests/external-handoff-descriptors.test.mjs");
const app = [readText("src/App.tsx"), readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx")].join("\n");
const runnerState = readText("src/app-state/useRunnerWorkspaceState.ts");
const graph = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map(readText).join("\n");
const run = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/ExternalHandoffPanel.tsx", "src/workspaces/SettingsWorkspace.tsx"].map(readText).join("\n");
const css = readStyleSourceBundle();
const evidence = readText("docs/validation/runner-ui-execution-evidence.md");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message));
}

requireIncludes(moduleText, [
  "agentique.externalHandoffDescriptors.v1",
  "createExternalHandoffDescriptors",
  "reviewExternalHandoffDescriptorGate",
  "assertExternalHandoffDescriptorsSafe",
  "startsBridge: false",
  "startsRuntime: false",
  "browserDataAccess: false",
  "partialEvidence",
  "external-handoff",
  "destinationPolicy",
  "requiresExplicitUserAction",
  "automaticOpen: false",
  "allowedDestinations",
  "destinationReview",
  "unknown-client",
  "unsafe-payload"
], "external handoff descriptor module");

requireIncludes(tests, [
  "blocked and high-risk nodes produce actionable external handoff descriptors",
  "handoff-only nodes remain descriptor export rows without bridge launch",
  "credentialed provider or permission-required nodes can be routed to handoff review",
  "partial local run evidence is linked without exposing local paths",
  "destination policies require explicit user action for user-owned clients and export folders",
  "localhost and deep-link targets are constrained without bridge execution",
  "unknown clients and unsafe payloads remain blocked by default",
  "descriptor safety rejects commands paths browser data and raw secrets",
  "external handoff descriptor review gate passes"
], "external handoff descriptor tests");

requireIncludes(app, [
  "externalHandoffDescriptors",
  "externalHandoffDescriptors={externalHandoffDescriptors}"
], "app external handoff wiring");

requireIncludes(runnerState, [
  "createExternalHandoffDescriptors",
  "externalHandoffDescriptors"
], "runner state external handoff wiring");

requireIncludes(graph, [
  "externalHandoffDescriptors",
  "aria-label=\"Graph external handoff descriptors\""
], "graph external handoff UI");

requireIncludes(run, [
  "externalHandoffDescriptors",
  "aria-label=\"External handoff descriptor evidence\"",
  "aria-label=\"External handoff partial execution evidence\"",
  "aria-label=\"External handoff bridge boundary\"",
  "aria-label=\"External handoff destination policy\"",
  "aria-label=\"External handoff cleanup readiness\""
], "run external handoff UI");

requireIncludes(css, [
  ".external-handoff-panel",
  ".external-handoff-grid",
  ".external-handoff-list"
], "external handoff CSS");

requireIncludes(evidence, [
  "external handoff descriptors",
  "blocked and handoff-only nodes",
  "no bridge or external runtime is started",
  "user-owned client",
  "export folder",
  "unknown clients and unsafe payloads remain blocked"
], "runner evidence doc");

if (!String(packageJson.scripts?.["validate:external-handoff-descriptors"] ?? "").includes("check-external-handoff-descriptors.mjs")) {
  failures.push("package scripts must define validate:external-handoff-descriptors");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:external-handoff-descriptors")) {
  failures.push("validate script must include validate:external-handoff-descriptors");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/external-handoff-descriptors.mjs",
    "tests/external-handoff-descriptors.test.mjs",
    "src/App.tsx",
    "src/app-state/useRunnerWorkspaceState.ts",
    "src/workspaces/GraphWorkspace.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx",
    "src/workspaces/ExternalHandoffPanel.tsx",
    "src/styles.css",
    "docs/validation/runner-ui-execution-evidence.md",
    "package.json"
  ],
  summary: review.checks
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
