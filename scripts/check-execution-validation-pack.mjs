#!/usr/bin/env node
import fs from "node:fs";
import { reviewExecutionValidationPackGate } from "../src/core/execution-validation-pack.mjs";

const failures = [];
const review = reviewExecutionValidationPackGate();
const moduleText = readText("src/core/execution-validation-pack.mjs");
const tests = readText("tests/execution-validation-pack.test.mjs");
const evidence = readText("docs/validation/runner-ui-execution-evidence.md");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message));
}

requireIncludes(moduleText, [
  "agentique.executionValidationPack.v1",
  "createExecutionValidationPack",
  "reviewExecutionValidationPackGate",
  "assertExecutionValidationPackSafe",
  "\"timed-out\"",
  "\"human-approval\"",
  "productionDesktopRuntime: false",
  "hostedRuntime: false",
  "universalRuntime: false",
  "noBridgeStart: true",
  "noRuntimeStart: true",
  "validate:execution-validation-pack"
], "execution validation pack module");

requireIncludes(tests, [
  "execution validation pack covers every release demo flow",
  "visual and interaction evidence references Graph and Run execution artifacts",
  "gate evidence aggregates execution-layer validators without runtime claims",
  "execution validation pack safety rejects secrets paths commands internal markers and executable claims",
  "execution validation pack review gate passes"
], "execution validation pack tests");

requireIncludes(evidence, [
  "Release-grade execution validation pack",
  "deterministic scheduler, Python and Node adapter lanes",
  "cancellation, timeout, cleanup, rerun, and human approval evidence"
], "runner UI evidence doc");

if (!String(packageJson.scripts?.["validate:execution-validation-pack"] ?? "").includes("check-execution-validation-pack.mjs")) {
  failures.push("package scripts must define validate:execution-validation-pack");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:execution-validation-pack")) {
  failures.push("validate script must include validate:execution-validation-pack");
}

for (const artifact of [
  "docs/validation/artifacts/runner-ui-graph-desktop.png",
  "docs/validation/artifacts/runner-ui-run-mobile.png"
]) {
  if (!fs.existsSync(artifact)) {
    failures.push(`missing screenshot artifact: ${artifact}`);
  } else if (fs.statSync(artifact).size < 1000) {
    failures.push(`screenshot artifact is unexpectedly small: ${artifact}`);
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/execution-validation-pack.mjs",
    "tests/execution-validation-pack.test.mjs",
    "docs/validation/runner-ui-execution-evidence.md",
    "docs/validation/artifacts/runner-ui-graph-desktop.png",
    "docs/validation/artifacts/runner-ui-run-mobile.png",
    "package.json"
  ],
  summary: review.summary
}, null, 2));

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}
