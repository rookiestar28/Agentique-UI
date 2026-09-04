import { useEffect, useMemo, useState } from "react";
import type { FixedNativeAdapterId, NativeTimeTravelMode } from "../core/tauri-native-async-run-client";
import { useNativeAsyncRunLifecycle } from "../app-state/useNativeAsyncRunLifecycle";

export function NativeAsyncRunLifecyclePanel({ runId }: { runId: string }) {
  const [adapterId, setAdapterId] = useState<FixedNativeAdapterId>("adapter.local-python");
  const [selectedGenerationDigest, setSelectedGenerationDigest] = useState("");
  const [timeTravelMode, setTimeTravelMode] = useState<NativeTimeTravelMode>("retry");
  const [targetRunId, setTargetRunId] = useState(() => branchRunId(runId));
  const address = useMemo(
    () => ({
      productScopeId: "workspace.local",
      sessionId: "session.ui-workflow-001",
      resourceId: "resource.ui-workflow-001",
      runId
    }),
    [runId]
  );
  const { available, state, actions } = useNativeAsyncRunLifecycle(address, adapterId);
  const canPrepare = available && state.transport === "connected" && state.status === "idle";
  const canDecide = state.status === "pending-approval";
  const canStart = state.status === "approved" && Boolean(state.permissionGrantId);
  const canCancel = state.status === "running" || state.status === "canceling";
  const canRevoke = Boolean(state.permissionGrantId) && (state.status === "approved" || state.status === "running");
  const canReadLogs = !["idle", "pending-approval", "approved", "denied", "blocked"].includes(state.status);
  const canReadArtifacts = state.status === "succeeded" || state.status === "failed";
  const canCleanup = ["succeeded", "failed", "canceled", "timed-out", "cleanup-required", "cleaned-up"].includes(state.status);
  const canInspectCheckpoints = available && state.transport === "connected" && ["succeeded", "failed", "canceled", "timed-out", "cleaned-up"].includes(state.status);
  const canPrepareTimeTravel =
    canInspectCheckpoints && Boolean(state.checkpointHistory?.generations.some((generation) => generation.generationDigest === selectedGenerationDigest)) && targetRunId !== runId;

  useEffect(() => {
    setSelectedGenerationDigest("");
    setTimeTravelMode("retry");
    setTargetRunId(branchRunId(runId));
  }, [runId]);

  useEffect(() => {
    const generations = state.checkpointHistory?.generations ?? [];
    if (generations.length > 0 && !generations.some((generation) => generation.generationDigest === selectedGenerationDigest)) {
      setSelectedGenerationDigest(generations.find((generation) => generation.current)?.generationDigest ?? generations[0].generationDigest);
    }
  }, [selectedGenerationDigest, state.checkpointHistory]);

  return (
    <section className="evidence-panel" aria-labelledby="native-async-run-heading" data-native-status={state.status} data-native-transport={state.transport}>
      <div className="section-heading compact-heading">
        <p className="caption">Native lifecycle</p>
        <h3 id="native-async-run-heading">Asynchronous run coordinator</h3>
      </div>
      <label className="surface-note" htmlFor="native-fixed-adapter">
        Fixed native adapter
      </label>
      <select id="native-fixed-adapter" value={adapterId} disabled={state.status !== "idle"} onChange={(event) => setAdapterId(event.target.value as FixedNativeAdapterId)}>
        <option value="adapter.local-python">Python (fixed native)</option>
        <option value="adapter.local-node">Node (fixed native)</option>
        <option value="adapter.local-wasm">WASM (fixed native sandbox)</option>
        <option value="adapter.local-container">Container (fixed rootless sandbox)</option>
      </select>
      {adapterId === "adapter.local-container" ? (
        <p className="surface-note" data-container-runtime-status="host-proof-required">
          Linux-native optional lane. Start remains fail closed unless native checks prove an active rootless Docker or Podman engine and the exact pre-provisioned image. Windows
          execution is unavailable; macOS is skipped and unverified.
        </p>
      ) : null}
      <div className="runner-status-grid">
        <div>
          <span>Transport</span>
          <strong>{state.transport}</strong>
        </div>
        <div>
          <span>Lifecycle</span>
          <strong>{state.status}</strong>
        </div>
        <div>
          <span>Canonical events</span>
          <strong>{state.events.length}</strong>
        </div>
        <div>
          <span>Durable result</span>
          <strong>{state.productProjection?.committed ? "committed" : (state.productProjection?.recoveryClassification ?? "pending")}</strong>
        </div>
        <div>
          <span>Working-set checkpoint</span>
          <strong>{state.workingSetCheckpoint?.committed ? `${state.workingSetCheckpoint.fileCount} files` : "pending"}</strong>
        </div>
      </div>
      {state.productProjection ? (
        <p className="surface-note" data-product-projection={state.productProjection.recoveryClassification}>
          Recovery: {state.productProjection.recoveryClassification}. Terminal: {state.productProjection.state}. Product evidence: {state.productProjection.artifactRefs.length}{" "}
          bounded files.
        </p>
      ) : null}
      {state.workingSetCheckpoint ? (
        <p className="surface-note" data-working-set-checkpoint={state.workingSetCheckpoint.generationDigest.slice(0, 12)}>
          Native checkpoint committed before terminal publication. Local content is not encrypted at rest; restore never replays external effects.
        </p>
      ) : null}
      <div
        className="runner-status-grid"
        aria-label="Native receipt evidence"
        aria-live="polite"
        data-native-receipt-kind={state.receiptSummary?.kind ?? "pending"}
        data-native-process-cleanup={state.receiptSummary?.processTreeCleanup == null ? "pending" : String(state.receiptSummary.processTreeCleanup)}
        data-native-orphan-count={state.receiptSummary?.orphanCount ?? "unknown"}
      >
        <div>
          <span>Receipt</span>
          <strong>{state.receiptSummary?.kind ?? "pending"}</strong>
        </div>
        <div>
          <span>Receipt state</span>
          <strong>{state.receiptSummary?.state ?? "pending"}</strong>
        </div>
        <div>
          <span>Replay events</span>
          <strong>{state.receiptSummary?.eventCount ?? 0}</strong>
        </div>
        <div>
          <span>Logs / artifacts</span>
          <strong>
            {state.receiptSummary?.logCount ?? 0} / {state.receiptSummary?.artifactCount ?? 0}
          </strong>
        </div>
        <div>
          <span>Process cleanup</span>
          <strong>
            {state.receiptSummary?.processTreeCleanup == null
              ? (state.receiptSummary?.cleanupStatus ?? "pending")
              : `${state.receiptSummary.processTreeCleanup ? "verified" : "unverified"}; orphans ${state.receiptSummary.orphanCount ?? "unknown"}`}
          </strong>
        </div>
      </div>
      <p className="surface-note">{state.message}</p>
      <div className="runner-status-grid" aria-label="Checkpoint time travel" data-time-travel-state={state.timeTravelPreparation?.state ?? "unprepared"}>
        <div>
          <span>Checkpoint history</span>
          <strong>{state.checkpointHistory ? `${state.checkpointHistory.generationCount} validated` : "not inspected"}</strong>
        </div>
        <div>
          <span>Branch state</span>
          <strong>{state.timeTravelPreparation?.state ?? "unprepared"}</strong>
        </div>
      </div>
      <div className="runner-actions" aria-label="Checkpoint time-travel controls">
        <button type="button" className="secondary-action" disabled={!canInspectCheckpoints} onClick={() => void actions.inspectCheckpoints()}>
          Inspect checkpoint history
        </button>
        <label className="surface-note" htmlFor="native-checkpoint-generation">
          Validated generation
        </label>
        <select
          id="native-checkpoint-generation"
          value={selectedGenerationDigest}
          disabled={!state.checkpointHistory}
          onChange={(event) => setSelectedGenerationDigest(event.target.value)}
        >
          <option value="">Inspect history first</option>
          {(state.checkpointHistory?.generations ?? []).map((generation) => (
            <option key={generation.generationDigest} value={generation.generationDigest}>
              {generation.generationDigest.slice(0, 12)} · {generation.fileCount} files{generation.current ? " · current" : ""}
            </option>
          ))}
        </select>
        <label className="surface-note" htmlFor="native-time-travel-mode">
          Lineage mode
        </label>
        <select
          id="native-time-travel-mode"
          value={timeTravelMode}
          disabled={!state.checkpointHistory}
          onChange={(event) => setTimeTravelMode(event.target.value as NativeTimeTravelMode)}
        >
          <option value="retry">Retry</option>
          <option value="resume">Resume</option>
          <option value="replay">Replay</option>
        </select>
        <label className="surface-note" htmlFor="native-time-travel-target">
          New target run ID
        </label>
        <input id="native-time-travel-target" value={targetRunId} disabled={!state.checkpointHistory} onChange={(event) => setTargetRunId(event.target.value)} />
        <button
          type="button"
          className="secondary-action"
          disabled={!canPrepareTimeTravel}
          onClick={() => void actions.prepareTimeTravel({ targetRunId, generationDigest: selectedGenerationDigest, mode: timeTravelMode })}
        >
          Prepare non-executing branch
        </button>
      </div>
      <p className="surface-note">
        History exposes metadata only. Local checkpoint content is not encrypted at rest. A branch-ready target never replays an external effect and cannot start until its own
        ordinary prepare, fresh approval, and fresh one-use grant complete.
      </p>
      <div className="runner-actions" aria-label="Native asynchronous lifecycle controls">
        <button type="button" className="secondary-action" disabled={!canPrepare} onClick={() => void actions.prepare()}>
          Prepare native run
        </button>
        <button type="button" className="secondary-action" disabled={!canDecide} onClick={() => void actions.decide("approved")}>
          Approve exact effect
        </button>
        <button type="button" className="secondary-action" disabled={!canDecide} onClick={() => void actions.decide("denied")}>
          Deny
        </button>
        <button type="button" className="primary-action" disabled={!canStart} onClick={() => void actions.start()}>
          Start asynchronously
        </button>
        <button type="button" className="secondary-action" disabled={!canCancel} onClick={() => void actions.cancel()}>
          Cancel retained handle
        </button>
        <button type="button" className="secondary-action" disabled={!canRevoke} onClick={() => void actions.revoke()}>
          Revoke exact grant
        </button>
        <button type="button" className="secondary-action" disabled={!available} onClick={() => void actions.resync()}>
          Resync bounded replay
        </button>
        <button type="button" className="secondary-action" disabled={!canReadLogs} onClick={() => void actions.logs()}>
          Read native logs
        </button>
        <button type="button" className="secondary-action" disabled={!canReadArtifacts} onClick={() => void actions.artifacts()}>
          Read native artifacts
        </button>
        <button type="button" className="secondary-action" disabled={!canCleanup} onClick={() => void actions.cleanup()}>
          Clean up native run
        </button>
      </div>
      <p className="surface-note">
        Event evidence replay, the validated product result pointer, and the bounded disposable working-set checkpoint are native-owned and restart-durable; restart never replays
        an external effect. {"No PID, executable path, arguments, environment values, or generic process controls cross this UI boundary."}
      </p>
    </section>
  );
}

function branchRunId(sourceRunId: string) {
  return `${sourceRunId.slice(0, 82)}.branch`;
}
