#!/usr/bin/env node
import { reviewNodeAdapterExecution } from "../src/core/node-adapter-runner.mjs";

const review = await reviewNodeAdapterExecution();
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
      checked: ["src/core/node-adapter-runner.mjs", "adapters/node/echo-adapter.mjs"],
      summary: review.summary
    },
    null,
    2
  )
);
