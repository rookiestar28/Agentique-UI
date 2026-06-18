import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDifyDslYaml,
  parseLangGraphManifest,
  parseN8nWorkflowJson,
  sampleDifyDslYaml,
  sampleLangGraphManifest,
  sampleN8nWorkflowJson
} from "../src/core/platform-format-adapter.mjs";
import {
  assertNormalizationOutputSafe,
  normalizePlatformIntakeToWorkflowIr,
  platformIrNormalizationSchemaVersion,
  reviewPlatformIrNormalizerGate,
  workflowImportLossReportSchemaVersion
} from "../src/core/platform-ir-normalizer.mjs";
import { validateWorkflowIr } from "../src/core/workflow-ir.mjs";

test("first-class platform fixtures produce canonical workflow IR and loss reports", () => {
  const results = [
    normalizePlatformIntakeToWorkflowIr(parseN8nWorkflowJson(sampleN8nWorkflowJson)),
    normalizePlatformIntakeToWorkflowIr(parseDifyDslYaml(sampleDifyDslYaml)),
    normalizePlatformIntakeToWorkflowIr(parseLangGraphManifest(sampleLangGraphManifest))
  ];

  for (const result of results) {
    assert.equal(result.ok, true, result.platform);
    assert.equal(result.schemaVersion, platformIrNormalizationSchemaVersion);
    assert.equal(result.lossReport.schemaVersion, workflowImportLossReportSchemaVersion);
    assert.equal(result.boundary.noExecution, true);
    assert.equal(result.boundary.noSchedulerStart, true);
    assert.equal(result.boundary.grantsRuntimeCompatibility, false);
    assert.equal(validateWorkflowIr(result.workflowIr).ok, true);
    assertNormalizationOutputSafe(result);
  }
});

test("loss report distinguishes preserved normalized degraded blocked and handoff-only states", () => {
  const review = reviewPlatformIrNormalizerGate();
  const blocked = normalizePlatformIntakeToWorkflowIr(parseN8nWorkflowJson({
    ...sampleN8nWorkflowJson,
    connections: {
      "Manual Trigger": {
        main: [[{ node: "Missing Node", type: "main", index: 0 }]]
      }
    }
  }));
  const statuses = new Set([
    ...review.platformRows.flatMap((row) => [
      row.preserved > 0 ? "preserved" : "",
      row.normalized > 0 ? "normalized" : "",
      row.degraded > 0 ? "degraded" : "",
      row.handoffOnly > 0 ? "handoff-only" : ""
    ]),
    blocked.lossReport.summary.blocked > 0 ? "blocked" : ""
  ].filter(Boolean));

  assert.equal(review.ok, true);
  assert.equal(statuses.has("preserved"), true);
  assert.equal(statuses.has("normalized"), true);
  assert.equal(statuses.has("degraded"), true);
  assert.equal(statuses.has("handoff-only"), true);
  assert.equal(statuses.has("blocked"), true);
});

test("n8n normalization preserves source mapping while keeping expressions out of executable fields", () => {
  const result = normalizePlatformIntakeToWorkflowIr(parseN8nWorkflowJson(sampleN8nWorkflowJson));
  const serializedIr = JSON.stringify(result.workflowIr);

  assert.deepEqual(result.sourceMap.nodes.map((entry) => entry.sourceId), ["set-summary", "start"]);
  assert.ok(result.workflowIr.nodes.some((node) => node.type === "input"));
  assert.ok(result.workflowIr.nodes.some((node) => node.type === "transform"));
  assert.equal(serializedIr.includes("{{ $json.title }}"), false);
  assert.equal(result.lossReport.summary.normalized > 0, true);
  assert.equal(result.lossReport.summary.degraded > 0, true);
});

test("Dify and LangGraph platform-only semantics remain handoff-only", () => {
  const dify = normalizePlatformIntakeToWorkflowIr(parseDifyDslYaml(sampleDifyDslYaml));
  const langgraph = normalizePlatformIntakeToWorkflowIr(parseLangGraphManifest(sampleLangGraphManifest));

  assert.ok(dify.workflowIr.nodes.some((node) => node.type === "handoff"));
  assert.equal(dify.lossReport.semantics.some((entry) => entry.status === "handoff-only"), true);
  assert.equal(langgraph.lossReport.summary.handoffOnly, 1);
  assert.equal(JSON.stringify(langgraph).includes("./src/agent/graph.py"), false);
});

test("blocked adapter output does not produce workflow IR", () => {
  const blockedIntake = parseN8nWorkflowJson({
    ...sampleN8nWorkflowJson,
    connections: {
      "Manual Trigger": {
        main: [[{ node: "Missing Node", type: "main", index: 0 }]]
      }
    }
  });
  const result = normalizePlatformIntakeToWorkflowIr(blockedIntake);

  assert.equal(blockedIntake.ok, false);
  assert.equal(result.ok, false);
  assert.equal(result.workflowIr, null);
  assert.equal(result.lossReport.summary.blocked > 0, true);
});

test("normalization output is deterministic and path neutral", () => {
  const intake = parseLangGraphManifest(sampleLangGraphManifest);
  const first = normalizePlatformIntakeToWorkflowIr(intake);
  const second = normalizePlatformIntakeToWorkflowIr(intake);

  assert.deepEqual(first, second);
  assertNoUnsafeSerializedText(first, ["./src/agent", "../", ".env", "npm install", "pip install"]);
});

test("invalid normalizer input fails closed", () => {
  const result = normalizePlatformIntakeToWorkflowIr({ schemaVersion: "unknown" });

  assert.equal(result.ok, false);
  assert.equal(result.workflowIr, null);
  assert.equal(result.errors[0].code, "normalizer.invalid-schema");
});

function assertNoUnsafeSerializedText(report, values) {
  const serialized = JSON.stringify(report);
  for (const value of values) {
    assert.equal(serialized.includes(value), false, `serialized report leaked ${value}`);
  }
}
