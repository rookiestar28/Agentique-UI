#!/usr/bin/env node
import fs from "node:fs";
import { reviewRunFolderWriter } from "../src/core/run-folder-writer.mjs";

const review = reviewRunFolderWriter();
const doc = fs.readFileSync("docs/contracts/run-folder-writer.md", "utf8");
const findings = [];

for (const phrase of ["run.json", "stdout", "stderr", "viewer metadata", "cleanup receipt", "reproducibility digest"]) {
  if (!doc.toLowerCase().includes(phrase)) {
    findings.push(`Contract doc missing ${phrase}.`);
  }
}

if (!review.ok) {
  findings.push(...review.errors.map((error) => error.message));
}

if ((review.summary.files ?? 0) < 7) {
  findings.push("Writer must materialize the expected run folder files.");
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/run-folder-writer.mjs",
    "docs/contracts/run-folder-writer.md"
  ],
  summary: review.summary
}, null, 2));
