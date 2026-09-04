#!/usr/bin/env node
import { localRunStates, reviewLocalRunStateMachine } from "../src/core/local-run-state-machine.mjs";

const review = reviewLocalRunStateMachine();
const findings = [];

if (!review.ok) {
  findings.push(...review.errors.map((error) => error.message));
}

if (!review.forbiddenJumpBlocked) {
  findings.push("Forbidden queued-to-running jump must be blocked.");
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: ["src/core/local-run-state-machine.mjs"],
      states: localRunStates
    },
    null,
    2
  )
);
