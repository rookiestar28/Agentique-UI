#!/usr/bin/env node
import { reviewStyleSourceBoundary } from "../src/core/style-source-boundary.mjs";

const report = reviewStyleSourceBoundary();

if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: report.status,
      manifest: report.manifest,
      shards: report.shards,
      bundle: {
        lines: report.bundle.lines,
        stylelintDependencyStatus: report.bundle.stylelintDependencyStatus
      }
    },
    null,
    2
  )
);
