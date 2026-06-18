import assert from "node:assert/strict";
import test from "node:test";
import {
  assertExternalRuntimeDescriptorSafe,
  createExternalRuntimeHandoff,
  externalRuntimeTargets,
  sampleExternalRuntimeHandoff
} from "../src/core/external-runtime-adapter.mjs";
import { sampleWorkflowIr } from "../src/core/workflow-ir.mjs";

function supportedWorkflow() {
  return {
    ...sampleWorkflowIr,
    nodes: sampleWorkflowIr.nodes
      .filter((node) => node.id !== "provider-sync")
      .map((node) => (node.id === "preview" ? { ...node, type: "handoff" } : node)),
    edges: sampleWorkflowIr.edges.filter((edge) => edge.to !== "provider-sync" && edge.from !== "provider-sync")
  };
}

test("external runtime targets are explicit and descriptor-only", () => {
  assert.deepEqual(externalRuntimeTargets, ["n8n", "flowise", "dify", "comfyui"]);
  assert.equal(sampleExternalRuntimeHandoff.execution.willExecute, false);
  assert.equal(sampleExternalRuntimeHandoff.execution.startsBridge, false);
  assert.equal(sampleExternalRuntimeHandoff.compatibility.universalRuntimeClaim, false);
});

test("supported target descriptor is safe reversible and path-free", () => {
  const descriptor = createExternalRuntimeHandoff(supportedWorkflow(), "n8n", {
    createdAt: "2026-06-11T00:20:00.000Z"
  });

  assert.equal(descriptor.ok, true);
  assert.equal(descriptor.schemaVersion, "agentique.externalRuntimeHandoff.v1");
  assert.equal(descriptor.mode, "export-descriptor");
  assert.equal(descriptor.artifacts.writesFiles, false);
  assert.equal(descriptor.execution.willExecute, false);
  assert.equal(descriptor.cleanup.reversible, true);
  assert.equal(descriptor.compatibility.status, "compatible");
  assertExternalRuntimeDescriptorSafe(descriptor);
});

test("unsupported nodes are reported instead of executed", () => {
  const descriptor = createExternalRuntimeHandoff(sampleWorkflowIr, "n8n", {
    createdAt: "2026-06-11T00:20:00.000Z"
  });

  assert.equal(descriptor.ok, false);
  assert.equal(descriptor.execution.willExecute, false);
  assert.equal(descriptor.compatibility.status, "blocked");
  assert.ok(descriptor.compatibility.unsupportedNodes.some((node) => node.id === "provider-sync"));
  assert.ok(descriptor.errors.some((error) => error.code === "workflow.unsupported-node"));
});

test("all supported targets produce no-execution descriptors", () => {
  for (const target of externalRuntimeTargets) {
    const descriptor = createExternalRuntimeHandoff(supportedWorkflow(), target, {
      createdAt: "2026-06-11T00:20:00.000Z"
    });

    assert.equal(descriptor.target, target);
    assert.equal(descriptor.execution.willExecute, false);
    assert.equal(descriptor.execution.makesNetworkRequest, false);
    assert.equal(descriptor.compatibility.universalRuntimeClaim, false);
  }
});

test("unsupported targets and unsafe destinations fail closed", () => {
  const unsupported = createExternalRuntimeHandoff(supportedWorkflow(), "unknown-runtime");
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.errors[0].code, "external-runtime.unsupported-target");

  const unsafeDestination = createExternalRuntimeHandoff(supportedWorkflow(), "dify", {
    destination: ["C", ":\\tmp\\workflow.json"].join("")
  });
  assert.equal(unsafeDestination.ok, false);
  assert.equal(unsafeDestination.errors[0].code, "external-runtime.unsafe-destination");
});

test("descriptor safety check rejects executable command text", () => {
  assert.throws(
    () => assertExternalRuntimeDescriptorSafe({ output: { copyText: "npm run external-runtime" } }),
    /executable commands/u
  );
});
