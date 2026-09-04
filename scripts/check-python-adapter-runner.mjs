#!/usr/bin/env node
import { reviewPythonAdapterExecution } from "../src/core/python-adapter-runner.mjs";

const review = await reviewPythonAdapterExecution();
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
      checked: ["src/core/python-adapter-runner.mjs", "adapters/python/echo_adapter.py"],
      summary: review.summary
    },
    null,
    2
  )
);
