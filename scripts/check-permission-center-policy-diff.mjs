#!/usr/bin/env node
import { permissionCenterPolicyDiffSchemaVersion, reviewPermissionCenterPolicyDiff } from "../src/core/permission-center-policy-diff.mjs";

const result = reviewPermissionCenterPolicyDiff();
const output = JSON.stringify(
  {
    status: result.validation.ok ? "passed" : "failed",
    schemaVersion: permissionCenterPolicyDiffSchemaVersion,
    summary: result.validation.summary,
    failures: result.validation.failures
  },
  null,
  2
);

if (!result.validation.ok) {
  console.error(output);
  process.exit(1);
}

console.log(output);
