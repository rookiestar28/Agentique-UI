#!/usr/bin/env node
import { reviewRunDashboardQueueMonitor, runDashboardQueueMonitorSchemaVersion } from "../src/core/run-dashboard-queue-monitor.mjs";

const result = reviewRunDashboardQueueMonitor();
const output = JSON.stringify(
  {
    status: result.validation.ok ? "passed" : "failed",
    schemaVersion: runDashboardQueueMonitorSchemaVersion,
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
