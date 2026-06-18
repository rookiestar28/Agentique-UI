#!/usr/bin/env node
import { reviewNativeRunnerCleanupRecovery } from "../src/core/native-runner-cleanup-recovery.mjs";

const review = reviewNativeRunnerCleanupRecovery();

if (!review.ok) {
  console.error(
    JSON.stringify(
      {
        schemaVersion: review.schemaVersion,
        ok: review.ok,
        cleanupRecovery: review.cleanupRecovery,
        errors: review.errors
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      schemaVersion: review.schemaVersion,
      cleanupRecovery: review.cleanupRecovery
    },
    null,
    2
  )
);
