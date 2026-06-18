import assert from "node:assert/strict";
import test from "node:test";
import { assertDescriptorSafe, createHandoffDescriptor, handoffTargets } from "../src/core/handoff-helper.mjs";

const resource = {
  resourceId: "example.visual-guide",
  title: "Example Visual Guide",
  version: "0.1.0",
  digest: "e".repeat(64),
  supportMode: "visualizable",
  privateToken: ["bearer", "demoSensitive12345"].join(" "),
  internalNotes: "operator-only"
};

test("supported handoff targets are explicit", () => {
  assert.deepEqual(handoffTargets, ["codex", "claude-code", "mcp-client", "folder-export"]);
});

test("agent-client descriptor is non-executing and reversible", () => {
  const descriptor = createHandoffDescriptor(resource, "codex", { createdAt: "2026-06-11T00:10:00.000Z" });

  assert.equal(descriptor.ok, true);
  assert.equal(descriptor.schemaVersion, "agentique.handoffDescriptor.v1");
  assert.equal(descriptor.execution.willExecute, false);
  assert.equal(descriptor.execution.startsBridge, false);
  assert.equal(descriptor.cleanup.reversible, true);
  assert.equal(descriptor.resource.resourceId, "example.visual-guide");
  assert.ok(descriptor.output.copyText.includes("no command is executed"));
});

test("all supported targets generate descriptors", () => {
  for (const target of handoffTargets) {
    const descriptor = createHandoffDescriptor(resource, target, { createdAt: "2026-06-11T00:10:00.000Z" });
    assert.equal(descriptor.ok, true);
    assert.equal(descriptor.target, target);
    assert.equal(descriptor.execution.willExecute, false);
  }
});

test("unsupported target fails safely", () => {
  const descriptor = createHandoffDescriptor(resource, "unknown-client");

  assert.equal(descriptor.ok, false);
  assert.equal(descriptor.execution.willExecute, false);
  assert.equal(descriptor.cleanup.reversible, true);
  assert.equal(descriptor.errors[0].code, "handoff.unsupported-target");
});

test("descriptor output omits private input fields", () => {
  const descriptor = createHandoffDescriptor(resource, "claude-code", { createdAt: "2026-06-11T00:10:00.000Z" });
  const text = JSON.stringify(descriptor);

  assert.equal(text.includes("privateToken"), false);
  assert.equal(text.includes("internalNotes"), false);
  assert.equal(text.includes("demoSensitive12345"), false);
  assertDescriptorSafe(descriptor);
});

test("descriptor safety check blocks local paths and unsafe material", () => {
  assert.throws(
    () => assertDescriptorSafe({ output: { fileName: ["C", ":\\tmp\\handoff.json"].join("") } }),
    /local path/u
  );
  assert.throws(
    () => assertDescriptorSafe({ output: { copyText: ["bearer", "demoSensitive12345"].join(" ") } }),
    /unsafe material/u
  );
});
