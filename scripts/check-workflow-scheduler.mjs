#!/usr/bin/env node
import { reviewWorkflowScheduler } from "../src/core/workflow-scheduler.mjs";

const review = reviewWorkflowScheduler();
const findings = [];

if (!review.ok) {
  findings.push(...review.errors.map((error) => error.message));
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: ["src/core/workflow-scheduler.mjs"],
      summary: review.summary
    },
    null,
    2
  )
);
