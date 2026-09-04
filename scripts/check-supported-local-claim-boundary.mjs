#!/usr/bin/env node
import fs from "node:fs";
import { scanPublicBoundary } from "./check-public-boundary.mjs";
import {
  reviewSupportedLocalClaimBoundary,
  reviewSupportedLocalClaimGate,
  reviewSupportedLocalClaimSurfaces,
  supportedLocalClaimBoundary
} from "../src/core/supported-local-claim-boundary.mjs";

const failures = [];
const packageJson = JSON.parse(readText("package.json"));
const policyReview = reviewSupportedLocalClaimBoundary(supportedLocalClaimBoundary);
const gateReview = reviewSupportedLocalClaimGate();
const surfaceReview = reviewSupportedLocalClaimSurfaces({
  readme: readText("README.md"),
  support: readText("SUPPORT.md"),
  security: readText("SECURITY.md"),
  nativeRunner: readText("docs/contracts/native-runner-boundary.md"),
  runnerCloseout: readText("docs/validation/runner-capability-closeout.md")
});
const publicReview = scanPublicBoundary(process.cwd());

if (!policyReview.ok) failures.push(...policyReview.errors.map((error) => `${error.code}: ${error.message}`));
if (!gateReview.ok) failures.push("supported-local mutation gate must block every unsafe claim family");
if (!surfaceReview.ok) failures.push(...surfaceReview.errors.map((error) => `${error.code}: ${error.message}`));
if (publicReview.status !== "passed") failures.push("public boundary scan must pass before a supported-local claim is accepted");

const command = String(packageJson.scripts?.["validate:supported-local-claim-boundary"] ?? "");
if (!command.includes("check-supported-local-claim-boundary.mjs")) {
  failures.push("package scripts must define validate:supported-local-claim-boundary");
}
const closeoutCommand = String(packageJson.scripts?.["validate:runner-capability-closeout"] ?? "");
if (!closeoutCommand.includes("validate:supported-local-claim-boundary")) {
  failures.push("runner capability closeout must invoke the supported-local claim boundary");
}

const contract = readText("docs/contracts/supported-local-claim-boundary.md").replace(/\s+/gu, " ");
for (const phrase of [
  "fixed native Python and Node local execution",
  "Windows and Linux",
  "macOS local execution remains unverified",
  "review-only evidence",
  "generic shell or subprocess authority",
  "hosted or universal runtime",
  "production desktop runtime"
]) {
  if (!contract.includes(phrase)) failures.push(`supported-local contract missing required phrase: ${phrase}`);
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      schemaVersion: supportedLocalClaimBoundary.schemaVersion,
      verifiedPlatforms: policyReview.verifiedPlatforms,
      unverifiedPlatforms: policyReview.unverifiedPlatforms,
      supportedExecutionLanes: policyReview.supportedExecutionLanes,
      reviewOnlyLanes: policyReview.reviewOnlyLanes,
      checkedSurfaces: surfaceReview.checkedSurfaces,
      publicFilesChecked: publicReview.checkedFiles
    },
    null,
    2
  )
);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}
