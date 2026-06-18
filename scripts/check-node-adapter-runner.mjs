#!/usr/bin/env node
import fs from "node:fs";
import { reviewNodeAdapterExecution } from "../src/core/node-adapter-runner.mjs";

const review = await reviewNodeAdapterExecution();
const doc = fs.readFileSync("docs/contracts/node-adapter-runner.md", "utf8");
const findings = [];

for (const phrase of [
  "signed and allowlisted",
  "packaged adapter",
  "fail before launch",
  "package manager",
  "lifecycle scripts",
  "inline scripts",
  "minimal environment",
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
    "src/core/node-adapter-runner.mjs",
    "adapters/node/echo-adapter.mjs",
    "docs/contracts/node-adapter-runner.md"
  ],
  summary: review.summary
}, null, 2));
