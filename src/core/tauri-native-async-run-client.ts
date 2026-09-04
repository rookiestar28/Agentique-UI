import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createNativeAsyncRunClient } from "./native-async-run-client.mjs";

const allowedNativeCommands = new Set([
  "agentique_runner_prepare",
  "agentique_runner_approval_proposal",
  "agentique_runner_decide_approval",
  "agentique_runner_start",
  "agentique_runner_revoke_permission",
  "agentique_runner_cancel",
  "agentique_runner_status",
  "agentique_runner_logs",
  "agentique_runner_artifacts",
  "agentique_runner_cleanup",
  "agentique_runner_checkpoint_history",
  "agentique_runner_time_travel_prepare"
]);

export type NativeRunAddress = {
  productScopeId: string;
  sessionId: string;
  resourceId: string;
  runId: string;
};

export type FixedNativeAdapterId = "adapter.local-python" | "adapter.local-node" | "adapter.local-wasm" | "adapter.local-container";

export type CanonicalNativeRunEvent = {
  sequence: number;
  kind: "activity" | "result" | "cancelled" | "error";
  occurredAt: string;
  delivery: "live" | "replay";
  payload: Record<string, unknown>;
};

export type NativeProductProjectionReceipt = {
  schemaVersion: "agentique.nativeProductResultProjectionReceipt.v1";
  resourceId: string;
  sessionId: string;
  runId: string;
  candidateDigest: string;
  state: string;
  committed: boolean;
  idempotent: boolean;
  generationRef: string;
  pointerRef: string;
  artifactRefs: string[];
  recoveryClassification: string;
  redacted: true;
};

export type NativeWorkingSetCheckpointReceipt = {
  schemaVersion: "agentique.nativeWorkingSetCheckpointReceipt.v1";
  scopeId: string;
  generationDigest: string;
  committed: boolean;
  idempotent: boolean;
  restored: boolean;
  fileCount: number;
  totalBytes: number;
  generationRef: string;
  pointerRef: string;
  rootRef: string;
  encryptedAtRest: false;
  replaysExternalEffects: false;
  redacted: true;
};

export type NativeCheckpointGenerationSummary = {
  generationDigest: string;
  current: boolean;
  fileCount: number;
  totalBytes: number;
  generationRef: string;
  valid: true;
  eligible: true;
  redacted: true;
};

export type NativeCheckpointHistoryReceipt = {
  schemaVersion: "agentique.nativeCheckpointHistory.v1";
  resourceId: string;
  sessionId: string;
  runId: string;
  generationCount: number;
  generations: NativeCheckpointGenerationSummary[];
  includesContent: false;
  encryptedAtRest: false;
  redacted: true;
};

export type NativeTimeTravelMode = "retry" | "resume" | "replay";

export type NativeTimeTravelPrepareReceipt = {
  schemaVersion: "agentique.nativeTimeTravelPrepareReceipt.v1";
  resourceId: string;
  sessionId: string;
  sourceRunId: string;
  targetRunId: string;
  mode: NativeTimeTravelMode;
  selectedGenerationDigest: string;
  sourceGenerationDigest: string;
  sourceGenerationRef: string;
  targetRootRef: string;
  lineageRef: string;
  state: "branch-ready";
  prepared: true;
  sourceImmutable: true;
  requiresFreshApproval: true;
  willSpawnProcess: false;
  replaysExternalEffects: false;
  fileCount: number;
  totalBytes: number;
  redacted: true;
};

export function isTauriRuntimeAvailable() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createTauriNativeAsyncRunClient({
  address,
  adapterId = "adapter.local-python",
  onEvent,
  onError
}: {
  address: NativeRunAddress;
  adapterId?: FixedNativeAdapterId;
  onEvent?: (event: CanonicalNativeRunEvent) => void;
  onError?: (error: { code: string; message: string }) => void;
}) {
  const createClient = createNativeAsyncRunClient as (options: Record<string, unknown>) => any;
  return createClient({
    address,
    adapterId,
    invokeNative: (command: string, args: Record<string, unknown>) => {
      // CRITICAL: the renderer bridge stays command-allowlisted; accepting arbitrary invoke names
      // would turn this fixed lifecycle adapter into a generic native authority surface.
      if (!allowedNativeCommands.has(command)) throw new Error("Native lifecycle command is not allowlisted.");
      return invoke(command, args);
    },
    listenNative: (eventName: string, handler: (event: { payload: unknown }) => void) => listen(eventName, handler),
    onEvent,
    onError
  });
}
