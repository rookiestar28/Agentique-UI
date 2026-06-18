import assert from "node:assert/strict";
import test from "node:test";
import {
  createDurableRunLedger,
  createDurableRunLedgerSurface,
  createMemoryDurableRunLedgerStorage,
  durableRunLedgerSchemaVersion,
  reviewDurableRunLedgerGate
} from "../src/core/durable-run-ledger.mjs";

test("durable run ledger replays records after app reload", () => {
  const storage = createMemoryDurableRunLedgerStorage();
  const first = createDurableRunLedger({ storage, maxRuns: 5 });
  const appended = first.appendRun({
    runId: "run-ledger-success-001",
    state: "succeeded",
    logs: ["completed with redacted output"],
    artifacts: [{ id: "artifact-json", path: "artifacts/result.json", digest: "sha256:abc123", bytes: 128 }]
  });
  const reloaded = createDurableRunLedger({ storage, maxRuns: 5 });
  const replay = reloaded.replayAfterRestart();

  assert.equal(appended.snapshot.schemaVersion, durableRunLedgerSchemaVersion);
  assert.equal(replay.status, "replayed");
  assert.equal(replay.runs.length, 1);
  assert.equal(replay.runs[0].runId, "run-ledger-success-001");
  assert.equal(replay.boundary.noCloudSessionDependency, true);
});

test("legacy snapshots migrate with rollback evidence", () => {
  const legacy = {
    schemaVersion: "agentique.durableRunLedger.v0",
    runs: [{ id: "legacy-run-001", status: "succeeded", log: "legacy log" }]
  };
  const storage = createMemoryDurableRunLedgerStorage(JSON.stringify(legacy));
  const ledger = createDurableRunLedger({ storage, maxRuns: 5 });
  const replay = ledger.replayAfterRestart();

  assert.equal(replay.status, "migrated");
  assert.equal(replay.snapshot.schemaVersion, durableRunLedgerSchemaVersion);
  assert.equal(replay.snapshot.migration.from, "agentique.durableRunLedger.v0");
  assert.equal(replay.snapshot.rollback.previousSchemaVersion, "agentique.durableRunLedger.v0");
  assert.equal(replay.runs[0].runId, "legacy-run-001");
});

test("corrupt storage falls back without replaying stale success", () => {
  const storage = createMemoryDurableRunLedgerStorage("{not-json");
  const ledger = createDurableRunLedger({ storage, maxRuns: 5 });
  const replay = ledger.replayAfterRestart();

  assert.equal(replay.status, "corrupt-fallback");
  assert.equal(replay.runs.length, 0);
  assert.equal(replay.errors[0].code, "durable-run-ledger.corrupt-storage");
  assert.equal(replay.snapshot.recovery.corruptFallback, true);
});

test("retention and export are bounded redacted and path-neutral", () => {
  const storage = createMemoryDurableRunLedgerStorage();
  const ledger = createDurableRunLedger({ storage, maxRuns: 3 });
  for (let index = 0; index < 6; index += 1) {
    ledger.appendRun({
      runId: `run-ledger-${index}`,
      state: index % 2 === 0 ? "succeeded" : "failed",
      logs: [`line ${index} bearer abcdefghijklmnop should redact`],
      artifacts: [{ id: `artifact-${index}`, path: `artifacts/output-${index}.json`, digest: `sha256:${index}`, bytes: 64 }]
    });
  }
  const exported = ledger.exportLedger({ maxRuns: 2 });

  assert.equal(exported.summary.exportedRuns, 2);
  assert.equal(exported.summary.retainedRuns, 3);
  assert.equal(exported.summary.truncated, true);
  assert.doesNotMatch(JSON.stringify(exported), /[A-Za-z]:[\\/]|Bearer\s+|sk-[a-z0-9_-]+|cookie|token|vault:[a-z]/iu);
  assert.equal(
    exported.runs.every((run) => run.logs.every((log) => log.redacted === true)),
    true
  );
});

test("durable run ledger surface exposes replay migrate corrupt and export samples", () => {
  const replay = createDurableRunLedgerSurface({ action: "replay" });
  const migrate = createDurableRunLedgerSurface({ action: "migrate" });
  const corrupt = createDurableRunLedgerSurface({ action: "corrupt" });
  const exported = createDurableRunLedgerSurface({ action: "export" });

  assert.equal(replay.replay.status, "replayed");
  assert.equal(migrate.replay.status, "migrated");
  assert.equal(corrupt.replay.status, "corrupt-fallback");
  assert.equal(exported.export.summary.truncated, true);
  assert.equal(exported.boundary.noSignedInstallerDependency, true);
});

test("durable run ledger gate proves replay migration fallback export and no dependency widening", () => {
  const review = reviewDurableRunLedgerGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.restartReplay, true);
  assert.equal(review.checks.migrationRollback, true);
  assert.equal(review.checks.corruptionFallback, true);
  assert.equal(review.checks.boundedRetentionExport, true);
  assert.equal(review.checks.redactedPathNeutralExport, true);
  assert.equal(review.checks.noInstallerOrCloudDependency, true);
});
