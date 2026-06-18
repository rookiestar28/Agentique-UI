#!/usr/bin/env node
import fs from "node:fs";
import { reviewSourceRoundTripHandoffGate } from "../src/core/source-roundtrip-handoff.mjs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];
const review = reviewSourceRoundTripHandoffGate();
const moduleText = readText("src/core/source-roundtrip-handoff.mjs");
const tests = readText("tests/source-roundtrip-handoff.test.mjs");
const app = [
  readText("src/App.tsx"),
  readText("src/workspaces/routes/LibraryWorkspaceAndImportWorkspaceRoute.tsx"),
  readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx")
].join("\n");
const importer = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map(readText).join("\n");
const run = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map(readText).join("\n");
const css = readStyleSourceBundle();
const evidence = readText("docs/validation/runner-ui-execution-evidence.md");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message));
}

requireIncludes(moduleText, [
  "agentique.sourceRoundTripHandoff.v1",
  "createSourceRoundTripHandoff",
  "reviewSourceRoundTripHandoffGate",
  "assertSourceRoundTripHandoffSafe",
  "sourcePreserving: true",
  "noBridgeStart: true",
  "noRuntimeStart: true",
  "unsupportedSemanticsRewritten: false",
  "sourcePlatformHandoffs"
], "source round-trip handoff module");

requireIncludes(tests, [
  "first-class platform samples produce source-preserving export descriptors",
  "lossy normalization is mapped to explicit loss-report entries",
  "platform handoff descriptors include credentials providers permissions and blocked reasons",
  "descriptor safety rejects raw secrets paths commands and executable bridge claims",
  "source round-trip handoff review gate passes"
], "source round-trip handoff tests");

requireIncludes(app, [
  "createSourceRoundTripHandoff",
  "sourceRoundTripHandoff",
  "sourceRoundTripHandoff={sourceRoundTripHandoff}"
], "app source round-trip wiring");

requireIncludes(importer, [
  "sourceRoundTripHandoff",
  "aria-label=\"Source-preserving round-trip export\"",
  "aria-label=\"Source platform handoff requirements\""
], "import source round-trip UI");

requireIncludes(run, [
  "sourceRoundTripHandoff",
  "aria-label=\"Run source handoff local blocked external summary\""
], "run source round-trip UI");

requireIncludes(css, [
  ".source-roundtrip-panel",
  ".source-roundtrip-grid",
  ".source-roundtrip-list"
], "source round-trip CSS");

requireIncludes(evidence, [
  "source-preserving round-trip export",
  "source maps and loss-report entries",
  "no bridge or external runtime is started"
], "runner evidence doc");

if (!String(packageJson.scripts?.["validate:source-roundtrip-handoff"] ?? "").includes("check-source-roundtrip-handoff.mjs")) {
  failures.push("package scripts must define validate:source-roundtrip-handoff");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:source-roundtrip-handoff")) {
  failures.push("validate script must include validate:source-roundtrip-handoff");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/source-roundtrip-handoff.mjs",
    "tests/source-roundtrip-handoff.test.mjs",
    "src/App.tsx",
    "src/workspaces/LibraryImportWorkspaces.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx",
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
