import assert from "node:assert/strict";
import test from "node:test";

import {
  captureWorkingSetCheckpoint,
  createMemoryWorkingSetCheckpointStore,
  createMemoryWorkingTarget,
  restoreWorkingSetCheckpoint,
  workingSetCheckpointPolicy
} from "../src/core/working-set-checkpoint.mjs";

const scopeId = "scope.runner-001";

function source(entries = [{ path: "state/input.json", content: '{"ready":true}', identityBefore: "file-1", identityAfter: "file-1" }]) {
  return { nativeOwned: true, dedicated: true, scopeId, entries };
}

test("capture commits immutable content before the authoritative CAS pointer", async () => {
  const order = [];
  const store = createMemoryWorkingSetCheckpointStore({ onStage: (stage) => order.push(stage) });
  const receipt = await captureWorkingSetCheckpoint(source(), store);

  assert.equal(receipt.committed, true);
  assert.equal(receipt.fileCount, 1);
  assert.deepEqual(order, ["content", "manifest", "pointer"]);
  assert.equal(store.current(scopeId).generationDigest, receipt.generationDigest);
  assert.equal(store.current(scopeId).manifest.entries[0].path, "state/input.json");
});

test("partial generation and CAS conflict never replace prior authority", async () => {
  const store = createMemoryWorkingSetCheckpointStore();
  const accepted = await captureWorkingSetCheckpoint(source(), store);
  await assert.rejects(
    captureWorkingSetCheckpoint(source([{ path: "state/next.txt", content: "next", identityBefore: "file-2", identityAfter: "file-2" }]), store, {
      expectedPointerDigest: "f".repeat(64)
    }),
    (error) => error.code === "working-set.cas-conflict"
  );
  await assert.rejects(
    captureWorkingSetCheckpoint(source([{ path: "state/partial.txt", content: "partial", identityBefore: "file-3", identityAfter: "file-3" }]), store, {
      expectedPointerDigest: accepted.generationDigest,
      faultAt: "after-content"
    })
  );
  assert.equal(store.current(scopeId).generationDigest, accepted.generationDigest);
});

test("capture rejects unsafe roots entries identities paths and policy overflow", async () => {
  const cases = [
    { root: { ...source(), nativeOwned: false }, code: "working-set.root-not-native" },
    { entries: [{ path: "../escape.txt", content: "x" }], code: "working-set.unsafe-path" },
    { entries: [{ path: "state/link.txt", content: "x", kind: "symlink" }], code: "working-set.non-regular" },
    { entries: [{ path: "state/reparse.txt", content: "x", reparsePoint: true }], code: "working-set.reparse-point" },
    { entries: [{ path: "state/hard.txt", content: "x", linkCount: 2 }], code: "working-set.hard-link" },
    { entries: [{ path: "CON.txt", content: "x" }], code: "working-set.reserved-name" },
    { entries: [{ path: ".env", content: "x" }], code: "working-set.private-path" },
    { entries: [{ path: "state/a.txt", content: "x", identityBefore: "one", identityAfter: "two" }], code: "working-set.identity-changed" },
    { entries: [{ path: "large.bin", content: "x".repeat(workingSetCheckpointPolicy.maxFileBytes + 1) }], code: "working-set.file-limit" }
  ];
  for (const fixture of cases) {
    const candidate = fixture.root ?? source(fixture.entries);
    await assert.rejects(captureWorkingSetCheckpoint(candidate, createMemoryWorkingSetCheckpointStore()), (error) => error.code === fixture.code);
  }
});

test("portable canonicalization catches case and Unicode normalization collisions", async () => {
  for (const entries of [
    [
      { path: "state/Value.txt", content: "a" },
      { path: "state/value.txt", content: "b" }
    ],
    [
      { path: "state/café.txt", content: "a" },
      { path: "state/cafe\u0301.txt", content: "b" }
    ]
  ]) {
    await assert.rejects(captureWorkingSetCheckpoint(source(entries), createMemoryWorkingSetCheckpointStore()), (error) => error.code === "working-set.path-collision");
  }
});

test("restore validates the complete bundle before invoking privileged reset", async () => {
  const store = createMemoryWorkingSetCheckpointStore();
  await captureWorkingSetCheckpoint(source(), store);
  store.tamper(scopeId, "state/input.json", "changed");
  const target = createMemoryWorkingTarget({ scopeId });

  await assert.rejects(restoreWorkingSetCheckpoint(scopeId, store, target), (error) => error.code === "working-set.integrity-failed");
  assert.deepEqual(target.actions(), []);
});

test("restore resets only a native dedicated root then stages and atomically activates", async () => {
  const store = createMemoryWorkingSetCheckpointStore();
  const capture = await captureWorkingSetCheckpoint(source(), store);
  const target = createMemoryWorkingTarget({ scopeId, initialState: "populated" });
  const receipt = await restoreWorkingSetCheckpoint(scopeId, store, target);

  assert.equal(receipt.restored, true);
  assert.equal(receipt.generationDigest, capture.generationDigest);
  assert.deepEqual(target.actions(), ["inspect", "reset", "inspect-empty", "stage", "activate"]);
  assert.equal(target.read("state/input.json"), '{"ready":true}');
  assert.equal(receipt.replaysExternalEffects, false);
});

test("post-reset failure reports cleanup-required and retries from validated immutable content", async () => {
  const store = createMemoryWorkingSetCheckpointStore();
  await captureWorkingSetCheckpoint(source(), store);
  const broken = createMemoryWorkingTarget({ scopeId, faultAt: "stage" });
  await assert.rejects(restoreWorkingSetCheckpoint(scopeId, store, broken), (error) => error.code === "working-set.cleanup-required");
  const retry = createMemoryWorkingTarget({ scopeId });
  assert.equal((await restoreWorkingSetCheckpoint(scopeId, store, retry)).restored, true);
});

test("checkpoint receipts remain path-relative redacted bounded and non-backup", async () => {
  const store = createMemoryWorkingSetCheckpointStore({ maxGenerations: 2 });
  const first = await captureWorkingSetCheckpoint(source(), store);
  const second = await captureWorkingSetCheckpoint(source([{ path: "state/next.txt", content: "next" }]), store, { expectedPointerDigest: first.generationDigest });
  await captureWorkingSetCheckpoint(source([{ path: "state/final.txt", content: "final" }]), store, { expectedPointerDigest: second.generationDigest });

  assert.equal(store.snapshot(scopeId).generations, 2);
  assert.doesNotMatch(JSON.stringify(store.snapshot(scopeId)), /[A-Za-z]:[\\/]|\/Users\/|\/home\/|bearer\s+|cookie=/iu);
  assert.equal(first.boundary.generalBackup, false);
  assert.equal(first.boundary.timeTravel, false);
  assert.equal(first.boundary.externalEffectReplay, false);
});
