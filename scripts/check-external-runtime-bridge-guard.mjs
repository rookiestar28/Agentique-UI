#!/usr/bin/env node
import fs from "node:fs";
import { reviewExternalBridgeGuard } from "../src/core/external-runtime-bridge-guard.mjs";

const failures = [];
const moduleText = readText("src/core/external-runtime-bridge-guard.mjs");
const tests = readText("tests/external-runtime-bridge-guard.test.mjs");
const docs = readText("docs/contracts/external-runtime-bridge-guard.md");
const packageJson = JSON.parse(readText("package.json"));
const review = reviewExternalBridgeGuard();

requireIncludes(moduleText, [
  "agentique.externalRuntimeBridgeGuard.v1",
  "explicit-user-action",
  "deep-link",
  "public-readback",
  "descriptor-view",
  "localhost-only",
  "per-launch-token",
  "assertExternalBridgePayloadSafe",
  "evaluateRunStartGrants",
  "startsBridge: false"
], "external bridge guard module");

requireIncludes(tests, [
  "explicit opt-in localhost bridge review is approved without starting a bridge",
  "deep link public readback and descriptor view cannot start bridges",
  "bridge network must bind to localhost with per-launch auth",
  "unsafe payloads are rejected before bridge approval",
  "permission preflight must pass for bridge launch",
  "shutdown and cleanup plans are required"
], "external bridge guard tests");

requireIncludes(docs, [
  "External Runtime Bridge Guard Contract",
  "guarded preflight only",
  "Deep links, public readback, and descriptor viewing cannot start or authorize a bridge",
  "localhost-only",
  "per-launch token auth",
  "startsBridge: false",
  "does not provide a production desktop runtime"
], "external bridge guard docs");

if (!review.ok || review.summary.startsBridge !== false || review.approvedStatus !== "approved") {
  failures.push("external bridge guard review summary must prove approved preflight without starting a bridge");
}

if (!String(packageJson.scripts?.["validate:external-runtime-bridge-guard"] ?? "").includes("check-external-runtime-bridge-guard.mjs")) {
  failures.push("package scripts must define validate:external-runtime-bridge-guard");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:external-runtime-bridge-guard")) {
  failures.push("validate script must include validate:external-runtime-bridge-guard");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/external-runtime-bridge-guard.mjs",
    "tests/external-runtime-bridge-guard.test.mjs",
    "docs/contracts/external-runtime-bridge-guard.md"
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
