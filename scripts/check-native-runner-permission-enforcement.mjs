#!/usr/bin/env node
import { reviewNativeRunnerPermissionEnforcement } from "../src/core/native-runner-permission-enforcement.mjs";

const review = reviewNativeRunnerPermissionEnforcement();

if (!review.ok) {
  console.error(
    JSON.stringify(
      {
        schemaVersion: review.schemaVersion,
        ok: review.ok,
        permission: review.permission,
        requestFields: review.requestFields,
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
      permission: review.permission
    },
    null,
    2
  )
);
