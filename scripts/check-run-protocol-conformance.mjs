#!/usr/bin/env node
import fs from "node:fs";
import { reviewRunProtocolConformance } from "../src/core/run-protocol-conformance.mjs";

const failures = [];
const review = reviewRunProtocolConformance();
const packageJson = JSON.parse(read("package.json"));

if (!review.ok) failures.push(...review.errors.map((error) => error.message ?? error.code));

for (const [file, phrases] of Object.entries({
  "src/core/run-protocol.mjs": [
    "agentique.runProtocolEvent.v1",
    "createRunProtocolProducer",
    "createRunProtocolConsumer",
    "createRunProtocolJournal",
    "canonicalEventDigest",
    "resync-required",
    "event-after-terminal"
  ],
  "src/core/run-protocol-conformance.mjs": ["adaptNativeRunnerEvent", "adaptNativeRunnerReplay", "diagnostic-only", "capabilityNeutral"],
  "tests/run-protocol.test.mjs": ["complete address", "conflicting duplicates", "every second terminal", "stale cursor resync", "diagnostic trace"]
})) {
  const text = read(file);
  for (const phrase of phrases) if (!text.includes(phrase)) failures.push(`${file} missing required phrase: ${phrase}`);
}

if (!String(packageJson.scripts?.["validate:run-protocol"] ?? "").includes("check-run-protocol-conformance.mjs")) {
  failures.push("package scripts must define validate:run-protocol");
}
if (!String(packageJson.scripts?.validate ?? "").includes("npm run validate:run-protocol")) {
  failures.push("full validate script must include validate:run-protocol");
}
if (!Object.values(review.boundary).every((value) => value === false)) {
  failures.push("run protocol conformance must not widen execution or data capabilities");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures, review }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: [
        "src/core/run-protocol.mjs",
        "src/core/run-protocol-conformance.mjs",
        "schemas/run-protocol-event.schema.json",
        "examples/run-protocol-event.valid.json",
        "tests/run-protocol.test.mjs",
        "tests/run-protocol-conformance.test.mjs",
        "package.json"
      ],
      summary: review.summary
    },
    null,
    2
  )
);

function read(file) {
  return fs.readFileSync(file, "utf8");
}
