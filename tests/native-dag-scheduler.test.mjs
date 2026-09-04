import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createNativeDagSchedulerClient, normalizeNativeDagWorkflow } from "../src/core/native-dag-scheduler-client.mjs";

const read = (filePath) => (fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "");
const rust = read("src-tauri/src/lib.rs");
const scheduler = read("src-tauri/src/native_dag_scheduler.rs");
const client = read("src/core/native-dag-scheduler-client.mjs");
const bridge = read("src/core/tauri-native-dag-scheduler-client.ts");
const panel = read("src/workspaces/NativeDagSchedulerPanel.tsx");
const contract = read("docs/contracts/native-dag-scheduler.md");

test("native DAG scheduler exposes bounded native start status and cancel commands", () => {
  for (const command of ["agentique_scheduler_start", "agentique_scheduler_status", "agentique_scheduler_cancel"]) {
    assert.match(rust, new RegExp(command, "u"), command);
  }
  assert.match(scheduler, /deny_unknown_fields/u);
  assert.match(scheduler, /MAX_NATIVE_DAG_NODES/u);
  assert.match(scheduler, /stable_topological_order/u);
  assert.match(scheduler, /preflight_native_run_for_scheduler/u);
});

test("native DAG attempts retain one-use runner authority without launch configuration", () => {
  const attemptBody = scheduler.match(/struct\s+NativeDagAttemptRequest\s*\{([\s\S]*?)\n\}/u)?.[1] ?? "";
  for (const field of ["run_id", "adapter_id", "approval_id", "permission_profile_id", "permission_grant_id"]) {
    assert.match(attemptBody, new RegExp(`\\b${field}\\b`, "u"), field);
  }
  for (const forbidden of ["executable", "runtime", "path", "args", "environment", "script", "command_line", "package_manager"]) {
    assert.doesNotMatch(attemptBody, new RegExp(`\\b${forbidden}\\b`, "iu"), forbidden);
  }
  assert.match(scheduler, /duplicate[^\n]*(?:run|grant)/iu);
  assert.match(scheduler, /cleanup-required/u);
  assert.match(scheduler, /handoff-only/u);
});

test("scheduler persistence UI and contract preserve fail-closed workflow truth", () => {
  for (const phrase of ["write_native_dag_snapshot", "recover_interrupted_native_dag", "NativeDagWorkflowReceipt"]) {
    assert.match(scheduler, new RegExp(phrase, "u"), phrase);
  }
  for (const phrase of ["start()", "status()", "cancel()", "activeNodeId", "terminalState"]) {
    assert.ok(client.includes(phrase) || bridge.includes(phrase), phrase);
  }
  for (const phrase of ["Native DAG scheduler", 'aria-live="polite"', "Cancel workflow", "Skipped", "Retry"]) {
    assert.match(panel, new RegExp(phrase, "u"), phrase);
  }
  for (const phrase of ["distinct pre-approved attempt", "stable topological order", "atomic", "cleanup-required", "handoff-only", "macOS remains unverified"]) {
    assert.match(contract, new RegExp(phrase, "iu"), phrase);
  }
});

test("native DAG client invokes only bounded start status and cancel requests", async () => {
  const commands = [];
  const workflow = sampleWorkflow();
  const client = createNativeDagSchedulerClient({
    workflow,
    invokeNative: async (command, { request }) => {
      commands.push({ command, request });
      return sampleReceipt(workflow, command === "agentique_scheduler_start" ? "queued" : command === "agentique_scheduler_cancel" ? "canceled" : "running");
    }
  });
  await client.start();
  await client.status();
  await client.cancel();
  assert.deepEqual(
    commands.map((item) => item.command),
    ["agentique_scheduler_start", "agentique_scheduler_status", "agentique_scheduler_cancel"]
  );
  assert.deepEqual(Object.keys(commands[1].request).sort(), ["commandId", "resourceId", "sessionId", "workflowId"]);
  assert.equal(client.snapshot().terminalState, "canceled");
});

test("native DAG client rejects unknown authority handoff cycles and duplicate grants", () => {
  const unknown = sampleWorkflow();
  unknown.nodes[0].attempts[0].executable = "powershell";
  assert.throws(() => normalizeNativeDagWorkflow(unknown), /unknown fields/u);

  const handoff = sampleWorkflow();
  handoff.nodes[0].nodeType = "handoff-only";
  assert.throws(() => normalizeNativeDagWorkflow(handoff), /handoff-only/iu);

  const cycle = sampleWorkflow();
  cycle.nodes[0].dependsOn = ["node.b"];
  assert.throws(() => normalizeNativeDagWorkflow(cycle), /cycle/u);

  const duplicate = sampleWorkflow();
  duplicate.nodes[1].attempts[0].permissionGrantId = duplicate.nodes[0].attempts[0].permissionGrantId;
  assert.throws(() => normalizeNativeDagWorkflow(duplicate), /unique/u);
});

test("native DAG client rejects fabricated workflow success", async () => {
  const workflow = sampleWorkflow();
  const client = createNativeDagSchedulerClient({
    workflow,
    invokeNative: async () => {
      const receipt = sampleReceipt(workflow, "succeeded");
      receipt.nodes[1].state = "skipped";
      return receipt;
    }
  });
  await assert.rejects(() => client.start(), /cannot report success/u);
});

function sampleWorkflow() {
  return {
    workflowId: "workflow.client-test",
    resourceId: "resource.client-test",
    sessionId: "session.client-test",
    commandId: "command.client-test",
    nodes: [
      {
        nodeId: "node.a",
        nodeType: "fixed-adapter",
        dependsOn: [],
        maxRetries: 0,
        attempts: [
          {
            runId: "run.client-test-a",
            commandId: "command.client-test-a",
            adapterId: "adapter.local-python",
            approvalId: "approval.client-test-a",
            permissionProfileId: "permission.local-python.minimal",
            permissionGrantId: "grant.client-test-a"
          }
        ]
      },
      {
        nodeId: "node.b",
        nodeType: "fixed-adapter",
        dependsOn: ["node.a"],
        maxRetries: 0,
        attempts: [
          {
            runId: "run.client-test-b",
            commandId: "command.client-test-b",
            adapterId: "adapter.local-node",
            approvalId: "approval.client-test-b",
            permissionProfileId: "permission.local-node.minimal",
            permissionGrantId: "grant.client-test-b"
          }
        ]
      }
    ]
  };
}

function sampleReceipt(workflow, state) {
  const terminalState = ["succeeded", "failed", "canceled", "cleanup-required"].includes(state) ? state : null;
  return {
    schemaVersion: "agentique.nativeDagWorkflowReceipt.v1",
    sequence: 1,
    workflowId: workflow.workflowId,
    resourceId: workflow.resourceId,
    sessionId: workflow.sessionId,
    state,
    activeNodeId: state === "running" ? "node.a" : null,
    terminalState,
    topologicalOrder: ["node.a", "node.b"],
    nodes: workflow.nodes.map((node) => ({
      nodeId: node.nodeId,
      state: state === "succeeded" ? "succeeded" : state === "canceled" ? "canceled" : state === "running" && node.nodeId === "node.a" ? "running" : "queued",
      dependsOn: node.dependsOn,
      retryCount: 0,
      activeAttemptIndex: state === "running" && node.nodeId === "node.a" ? 0 : null,
      terminalRunId: null,
      attempts: node.attempts.map((attempt, attemptIndex) => ({
        attemptIndex,
        runId: attempt.runId,
        state: state === "succeeded" ? "succeeded" : state === "canceled" ? "canceled" : "queued",
        cleanupVerified: state === "succeeded",
        reason: "test receipt"
      })),
      reason: "test receipt"
    })),
    reason: "test receipt",
    redacted: true,
    replaysExternalEffects: false
  };
}
