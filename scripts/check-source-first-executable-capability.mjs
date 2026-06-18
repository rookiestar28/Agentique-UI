#!/usr/bin/env node
import fs from "node:fs";
import { reviewSourceFirstExecutableCapabilityGate } from "../src/core/source-first-executable-capability.mjs";

const failures = [];
const review = reviewSourceFirstExecutableCapabilityGate();
const moduleText = readText("src/core/source-first-executable-capability.mjs");
const tests = readText("tests/source-first-executable-capability.test.mjs");
const contract = readText("docs/contracts/source-first-executable-capability.md");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push("source-first executable capability gate must prove accepted and blocked paths");
}

requireIncludes(
  moduleText,
  [
    "agentique.sourceFirstExecutableCapability.v1",
    "source-first-posture-boundary",
    "native-event-transport",
    "revocation-cancel-controls",
    "durable-run-ledger-replay",
    "watchdog-heartbeat-cleanup",
    "artifact-receipt-safe-viewer",
    "runtime-prerequisite-readiness",
    "external-agent-client-handoff",
    "multi-lane-execution-readiness",
    "closeout-validation-claim-sync",
    "signedDesktopApp",
    "productionDesktopRuntime",
    "source-first.release-boundary",
    "source-first.forbidden-claim"
  ],
  "source-first capability module"
);

requireIncludes(
  tests,
  [
    "source-first executable capability posture accepts the complete boundary",
    "source-first executable capability posture requires every ordered capability row",
    "source-first executable capability posture blocks release and runtime overclaims",
    "source-first executable capability posture rejects unsafe evidence and internal markers",
    "source-first executable capability gate proves accepted and blocked paths"
  ],
  "source-first capability tests"
);

requireIncludes(
  contract,
  [
    "Source-First Executable Capability",
    "source-first local workspace",
    "supported-local-only",
    "native event transport",
    "revocation and cancel controls",
    "durable run ledger",
    "watchdog heartbeat",
    "artifact receipt",
    "runtime prerequisite",
    "external agent-client handoff",
    "multi-lane execution readiness",
    "signed desktop app",
    "production desktop runtime"
  ],
  "source-first capability contract"
);

if (!String(packageJson.scripts?.["validate:source-first-executable-capability"] ?? "").includes("check-source-first-executable-capability.mjs")) {
  failures.push("package scripts must define validate:source-first-executable-capability");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:source-first-executable-capability")) {
  failures.push("full validate script must include validate:source-first-executable-capability");
}

if (!review.missingCapabilityBlocked || !review.releaseOverclaimBlocked || !review.unsafeEvidenceBlocked) {
  failures.push("source-first gate must block missing capability rows, overclaims, and unsafe evidence");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: [
        "src/core/source-first-executable-capability.mjs",
        "tests/source-first-executable-capability.test.mjs",
        "docs/contracts/source-first-executable-capability.md",
        "package.json"
      ],
      summary: review.summary
    },
    null,
    2
  )
);

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
