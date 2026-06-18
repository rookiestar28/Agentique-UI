#!/usr/bin/env node
import fs from "node:fs";
import { reviewPythonAdapterExecution } from "../src/core/python-adapter-runner.mjs";

const review = await reviewPythonAdapterExecution();
const doc = fs.readFileSync("docs/contracts/python-adapter-runner.md", "utf8");
const findings = [];

for (const phrase of [
  "signed and allowlisted",
  "fail before launch",
  "minimal environment",
  "timeout",
  "cancellation",
  "cleanup receipt",
  "redacted"
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
    "src/core/python-adapter-runner.mjs",
    "adapters/python/echo_adapter.py",
    "docs/contracts/python-adapter-runner.md"
  ],
  summary: review.summary
}, null, 2));
