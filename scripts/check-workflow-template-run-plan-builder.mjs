#!/usr/bin/env node
import fs from "node:fs";
import {
  requiredTemplateBuilderScenarios,
  reviewWorkflowTemplateRunPlanBuilder,
  workflowTemplateRunPlanBuilderSchemaVersion
} from "../src/core/workflow-template-run-plan-builder.mjs";

const failures = [];
const review = reviewWorkflowTemplateRunPlanBuilder();
const moduleText = readText("src/core/workflow-template-run-plan-builder.mjs");
const tests = readText("tests/workflow-template-run-plan-builder.test.mjs");
const hook = readText("src/app-state/useRunnerWorkspaceState.ts");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const graph = readText("src/workspaces/GraphWorkspace.tsx");
const panel = readText("src/workspaces/WorkflowTemplateRunPlanBuilderPanel.tsx");
const stageReporting = readText("src/core/validation-stage-reporting.mjs");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message ?? error.code));
}

requireIncludes(
  moduleText,
  [
    "agentique.workflowTemplateRunPlanBuilder.v1",
    "createWorkflowTemplateRunPlanBuilderSurface",
    "reviewWorkflowTemplateRunPlanBuilder",
    "validateWorkflowTemplateRunPlanBuilderSurface",
    "template-builder.raw-mutation-blocked",
    "reactFlowDependencyAdded: false",
    "rawExternalWorkflowMutation: false",
    "automaticExecution: false",
    "packageLifecycleEnabled: false"
  ],
  "workflow template run-plan builder module"
);

requireIncludes(
  tests,
  [
    "workflow template run-plan builder validation gate passes",
    "template catalog exposes deterministic local templates without raw external payloads",
    "selected template builds typed Agentique workflow IR only",
    "builder review covers capabilities secrets human gates artifacts rerun and graph state",
    "dry-run artifacts stay bounded redacted and path-neutral",
    "missing secrets and human gates fail closed",
    "builder preserves authority boundary without dependency or execution widening",
    "scenario controls and graph workspace wiring are present"
  ],
  "workflow template run-plan builder tests"
);

requireIncludes(
  hook,
  ["createWorkflowTemplateRunPlanBuilderSurface", "workflowTemplateRunPlanBuilderSurface", "handleWorkflowTemplateBuilderScenario"],
  "runner workspace state hook"
);
requireIncludes(route, ["workflowTemplateRunPlanBuilderSurface", "handleWorkflowTemplateBuilderScenario"], "graph/run workspace route");
requireIncludes(types, ["workflowTemplateRunPlanBuilderSurface", "onWorkflowTemplateBuilderScenario", "WorkflowTemplateBuilderScenario"], "run workspace prop types");
requireIncludes(graph, ["WorkflowTemplateRunPlanBuilderPanel", "workflowTemplateRunPlanBuilderSurface", "onWorkflowTemplateBuilderScenario"], "graph workspace builder mount");
requireIncludes(
  panel,
  [
    "Workflow template run-plan builder",
    "Template builder scenario actions",
    "workflowTemplateRunPlanBuilderSurface.scenarioControls.map",
    "onWorkflowTemplateBuilderScenario(scenario.id as WorkflowTemplateBuilderScenario)"
  ],
  "workflow template run-plan builder panel"
);
requireIncludes(stageReporting, ["validate:workflow-template-run-plan-builder"], "validation stage reporting");

if (!String(packageJson.scripts?.["validate:workflow-template-run-plan-builder"] ?? "").includes("check-workflow-template-run-plan-builder.mjs")) {
  failures.push("package scripts must define validate:workflow-template-run-plan-builder");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:workflow-template-run-plan-builder")) {
  failures.push("full validate script must include validate:workflow-template-run-plan-builder");
}

if (
  !review.checks.catalogComplete ||
  !review.checks.typedIrOnly ||
  !review.checks.capabilitySecretHumanGates ||
  !review.checks.artifactDescriptors ||
  !review.checks.failClosed ||
  !review.checks.noCapabilityWidening ||
  !review.checks.publicSafe
) {
  failures.push("workflow template builder gate must prove catalog, typed IR, gate coverage, artifact redaction, fail-closed behavior, no capability widening, and public safety");
}

if (review.surface.summary.templates < 3 || review.surface.scenarioControls.length !== requiredTemplateBuilderScenarios.length) {
  failures.push("workflow template builder must expose required templates and scenarios");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      schemaVersion: workflowTemplateRunPlanBuilderSchemaVersion,
      summary: review.surface.summary,
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
