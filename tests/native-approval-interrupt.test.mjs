import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createNativeDagSchedulerClient, normalizeNativeDagWorkflow } from "../src/core/native-dag-scheduler-client.mjs";

const read = (filePath) => (fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "");
const rust = read("src-tauri/src/lib.rs");
const scheduler = read("src-tauri/src/native_dag_scheduler.rs");
test("native scheduler owns a strict checkpoint-bound approval resume command", () => {
  assert.match(rust, /agentique_scheduler_resume/u);
  assert.match(scheduler, /struct\s+NativeDagResumeRequest[\s\S]*deny_unknown_fields/u);
  for (const field of [
    "workflow_id",
    "node_id",
    "run_id",
    "interrupt_id",
    "checkpoint_generation_digest",
    "proposal_id",
    "proposal_digest",
    "decision_id",
    "permission_grant_id"
  ]) {
    assert.match(scheduler, new RegExp(`\\b${field}\\b`, "u"), field);
  }
  for (const forbidden of ["executable", "path", "args", "environment", "script", "package_manager", "payload"]) {
    const body = scheduler.match(/struct\s+NativeDagResumeRequest[\s\S]*?\n\}/u)?.[0] ?? "";
    assert.doesNotMatch(body, new RegExp(`\\b${forbidden}\\b`, "iu"), forbidden);
  }
});

test("client admits one pending interrupt and invokes only the exact resume command", async () => {
  const workflow = sampleInterruptWorkflow();
  assert.deepEqual(normalizeNativeDagWorkflow(workflow), workflow);
  const calls = [];
  const client = createNativeDagSchedulerClient({
    workflow,
    invokeNative: async (command, { request }) => {
      calls.push({ command, request });
      return samplePausedReceipt(workflow, command === "agentique_scheduler_resume" ? "running" : "paused-approval");
    }
  });
  await client.start();
  await client.resume({
    nodeId: "node.risky",
    runId: "run.interrupt-risky",
    interruptId: "interrupt.risky",
    checkpointGenerationDigest: "a".repeat(64),
    proposalId: "approval.interrupt-risky",
    proposalDigest: "b".repeat(64),
    decisionId: "decision.interrupt-risky",
    decision: "approved",
    permissionGrantId: "grant.interrupt-risky"
  });
  assert.deepEqual(
    calls.map((entry) => entry.command),
    ["agentique_scheduler_start", "agentique_scheduler_resume"]
  );
  assert.deepEqual(Object.keys(calls[1].request).sort(), [
    "checkpointGenerationDigest",
    "commandId",
    "decision",
    "decisionId",
    "interruptId",
    "nodeId",
    "permissionGrantId",
    "proposalDigest",
    "proposalId",
    "resourceId",
    "runId",
    "sessionId",
    "workflowId"
  ]);
});

function sampleInterruptWorkflow() {
  return {
    workflowId: "workflow.interrupt-test",
    resourceId: "resource.interrupt-test",
    sessionId: "session.interrupt-test",
    commandId: "command.interrupt-test",
    nodes: [
      {
        nodeId: "node.risky",
        nodeType: "approval-interrupt",
        interruptId: "interrupt.risky",
        dependsOn: [],
        maxRetries: 0,
        attempts: [
          {
            runId: "run.interrupt-risky",
            commandId: "command.interrupt-risky",
            adapterId: "adapter.local-python",
            approvalId: "approval.interrupt-risky",
            permissionProfileId: "permission.local-python.minimal",
            permissionGrantId: null
          }
        ]
      }
    ]
  };
}

function samplePausedReceipt(workflow, state) {
  return {
    schemaVersion: "agentique.nativeDagWorkflowReceipt.v1",
    sequence: 2,
    workflowId: workflow.workflowId,
    resourceId: workflow.resourceId,
    sessionId: workflow.sessionId,
    state,
    activeNodeId: null,
    terminalState: null,
    topologicalOrder: ["node.risky"],
    nodes: [
      {
        nodeId: "node.risky",
        state: state === "paused-approval" ? "pending-approval" : "queued",
        dependsOn: [],
        retryCount: 0,
        activeAttemptIndex: null,
        terminalRunId: null,
        attempts: [{ attemptIndex: 0, runId: "run.interrupt-risky", state: "queued", cleanupVerified: false, reason: "pending" }],
        interrupt: {
          interruptId: "interrupt.risky",
          runId: "run.interrupt-risky",
          proposalId: "approval.interrupt-risky",
          proposalDigest: "b".repeat(64),
          checkpointGenerationDigest: "a".repeat(64),
          state: state === "paused-approval" ? "pending" : "approved",
          expiresAtEpochSeconds: 4102444800,
          reason: "test interrupt"
        },
        reason: "test receipt"
      }
    ],
    reason: "test receipt",
    redacted: true,
    replaysExternalEffects: false
  };
}
