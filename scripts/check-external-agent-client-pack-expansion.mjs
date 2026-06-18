#!/usr/bin/env node
import { reviewExternalAgentClientPackExpansionGate } from "../src/core/external-agent-client-pack-expansion.mjs";

const validation = reviewExternalAgentClientPackExpansionGate();

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
