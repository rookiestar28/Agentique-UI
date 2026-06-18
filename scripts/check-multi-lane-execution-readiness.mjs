#!/usr/bin/env node
import fs from "node:fs";
import { reviewMultiLaneExecutionReadinessGate } from "../src/core/multi-lane-execution-readiness.mjs";

const failures = [];
const review = reviewMultiLaneExecutionReadinessGate();
const moduleText = readText("src/core/multi-lane-execution-readiness.mjs");
const tests = readText("tests/multi-lane-execution-readiness.test.mjs");
const contract = readText("docs/contracts/multi-lane-execution-readiness.md");
const hook = readText("src/app-state/useRunnerWorkspaceState.ts");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const workspace = readText("src/workspaces/RunWorkspace.tsx");
const panel = readText("src/workspaces/MultiLaneExecutionReadinessPanel.tsx");
const validationStages = readText("src/core/validation-stage-reporting.mjs");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message ?? error.code));
}

requireIncludes(
  moduleText,
  [
    "agentique.multiLaneExecutionReadiness.v1",
    "createMultiLaneExecutionReadinessMatrix",
    "createMultiLaneExecutionReadinessSurface",
    "reviewMultiLaneExecutionReadinessGate",
    "assertMultiLaneExecutionReadinessSafe",
    "deno-sandbox-gate-missing",
    "wasm-runtime-evidence-missing",
    "container-start-disabled",
    "additional-adapter-family",
    "executionEnabled: false",
    "executesDownloadedWorkflow: false",
    "runsPackageLifecycle: false",
    "adapterSignature",
    "provenance",
    "license"
  ],
  "multi-lane readiness module"
);

requireIncludes(
  tests,
  [
    "readiness matrix includes deno wasm container and adapter-family lanes",
    "future and unproven lanes remain disabled by default with blocker codes",
    "each lane records sandbox permission watchdog artifact license provenance and signature requirements",
    "unsupported lane claims and arbitrary downloaded workflow execution fail closed",
    "surface exposes evidence-only matrix summary for run workspace",
    "multi-lane readiness gate proves disabled future lanes and no overclaiming"
  ],
  "multi-lane readiness tests"
);

requireIncludes(
  contract,
  [
    "Multi-Lane Execution Readiness",
    "Deno",
    "WASM/WASI",
    "rootless container",
    "disabled-by-default",
    "license/provenance",
    "adapter signature",
    "arbitrary downloaded workflow execution"
  ],
  "multi-lane readiness contract"
);

requireIncludes(hook, ["createMultiLaneExecutionReadinessSurface", "multiLaneExecutionReadinessSurface"], "runner state multi-lane wiring");
requireIncludes(route, ["multiLaneExecutionReadinessSurface"], "graph/run route multi-lane wiring");
requireIncludes(types, ["multiLaneExecutionReadinessSurface"], "run workspace prop types");
requireIncludes(workspace, ["MultiLaneExecutionReadinessPanel", "multiLaneExecutionReadinessSurface"], "run workspace multi-lane mount");
requireIncludes(
  panel,
  ['aria-label="Multi-lane execution readiness matrix"', 'aria-label="Multi-lane disabled future lanes"', 'aria-label="Multi-lane side-effect boundary"'],
  "multi-lane readiness panel"
);
requireIncludes(validationStages, ["validate:multi-lane-execution-readiness"], "validation stage reporting manifest");

if (!String(packageJson.scripts?.["validate:multi-lane-execution-readiness"] ?? "").includes("check-multi-lane-execution-readiness.mjs")) {
  failures.push("package scripts must define validate:multi-lane-execution-readiness");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:multi-lane-execution-readiness")) {
  failures.push("full validate script must include validate:multi-lane-execution-readiness");
}

for (const [check, value] of Object.entries(review.checks)) {
  if (value !== true) failures.push(`multi-lane readiness gate check failed: ${check}`);
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
        "src/core/multi-lane-execution-readiness.mjs",
        "tests/multi-lane-execution-readiness.test.mjs",
        "docs/contracts/multi-lane-execution-readiness.md",
        "src/app-state/useRunnerWorkspaceState.ts",
        "src/workspaces/MultiLaneExecutionReadinessPanel.tsx",
        "src/core/validation-stage-reporting.mjs",
        "package.json"
      ],
      summary: review.summary
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
