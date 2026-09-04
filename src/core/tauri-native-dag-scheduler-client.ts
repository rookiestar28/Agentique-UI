import { invoke } from "@tauri-apps/api/core";
import { createNativeDagSchedulerClient } from "./native-dag-scheduler-client.mjs";

const allowedNativeCommands = new Set(["agentique_scheduler_start", "agentique_scheduler_status", "agentique_scheduler_cancel", "agentique_scheduler_resume"]);

export type FixedNativeDagAttempt = {
  runId: string;
  commandId: string;
  adapterId: "adapter.local-python" | "adapter.local-node";
  approvalId: string;
  permissionProfileId: "permission.local-python.minimal" | "permission.local-node.minimal";
  permissionGrantId: string | null;
};

export type NativeDagWorkflow = {
  workflowId: string;
  resourceId: string;
  sessionId: string;
  commandId: string;
  nodes: Array<{
    nodeId: string;
    nodeType: "fixed-adapter" | "approval-interrupt";
    interruptId?: string;
    dependsOn: string[];
    maxRetries: number;
    attempts: FixedNativeDagAttempt[];
  }>;
};

export type NativeDagWorkflowReceipt = {
  schemaVersion: "agentique.nativeDagWorkflowReceipt.v1";
  sequence: number;
  workflowId: string;
  resourceId: string;
  sessionId: string;
  state: string;
  activeNodeId: string | null;
  terminalState: string | null;
  topologicalOrder: string[];
  nodes: Array<{
    nodeId: string;
    state: string;
    dependsOn: string[];
    retryCount: number;
    activeAttemptIndex: number | null;
    terminalRunId: string | null;
    attempts: Array<{ attemptIndex: number; runId: string; state: string; cleanupVerified: boolean; reason: string }>;
    interrupt: null | {
      interruptId: string;
      runId: string;
      proposalId: string;
      proposalDigest: string;
      checkpointGenerationDigest: string;
      state: string;
      expiresAtEpochSeconds: number;
      reason: string;
    };
    reason: string;
  }>;
  reason: string;
  redacted: true;
  replaysExternalEffects: false;
};

export function createTauriNativeDagSchedulerClient(workflow: NativeDagWorkflow) {
  const createClient = createNativeDagSchedulerClient as (options: Record<string, unknown>) => {
    start(): Promise<NativeDagWorkflowReceipt>;
    status(): Promise<NativeDagWorkflowReceipt>;
    cancel(): Promise<NativeDagWorkflowReceipt>;
    resume(input: NativeDagResumeInput): Promise<NativeDagWorkflowReceipt>;
  };
  return createClient({
    workflow,
    invokeNative: (command: string, args: Record<string, unknown>) => {
      // CRITICAL: the DAG bridge owns exactly four scheduler commands. Accepting an arbitrary
      // invoke name would turn opaque graph identity into generic native authority.
      if (!allowedNativeCommands.has(command)) throw new Error("Native DAG command is not allowlisted.");
      return invoke(command, args);
    }
  });
}

export type NativeDagResumeInput = {
  nodeId: string;
  runId: string;
  interruptId: string;
  checkpointGenerationDigest: string;
  proposalId: string;
  proposalDigest: string;
  decisionId: string;
  decision: "approved" | "denied";
  permissionGrantId: string | null;
};
