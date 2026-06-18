import assert from "node:assert/strict";
import test from "node:test";
import {
  applyWorkflowEdit,
  createWorkflowEditorState,
  diffWorkflowStates,
  exportWorkflowEditorState,
  importWorkflowEditorState,
  redoWorkflowEdit,
  sampleWorkflowEditorState,
  undoWorkflowEdit
} from "../src/core/workflow-editor.mjs";
import { sampleWorkflowIr } from "../src/core/workflow-ir.mjs";

function supportedWorkflow() {
  return {
    ...sampleWorkflowIr,
    nodes: sampleWorkflowIr.nodes.map((node) => (
      node.id === "provider-sync" ? { ...node, type: "handoff" } : node
    ))
  };
}

test("sample editor state reports compatibility warnings without execution", () => {
  assert.equal(sampleWorkflowEditorState.operationMode, "describe-only");
  assert.equal(sampleWorkflowEditorState.safety.willExecute, false);
  assert.equal(sampleWorkflowEditorState.safety.startsBridge, false);
  assert.equal(sampleWorkflowEditorState.validation.ok, false);
  assert.ok(sampleWorkflowEditorState.compatibilityWarnings.some((warning) => warning.code === "workflow.unsupported-node"));
});

test("workflow edit adds a node, connects an edge, and records diff history", () => {
  const state = createWorkflowEditorState(supportedWorkflow(), { createdAt: "2026-06-11T00:00:00.000Z" });
  const added = applyWorkflowEdit(state, {
    type: "add-node",
    node: {
      id: "summary",
      type: "viewer",
      label: "Summary viewer",
      inputs: ["handoffDescriptor"],
      outputs: ["summaryArtifact"],
      risk: "low",
      credentials: []
    }
  }, { updatedAt: "2026-06-11T00:01:00.000Z" });

  assert.equal(added.ok, true);
  assert.equal(added.state.present.nodes.length, 6);
  assert.deepEqual(added.diff.addedNodes, ["summary"]);
  assert.equal(added.state.past.length, 1);

  const connected = applyWorkflowEdit(added.state, {
    type: "connect-edge",
    from: "handoff",
    to: "summary",
    label: "handoffDescriptor"
  });

  assert.equal(connected.ok, true);
  assert.deepEqual(connected.diff.addedEdges, ["handoff->summary:handoffDescriptor"]);
  assert.equal(connected.state.future.length, 0);
});

test("undo and redo are deterministic", () => {
  const state = createWorkflowEditorState(supportedWorkflow());
  const added = applyWorkflowEdit(state, {
    type: "add-node",
    node: {
      id: "audit",
      type: "transform",
      label: "Audit summary",
      inputs: ["handoffDescriptor"],
      outputs: ["auditArtifact"],
      risk: "low",
      credentials: []
    }
  });

  const undone = undoWorkflowEdit(added.state);
  assert.equal(undone.present.nodes.some((node) => node.id === "audit"), false);
  assert.equal(undone.future.length, 1);

  const redone = redoWorkflowEdit(undone);
  assert.equal(redone.present.nodes.some((node) => node.id === "audit"), true);
  assert.equal(redone.future.length, 0);
});

test("invalid edits fail closed and leave current state unchanged", () => {
  const state = createWorkflowEditorState(supportedWorkflow());
  const invalidEdge = applyWorkflowEdit(state, {
    type: "connect-edge",
    from: "missing",
    to: "handoff",
    label: "bad"
  });

  assert.equal(invalidEdge.ok, false);
  assert.equal(invalidEdge.state.present.nodes.length, state.present.nodes.length);
  assert.ok(invalidEdge.errors.some((error) => error.code === "workflow-editor.validation-blocked"));

  const blockedRawMutation = applyWorkflowEdit(state, {
    type: "mutate-raw",
    rawFormat: "n8n",
    rawPayload: { nodes: [] }
  });

  assert.equal(blockedRawMutation.ok, false);
  assert.ok(blockedRawMutation.errors.some((error) => error.code === "workflow-editor.raw-mutation-blocked"));
});

test("exports are redacted and can be imported as describe-only state", () => {
  const state = createWorkflowEditorState(supportedWorkflow());
  const exported = exportWorkflowEditorState(state, { exportedAt: "2026-06-11T00:02:00.000Z" });

  assert.equal(exported.ok, true);
  assert.equal(exported.descriptor.safety.willExecute, false);
  assert.equal(JSON.stringify(exported.descriptor).includes("vault:providerCredential"), false);
  assert.equal(exported.descriptor.redaction.vaultReferencesRemoved, 1);
  assert.deepEqual(exported.descriptor.workflow.nodes.find((node) => node.id === "provider-sync").credentials, []);

  const imported = importWorkflowEditorState(exported.descriptor);
  assert.equal(imported.ok, true);
  assert.equal(imported.state.operationMode, "describe-only");
});

test("workflow diffs report removals and updates", () => {
  const before = supportedWorkflow();
  const after = {
    ...before,
    nodes: before.nodes
      .filter((node) => node.id !== "preview")
      .map((node) => (node.id === "handoff" ? { ...node, label: "Reviewed handoff" } : node)),
    edges: before.edges.filter((edge) => edge.to !== "preview")
  };

  const diff = diffWorkflowStates(before, after);
  assert.deepEqual(diff.removedNodes, ["preview"]);
  assert.deepEqual(diff.updatedNodes, ["handoff"]);
  assert.ok(diff.removedEdges.some((edge) => edge.includes("verify->preview")));
});
