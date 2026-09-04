import assert from "node:assert/strict";
import test from "node:test";
import { readNativeRunRegistryInputs, reviewNativeRunRegistry } from "../src/core/native-runner-durable-registry.mjs";

test("native durable run registry gate passes", () => {
  const review = reviewNativeRunRegistry();
  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.ok(Object.values(review.checks).every(Boolean));
});

test("native durable run registry rejects non-atomic publication", () => {
  const input = readNativeRunRegistryInputs();
  const review = reviewNativeRunRegistry({
    ...input,
    rustSource: input.rustSource.replace("fs::rename(&temporary, &final_path)", "fs::copy(&temporary, &final_path)")
  });
  assert.equal(review.checks.boundedAppendOnlyLedger, false);
});

test("native durable run registry rejects persisted authorization", () => {
  const input = readNativeRunRegistryInputs();
  const marker = "struct NativeDurableRunRegistryRecord {";
  const review = reviewNativeRunRegistry({
    ...input,
    rustSource: input.rustSource.replace(marker, `${marker}\n    approval_id: String,`)
  });
  assert.equal(review.checks.nonAuthorizing, false);
});

test("native durable run registry rejects acknowledgement before persistence", () => {
  const input = readNativeRunRegistryInputs();
  const weakened = input.rustSource.replace(
    "initialize_native_run_registry(&request)?;",
    "let _registry_persistence_removed = true;"
  );
  assert.notEqual(weakened, input.rustSource);
  const review = reviewNativeRunRegistry({ ...input, rustSource: weakened });
  assert.equal(review.checks.transitionBeforeAcknowledgement, false);
});

test("native durable run registry rejects projection-first legacy recovery", () => {
  const input = readNativeRunRegistryInputs();
  const review = reviewNativeRunRegistry({
    ...input,
    rustSource: input.rustSource.replace("recover_native_registry_record_if_needed", "removed_registry_recovery")
  });
  assert.equal(review.checks.restartReconciliation, false);
});

test("native durable run registry rejects missing corruption coverage", () => {
  const input = readNativeRunRegistryInputs();
  const review = reviewNativeRunRegistry({
    ...input,
    rustSource: input.rustSource.replace("durable_native_run_registry_rejects_corruption_gap_and_scope_tamper", "removed_corruption_test")
  });
  assert.equal(review.checks.corruptionFailsClosed, false);
});
