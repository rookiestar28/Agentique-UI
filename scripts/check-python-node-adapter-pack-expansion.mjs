#!/usr/bin/env node
import fs from "node:fs";
import {
  createPythonNodeAdapterPackExpansion,
  pythonNodeAdapterPackExpansionSchemaVersion,
  reviewPythonNodeAdapterPackExpansion
} from "../src/core/python-node-adapter-pack-expansion.mjs";

const failures = [];
const review = createPythonNodeAdapterPackExpansion();
const validation = reviewPythonNodeAdapterPackExpansion();
const moduleText = readText("src/core/python-node-adapter-pack-expansion.mjs");
const tests = readText("tests/python-node-adapter-pack-expansion.test.mjs");
const surfaceTests = readText("tests/adapter-pack-expansion-surface.test.mjs");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const runWorkspace = readText("src/workspaces/RunWorkspace.tsx");
const panel = readText("src/workspaces/PythonNodeAdapterPackExpansionPanel.tsx");
const stageReporting = readText("src/core/validation-stage-reporting.mjs");
const packageJson = JSON.parse(readText("package.json"));

if (!validation.ok) {
  failures.push(...validation.errors.map((error) => error.message));
}

requireIncludes(
  moduleText,
  [
    "agentique.pythonNodeAdapterPackExpansion.v1",
    "createPythonNodeAdapterPackExpansion",
    "reviewPythonNodeAdapterPackExpansion",
    "package-install",
    "lifecycle-script",
    "browser-data",
    "provider-automation",
    "newRuntimeLane: false"
  ],
  "python node adapter pack expansion module"
);

if (/node:child_process|node:fs|from\s+["'][^"']*(?:python|node)-adapter-runner|import\s*\([^)]*(?:python|node)-adapter-runner/u.test(moduleText)) {
  failures.push("python node adapter pack expansion module must stay browser safe and not import Node-only runners");
}

requireIncludes(
  tests,
  ["accepts only fixed allowlisted packs", "keeps package lifecycle and authority denied", "blocks unsafe samples before launch", "stays browser safe"],
  "python node adapter pack expansion tests"
);
requireIncludes(surfaceTests, ["Python and Node adapter pack expansion", "descriptor-only pack review"], "adapter pack expansion surface tests");
requireIncludes(route, ["createPythonNodeAdapterPackExpansion", "adapterPackExpansion={adapterPackExpansion}"], "graph/run route");
requireIncludes(runWorkspace, ["PythonNodeAdapterPackExpansionPanel", "adapterPackExpansion={adapterPackExpansion}"], "run workspace mount");
requireIncludes(
  panel,
  [
    "Python and Node adapter pack expansion",
    "Fixed allowlisted adapter packs",
    "Host prerequisite receipts",
    "Permission ceiling",
    "Watchdog and native event receipts",
    "Artifact and cleanup receipts",
    "Package lifecycle denial",
    "Adapter pack blocked reasons",
    "descriptor-only pack review"
  ],
  "adapter pack expansion panel"
);
requireIncludes(stageReporting, ["validate:python-node-adapter-pack-expansion"], "validation stage reporting");

if (!String(packageJson.scripts?.["validate:python-node-adapter-pack-expansion"] ?? "").includes("check-python-node-adapter-pack-expansion.mjs")) {
  failures.push("package scripts must define validate:python-node-adapter-pack-expansion");
}
if (!String(packageJson.scripts?.validate ?? "").includes("validate:python-node-adapter-pack-expansion")) {
  failures.push("full validate script must include validate:python-node-adapter-pack-expansion");
}

const runtimeSet = new Set(review.packs.map((pack) => pack.runtime));
if (review.schemaVersion !== pythonNodeAdapterPackExpansionSchemaVersion || review.packs.length !== 2 || !runtimeSet.has("python") || !runtimeSet.has("node")) {
  failures.push("review must expose exactly the fixed Python and Node adapter packs");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      schemaVersion: pythonNodeAdapterPackExpansionSchemaVersion,
      summary: validation.checks,
      blockedCases: review.blockedSamples.length,
      failures: []
    },
    null,
    2
  )
);

function readText(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}
