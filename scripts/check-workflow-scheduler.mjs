#!/usr/bin/env node
import fs from "node:fs";
import { reviewWorkflowScheduler } from "../src/core/workflow-scheduler.mjs";

const review = reviewWorkflowScheduler();
const doc = fs.readFileSync("docs/contracts/workflow-scheduler.md", "utf8");
const findings = [];

for (const phrase of [
  "allowlisted node families",
  "unsupported",
  "topological order",
  "branch",
  "merge",
  "retries",
  "failure propagation",
  "cancellation",
  "artifact mapping",
  "cleanup receipt"
]) {
  if (!doc.toLowerCase().includes(phrase)) {
    findings.push(`Contract doc missing ${phrase}.`);
  }
}

if (!review.ok) {
  findings.push(...review.errors.map((error) => error.message));
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/workflow-scheduler.mjs",
    "docs/contracts/workflow-scheduler.md"
  ],
  summary: review.summary
}, null, 2));
