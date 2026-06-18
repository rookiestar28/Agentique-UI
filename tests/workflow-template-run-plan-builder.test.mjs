import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import {
  createWorkflowTemplateRunPlanBuilderScenario,
  createWorkflowTemplateRunPlanBuilderSurface,
  requiredTemplateBuilderScenarios,
  reviewWorkflowTemplateRunPlanBuilder,
  validateWorkflowTemplateRunPlanBuilderSurface,
  workflowTemplateRunPlanBuilderSchemaVersion
} from "../src/core/workflow-template-run-plan-builder.mjs";

test("workflow template run-plan builder validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-workflow-template-run-plan-builder.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);

  assert.equal(result.status, "passed");
  assert.equal(result.schemaVersion, workflowTemplateRunPlanBuilderSchemaVersion);
  assert.equal(result.summary.templates >= 3, true);
  assert.equal(result.summary.interactionViewports, 2);
});

test("template catalog exposes deterministic local templates without raw external payloads", () => {
  const surface = createWorkflowTemplateRunPlanBuilderSurface();

  assert.equal(surface.schemaVersion, workflowTemplateRunPlanBuilderSchemaVersion);
  assert.equal(surface.templates.length >= 3, true);
  assert.equal(
    surface.templates.every((template) => template.localOnly === true && template.rawThirdPartyPayload === false && template.reviewOnly === true),
    true
  );
  assert.equal(
    surface.templates.every((template) => template.graphState && template.capabilitySummary && template.humanGateSummary && template.secretReferenceSummary),
    true
  );
});

test("selected template builds typed Agentique workflow IR only", () => {
  const surface = createWorkflowTemplateRunPlanBuilderSurface({ scenario: "approval-template" });

  assert.equal(surface.selectedTemplate.id, "approval-review-template");
  assert.equal(surface.workflowIr.schemaVersion, "agentique.workflowIr.v1");
  assert.equal(surface.builder.rawExternalMutation.accepted, false);
  assert.equal(surface.builder.rawExternalMutation.code, "template-builder.raw-mutation-blocked");
  assert.doesNotMatch(JSON.stringify(surface), /"rawPayload"|import-raw-external|mutate-raw/iu);
});

test("builder review covers capabilities secrets human gates artifacts rerun and graph state", () => {
  const surface = createWorkflowTemplateRunPlanBuilderSurface({ scenario: "approval-template" });

  assert.equal(surface.runPlan.status, "permission-required");
  assert.equal(surface.capabilityReview.required.length >= 1, true);
  assert.equal(surface.secretReview.references.length >= 1, true);
  assert.equal(surface.humanGateReview.gates.length >= 1, true);
  assert.equal(surface.dryRun.resultArtifacts.length >= 1, true);
  assert.equal(surface.rerunEligibility.eligible, false);
  assert.equal(surface.graphState.nodes >= 1, true);
  assert.equal(validateWorkflowTemplateRunPlanBuilderSurface(surface).ok, true);
});

test("dry-run artifacts stay bounded redacted and path-neutral", () => {
  const surface = createWorkflowTemplateRunPlanBuilderSurface({ scenario: "artifact-template" });
  const text = JSON.stringify(surface.dryRun);

  assert.equal(
    surface.dryRun.resultArtifacts.every((artifact) => artifact.redacted === true && artifact.pathNeutral === true && artifact.includesRawBytes === false),
    true
  );
  assert.doesNotMatch(text, /[A-Z]:[\\/]/u);
  assert.doesNotMatch(text, /\/Users\/|\/home\//u);
  assert.doesNotMatch(text, /https:\/\/[^"]+\?(?:[^"]*signature|[^"]*token)/iu);
});

test("missing secrets and human gates fail closed", () => {
  const missingSecret = createWorkflowTemplateRunPlanBuilderScenario("missing-secret");
  const humanGate = createWorkflowTemplateRunPlanBuilderScenario("human-gate");

  assert.equal(missingSecret.secretReview.status, "blocked");
  assert.equal(missingSecret.rerunEligibility.eligible, false);
  assert.equal(humanGate.humanGateReview.status, "approval-required");
  assert.equal(humanGate.rerunEligibility.eligible, false);
});

test("builder preserves authority boundary without dependency or execution widening", () => {
  const review = reviewWorkflowTemplateRunPlanBuilder();
  const boundary = review.surface.boundary;

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(boundary.reactFlowDependencyAdded, false);
  assert.equal(boundary.rawExternalWorkflowMutation, false);
  assert.equal(boundary.automaticExecution, false);
  assert.equal(boundary.packageLifecycleEnabled, false);
  assert.equal(boundary.genericShellOrProcess, false);
  assert.equal(boundary.browserDataEnabled, false);
  assert.equal(boundary.ambientEnvEnabled, false);
  assert.equal(boundary.containerStartEnabled, false);
  assert.equal(boundary.externalProviderAutomationEnabled, false);
});

test("scenario controls and graph workspace wiring are present", () => {
  const scenarios = requiredTemplateBuilderScenarios.map(createWorkflowTemplateRunPlanBuilderScenario);
  const selected = new Set(scenarios.map((surface) => surface.activeScenario));
  const route = fs.readFileSync("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx", "utf8");
  const graph = fs.readFileSync("src/workspaces/GraphWorkspace.tsx", "utf8");
  const state = fs.readFileSync("src/app-state/useRunnerWorkspaceState.ts", "utf8");
  const panel = fs.readFileSync("src/workspaces/WorkflowTemplateRunPlanBuilderPanel.tsx", "utf8");

  for (const scenario of requiredTemplateBuilderScenarios) {
    assert.equal(selected.has(scenario), true, scenario);
  }
  assert.match(panel, /aria-label="Workflow template run-plan builder"/u);
  assert.match(panel, /aria-label="Template builder scenario actions"/u);
  assert.match(route, /workflowTemplateRunPlanBuilderSurface/u);
  assert.match(graph, /WorkflowTemplateRunPlanBuilderPanel/u);
  assert.match(state, /createWorkflowTemplateRunPlanBuilderSurface/u);
});
