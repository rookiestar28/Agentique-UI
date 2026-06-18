import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAdapterOutputSafe,
  parseDifyDslYaml,
  parseLangGraphManifest,
  parseN8nWorkflowJson,
  parsePlatformWorkflow,
  platformAdapterIntakeSchemaVersion,
  reviewPlatformFormatAdapterGate,
  sampleDifyDslYaml,
  sampleLangGraphManifest,
  sampleN8nWorkflowJson
} from "../src/core/platform-format-adapter.mjs";

test("platform adapter review accepts n8n Dify and LangGraph samples as parse-only data", () => {
  const review = reviewPlatformFormatAdapterGate();

  assert.equal(review.ok, true);
  assert.equal(review.schemaVersion, "agentique.platformAdapterReview.v1");
  assert.equal(review.boundary.parseOnly, true);
  assert.equal(review.boundary.noExecution, true);
  assert.equal(review.boundary.noNetwork, true);
  assert.equal(review.boundary.noPackageInstall, true);
  assert.equal(review.summary.platforms, 3);
  assert.equal(review.summary.accepted, 3);
  assert.deepEqual(review.platformRows.map((row) => row.platform), ["n8n", "dify", "langgraph"]);
  assertNoUnsafeSerializedText(review, ["./src/agent", "../", ".env", "sk-"]);
});

test("n8n workflow JSON preserves ids edges credentials and expressions without execution", () => {
  const report = parseN8nWorkflowJson(sampleN8nWorkflowJson);

  assert.equal(report.ok, true);
  assert.equal(report.schemaVersion, platformAdapterIntakeSchemaVersion);
  assert.equal(report.platform, "n8n");
  assert.equal(report.source.format, "json");
  assert.equal(report.boundary.noExecution, true);
  assert.deepEqual(report.source.preserved.originalNodeIds, ["set-summary", "start"]);
  assert.equal(report.summary.nodes, 2);
  assert.equal(report.summary.edges, 1);
  assert.equal(report.summary.credentialReferences, 1);
  assert.equal(report.summary.expressions, 1);
  assert.ok(report.nodes.every((node) => node.classification === "handoff-only"));
  assertAdapterOutputSafe(report);
});

test("Dify DSL YAML preserves graph topology provider metadata and template expressions", () => {
  const report = parseDifyDslYaml(sampleDifyDslYaml);

  assert.equal(report.ok, true);
  assert.equal(report.platform, "dify");
  assert.equal(report.source.format, "yaml");
  assert.deepEqual(report.source.preserved.originalNodeIds, ["answer", "start"]);
  assert.equal(report.summary.nodes, 2);
  assert.equal(report.summary.edges, 1);
  assert.equal(report.summary.triggers, 1);
  assert.ok(report.nodes.some((node) => node.providerRequirements.includes("openai")));
  assert.ok(report.nodes.some((node) => node.expressions.some((expression) => expression.includes("{{#sys.query#}}"))));
  assertAdapterOutputSafe(report);
});

test("LangGraph manifest preserves graph names while redacting platform source references", () => {
  const report = parseLangGraphManifest(sampleLangGraphManifest);

  assert.equal(report.ok, true);
  assert.equal(report.platform, "langgraph");
  assert.equal(report.source.name, "langgraph.json");
  assert.deepEqual(report.source.preserved.originalNodeIds, ["agent"]);
  assert.equal(report.nodes[0].sourceReferences[0].kind, "python-entrypoint");
  assert.equal(report.nodes[0].sourceReferences[0].redacted, "redacted:platform-source-reference");
  assert.equal(report.nodes[0].providerRequirements.includes("local-project-reference"), true);
  assertNoUnsafeSerializedText(report, ["./src/agent/graph.py"]);
  assertAdapterOutputSafe(report);
});

test("dispatcher infers supported formats and rejects unsupported input", () => {
  assert.equal(parsePlatformWorkflow(sampleN8nWorkflowJson).platform, "n8n");
  assert.equal(parsePlatformWorkflow(sampleDifyDslYaml).platform, "dify");
  assert.equal(parsePlatformWorkflow(sampleLangGraphManifest).platform, "langgraph");

  const rejected = parsePlatformWorkflow("not a supported workflow");
  assert.equal(rejected.ok, false);
  assert.equal(rejected.errors[0].code, "platform.unsupported");
});

test("malformed invalid and ambiguous platform input fails closed", () => {
  assert.equal(parseN8nWorkflowJson("{").errors[0].code, "platform.invalid-json");
  assert.equal(parseDifyDslYaml("workflow: [").errors[0].code, "platform.invalid-yaml");
  assert.equal(parseLangGraphManifest({ dependencies: [] }).ok, false);

  const duplicate = parseN8nWorkflowJson({
    ...sampleN8nWorkflowJson,
    nodes: [
      sampleN8nWorkflowJson.nodes[0],
      { ...sampleN8nWorkflowJson.nodes[1], id: "start" }
    ]
  });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.errors.some((error) => error.code === "platform.duplicate-node"));
});

test("dangling edges cycles and executable nodes are blocked", () => {
  const dangling = parseN8nWorkflowJson({
    ...sampleN8nWorkflowJson,
    connections: {
      "Manual Trigger": {
        main: [[{ node: "Missing Node", type: "main", index: 0 }]]
      }
    }
  });
  assert.equal(dangling.ok, false);
  assert.ok(dangling.errors.some((error) => error.code === "platform.dangling-edge"));

  const cycle = parseDifyDslYaml([
    "workflow:",
    "  graph:",
    "    nodes:",
    "      - id: a",
    "        data: { title: A, type: start }",
    "      - id: b",
    "        data: { title: B, type: llm }",
    "    edges:",
    "      - { id: ab, source: a, target: b }",
    "      - { id: ba, source: b, target: a }",
    ""
  ].join("\n"));
  assert.equal(cycle.ok, false);
  assert.ok(cycle.errors.some((error) => error.code === "platform.cycle"));

  const executable = parseN8nWorkflowJson({
    ...sampleN8nWorkflowJson,
    nodes: [
      sampleN8nWorkflowJson.nodes[0],
      {
        id: "shell",
        name: "Shell",
        type: "n8n-nodes-base.executeCommand",
        position: [100, 0],
        parameters: { command: "echo safe" }
      }
    ],
    connections: {}
  });
  assert.equal(executable.ok, false);
  assert.ok(executable.errors.some((error) => error.code === "platform.executable-node"));
});

test("oversized secrets traversal environment and container markers fail before preservation", () => {
  assert.equal(parseN8nWorkflowJson(sampleN8nWorkflowJson, { maxBytes: 10 }).errors[0].code, "platform.oversized");

  const secret = parseN8nWorkflowJson({
    ...sampleN8nWorkflowJson,
    nodes: [
      {
        id: "secret",
        name: "Secret",
        type: "n8n-nodes-base.set",
        position: [0, 0],
        parameters: {
          header: `Authorization: Bearer ${"a".repeat(20)}`
        }
      }
    ],
    connections: {}
  });
  assert.equal(secret.errors[0].code, "platform.inline-secret");
  assertNoUnsafeSerializedText(secret, ["Bearer", "aaaaaaaa"]);

  const traversal = parseLangGraphManifest({
    graphs: {
      agent: "../agent/graph.py:graph"
    },
    dependencies: []
  });
  assert.equal(traversal.errors[0].code, "platform.unsafe-path");

  const env = parseLangGraphManifest({
    graphs: {
      agent: "./src/agent/graph.py:graph"
    },
    env: ".env"
  });
  assert.equal(env.errors[0].code, "platform.env-reference");

  const container = parseLangGraphManifest({
    graphs: {
      agent: "./src/agent/graph.py:graph"
    },
    dockerfile: "Dockerfile"
  });
  assert.equal(container.errors[0].code, "platform.executable-marker");
});

test("adapter output safety rejects private paths and inline secrets", () => {
  assert.throws(
    () => assertAdapterOutputSafe({ value: ["C:", "Users", "example"].join("\\") }),
    (error) => error.code === "platform.output-unsafe-path"
  );
  assert.throws(
    () => assertAdapterOutputSafe({ value: `sk-${"a".repeat(20)}` }),
    /inline sensitive/u
  );
});

function assertNoUnsafeSerializedText(report, values) {
  const serialized = JSON.stringify(report);
  for (const value of values) {
    assert.equal(serialized.includes(value), false, `serialized report leaked ${value}`);
  }
}
