#!/usr/bin/env node
import fs from "node:fs";
import { reviewDesktopRunnerValidationGate } from "../src/core/desktop-runner-validation-gate.mjs";

const failures = [];
const moduleText = readText("src/core/desktop-runner-validation-gate.mjs");
const tests = readText("tests/desktop-runner-validation-gate.test.mjs");
const sop = readText("docs/security/desktop-runner-sop.md");
const packageJson = JSON.parse(readText("package.json"));
const review = reviewDesktopRunnerValidationGate();

requireIncludes(moduleText, [
  "agentique.desktopRunnerEvidence.v1",
  "requiredPlatforms",
  "approve-permissions",
  "processCleanup",
  "crashRecovery",
  "artifactRedaction",
  "publicBoundary",
  "adapterEvidence",
  "releaseClaims"
], "desktop runner validation module");

requireIncludes(tests, [
  "complete desktop runner evidence is accepted across all platforms",
  "missing platform evidence fails closed",
  "process cleanup and crash recovery evidence are mandatory",
  "artifact redaction and public scans are mandatory",
  "Playwright runner workflows must cover approve start cancel status logs and artifacts",
  "adapter signature and preflight evidence are required",
  "unsafe evidence references and missing SOP references fail closed",
  "release claims stay blocked without separate release gates"
], "desktop runner validation tests");

requireIncludes(sop, [
  "Cross-Platform Runner Acceptance Matrix",
  "Required Runner Evidence Manifest",
  "Windows",
  "macOS",
  "Linux",
  "process-tree cleanup evidence",
  "crash recovery evidence",
  "artifact redaction evidence",
  "no-secret and public-boundary scan results",
  "Playwright workflow coverage",
  "adapter signature evidence",
  "release-claim boundary",
  "Missing platform evidence"
], "desktop runner SOP");

if (!review.ok || review.acceptedStatus !== "accepted") {
  failures.push("desktop runner validation review must accept the complete sample evidence");
}

if (!review.missingPlatformBlocked || !review.unsafeReferenceBlocked || !review.overclaimBlocked) {
  failures.push("desktop runner validation review must block missing platform evidence, unsafe references, and release overclaims");
}

if (!String(packageJson.scripts?.["validate:desktop-runner-validation-gate"] ?? "").includes("check-desktop-runner-validation-gate.mjs")) {
  failures.push("package scripts must define validate:desktop-runner-validation-gate");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:desktop-runner-validation-gate")) {
  failures.push("validate script must include validate:desktop-runner-validation-gate");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/desktop-runner-validation-gate.mjs",
    "tests/desktop-runner-validation-gate.test.mjs",
    "docs/security/desktop-runner-sop.md"
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
