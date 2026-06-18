#!/usr/bin/env node
import fs from "node:fs";
import { reviewExecutableCapabilityCloseoutGate } from "../src/core/executable-capability-closeout-pack.mjs";
import { reviewSourceFirstExecutableCapability, sampleSourceFirstExecutableCapability } from "../src/core/source-first-executable-capability.mjs";

const failures = [];
const gate = reviewExecutableCapabilityCloseoutGate();
const sourceFirst = reviewSourceFirstExecutableCapability(sampleSourceFirstExecutableCapability);
const moduleText = readText("src/core/executable-capability-closeout-pack.mjs");
const tests = readText("tests/executable-capability-closeout-pack.test.mjs");
const closeoutDoc = readText("docs/validation/executable-capability-closeout-pack.md");
const sourceFirstDoc = readText("docs/contracts/source-first-executable-capability.md");
const packageJson = JSON.parse(readText("package.json"));
const privatePlanMarker = ["\\.", "planning"].join("");
const privateReferenceDocsMarker = ["reference", "\\/", "docs"].join("");
const unsafePublicMarkerPattern = new RegExp(`\\bR\\d{4}\\b|${privatePlanMarker}|${privateReferenceDocsMarker}|[A-Za-z]:[\\\\/]`, "u");

if (!gate.ok || gate.acceptedStatus !== "accepted") {
  failures.push("executable capability closeout gate must accept the complete pack");
}

if (!gate.missingCapabilityBlocked || !gate.validationEvidenceBlocked || !gate.overclaimBlocked || !gate.unsafeReferenceBlocked) {
  failures.push("executable capability closeout gate must block missing capabilities, missing validation evidence, overclaims, and unsafe refs");
}

if (!sourceFirst.ok || sourceFirst.summary.acceptedRows !== 10 || sourceFirst.summary.plannedRows !== 0 || sourceFirst.summary.nextCapability !== null) {
  failures.push("source-first capability matrix must be synced to accepted closeout rows");
}

requireIncludes(
  moduleText,
  [
    "agentique.executableCapabilityCloseoutPack.v1",
    "source-first-posture-boundary",
    "active-native-event-transport",
    "revocation-cancel-controls",
    "durable-run-ledger-replay",
    "watchdog-heartbeat-cleanup",
    "artifact-receipt-safe-viewer",
    "runtime-prerequisite-readiness",
    "external-agent-client-handoff",
    "multi-lane-execution-readiness",
    "closeout-validation-claim-sync",
    "agentiqueUiFullValidation",
    "coreFullGate",
    "desktopNarrowInteractionEvidence",
    "productionDesktopRuntime",
    "executable-closeout.no-go"
  ],
  "executable closeout module"
);

requireIncludes(
  tests,
  [
    "executable capability closeout pack accepts completed local-only evidence",
    "every closeout capability has accepted status and path-neutral public evidence",
    "validation evidence and source-first claim sync are required",
    "release and runtime overclaims remain blocked",
    "public safety rejects internal markers and unsafe evidence references",
    "source-first capability matrix is synchronized to accepted closeout rows",
    "closeout pack document is public safe and states continued No-Go claims",
    "executable capability closeout gate proves accepted and blocked paths"
  ],
  "executable closeout tests"
);

requireIncludes(
  closeoutDoc,
  [
    "Executable Capability Closeout Pack",
    "source-first local workspace",
    "supported-local-only",
    "public-boundary and no-secret checks",
    "desktop and narrow interaction evidence",
    "signed installer",
    "updater",
    "production desktop runtime"
  ],
  "executable closeout document"
);

requireIncludes(
  sourceFirstDoc,
  ["Current state", "Accepted", "closeout validation and claim sync", "Passing this closeout pack does not publish"],
  "source-first capability contract"
);

if (!String(packageJson.scripts?.["validate:executable-capability-closeout-pack"] ?? "").includes("check-executable-capability-closeout-pack.mjs")) {
  failures.push("package scripts must define validate:executable-capability-closeout-pack");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:executable-capability-closeout-pack")) {
  failures.push("full validate script must include validate:executable-capability-closeout-pack");
}

if (unsafePublicMarkerPattern.test(closeoutDoc)) {
  failures.push("public executable closeout doc must not contain internal markers or local paths");
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
        "src/core/executable-capability-closeout-pack.mjs",
        "tests/executable-capability-closeout-pack.test.mjs",
        "docs/validation/executable-capability-closeout-pack.md",
        "docs/contracts/source-first-executable-capability.md",
        "package.json"
      ],
      summary: gate.summary
    },
    null,
    2
  )
);

function readText(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}
