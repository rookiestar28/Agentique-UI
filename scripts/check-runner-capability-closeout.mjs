#!/usr/bin/env node
import fs from "node:fs";
import { reviewRunnerCapabilityCloseoutGate } from "../src/core/runner-capability-closeout-gate.mjs";

const requiredValidateEntries = [
  "validate:contracts",
  "validate:native-runner-boundary",
  "validate:local-run-state-machine",
  "validate:permission-grants",
  "validate:run-folder-writer",
  "validate:python-adapter-runner",
  "validate:node-adapter-runner",
  "validate:workflow-scheduler",
  "validate:graph-run-execution-ui",
  "validate:external-runtime-bridge-guard",
  "validate:wasm-wasi-sandbox-gate",
  "validate:rootless-container-preflight-gate",
  "validate:desktop-runner-validation-gate",
  "validate:runner-capability-closeout",
  "npm test",
  "validate:public"
];

const failures = [];
const moduleText = readText("src/core/runner-capability-closeout-gate.mjs");
const tests = readText("tests/runner-capability-closeout-gate.test.mjs");
const closeout = readText("docs/validation/runner-capability-closeout.md");
const packageJson = JSON.parse(readText("package.json"));
const review = reviewRunnerCapabilityCloseoutGate();

requireIncludes(moduleText, [
  "agentique.runnerCapabilityCloseout.v1",
  "requiredValidationSteps",
  "runner-capability-contract",
  "native-command-boundary",
  "python-adapter",
  "node-adapter",
  "wasm-preflight",
  "container-preflight",
  "supported-local-only",
  "productionDesktopRuntime"
], "runner capability closeout module");

requireIncludes(tests, [
  "runner capability closeout accepts supported local-only scope",
  "missing runner validation steps fail closed",
  "capability records must be accepted and path-neutral",
  "release and runtime overclaims are blocked",
  "public safety checks must pass",
  "closeout document states supported local-only scope and blocked release claims"
], "runner capability closeout tests");

requireIncludes(closeout, [
  "Runner Capability Closeout",
  "supported-local-only",
  "runner capability contract and no-overclaim gate",
  "Graph and Run workspace controls",
  "WASM/WASI preflight gate",
  "rootless container preflight gate",
  "desktop runner evidence gate",
  "production desktop runtime",
  "signed updater channel",
  "public-boundary and no-secret checks"
], "runner capability closeout doc");

if (!review.ok || review.acceptedStatus !== "accepted") {
  failures.push("runner capability closeout gate must accept the complete sample closeout");
}

if (!review.missingValidationBlocked || !review.overclaimBlocked || !review.unsafeReferenceBlocked) {
  failures.push("runner capability closeout gate must block missing validation, overclaims, and unsafe references");
}

const validateScript = String(packageJson.scripts?.validate ?? "");
for (const entry of requiredValidateEntries) {
  if (!validateScript.includes(entry)) {
    failures.push(`full validate script missing required runner closeout entry: ${entry}`);
  }
}

if (!String(packageJson.scripts?.["validate:runner-capability-closeout"] ?? "").includes("check-runner-capability-closeout.mjs")) {
  failures.push("package scripts must define validate:runner-capability-closeout");
}

if (/\bR\d{4}\b/u.test(closeout)) {
  failures.push("public runner closeout document must not contain internal item codes");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/runner-capability-closeout-gate.mjs",
    "tests/runner-capability-closeout-gate.test.mjs",
    "docs/validation/runner-capability-closeout.md",
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
