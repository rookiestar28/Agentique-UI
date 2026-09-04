#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { reviewNativeApprovalConsentGate } from "../src/core/native-approval-consent.mjs";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const rust = read("src-tauri/src/lib.rs");
const panel = read("src/workspaces/NativeApprovalConsentPanel.tsx");
const route = read("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const contract = read("docs/contracts/native-approval-consent.md");
const normalizedContract = contract.replace(/\s+/gu, " ");
const packageJson = JSON.parse(read("package.json"));
const prepareBody = rust.match(/fn agentique_runner_prepare[\s\S]*?\n\}\n\n#\[tauri::command\]/u)?.[0] ?? "";
const decisionBody = rust.match(/fn agentique_runner_decide_approval[\s\S]*?\n\}\n\n#\[tauri::command\]/u)?.[0] ?? "";
const review = reviewNativeApprovalConsentGate();

const checks = {
  referenceReview: review.ok,
  nativeCommands:
    rust.includes("agentique_runner_approval_proposal") &&
    rust.includes("agentique_runner_decide_approval") &&
    rust.includes("NativeApprovalDecisionRequest") &&
    rust.includes("NativeApprovalProposalRecord"),
  prepareIsPendingOnly:
    prepareBody.includes("permission.proposal-pending") && prepareBody.includes("permission_grant_id: None") && !prepareBody.includes("store_native_permission_grant"),
  explicitDecisionMintsGrant:
    decisionBody.includes('request.decision != "approved"') && decisionBody.includes("explicit_user_action: true") && decisionBody.includes("store_native_permission_grant"),
  startRechecksDecision:
    rust.includes("validate_native_approval_for_start") && rust.includes("legacy approvalId is non-authorizing") && rust.includes("canonical_native_approval_digest"),
  exactOwnership:
    rust.includes('policy_owner: "agentique-native-host"') && rust.includes('presentation_owner: "agentique-ui"') && rust.includes('distribution_mode: "bundled-fixed"'),
  userStatesVisible:
    panel.includes("Pending proposal") &&
    panel.includes("Explicit approve") &&
    panel.includes("Scope mismatch") &&
    panel.includes("Exact native approval capabilities") &&
    route.includes("createNativeApprovalConsentSurface(nativeApprovalScenario)"),
  contractComplete: [
    "only authority",
    "Prepare creates a bounded pending proposal and no permission grant",
    "explicit approve or deny",
    "one-time grant",
    "Legacy approval or permission identifiers are non-authorizing evidence",
    "credential name",
    "adopts no external runtime package"
  ].every((phrase) => normalizedContract.includes(phrase)),
  packageWiring:
    packageJson.scripts?.["validate:native-approval-consent"]?.includes("node scripts/check-native-approval-consent.mjs") === true &&
    packageJson.scripts?.["validate:native-runner-permission-enforcement"]?.includes("npm run validate:native-approval-consent") === true,
  noHeddleDependency: !Object.keys({ ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) }).some((name) => name.startsWith("@heddleagent/"))
};

const errors = Object.entries(checks)
  .filter(([, ok]) => !ok)
  .map(([name]) => ({ code: `native-consent.${name}`, message: `Native approval consent check failed: ${name}.` }));

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "failed", checks, errors }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checks,
      summary: {
        startBeforeDecision: "blocked",
        explicitDecision: "required",
        grantUse: "one-time",
        policyOwner: "agentique-native-host",
        packageDisposition: "NO_ADOPT"
      }
    },
    null,
    2
  )
);
