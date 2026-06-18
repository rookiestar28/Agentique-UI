#!/usr/bin/env node
import fs from "node:fs";
import { permissionGrantFamilies, reviewPermissionGrantEnforcement } from "../src/core/permission-grants.mjs";
import { reviewRunnerPermissionPreflightGate } from "../src/core/runner-permission-preflight.mjs";

const review = reviewPermissionGrantEnforcement();
const runnerReview = reviewRunnerPermissionPreflightGate();
const doc = fs.readFileSync("docs/contracts/permission-grants.md", "utf8");
const runnerModule = fs.readFileSync("src/core/runner-permission-preflight.mjs", "utf8");
const runnerTests = fs.readFileSync("tests/runner-permission-preflight.test.mjs", "utf8");
const findings = [];

for (const family of permissionGrantFamilies) {
  if (!doc.includes(`\`${family}\``)) {
    findings.push(`Contract doc missing grant family ${family}.`);
  }
}

if (!review.ok) {
  findings.push(...review.errors.map((error) => error.message));
}

if (!review.revokedBlocked) {
  findings.push("Revoked grants must block start preflight.");
}

if (!review.unsafeBlocked) {
  findings.push("Unsafe ambient or hidden access must block start preflight.");
}

if (!runnerReview.ok) {
  findings.push(...runnerReview.errors.map((error) => error.message));
}

for (const phrase of [
  "agentique.runnerPermissionPreflightReview.v1",
  "approveRunnerPermissionGrants",
  "revokeRunnerPermissionGrant",
  "createBlockedRunnerPermissionScenario",
  "createAllowedRunnerPermissionPreflight",
  "artifacts/permission-audit.json"
]) {
  if (!runnerModule.includes(phrase)) {
    findings.push(`Runner permission preflight module missing ${phrase}.`);
  }
}

for (const phrase of [
  "empty runner permission store blocks start preflight",
  "approve flow grants required scoped permissions and allows start",
  "revoke flow disables start and records revoked evidence",
  "blocked sample covers expired wrong-run hidden ambient browser data and shell blockers",
  "rerun after grant uses an allowed permission preflight"
]) {
  if (!runnerTests.includes(phrase)) {
    findings.push(`Runner permission preflight tests missing ${phrase}.`);
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/core/permission-grants.mjs",
    "src/core/runner-permission-preflight.mjs",
    "tests/runner-permission-preflight.test.mjs",
    "docs/contracts/permission-grants.md"
  ],
  families: permissionGrantFamilies,
  runnerPreflight: runnerReview.summary
}, null, 2));
