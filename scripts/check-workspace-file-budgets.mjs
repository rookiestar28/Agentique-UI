#!/usr/bin/env node
import { reviewWorkspaceFileBudgets } from "../src/core/workspace-file-budgets.mjs";

const { report, validation } = reviewWorkspaceFileBudgets();

if (!validation.ok) {
  console.error(
    JSON.stringify(
      {
        status: validation.status,
        failures: validation.failures,
        summary: validation.summary
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
      status: validation.status,
      schemaVersion: report.schemaVersion,
      summary: validation.summary,
      checked: report.files.map((file) => ({
        path: file.path,
        lines: file.lines,
        maxLines: file.maxLines,
        role: file.role
      }))
    },
    null,
    2
  )
);
