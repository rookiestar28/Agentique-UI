import assert from "node:assert/strict";
import test from "node:test";
import { readNativeRunnerCleanupRecoveryInputs, reviewNativeRunnerCleanupRecovery } from "../src/core/native-runner-cleanup-recovery.mjs";

test("native runner cleanup recovery validation gate passes", () => {
  const review = reviewNativeRunnerCleanupRecovery();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.cleanupRecovery.nativeBacked, true);
  assert.equal(review.cleanupRecovery.descriptorOnly, false);
  assert.equal(review.cleanupRecovery.cancelCommandNativeBacked, true);
  assert.equal(review.cleanupRecovery.cleanupCommandIdempotent, true);
  assert.equal(review.cleanupRecovery.restartRecovery, true);
  assert.equal(review.cleanupRecovery.noOrphanEvidence, true);
});

test("native runner cleanup recovery rejects boundary-only cancel", () => {
  const input = readNativeRunnerCleanupRecoveryInputs();
  const weakened = reviewNativeRunnerCleanupRecovery({
    ...input,
    rustSource: input.rustSource.replace("cancel-cleanup", "boundary-accepted")
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-cleanup.cancel-command"));
});

test("native runner cleanup recovery rejects unsafe receipt material", () => {
  const input = readNativeRunnerCleanupRecoveryInputs();
  const unsafePath = ["C", ":/Users/example/raw "].join("");
  const unsafeResearchPath = ["ref", "erence", "/repos/private"].join("");
  const unsafeSecret = ["bearer", "abcdefghijklmnop"].join(" ");
  const weakened = reviewNativeRunnerCleanupRecovery({
    ...input,
    rustSource: `${input.rustSource}\nconst BAD_CLEANUP_RECEIPT: &str = "${unsafePath}${unsafeResearchPath} ${unsafeSecret}";`
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-cleanup.unsafe-receipt"));
});
