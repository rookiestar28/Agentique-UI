import assert from "node:assert/strict";
import test from "node:test";
import {
  createRunHistoryEvidence,
  reviewRunHistoryEvidenceGate,
  runHistoryEvidenceSchemaVersion
} from "../src/core/run-history-evidence.mjs";

test("run history exposes all required terminal and recovery states", () => {
  const history = createRunHistoryEvidence();
  const states = new Set(history.history.map((entry) => entry.state));

  assert.equal(history.schemaVersion, runHistoryEvidenceSchemaVersion);
  for (const state of ["succeeded", "failed", "canceled", "timed-out", "cleanup-required", "cleaned", "recovered"]) {
    assert.equal(states.has(state), true, state);
  }
  assert.equal(history.summary.totalRuns >= 7, true);
});

test("evidence browser renders logs outputs artifacts cleanup digest and timeline", () => {
  const history = createRunHistoryEvidence({ selectedRunId: "run-history-success" });

  assert.equal(history.evidenceBrowser.logs.length > 0, true);
  assert.equal(history.evidenceBrowser.outputs.length > 0, true);
  assert.equal(history.evidenceBrowser.artifacts.length > 0, true);
  assert.equal(history.evidenceBrowser.viewerMetadata.artifactViewers.includes("json"), true);
  assert.ok(history.evidenceBrowser.cleanup.receiptPath.endsWith("cleanup-receipt.json"));
  assert.match(history.evidenceBrowser.reproducibilityDigest, /^[a-f0-9]{64}$/u);
  assert.equal(history.evidenceBrowser.timeline.some((event) => event.state === "succeeded"), true);
});

test("evidence browser is redacted and path-neutral", () => {
  const history = createRunHistoryEvidence({ selectedRunId: "run-history-failed" });
  const text = JSON.stringify(history);

  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/u);
  assert.doesNotMatch(text, /vault:[a-z][a-zA-Z0-9._-]+/u);
  assert.doesNotMatch(text, /bearer\s+[A-Za-z0-9._-]+/iu);
  assert.doesNotMatch(text, /cookie=/iu);
  assert.equal(history.evidenceBrowser.logs.every((log) => log.redacted === true), true);
});

test("cleanup action can be repeated idempotently", () => {
  const first = createRunHistoryEvidence({ action: "cleanup" });
  const second = createRunHistoryEvidence({ action: "cleanup-again" });

  assert.equal(first.actionEvidence.cleanup.idempotent, true);
  assert.equal(second.actionEvidence.cleanup.idempotent, true);
  assert.equal(second.actionEvidence.cleanup.removed.length, 0);
});

test("rerun creates new run id and preserves prior evidence", () => {
  const rerun = createRunHistoryEvidence({ action: "rerun" });
  const { previousRunId, newRunId } = rerun.actionEvidence.rerun;

  assert.notEqual(newRunId, previousRunId);
  assert.equal(rerun.history.some((entry) => entry.runId === previousRunId), true);
  assert.equal(rerun.history.some((entry) => entry.runId === newRunId && entry.rerunOf === previousRunId), true);
  assert.equal(rerun.actionEvidence.rerun.previousEvidencePreserved, true);
});

test("stale incomplete run recovery is visible with cleanup required", () => {
  const recovered = createRunHistoryEvidence({ action: "recover", selectedRunId: "run-history-recovered" });

  assert.equal(recovered.selected.state, "recovered");
  assert.equal(recovered.selected.recovery.recovered, true);
  assert.equal(recovered.selected.recovery.reason, "stale-incomplete-run");
  assert.equal(recovered.selected.cleanup.status, "pending");
});

test("run history evidence review gate passes", () => {
  const review = reviewRunHistoryEvidenceGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.cleanupIdempotent, true);
  assert.equal(review.checks.nativeBacked, true);
  assert.equal(review.checks.descriptorOnly, false);
});
