#!/usr/bin/env node
import { reviewRunFolderWriter } from "../src/core/run-folder-writer.mjs";

const review = reviewRunFolderWriter();
const findings = [];

if (!review.ok) {
  findings.push(...review.errors.map((error) => error.message));
}

if ((review.summary.files ?? 0) < 7) {
  findings.push("Writer must materialize the expected run folder files.");
}
if (review.summary.atomicPublished !== true || review.summary.integrityValidated !== true) {
  findings.push("Writer must atomically publish and validate the committed SHA-256 inventory.");
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: ["src/core/run-folder-writer.mjs"],
      summary: review.summary
    },
    null,
    2
  )
);
