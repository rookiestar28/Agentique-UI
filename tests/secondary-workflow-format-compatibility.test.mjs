import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertSecondaryWorkflowFormatCompatibilitySafe,
  createSecondaryWorkflowFormatCompatibilityBacklog,
  reviewSecondaryWorkflowFormatCompatibilityGate,
  secondaryWorkflowFormatCompatibilitySchemaVersion
} from "../src/core/secondary-workflow-format-compatibility.mjs";

const requiredIds = [
  "node-red",
  "serverless-workflow",
  "argo-workflows",
  "flowise",
  "langflow",
  "github-actions",
  "airflow",
  "bpmn",
  "haystack",
  "kestra",
  "autogen",
  "llamaindex-workflows",
  "crewai"
];

test("secondary workflow format backlog covers every candidate with decision rows", () => {
  const backlog = createSecondaryWorkflowFormatCompatibilityBacklog();
  const ids = new Set(backlog.candidates.map((row) => row.id));

  assert.equal(backlog.schemaVersion, secondaryWorkflowFormatCompatibilitySchemaVersion);
  for (const id of requiredIds) {
    assert.equal(ids.has(id), true, id);
  }
  for (const row of backlog.candidates) {
    assert.equal(row.decision, "no-go-for-early-support");
    assert.ok(["low", "medium", "high"].includes(row.riskLevel));
    assert.equal(row.sourceReferences.length >= 1, true, row.id);
    assert.equal(row.securityConstraints.length >= 1, true, row.id);
  }
});

test("secondary formats remain backlog reference only with no UI support claims", () => {
  const backlog = createSecondaryWorkflowFormatCompatibilityBacklog();

  assert.deepEqual(backlog.firstClassImportFormats, ["n8n", "dify", "langgraph"]);
  assert.equal(backlog.summary.goDecisions, 0);
  assert.equal(backlog.summary.exposedSupportedImports, 0);
  assert.equal(backlog.candidates.every((row) => row.supportState === "backlog-reference-only"), true);
  assert.equal(backlog.candidates.every((row) => row.supportedImport === false), true);
  assert.equal(backlog.candidates.every((row) => row.earlySupportPromise === false), true);
  assert.equal(backlog.candidates.every((row) => row.exposedInUi === false), true);
});

test("promotion evidence remains closed until adapter tests loss reports capability mapping and fixtures exist", () => {
  const backlog = createSecondaryWorkflowFormatCompatibilityBacklog();

  assert.ok(backlog.promotionCriteria.includes("adapter tests"));
  assert.ok(backlog.promotionCriteria.includes("loss report mapping"));
  assert.ok(backlog.promotionCriteria.includes("capability classification"));
  assert.ok(backlog.promotionCriteria.includes("public-safe fixtures"));
  assert.ok(backlog.promotionCriteria.includes("UI exposure review"));
  for (const row of backlog.candidates) {
    assert.deepEqual(row.promotionEvidence, {
      adapterTests: false,
      lossReports: false,
      capabilityMapping: false,
      publicSafeFixtures: false
    });
  }
});

test("platform adapter and import workspace do not expose secondary formats as supported imports", () => {
  const adapter = fs.readFileSync("src/core/platform-format-adapter.mjs", "utf8");
  const importer = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");

  assert.match(adapter, /supportedPlatforms = new Set\(\["n8n", "dify", "langgraph"\]\)/u);
  for (const label of ["Node-RED", "Serverless Workflow", "Argo Workflows", "Flowise", "Langflow", "GitHub Actions", "Airflow", "BPMN", "Haystack", "Kestra", "AutoGen", "LlamaIndex", "CrewAI"]) {
    assert.doesNotMatch(adapter, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.doesNotMatch(importer, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("secondary workflow format compatibility safety rejects secrets paths commands internal markers and support claims", () => {
  const unsafeValues = [
    { value: `sk-${"a".repeat(20)}` },
    { path: ["C:", "Users", "example"].join("\\") },
    { action: "npm run unsafe" },
    { internal: [[".", "planning"].join("")] },
    { internal: [["reference", "docs"].join("/")] },
    { internal: [["AUI", "EXEC"].join("-")] },
    { internal: [["road", "map"].join("")] },
    { candidate: { supportedImport: true } },
    { candidate: { exposedInUi: true } },
    { candidate: { localExecutionEnabled: true } }
  ];

  for (const unsafe of unsafeValues) {
    assert.throws(
      () => assertSecondaryWorkflowFormatCompatibilitySafe(unsafe),
      (error) => [
        "vault.inline-secret",
        "secondary-format-compatibility.unsafe-path",
        "secondary-format-compatibility.command-text",
        "secondary-format-compatibility.private-marker",
        "secondary-format-compatibility.support-claim"
      ].includes(error.code)
    );
  }
});

test("secondary workflow format compatibility review gate passes", () => {
  const review = reviewSecondaryWorkflowFormatCompatibilityGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.requiredCandidatesCovered, true);
  assert.equal(review.checks.noUiSupportExposure, true);
  assert.equal(review.checks.promotionEvidenceClosed, true);
  assert.equal(review.checks.firstClassOnly, true);
});
