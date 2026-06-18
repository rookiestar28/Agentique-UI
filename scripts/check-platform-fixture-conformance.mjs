#!/usr/bin/env node
import fs from "node:fs";
import { reviewPlatformFixtureConformancePack } from "../src/core/platform-fixture-conformance.mjs";
import { platformWorkflowFixturePack } from "../tests/fixtures/platform-workflows/fixtures.mjs";

const failures = [];
const moduleText = readText("src/core/platform-fixture-conformance.mjs");
const fixtures = readText("tests/fixtures/platform-workflows/fixtures.mjs");
const tests = readText("tests/platform-fixture-conformance.test.mjs");
const packageJson = JSON.parse(readText("package.json"));

requireIncludes(moduleText, [
  "agentique.platformFixtureConformance.v1",
  "reviewPlatformFixtureConformancePack",
  "createGraphRunPlan",
  "normalizePlatformIntakeToWorkflowIr",
  "noExternalPlatformInvoke",
  "noSchedulerStart"
], "platform fixture conformance module");

requireIncludes(fixtures, [
  "n8n-basic-review",
  "dify-basic-review",
  "langgraph-basic-review",
  "n8n-dangling-edge",
  "dify-cycle",
  "n8n-duplicate-id",
  "n8n-secret-like-value",
  "n8n-shell-node",
  "langgraph-traversal-ref",
  "dify-unsupported-provider",
  "n8n-oversized",
  "golden"
], "platform fixture pack");

requireIncludes(tests, [
  "platform fixture conformance pack validates accepted golden summaries",
  "negative fixtures fail closed or stay non-executable",
  "golden summaries include adapter IR capability and loss report outputs",
  "fixture conformance output is deterministic and public safe",
  "golden drift fails the conformance review"
], "platform fixture conformance tests");

const report = reviewPlatformFixtureConformancePack(platformWorkflowFixturePack);
if (!report.ok) {
  failures.push("fixture conformance review must pass");
}
if (report.summary.acceptedFixtures !== 3 || report.summary.negativeFixtures < 8 || report.summary.firstClassPlatforms !== 3) {
  failures.push("fixture conformance review must cover all accepted platforms and negative cases");
}
if (report.boundary.noExecution !== true || report.boundary.noInstall !== true || report.boundary.noExternalPlatformInvoke !== true) {
  failures.push("fixture conformance boundary must prohibit execution install and external platform invocation");
}
if (!String(packageJson.scripts?.["validate:platform-fixture-conformance"] ?? "").includes("check-platform-fixture-conformance.mjs")) {
  failures.push("package scripts must define validate:platform-fixture-conformance");
}
if (!String(packageJson.scripts?.validate ?? "").includes("validate:platform-fixture-conformance")) {
  failures.push("validate script must include validate:platform-fixture-conformance");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/platform-fixture-conformance.mjs",
    "tests/fixtures/platform-workflows/fixtures.mjs",
    "tests/platform-fixture-conformance.test.mjs",
    "package.json"
  ]
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
