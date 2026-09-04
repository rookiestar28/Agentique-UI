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
  assert.equal(review.cleanupRecovery.windowsJobObjectContainment, true);
  assert.equal(review.cleanupRecovery.assignmentBeforeWorkload, true);
  assert.equal(review.cleanupRecovery.processTreeTerminationQuery, true);
  assert.equal(review.cleanupRecovery.evidenceDerivedReceipt, true);
  assert.equal(review.cleanupRecovery.realDescendantCoverage, true);
  assert.equal(review.cleanupRecovery.testModeNativeOnly, true);
  assert.equal(review.cleanupRecovery.restartFailsClosed, true);
  assert.equal(review.cleanupRecovery.unixDedicatedProcessGroup, true);
  assert.equal(review.cleanupRecovery.unixGroupTerminationProbe, true);
  assert.equal(review.cleanupRecovery.crossPlatformDescendantCoverage, true);
  assert.equal(review.cleanupRecovery.noShellOrPackageFallback, true);
  assert.equal(review.cleanupRecovery.missingRuntimeDeterministic, true);
});

test("native runner cleanup recovery rejects boundary-only cancel", () => {
  const input = readNativeRunnerCleanupRecoveryInputs();
  const cancelOffset = input.rustSource.indexOf("fn agentique_runner_cancel");
  assert.notEqual(cancelOffset, -1);
  const rustSource =
    input.rustSource.slice(0, cancelOffset) + input.rustSource.slice(cancelOffset).replace("coordinator.cancel_requested.store(true", "coordinator.cancel_requested.load(");
  const weakened = reviewNativeRunnerCleanupRecovery({
    ...input,
    rustSource
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

test("native runner cleanup recovery rejects constant-only no-orphan claims", () => {
  const input = readNativeRunnerCleanupRecoveryInputs();
  const weakened = reviewNativeRunnerCleanupRecovery({
    ...input,
    rustSource: input.rustSource
      .replace("process_tree_cleanup: cleanup.process_tree_cleanup", "process_tree_cleanup: true")
      .replace("orphan_count: cleanup.orphan_count", "orphan_count: Some(0)")
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-cleanup.evidence-derived-receipt"));
});

test("native runner cleanup recovery rejects process assignment after workload framing", () => {
  const input = readNativeRunnerCleanupRecoveryInputs();
  const weakened = reviewNativeRunnerCleanupRecovery({
    ...input,
    rustSource: input.rustSource.replace("process_tree_supervisor.assign_child(&child)", "removed_assignment(&child)")
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-cleanup.assignment-before-workload"));
});

test("native runner cleanup recovery rejects missing job termination query", () => {
  const input = readNativeRunnerCleanupRecoveryInputs();
  const weakened = reviewNativeRunnerCleanupRecovery({
    ...input,
    rustSource: input.rustSource.replaceAll("QueryInformationJobObject", "removedJobQuery")
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-cleanup.process-tree-termination-query"));
});

test("native runner cleanup recovery rejects false restart cleanup success", () => {
  const input = readNativeRunnerCleanupRecoveryInputs();
  const weakened = reviewNativeRunnerCleanupRecovery({
    ...input,
    rustSource: input.rustSource.replaceAll(
      'NativeProcessCleanupObservation::unverified("restart-supervisor-unavailable")',
      'NativeProcessCleanupObservation::verified_zero("restart-supervisor-unavailable")'
    )
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-cleanup.restart-fails-closed"));
});

test("native runner cleanup recovery rejects a caller-selected descendant executable", () => {
  const input = readNativeRunnerCleanupRecoveryInputs();
  const weakened = reviewNativeRunnerCleanupRecovery({
    ...input,
    adapterSource: input.adapterSource.replace("[sys.executable,", '[request.get("executable"),')
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-cleanup.test-mode-native-only"));
});

test("native runner cleanup recovery rejects missing Unix process-group creation", () => {
  const input = readNativeRunnerCleanupRecoveryInputs();
  const weakened = reviewNativeRunnerCleanupRecovery({
    ...input,
    rustSource: input.rustSource.replace(".process_group(0)", ".process_group(-1)")
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-cleanup.unix-dedicated-process-group"));
});

test("native runner cleanup recovery rejects missing Unix group termination", () => {
  const input = readNativeRunnerCleanupRecoveryInputs();
  const weakened = reviewNativeRunnerCleanupRecovery({
    ...input,
    rustSource: input.rustSource.replaceAll("libc::killpg", "removed_group_signal")
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-cleanup.unix-group-termination-probe"));
});

test("native runner cleanup recovery rejects unverified Unix process-group ownership", () => {
  const input = readNativeRunnerCleanupRecoveryInputs();
  const weakened = reviewNativeRunnerCleanupRecovery({
    ...input,
    rustSource: input.rustSource.replaceAll("libc::getpgid", "removed_group_identity_probe")
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-cleanup.unix-dedicated-process-group"));
});

test("native runner cleanup recovery rejects shell fallback in runtime resolution", () => {
  const input = readNativeRunnerCleanupRecoveryInputs();
  const weakened = reviewNativeRunnerCleanupRecovery({
    ...input,
    rustSource: input.rustSource.replace('["python", "python3"]', '["python", "python3", "sh"]')
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-cleanup.no-shell-or-package-fallback"));
});
