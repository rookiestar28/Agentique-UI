#!/usr/bin/env node
import fs from "node:fs";
import { reviewActiveNativeEventTransportGate } from "../src/core/active-native-event-transport.mjs";

const failures = [];
const review = reviewActiveNativeEventTransportGate();
const moduleText = readText("src/core/active-native-event-transport.mjs");
const tests = readText("tests/active-native-event-transport.test.mjs");
const contract = readText("docs/contracts/active-native-event-transport.md");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message ?? error.code));
}

requireIncludes(
  moduleText,
  [
    "agentique.activeNativeEventTransport.v1",
    "agentique.activeNativeRunnerEvent.v1",
    "createActiveNativeEventTransport",
    "reviewActiveNativeEventTransportGate",
    "activeNativeEventName",
    "liveTransport: true",
    "replayFallback: true",
    "noGenericShell: true",
    "noProcessPermissionWidening: true",
    "noPackageLifecycleExecution: true"
  ],
  "active native event transport module"
);

requireIncludes(
  tests,
  [
    "active native event transport delivers ordered versioned payloads",
    "late subscribers receive bounded replay before live messages",
    "listener lifecycle cleanup prevents duplicate listeners across remount",
    "overflow and backpressure stay bounded while preserving terminal event",
    "unsafe payloads are redacted and terminal consistency is enforced",
    "active native event transport gate proves no capability widening"
  ],
  "active native event transport tests"
);

requireIncludes(
  contract,
  [
    "Active Native Event Transport",
    "versioned payloads",
    "monotonic event ids",
    "listener cleanup",
    "late-subscriber replay",
    "overflow",
    "terminal event",
    "generic shell",
    "package lifecycle",
    "browser data"
  ],
  "active native event transport contract"
);

if (!String(packageJson.scripts?.["validate:active-native-event-transport"] ?? "").includes("check-active-native-event-transport.mjs")) {
  failures.push("package scripts must define validate:active-native-event-transport");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:active-native-event-transport")) {
  failures.push("full validate script must include validate:active-native-event-transport");
}

if (!review.checks.liveTransportProven || !review.checks.listenerCleanup || !review.checks.backpressureBounded || !review.checks.noCapabilityWidening) {
  failures.push("active native event transport gate must prove live transport, cleanup, backpressure, and no capability widening");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: ["src/core/active-native-event-transport.mjs", "tests/active-native-event-transport.test.mjs", "docs/contracts/active-native-event-transport.md", "package.json"],
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
