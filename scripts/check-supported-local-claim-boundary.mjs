#!/usr/bin/env node
import fs from "node:fs";
import { scanPublicBoundary } from "./check-public-boundary.mjs";
import { reviewSupportedLocalClaimBoundary, reviewSupportedLocalClaimGate, supportedLocalClaimBoundary } from "../src/core/supported-local-claim-boundary.mjs";

const failures = [];
const packageJson = JSON.parse(readText("package.json"));
const policyReview = reviewSupportedLocalClaimBoundary(supportedLocalClaimBoundary);
const gateReview = reviewSupportedLocalClaimGate();
const publicReview = scanPublicBoundary(process.cwd());

if (!policyReview.ok) failures.push(...policyReview.errors.map((error) => `${error.code}: ${error.message}`));
if (!gateReview.ok) failures.push("supported-local mutation gate must block every unsafe claim family");
if (publicReview.status !== "passed") failures.push("public boundary scan must pass before a supported-local claim is accepted");

const command = String(packageJson.scripts?.["validate:supported-local-claim-boundary"] ?? "");
if (!command.includes("check-supported-local-claim-boundary.mjs")) {
  failures.push("package scripts must define validate:supported-local-claim-boundary");
}
const closeoutCommand = String(packageJson.scripts?.["validate:runner-capability-closeout"] ?? "");
if (!closeoutCommand.includes("validate:supported-local-claim-boundary")) {
  failures.push("runner capability closeout must invoke the supported-local claim boundary");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}
