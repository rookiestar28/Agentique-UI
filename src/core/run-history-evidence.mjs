import {
  createLocalRunRecord,
  recoverLocalRun,
  transitionLocalRun
} from "./local-run-state-machine.mjs";
import { createRunFolderManifest, sampleRunFolderInput } from "./run-folder.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const runHistoryEvidenceSchemaVersion = "agentique.runHistoryEvidence.v1";

const fixedNow = "2026-06-13T00:00:00.000Z";
const unsafeEvidencePattern = /(?<![A-Za-z])[A-Za-z]:[\\/]|vault:[a-z][a-zA-Z0-9._-]{2,80}|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|cookie=/iu;

export function createRunHistoryEvidence({ action = "view", selectedRunId = "run-history-success", now = fixedNow } = {}) {
  const history = baseHistory(now);
  const selected = history.find((entry) => entry.runId === selectedRunId) ?? history[0];
  const actionEvidence = actionEvidenceFor(action, history, now);
  const activeRunId = actionEvidence.selectedRunId ?? selected.runId;
  const active = history.find((entry) => entry.runId === activeRunId) ?? selected;
  const evidence = {
    schemaVersion: runHistoryEvidenceSchemaVersion,
    generatedAt: now,
    action,
    selectedRunId: active.runId,
    history,
    selected: active,
    evidenceBrowser: evidenceBrowserFor(active),
    actionEvidence,
    summary: {
      totalRuns: history.length,
      states: summarizeStates(history),
      cleanupReceipts: history.filter((entry) => entry.cleanup.receipt).length,
      recovered: history.filter((entry) => entry.recovery.recovered).length,
      rerunLinks: history.filter((entry) => entry.rerunOf).length
    },
    boundary: {
      browserWritesFiles: false,
      nativeBacked: true,
      descriptorOnly: false,
      redacted: true
    }
  };
  assertNoInlineSecrets(evidence);
  if (unsafeEvidencePattern.test(JSON.stringify(evidence))) {
    throw new Error("Run history evidence contains unsafe material.");
  }
  return freeze(evidence);
}

export function reviewRunHistoryEvidenceGate() {
  const view = createRunHistoryEvidence();
  const cleanup = createRunHistoryEvidence({ action: "cleanup" });
  const cleanupAgain = createRunHistoryEvidence({ action: "cleanup-again" });
  const rerun = createRunHistoryEvidence({ action: "rerun" });
  const recover = createRunHistoryEvidence({ action: "recover", selectedRunId: "run-history-recovered" });
  const states = new Set(view.history.map((entry) => entry.state));
  const ok = view.schemaVersion === runHistoryEvidenceSchemaVersion &&
    ["succeeded", "failed", "canceled", "timed-out", "cleanup-required", "cleaned", "recovered"].every((state) => states.has(state)) &&
    view.evidenceBrowser.logs.every((log) => log.redacted === true) &&
    cleanup.actionEvidence.cleanup.idempotent === true &&
    cleanupAgain.actionEvidence.cleanup.idempotent === true &&
    cleanupAgain.actionEvidence.cleanup.removed.length === 0 &&
    rerun.actionEvidence.rerun.newRunId !== rerun.actionEvidence.rerun.previousRunId &&
    rerun.history.some((entry) => entry.runId === rerun.actionEvidence.rerun.previousRunId) &&
    recover.selected.recovery.recovered === true &&
    recover.selected.cleanup.status === "pending" &&
    view.boundary.nativeBacked === true &&
    view.boundary.descriptorOnly === false &&
    view.evidenceBrowser.viewerMetadata.artifactViewers.includes("json") &&
    !unsafeEvidencePattern.test(JSON.stringify({ view, cleanup, cleanupAgain, rerun, recover }));

  return freeze({
    schemaVersion: "agentique.runHistoryEvidenceReview.v1",
    ok,
    checks: {
      states: [...states],
      cleanupIdempotent: cleanupAgain.actionEvidence.cleanup.idempotent,
      rerunNewRunId: rerun.actionEvidence.rerun.newRunId,
      recoveredRun: recover.selected.runId,
      nativeBacked: view.boundary.nativeBacked,
      descriptorOnly: view.boundary.descriptorOnly
    },
    errors: ok ? [] : [issue("run-history-evidence.review", "Run history evidence review failed.")]
  });
}

function baseHistory(now) {
  const manifest = createRunFolderManifest(runFolderInput({
    runId: "run-history-success",
    createdAt: now,
    logs: [
      { name: "stdout.log", text: "Started with redacted:vault-reference reference only." },
      { name: "stderr.log", text: "No errors." }
    ],
    outputs: [{ path: "outputs/result.json", mediaType: "application/json", bytes: 128 }],
    artifacts: [{ id: "artifact-result-json", path: "artifacts/result.json", viewer: "json", redacted: true }]
  }));
  return [
    runEntry({
      runId: "run-history-success",
      state: "succeeded",
      manifest,
      timeline: ["queued", "preparing", "running", "succeeded"],
      failure: { status: "none", code: null, message: null },
      cleanup: cleanupReceipt("run-history-success", "pending", ["runs/run-history-success/logs", "runs/run-history-success/outputs", "runs/run-history-success/artifacts"])
    }),
    runEntry({
      runId: "run-history-failed",
      state: "failed",
      manifest: createRunFolderManifest(runFolderInput({
        runId: "run-history-failed",
        failure: { status: "failed", code: "adapter.failed", message: "Adapter failed with redacted inline output." }
      })),
      timeline: ["queued", "preparing", "running", "failed"],
      failure: { status: "failed", code: "adapter.failed", message: "Adapter failed with redacted inline output." },
      cleanup: cleanupReceipt("run-history-failed", "pending", ["runs/run-history-failed/logs"])
    }),
    runEntry({
      runId: "run-history-canceled",
      state: "canceled",
      manifest: createRunFolderManifest(runFolderInput({
        runId: "run-history-canceled",
        failure: { status: "canceled", code: "local-run.canceled", message: "Run cancellation completed." }
      })),
      timeline: ["queued", "preparing", "running", "canceling", "canceled"],
      failure: { status: "canceled", code: "local-run.canceled", message: "Run cancellation completed." },
      cleanup: cleanupReceipt("run-history-canceled", "cleaned", ["runs/run-history-canceled/logs", "runs/run-history-canceled/outputs"])
    }),
    runEntry({
      runId: "run-history-timeout",
      state: "timed-out",
      manifest: createRunFolderManifest(runFolderInput({
        runId: "run-history-timeout",
        failure: { status: "timed-out", code: "adapter.timeout", message: "Adapter timeout was cleaned." }
      })),
      timeline: ["queued", "preparing", "running", "timed-out"],
      failure: { status: "timed-out", code: "adapter.timeout", message: "Adapter timeout was cleaned." },
      cleanup: cleanupReceipt("run-history-timeout", "cleaned", ["runs/run-history-timeout/logs"])
    }),
    runEntry({
      runId: "run-history-cleanup",
      state: "cleanup-required",
      manifest: createRunFolderManifest(runFolderInput({ runId: "run-history-cleanup" })),
      timeline: ["queued", "running", "succeeded", "cleanup-required"],
      cleanup: cleanupReceipt("run-history-cleanup", "pending", ["runs/run-history-cleanup/logs", "runs/run-history-cleanup/artifacts"])
    }),
    runEntry({
      runId: "run-history-cleaned",
      state: "cleaned",
      manifest: createRunFolderManifest(runFolderInput({ runId: "run-history-cleaned" })),
      timeline: ["queued", "running", "succeeded", "cleanup-required", "cleaned"],
      cleanup: cleanupReceipt("run-history-cleaned", "cleaned", [])
    }),
    recoveredRun(now)
  ];
}

function recoveredRun(now) {
  let record = createLocalRunRecord({
    resourceId: "resource.history",
    sessionId: "session.history",
    runId: "run-history-recovered",
    worker: { staleAfterMs: 1000 }
  }, { now: "2026-06-13T00:00:00.000Z" });
  for (const action of [
    { type: "prepare" },
    { type: "ready", workerId: "worker.history" },
    { type: "start", workerId: "worker.history" }
  ]) {
    const result = transitionLocalRun(record, action, { now: "2026-06-13T00:00:00.000Z" });
    record = result.record;
  }
  const recovered = recoverLocalRun(record, { now: "2026-06-13T00:02:00.000Z" }).record;
  return runEntry({
    runId: recovered.runId,
    state: "recovered",
    manifest: createRunFolderManifest(runFolderInput({
      runId: recovered.runId,
      failure: { status: "failed", code: recovered.failure.code, message: recovered.failure.message }
    })),
    timeline: recovered.events.map((event) => event.state),
    cleanup: cleanupReceipt(recovered.runId, "pending", [`runs/${recovered.runId}/logs`]),
    recovery: recovered.recovery
  });
}

function runEntry({ runId, state, manifest, timeline, failure = { status: "none", code: null, message: null }, cleanup, recovery = { recovered: false, reason: null, recoveredAt: null }, rerunOf = null }) {
  return {
    runId,
    state,
    createdAt: manifest.runJson.createdAt,
    resourceId: manifest.runJson.resource.id,
    adapterRuntime: manifest.runJson.adapter.runtime,
    reproducibilityDigest: manifest.runJson.reproducibility.inputDigest,
    timeline: timeline.map((state, index) => ({
      sequence: index + 1,
      state,
      label: redactText(state)
    })),
    logs: manifest.runJson.logs.map((log) => ({
      name: log.name,
      redacted: true,
      text: redactEvidenceText(log.text)
    })),
    outputs: manifest.runJson.outputs.map((output) => ({
      path: output.path,
      mediaType: output.mediaType,
      bytes: output.bytes,
      digest: output.digest
    })),
    artifacts: manifest.runJson.artifacts.map((artifact) => ({
      id: artifact.id,
      path: artifact.path,
      viewer: artifact.viewer,
      redacted: artifact.redacted,
      digest: artifact.digest
    })),
    failure: {
      status: failure.status,
      code: failure.code,
      message: failure.message ? redactEvidenceText(failure.message) : null
    },
    cleanup,
    viewerMetadata: manifest.runJson.viewerMetadata,
    recovery,
    rerunOf
  };
}

function evidenceBrowserFor(run) {
  return {
    runId: run.runId,
    status: run.state,
    logs: run.logs,
    outputs: run.outputs,
    artifacts: run.artifacts,
    viewerMetadata: run.viewerMetadata,
    cleanup: run.cleanup,
    reproducibilityDigest: run.reproducibilityDigest,
    timeline: run.timeline
  };
}

function actionEvidenceFor(action, history, now) {
  if (action === "cleanup" || action === "cleanup-again") {
    return {
      selectedRunId: "run-history-cleanup",
      cleanup: cleanupReceipt("run-history-cleanup", "cleaned", action === "cleanup" ? ["runs/run-history-cleanup/logs", "runs/run-history-cleanup/artifacts"] : [], now)
    };
  }
  if (action === "rerun") {
    const previous = history[0];
    const rerun = runEntry({
      runId: "run-history-success-rerun-001",
      state: "succeeded",
      manifest: createRunFolderManifest(runFolderInput({ runId: "run-history-success-rerun-001", createdAt: now })),
      timeline: ["queued", "preparing", "running", "succeeded"],
      cleanup: cleanupReceipt("run-history-success-rerun-001", "pending", ["runs/run-history-success-rerun-001/logs"]),
      rerunOf: previous.runId
    });
    history.push(rerun);
    return {
      selectedRunId: rerun.runId,
      rerun: {
        previousRunId: previous.runId,
        newRunId: rerun.runId,
        previousEvidencePreserved: true
      }
    };
  }
  if (action === "recover") {
    return {
      selectedRunId: "run-history-recovered",
      recovery: {
        recovered: true,
        reason: "stale-incomplete-run",
        cleanupRequired: true
      }
    };
  }
  return {
    selectedRunId: null,
    view: "history"
  };
}

function cleanupReceipt(runId, status, removed = [], cleanedAt = fixedNow) {
  return {
    schemaVersion: "agentique.runFolderCleanupReceipt.v1",
    runId,
    status,
    cleanedAt,
    idempotent: true,
    removed: removed.map(redactEvidenceText),
    receiptPath: `runs/${runId}/cleanup-receipt.json`
  };
}

function runFolderInput(overrides) {
  return /** @type {any} */ ({
    ...sampleRunFolderInput,
    ...overrides
  });
}

function summarizeStates(history) {
  return history.reduce((summary, entry) => ({
    ...summary,
    [entry.state]: (summary[entry.state] ?? 0) + 1
  }), {});
}

function redactEvidenceText(value) {
  return redactText(String(value ?? ""))
    .replace(/vault:[a-z][a-zA-Z0-9._-]{2,80}/gu, "redacted:vault-reference")
    .replace(unsafeEvidencePattern, "redacted:sensitive-evidence");
}

function issue(code, message) {
  return { code, message: redactEvidenceText(message) };
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
