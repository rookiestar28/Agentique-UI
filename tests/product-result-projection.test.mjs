import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryAtomicProductResultRepository, createProductResultProjector, migrateLegacyProjectionExport } from "../src/core/product-result-projection.mjs";

const address = Object.freeze({
  resourceId: "resource.projection-001",
  sessionId: "session.projection-001",
  runId: "run.projection-001"
});

function candidate(overrides = {}) {
  return {
    address,
    candidateDigest: "a".repeat(64),
    state: "succeeded",
    terminalMetadata: { code: "run.succeeded", message: "Run completed." },
    artifacts: [
      {
        id: "artifact.result",
        path: "artifacts/result.json",
        digest: "b".repeat(64),
        bytes: 128,
        mediaType: "application/json",
        redacted: true
      }
    ],
    ...overrides
  };
}

test("projector awaits an atomic product commit before publishing success", async () => {
  const order = [];
  const repository = createMemoryAtomicProductResultRepository({ onStage: (stage) => order.push(stage) });
  const projector = createProductResultProjector({
    repository,
    publishTerminal: async (terminal) => {
      order.push(`publish:${terminal.state}`);
    }
  });

  const result = await projector.project(candidate());

  assert.equal(result.ok, true);
  assert.equal(result.receipt.committed, true);
  assert.deepEqual(order, ["content", "manifest", "pointer", "publish:succeeded"]);
  assert.equal(repository.reconcile(address).classification, "completed");
});

test("same address and digest is idempotent while a conflicting candidate fails closed", async () => {
  const repository = createMemoryAtomicProductResultRepository();
  const first = await repository.commit(candidate());
  const repeat = await repository.commit(candidate());

  assert.equal(first.idempotent, false);
  assert.equal(repeat.idempotent, true);
  await assert.rejects(repository.commit(candidate({ candidateDigest: "c".repeat(64) })), (error) => error.code === "product-projection.digest-conflict");
});

test("faults before the authoritative pointer never replay partial success", async () => {
  for (const faultAt of ["before-content", "after-content", "after-manifest"]) {
    const repository = createMemoryAtomicProductResultRepository();
    await assert.rejects(repository.commit(candidate(), { faultAt }));
    const recovery = repository.reconcile(address);
    assert.notEqual(recovery.classification, "completed");
    assert.equal(recovery.replayUnknownEffect, false);
  }
});

test("projection failure emits one safe error terminal and quarantines output", async () => {
  const repository = createMemoryAtomicProductResultRepository();
  const terminals = [];
  const projector = createProductResultProjector({
    repository,
    publishTerminal: async (terminal) => terminals.push(terminal)
  });

  const result = await projector.project(candidate({ artifacts: [{ path: "../secret.txt", redacted: false }] }));

  assert.equal(result.ok, false);
  assert.equal(result.quarantined, true);
  assert.deepEqual(terminals, [
    {
      state: "failed",
      code: "product-projection.failed",
      message: "Product result could not be committed safely."
    }
  ]);
  assert.doesNotMatch(JSON.stringify(result), /secret\.txt|[A-Za-z]:[\\/]|bearer\s+/iu);
});

test("recovery distinguishes durable terminal, interrupted, partial, corrupt, unsupported, and orphaned", async () => {
  const repository = createMemoryAtomicProductResultRepository();
  const completed = { ...address, runId: "run.completed" };
  const interrupted = { ...address, runId: "run.interrupted" };
  const partial = { ...address, runId: "run.partial" };
  const corrupt = { ...address, runId: "run.corrupt" };
  const unsupported = { ...address, runId: "run.unsupported" };
  const orphaned = { ...address, runId: "run.orphaned" };

  await repository.commit(candidate({ address: completed }));
  repository.markActive(interrupted);
  await assert.rejects(repository.commit(candidate({ address: partial }), { faultAt: "after-content" }));
  repository.seedRecoveryState(corrupt, "corrupt");
  repository.seedRecoveryState(unsupported, "unsupported");
  repository.seedRecoveryState(orphaned, "orphaned");

  assert.equal(repository.reconcile(completed).classification, "completed");
  assert.equal(repository.reconcile(interrupted).classification, "cleanup-required");
  assert.equal(repository.reconcile(partial).classification, "partial");
  assert.equal(repository.reconcile(corrupt).classification, "corrupt");
  assert.equal(repository.reconcile(unsupported).classification, "unsupported");
  assert.equal(repository.reconcile(orphaned).classification, "orphaned");
  for (const current of [interrupted, partial, corrupt, unsupported, orphaned]) {
    assert.equal(repository.reconcile(current).replayUnknownEffect, false);
  }
});

test("a committed terminal remains authoritative when UI publication fails", async () => {
  const repository = createMemoryAtomicProductResultRepository();
  const projector = createProductResultProjector({
    repository,
    publishTerminal: async () => {
      throw new Error("listener unavailable");
    }
  });

  const result = await projector.project(candidate());

  assert.equal(result.ok, true);
  assert.equal(result.published, false);
  assert.equal(result.receipt.committed, true);
  assert.equal(repository.reconcile(address).classification, "completed");
});

test("legacy projection migration is explicit bounded and rollback-aware", () => {
  const migrated = migrateLegacyProjectionExport({
    schemaVersion: "agentique.durableRunLedger.v0",
    runs: [{ id: "run.legacy-001", status: "succeeded", log: "safe legacy summary" }]
  });

  assert.equal(migrated.schemaVersion, "agentique.productResultProjectionMigration.v1");
  assert.equal(migrated.runs[0].state, "succeeded");
  assert.equal(migrated.rollback.from, "agentique.durableRunLedger.v0");
  assert.equal(migrated.boundary.importsRendererStorageAutomatically, false);
  assert.throws(
    () => migrateLegacyProjectionExport({ schemaVersion: "agentique.unknown.v9", runs: [] }),
    (error) => error.code === "product-projection.unsupported-migration"
  );
});
