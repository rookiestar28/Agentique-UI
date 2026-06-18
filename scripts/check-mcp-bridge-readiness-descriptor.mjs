#!/usr/bin/env node
import { reviewMcpBridgeReadinessDescriptorGate } from "../src/core/mcp-bridge-readiness-descriptor.mjs";

const validation = reviewMcpBridgeReadinessDescriptorGate();

console.log(
  JSON.stringify(
    {
      status: validation.ok ? "passed" : "failed",
      schemaVersion: validation.schemaVersion,
      checks: validation.checks,
      errors: validation.errors
    },
    null,
    2
  )
);

if (!validation.ok) {
  process.exit(1);
}
