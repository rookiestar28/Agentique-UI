import assert from "node:assert/strict";
import test from "node:test";
import { sampleWorkflowIr, summarizeWorkflow, validateWorkflowIr } from "../src/core/workflow-ir.mjs";

test("sample workflow IR summarizes typed graph content", () => {
  const result = validateWorkflowIr(sampleWorkflowIr);
  assert.equal(result.ok, false);
  assert.equal(result.summary.nodes, 5);
  assert.equal(result.summary.edges, 4);
  assert.equal(result.summary.highRisk, 1);
  assert.equal(result.summary.requiredCredentials, 1);
  assert.equal(result.summary.unsupportedNodes, 1);
  assert.ok(result.errors.some((error) => error.code === "workflow.unsupported-node"));
});

test("supported graph validates without unsupported-node failures", () => {
  const ir = {
    ...sampleWorkflowIr,
    nodes: sampleWorkflowIr.nodes.map((node) => node.id === "provider-sync" ? { ...node, type: "handoff" } : node)
  };
  const result = validateWorkflowIr(ir);
  assert.equal(result.ok, true);
  assert.equal(summarizeWorkflow(ir).nodes, 5);
});

test("invalid edges and unsafe credential fields fail closed", () => {
  const invalidEdge = validateWorkflowIr({
    ...sampleWorkflowIr,
    nodes: sampleWorkflowIr.nodes.map((node) => node.id === "provider-sync" ? { ...node, type: "handoff" } : node),
    edges: [{ from: "missing", to: "intent", label: "bad" }]
  });
  assert.equal(invalidEdge.ok, false);
  assert.ok(invalidEdge.errors.some((error) => error.code === "workflow.invalid-edge"));

  const unsafe = validateWorkflowIr({
    ...sampleWorkflowIr,
    nodes: [{ id: "unsafe", type: "input", label: "Unsafe", inputs: [], outputs: [], risk: "low", credentialValue: "not-a-reference" }],
    edges: []
  });
  assert.equal(unsafe.ok, false);
  assert.ok(unsafe.errors.some((error) => error.code === "vault.inline-secret"));
});

