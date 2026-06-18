#!/usr/bin/env node
import fs from "node:fs";
import { reviewCompanionIntegrationCloseoutGate } from "../src/core/companion-integration-closeout-gate.mjs";

const requiredValidateEntries = [
  "validate:companion-integration-closeout",
  "validate:public",
  "npm test"
];

const failures = [];
const moduleText = readText("src/core/companion-integration-closeout-gate.mjs");
const tests = readText("tests/companion-integration-closeout-gate.test.mjs");
const closeout = readText("docs/validation/companion-integration-closeout.md");
const boundary = readText("docs/contracts/companion-capability-boundary.md");
const packageJson = JSON.parse(readText("package.json"));
const review = reviewCompanionIntegrationCloseoutGate();

requireIncludes(moduleText, [
  "agentique.companionIntegrationCloseout.v1",
  "2621a33ba9cd83b125ffaabeec7817abc3c52719",
  "@agentique.io/readback",
  "@agentique.io/validator",
  "@agentique.io/uploader",
  "@agentique.io/action",
  "authenticated-review-submission",
  "githubActionRuntime",
  "universalRuntime",
  "reviewCompanionIntegrationCloseoutGate"
], "companion closeout module");

requireIncludes(tests, [
  "companion integration closeout accepts the completed local-static scope",
  "source pin and package version drift fail closed",
  "capability evidence must be accepted and path-neutral",
  "unsupported live auth publication action and runtime claims are blocked",
  "deferred companion capabilities require a separate gate",
  "public validation document states accepted scope and blocked claims"
], "companion closeout tests");

requireIncludes(closeout, [
  "Companion Integration Closeout",
  "source revision `2621a33ba9cd83b125ffaabeec7817abc3c52719`",
  "@agentique.io/readback",
  "@agentique.io/validator",
  "@agentique.io/uploader",
  "@agentique.io/action",
  "read-only readback and badge projection",
  "static validator import proof",
  "safe download acquisition proof",
  "review-only uploader preview",
  "browser-local external intake scanner",
  "authenticated review submission",
  "GitHub Action runtime",
  "hosted runtime",
  "universal runtime",
  "public-boundary and no-secret checks"
], "companion closeout doc");

requireIncludes(boundary, [
  "Each implementation must record the package name, package version, source revision, and consumed surface",
  "authenticated review submission",
  "GitHub Action execution inside the desktop app",
  "hosted execution",
  "universal workflow execution"
], "companion capability boundary doc");

if (!review.ok || review.acceptedStatus !== "accepted") {
  failures.push("companion closeout gate must accept the complete sample closeout");
}

if (
  !review.sourceDriftBlocked ||
  !review.packageDriftBlocked ||
  !review.missingEvidenceBlocked ||
  !review.overclaimBlocked ||
  !review.unsafeReferenceBlocked ||
  !review.completedDeferredCapabilityBlocked
) {
  failures.push("companion closeout gate must block source drift, package drift, missing evidence, overclaims, unsafe references, and completed deferred capabilities");
}

const validateScript = String(packageJson.scripts?.validate ?? "");
for (const entry of requiredValidateEntries) {
  if (!validateScript.includes(entry)) {
    failures.push(`full validate script missing required companion closeout entry: ${entry}`);
  }
}

if (!String(packageJson.scripts?.["validate:companion-integration-closeout"] ?? "").includes("check-companion-integration-closeout.mjs")) {
  failures.push("package scripts must define validate:companion-integration-closeout");
}

if (/\bR\d{4}\b/u.test(closeout)) {
  failures.push("public companion closeout document must not contain internal item codes");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/companion-integration-closeout-gate.mjs",
    "tests/companion-integration-closeout-gate.test.mjs",
    "docs/validation/companion-integration-closeout.md",
    "docs/contracts/companion-capability-boundary.md",
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
