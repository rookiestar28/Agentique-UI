#!/usr/bin/env node
import fs from "node:fs";

const failures = [];
const closeout = readText("docs/validation/core-alignment-closeout.md");
const readinessSource = readText("src/core/core-alignment-readiness.mjs");
const packageJson = JSON.parse(readText("package.json"));

requireIncludes(closeout, [
  "Status: contract alignment complete; desktop distribution remains No-Go.",
  "public readback envelope",
  "POST download handoff",
  "import deep link",
  "resource bundle projection",
  "workflow graph projection",
  "contract fixture drift gate",
  "fixture-backed local import smoke",
  "No released installer.",
  "No signed updater.",
  "No production desktop runtime or broad native backend claim.",
  "No live production byte-transfer claim",
  "`npm run validate`"
], "core alignment closeout");

requireIncludes(readinessSource, [
  "coreAlignmentReadinessVersion",
  "createCoreAlignmentReadiness",
  "validateCoreAlignmentReadiness",
  "unsupported_claim_enabled",
  "missing_alignment_surface",
  "unsafe_readiness_text"
], "core alignment readiness source");

if (!String(packageJson.scripts?.["validate:core-alignment"] ?? "").includes("check-core-alignment-closeout.mjs")) {
  failures.push("package.json must expose validate:core-alignment");
}
if (!String(packageJson.scripts?.validate ?? "").includes("validate:core-alignment")) {
  failures.push("npm run validate must include validate:core-alignment");
}

const unsafePattern = new RegExp(
  [
    "sk-[A-Za-z0-9_-]{6,}",
    "ghp_[A-Za-z0-9_]{12,}",
    "github_pat_[A-Za-z0-9_]{12,}",
    "bearer\\s+[A-Za-z0-9._-]{12,}",
    "(?:^|[\\s\"'`(])[A-Za-z]:[\\\\/]",
    ["file", "://"].join(""),
    ["\\b", "R", "\\d{4}\\b"].join(""),
    ["\\.plan", "ning"].join(""),
    ["ref", "erence[\\\\/]docs"].join("")
  ].join("|"),
  "iu"
);
for (const [label, text] of [
  ["core alignment closeout", closeout],
  ["core alignment readiness source", readinessSource]
]) {
  if (unsafePattern.test(text)) {
    failures.push(`${label} contains unsafe public text`);
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "docs/validation/core-alignment-closeout.md",
    "src/core/core-alignment-readiness.mjs",
    "package.json"
  ]
}, null, 2));

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
