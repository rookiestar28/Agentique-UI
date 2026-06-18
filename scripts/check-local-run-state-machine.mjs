#!/usr/bin/env node
import fs from "node:fs";
import { localRunStates, reviewLocalRunStateMachine } from "../src/core/local-run-state-machine.mjs";

const review = reviewLocalRunStateMachine();
const doc = fs.readFileSync("docs/contracts/local-run-state-machine.md", "utf8");
const findings = [];

for (const state of localRunStates) {
  if (!doc.includes(`\`${state}\``)) {
    findings.push(`Contract doc missing state ${state}.`);
  }
}

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

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/local-run-state-machine.mjs",
    "docs/contracts/local-run-state-machine.md"
  ],
  states: localRunStates
}, null, 2));
