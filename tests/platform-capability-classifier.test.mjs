import assert from "node:assert/strict";
import test from "node:test";
import { createGraphRunPlan } from "../src/core/graph-run-plan.mjs";
import {
  assertPlatformCapabilityOutputSafe,
  classifyPlatformIntakeCapabilities,
  platformCapabilityMatrixSchemaVersion,
  reviewPlatformCapabilityClassifierGate
} from "../src/core/platform-capability-classifier.mjs";
import {
  parseDifyDslYaml,
  parseLangGraphManifest,
  parseN8nWorkflowJson,
  platformAdapterIntakeSchemaVersion,
  sampleDifyDslYaml,
  sampleLangGraphManifest,
  sampleN8nWorkflowJson
} from "../src/core/platform-format-adapter.mjs";
import { normalizePlatformIntakeToWorkflowIr } from "../src/core/platform-ir-normalizer.mjs";

const primaryClassifications = new Set(["executable", "permission-required", "blocked", "handoff-only"]);
const neverLocalFamilies = new Set([
  "code",
  "shell-process",
  "package-manager",
  "container",
  "browser-data",
  "ambient-environment",
  "downloaded-workflow",
  "unknown-provider"
]);

test("first-class platform samples produce deterministic capability matrices", () => {
  const reports = [
    classifyPlatformIntakeCapabilities(parseN8nWorkflowJson(sampleN8nWorkflowJson)),
    classifyPlatformIntakeCapabilities(parseDifyDslYaml(sampleDifyDslYaml)),
    classifyPlatformIntakeCapabilities(parseLangGraphManifest(sampleLangGraphManifest))
  ];

  for (const report of reports) {
    assert.equal(report.schemaVersion, platformCapabilityMatrixSchemaVersion);
    assert.equal(report.boundary.noExecution, true);
    assert.equal(report.boundary.grantsRuntimeCompatibility, false);
    assert.equal(report.nodeClassifications.length, report.summary.nodes);
    assertPlatformCapabilityOutputSafe(report);
  }

  assert.equal(reports[0].decision, "permission-required");
  assert.equal(reports[1].summary.handoffOnly > 0, true);
  assert.equal(reports[2].summary.handoffOnly, 1);
});

test("every imported node receives exactly one primary classification", () => {
  const report = classifyPlatformIntakeCapabilities(createCoverageIntake());

  assert.equal(report.summary.nodes, 20);
  assert.equal(report.nodeClassifications.every((node) => primaryClassifications.has(node.primaryClassification)), true);
  assert.equal(report.nodeClassifications.every((node) => typeof node.primaryClassification === "string"), true);
  assert.equal(new Set(report.nodeClassifications.map((node) => node.sourceFamily)).size, 20);
});

test("unsafe platform node families cannot become local executable", () => {
  const report = classifyPlatformIntakeCapabilities(createCoverageIntake());
  const unsafeNodes = report.nodeClassifications.filter((node) => neverLocalFamilies.has(node.sourceFamily));

  assert.equal(unsafeNodes.length, neverLocalFamilies.size);
  assert.equal(unsafeNodes.every((node) => node.primaryClassification !== "executable"), true);
  assert.equal(unsafeNodes.every((node) => node.executionLane === "blocked"), true);
});

test("credentialed networked provider and external-effect nodes require permission or handoff", () => {
  const report = classifyPlatformIntakeCapabilities(createCoverageIntake());
  const byFamily = new Map(report.nodeClassifications.map((node) => [node.sourceFamily, node]));

  assert.equal(byFamily.get("credentialed-operation").primaryClassification, "permission-required");
  assert.deepEqual(byFamily.get("credentialed-operation").permissionFamilies, ["secrets", "externalProviders"]);
  assert.equal(byFamily.get("http-api").primaryClassification, "permission-required");
  assert.equal(byFamily.get("filesystem").primaryClassification, "permission-required");
  assert.equal(byFamily.get("tool-provider").primaryClassification, "permission-required");
  assert.equal(byFamily.get("external-effect").primaryClassification, "permission-required");
  assert.equal(byFamily.get("model-provider").primaryClassification, "handoff-only");
  assert.equal(byFamily.get("external-runtime").primaryClassification, "handoff-only");
});

test("capability metadata flows into canonical IR and graph run-plan evidence", () => {
  const n8n = normalizePlatformIntakeToWorkflowIr(parseN8nWorkflowJson(sampleN8nWorkflowJson));
  const dify = normalizePlatformIntakeToWorkflowIr(parseDifyDslYaml(sampleDifyDslYaml));
  const langgraph = normalizePlatformIntakeToWorkflowIr(parseLangGraphManifest(sampleLangGraphManifest));
  const n8nPlan = createGraphRunPlan(n8n.workflowIr);
  const difyPlan = createGraphRunPlan(dify.workflowIr);
  const langgraphPlan = createGraphRunPlan(langgraph.workflowIr);

  const credentialed = n8nPlan.nodePlans.find((node) => node.sourceFamily === "credentialed-operation");
  const provider = difyPlan.nodePlans.find((node) => node.sourceFamily === "model-provider");
  const externalRuntime = langgraphPlan.nodePlans.find((node) => node.sourceFamily === "external-runtime");

  assert.equal(n8n.workflowIr.nodes.every((node) => node.capability?.schemaVersion === "agentique.platformNodeCapability.v1"), true);
  assert.equal(credentialed.classification, "permission-required");
  assert.equal(credentialed.executionLane, "signed-adapter-review");
  assert.equal(provider.classification, "handoff-only");
  assert.equal(provider.handoffDescriptor.localExecutionAllowed, false);
  assert.equal(externalRuntime.classification, "handoff-only");
  assert.equal(langgraph.capabilityMatrix.summary.handoffOnly, 1);
});

test("classifier review gate covers all required node families", () => {
  const review = reviewPlatformCapabilityClassifierGate();

  assert.equal(review.ok, true);
  assert.equal(review.summary.sourceFamilies >= 18, true);
  assert.equal(review.errors.length, 0);
});

function createCoverageIntake() {
  const nodes = [
    node("manual", "n8n-nodes-base.manualTrigger", { trigger: true }),
    node("transform", "n8n-nodes-base.set"),
    node("credentialed", "n8n-nodes-base.set", { credentials: [{ kind: "api", ref: "redacted:vault-reference" }] }),
    node("model", "dify.llm", { providerRequirements: ["openai"] }),
    node("http", "n8n-nodes-base.httpRequest"),
    node("file", "n8n-nodes-base.readWriteFile"),
    node("code", "n8n-nodes-base.code"),
    node("shell", "n8n-nodes-base.executeCommand"),
    node("package", "n8n-nodes-base.packageManager"),
    node("container", "n8n-nodes-base.docker"),
    node("browser", "n8n-nodes-base.browserSession"),
    node("env", "n8n-nodes-base.environment"),
    node("download", "n8n-nodes-base.downloadedWorkflow"),
    node("tool", "dify.tool"),
    node("subflow", "n8n-nodes-base.executeWorkflow"),
    node("approval", "n8n-nodes-base.humanApproval"),
    node("retry", "n8n-nodes-base.retry"),
    node("external", "langgraph-entrypoint"),
    node("unknown", "dify.llm", { providerRequirements: ["unknown_vendor"] }),
    node("effect", "n8n-nodes-base.externalEffect")
  ];
  return {
    ok: true,
    schemaVersion: platformAdapterIntakeSchemaVersion,
    platform: "n8n",
    decision: "accepted",
    source: {
      platformLabel: "n8n",
      format: "json",
      version: "coverage",
      name: "capability coverage",
      preserved: { originalNodeIds: nodes.map((entry) => entry.originalId), originalEdgeIds: [], unsupportedKeys: [] }
    },
    boundary: { parseOnly: true, noExecution: true },
    summary: {
      nodes: nodes.length,
      edges: 0,
      credentialReferences: 1,
      expressions: 0,
      triggers: 1,
      unsupportedMetadata: 0,
      blockedFindings: 0
    },
    nodes,
    edges: [],
    unsupported: [],
    errors: []
  };
}

function node(id, type, overrides = {}) {
  return {
    id,
    originalId: id,
    label: id,
    type,
    platformType: type,
    classification: "handoff-only",
    trigger: false,
    position: null,
    credentials: [],
    expressions: [],
    providerRequirements: [],
    unsupportedMetadata: [],
    ...overrides
  };
}
