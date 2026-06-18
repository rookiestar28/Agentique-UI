import assert from "node:assert/strict";
import test from "node:test";
import {
  agentClientTargets,
  assertAgentClientHandoffPlanSafe,
  createAgentClientHandoffPlan,
  sampleAgentClientHandoffPlan
} from "../src/core/agent-client-handoff.mjs";

const resource = {
  resourceId: "example.visual-guide",
  title: "Example Visual Guide",
  version: "0.1.0",
  digest: "e".repeat(64),
  supportMode: "visualizable",
  privateToken: ["bearer", "demoSensitive12345"].join(" "),
  internalNotes: "operator-only"
};

test("agent client targets are explicit", () => {
  assert.deepEqual(agentClientTargets, ["codex", "claude-code", "mcp-client", "local-folder", "local-bridge"]);
  assert.equal(sampleAgentClientHandoffPlan.target, "local-bridge");
});

test("supported client plan is secret-free reversible and non-executing", () => {
  const plan = createAgentClientHandoffPlan(resource, "codex", {
    createdAt: "2026-06-11T00:25:00.000Z"
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.schemaVersion, "agentique.agentClientHandoffPlan.v1");
  assert.equal(plan.execution.willExecute, false);
  assert.equal(plan.execution.writesFiles, false);
  assert.equal(plan.cleanup.reversible, true);
  assert.ok(plan.actions.some((action) => action.id === "copy-command"));
  assert.equal(JSON.stringify(plan).includes("privateToken"), false);
  assert.equal(JSON.stringify(plan).includes("demoSensitive12345"), false);
  assertAgentClientHandoffPlanSafe(plan);
});

test("local bridge plans remain descriptor-only", () => {
  const plan = createAgentClientHandoffPlan(resource, "local-bridge", {
    createdAt: "2026-06-11T00:25:00.000Z"
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.mode, "bridge-descriptor");
  assert.equal(plan.bridge.descriptorOnly, true);
  assert.equal(plan.bridge.startsBridge, false);
  assert.equal(plan.execution.startsBridge, false);
});

test("all supported clients produce reversible review-only plans", () => {
  for (const target of agentClientTargets) {
    const plan = createAgentClientHandoffPlan(resource, target, {
      createdAt: "2026-06-11T00:25:00.000Z"
    });

    assert.equal(plan.ok, true);
    assert.equal(plan.target, target);
    assert.equal(plan.execution.willExecute, false);
    assert.equal(plan.cleanup.reversible, true);
  }
});

test("unsupported clients and unsafe output requests fail closed", () => {
  const unsupported = createAgentClientHandoffPlan(resource, "unknown-client");
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.errors[0].code, "agent-client.unsupported-target");

  const unsafeDestination = createAgentClientHandoffPlan(resource, "local-folder", {
    destination: ["C", ":\\tmp\\handoff"].join("")
  });
  assert.equal(unsafeDestination.ok, false);
  assert.equal(unsafeDestination.errors[0].code, "agent-client.unsafe-destination");

  const unsafeCopy = createAgentClientHandoffPlan(resource, "codex", {
    copyText: "npm run external-client"
  });
  assert.equal(unsafeCopy.ok, false);
  assert.equal(unsafeCopy.errors[0].code, "agent-client.command-output");
});

test("safety check rejects execution-enabled plans", () => {
  const plan = createAgentClientHandoffPlan(resource, "mcp-client");
  assert.throws(
    () => assertAgentClientHandoffPlanSafe({ ...plan, execution: { ...plan.execution, startsBridge: true } }),
    /non-executing/u
  );
});
