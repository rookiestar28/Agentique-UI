import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTauriNativeAsyncRunClient,
  isTauriRuntimeAvailable,
  type CanonicalNativeRunEvent,
  type NativeProductProjectionReceipt,
  type NativeWorkingSetCheckpointReceipt,
  type NativeCheckpointHistoryReceipt,
  type NativeTimeTravelMode,
  type NativeTimeTravelPrepareReceipt,
  type FixedNativeAdapterId,
  type NativeRunAddress
} from "../core/tauri-native-async-run-client";

type NativeLifecycleState = {
  transport: "browser-preview" | "connecting" | "connected" | "error";
  status: string;
  message: string;
  approvalId: string | null;
  proposalId: string | null;
  proposalDigest: string | null;
  permissionGrantId: string | null;
  productProjection: NativeProductProjectionReceipt | null;
  workingSetCheckpoint: NativeWorkingSetCheckpointReceipt | null;
  checkpointHistory: NativeCheckpointHistoryReceipt | null;
  timeTravelPreparation: NativeTimeTravelPrepareReceipt | null;
  receiptSummary: NativeReceiptSummary | null;
  events: CanonicalNativeRunEvent[];
};

type NativeReceiptSummary = {
  kind: "status" | "logs" | "artifacts" | "cleanup";
  state: string;
  eventCount: number;
  logCount: number;
  artifactCount: number;
  cleanupStatus: string;
  processTreeCleanup: boolean | null;
  orphanCount: number | null;
};

const initialState = (available: boolean): NativeLifecycleState => ({
  transport: available ? "connecting" : "browser-preview",
  status: "idle",
  message: available ? "Connecting to native lifecycle events." : "Native lifecycle controls are available in the desktop app.",
  approvalId: null,
  proposalId: null,
  proposalDigest: null,
  permissionGrantId: null,
  productProjection: null,
  workingSetCheckpoint: null,
  checkpointHistory: null,
  timeTravelPreparation: null,
  receiptSummary: null,
  events: []
});

export function useNativeAsyncRunLifecycle(address: NativeRunAddress, adapterId: FixedNativeAdapterId = "adapter.local-python") {
  const available = isTauriRuntimeAvailable();
  const [state, setState] = useState<NativeLifecycleState>(() => initialState(available));
  const clientRef = useRef<ReturnType<typeof createTauriNativeAsyncRunClient> | null>(null);
  const addressKey = `${address.productScopeId}/${address.sessionId}/${address.resourceId}/${address.runId}/${adapterId}`;

  useEffect(() => {
    setState(initialState(available));
    if (!available) return;
    const client = createTauriNativeAsyncRunClient({
      address,
      adapterId,
      onEvent: (event) => {
        setState((current) => ({
          ...current,
          status: event.kind === "activity" ? current.status : event.kind,
          message: event.kind === "activity" ? String(event.payload.message ?? "Native activity received.") : `Native run reached ${event.kind}.`,
          events: [...current.events, event].slice(-16)
        }));
        if (event.kind !== "activity") {
          const activeClient = clientRef.current;
          if (activeClient) {
            void activeClient
              .status()
              .then((receipt: unknown) =>
                setState((current) => ({
                  ...current,
                  status: nativeStatusFrom(receipt),
                  receiptSummary: receiptSummary("status", receipt),
                  productProjection: projectionFrom(activeClient),
                  workingSetCheckpoint: checkpointFrom(activeClient)
                }))
              )
              .catch((error: unknown) => setState((current) => ({ ...current, transport: "error", message: safeError(error) })));
          }
        }
      },
      onError: (error) => {
        setState((current) => ({ ...current, transport: "error", message: `${error.code}: ${error.message}` }));
      }
    });
    clientRef.current = client;
    void client
      .connect()
      .then(() => setState((current) => ({ ...current, transport: "connected", message: "Native lifecycle event listener is connected." })))
      .catch((error: unknown) => setState((current) => ({ ...current, transport: "error", message: safeError(error) })));
    return () => {
      clientRef.current = null;
      void client.disconnect();
    };
  }, [addressKey, available]);

  const run = useCallback(async (operation: () => Promise<any>, pendingMessage: string) => {
    const client = clientRef.current;
    if (!client) return null;
    setState((current) => ({ ...current, message: pendingMessage }));
    try {
      return await operation();
    } catch (error) {
      setState((current) => ({ ...current, status: "blocked", message: safeError(error) }));
      return null;
    }
  }, []);

  const actions = useMemo(
    () => ({
      async prepare() {
        const client = clientRef.current;
        if (!client) return;
        const receipt = await run(() => client.prepare(), "Preparing an exact native approval proposal.");
        if (!receipt) return;
        const proposal = await run(() => client.approvalProposal({ approvalId: receipt.approvalId }), "Loading the native-owned approval proposal.");
        if (!proposal) return;
        setState((current) => ({
          ...current,
          status: "pending-approval",
          message: "Review the exact native effect before approving.",
          approvalId: String(receipt.approvalId),
          proposalId: String(proposal.proposalId),
          proposalDigest: String(proposal.proposalDigest)
        }));
      },
      async decide(decision: "approved" | "denied") {
        const client = clientRef.current;
        if (!client || !state.proposalId || !state.proposalDigest) return;
        const receipt = await run(
          () => client.decideApproval({ proposalId: state.proposalId, proposalDigest: state.proposalDigest, decision }),
          `Recording explicit ${decision} decision.`
        );
        if (!receipt) return;
        setState((current) => ({
          ...current,
          status: decision,
          message: decision === "approved" ? "One-time native grant is ready for start." : "Native execution was denied.",
          permissionGrantId: receipt.permissionGrant?.grantId ? String(receipt.permissionGrant.grantId) : null
        }));
      },
      async start() {
        const client = clientRef.current;
        if (!client || !state.approvalId || !state.permissionGrantId) return;
        const receipt = await run(() => client.start({ approvalId: state.approvalId, permissionGrantId: state.permissionGrantId }), "Starting the native run asynchronously.");
        if (receipt)
          setState((current) => ({
            ...current,
            status: String(receipt.state),
            message: "Native coordinator retained the active handle.",
            receiptSummary: receiptSummary("status", receipt),
            productProjection: projectionFrom(client),
            workingSetCheckpoint: checkpointFrom(client)
          }));
      },
      async cancel() {
        const client = clientRef.current;
        if (!client) return;
        const receipt = await run(() => client.cancel(), "Canceling the exact retained native handle.");
        if (receipt)
          setState((current) => ({
            ...current,
            status: String(receipt.state),
            message: "Native cancellation is in progress.",
            receiptSummary: receiptSummary("status", receipt),
            productProjection: projectionFrom(client),
            workingSetCheckpoint: checkpointFrom(client)
          }));
      },
      async revoke() {
        const client = clientRef.current;
        if (!client || !state.permissionGrantId) return;
        const receipt = await run(() => client.revoke({ permissionGrantId: state.permissionGrantId }), "Revoking the exact native permission grant.");
        if (receipt)
          setState((current) => ({
            ...current,
            status: String(receipt.state),
            message: receipt.state === "canceling" ? "Permission revoked; the exact retained handle is stopping." : "Permission revoked; native start is blocked.",
            receiptSummary: receiptSummary("status", receipt),
            productProjection: projectionFrom(client),
            workingSetCheckpoint: checkpointFrom(client)
          }));
      },
      async resync() {
        const client = clientRef.current;
        if (!client) return;
        const receipt = await run(() => client.resync(), "Resynchronizing bounded restart-durable event replay.");
        if (receipt)
          setState((current) => ({
            ...current,
            status: String(receipt.state),
            message: "Native lifecycle replay and durable result projection are synchronized.",
            receiptSummary: receiptSummary("status", receipt),
            productProjection: projectionFrom(client),
            workingSetCheckpoint: checkpointFrom(client)
          }));
      },
      async logs() {
        const client = clientRef.current;
        if (!client) return;
        const receipt = await run(() => client.logs(), "Reading bounded native event and log evidence.");
        if (receipt)
          setState((current) => ({
            ...current,
            status: nativeStatusFrom(receipt),
            message: "Bounded native log evidence is available.",
            receiptSummary: receiptSummary("logs", receipt),
            productProjection: projectionFrom(client),
            workingSetCheckpoint: checkpointFrom(client)
          }));
      },
      async artifacts() {
        const client = clientRef.current;
        if (!client) return;
        const receipt = await run(() => client.artifacts(), "Reading bounded native artifact evidence.");
        if (receipt)
          setState((current) => ({
            ...current,
            status: nativeStatusFrom(receipt),
            message: "Bounded native artifact evidence is available.",
            receiptSummary: receiptSummary("artifacts", receipt),
            productProjection: projectionFrom(client),
            workingSetCheckpoint: checkpointFrom(client)
          }));
      },
      async cleanup() {
        const client = clientRef.current;
        if (!client) return;
        const receipt = await run(() => client.cleanup(), "Cleaning up the exact native run scope.");
        if (receipt)
          setState((current) => ({
            ...current,
            status: nativeStatusFrom(receipt),
            message: "Native run cleanup completed with bounded recovery evidence.",
            receiptSummary: receiptSummary("cleanup", receipt),
            productProjection: projectionFrom(client),
            workingSetCheckpoint: checkpointFrom(client)
          }));
      },
      async inspectCheckpoints() {
        const client = clientRef.current;
        if (!client) return;
        const receipt = (await run(() => client.checkpointHistory(), "Validating bounded native checkpoint history.")) as NativeCheckpointHistoryReceipt | null;
        if (!receipt) return;
        setState((current) => ({
          ...current,
          message: `Validated ${receipt.generationCount} checkpoint generation${receipt.generationCount === 1 ? "" : "s"}; no content or absolute path crossed the renderer boundary.`,
          checkpointHistory: receipt,
          timeTravelPreparation: null
        }));
        return receipt;
      },
      async prepareTimeTravel({ targetRunId, generationDigest, mode }: { targetRunId: string; generationDigest: string; mode: NativeTimeTravelMode }) {
        const client = clientRef.current;
        if (!client) return;
        const receipt = (await run(
          () => client.prepareTimeTravel({ targetRunId, generationDigest, mode }),
          "Preparing a non-executing checkpoint branch."
        )) as NativeTimeTravelPrepareReceipt | null;
        if (!receipt) return;
        setState((current) => ({
          ...current,
          message: "Branch-ready only. Open the target run and create a fresh approval proposal before any start.",
          timeTravelPreparation: receipt
        }));
        return receipt;
      }
    }),
    [run, state.approvalId, state.permissionGrantId, state.proposalDigest, state.proposalId]
  );

  return { available, state, actions };
}

function projectionFrom(client: ReturnType<typeof createTauriNativeAsyncRunClient>) {
  return (client.snapshot().productProjection ?? null) as NativeProductProjectionReceipt | null;
}

function checkpointFrom(client: ReturnType<typeof createTauriNativeAsyncRunClient>) {
  return (client.snapshot().workingSetCheckpoint ?? null) as NativeWorkingSetCheckpointReceipt | null;
}

function nativeStatusFrom(receipt: unknown) {
  const value = receipt && typeof receipt === "object" && "state" in receipt ? String(receipt.state) : "blocked";
  return new Set(["pending-approval", "running", "canceling", "succeeded", "failed", "canceled", "timed-out", "cleanup-required", "cleaned-up"]).has(value) ? value : "blocked";
}

function receiptSummary(kind: NativeReceiptSummary["kind"], receipt: any): NativeReceiptSummary {
  const eventReplay = receipt?.eventReplay;
  const artifactEvidence = receipt?.artifactEvidence;
  const cleanupRecovery = receipt?.cleanupRecovery;
  return {
    kind,
    state: nativeStatusFrom(receipt),
    eventCount: Array.isArray(eventReplay?.events) ? eventReplay.events.length : 0,
    logCount: Array.isArray(artifactEvidence?.logs) ? artifactEvidence.logs.length : 0,
    artifactCount: Array.isArray(artifactEvidence?.artifacts) ? artifactEvidence.artifacts.length : 0,
    cleanupStatus: typeof cleanupRecovery?.status === "string" ? cleanupRecovery.status.slice(0, 64) : "not-requested",
    processTreeCleanup: typeof cleanupRecovery?.processTreeCleanup === "boolean" ? cleanupRecovery.processTreeCleanup : null,
    orphanCount: Number.isInteger(cleanupRecovery?.orphanCount) ? Number(cleanupRecovery.orphanCount) : null
  };
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "Native lifecycle operation failed.");
  return message.replace(/(?<![A-Za-z])[A-Za-z]:[\\/]|bearer\s+\S+|sk-[A-Za-z0-9]{20,}/giu, "redacted:sensitive").slice(0, 240);
}
