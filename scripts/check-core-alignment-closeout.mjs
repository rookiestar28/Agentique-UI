#!/usr/bin/env node
import fs from "node:fs";

const failures = [];
const readinessSource = readText("src/core/core-alignment-readiness.mjs");
const packageJson = JSON.parse(readText("package.json"));

requireIncludes(
  readinessSource,
  [
    "coreAlignmentReadinessVersion",
    "createCoreAlignmentReadiness",
    "validateCoreAlignmentReadiness",
    "unsupported_claim_enabled",
    "missing_alignment_surface",
    "unsafe_readiness_text"
  ],
  "core alignment readiness source"
);

if (!String(packageJson.scripts?.["validate:core-alignment"] ?? "").includes("check-core-alignment-closeout.mjs")) {
  failures.push("package.json must expose validate:core-alignment");
}
if (!String(packageJson.scripts?.validate ?? "").includes("validate:core-alignment")) {
  failures.push("npm run validate must include validate:core-alignment");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: ["src/core/core-alignment-readiness.mjs", "package.json"]
    },
    null,
    2
  )
);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const value of required) {
    if (!text.includes(value)) {
      failures.push(`${label} missing required text: ${value}`);
    }
  }
}
