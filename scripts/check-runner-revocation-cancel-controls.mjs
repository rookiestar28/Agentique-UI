#!/usr/bin/env node
import fs from "node:fs";
import { reviewRunnerRevocationCancelControlsGate } from "../src/core/runner-revocation-cancel-controls.mjs";

const failures = [];
const review = reviewRunnerRevocationCancelControlsGate();
const moduleText = readText("src/core/runner-revocation-cancel-controls.mjs");
const tests = readText("tests/runner-revocation-cancel-controls.test.mjs");
const contract = readText("docs/contracts/runner-revocation-cancel-controls.md");
const hook = readText("src/app-state/useRunnerWorkspaceState.ts");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const workspace = readText("src/workspaces/RunWorkspace.tsx");
const controls = readText("src/workspaces/RunnerRevocationCancelControls.tsx");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message ?? error.code));
}

requireIncludes(
  moduleText,
  [
    "agentique.runnerRevocationCancelControls.v1",
    "createRunnerRevocationCancelControls",
    "reviewRunnerRevocationCancelControlsGate",
    "runner-control.revoked-grant",
    "runner-control.stale-approval",
    "forced-kill",
    "cleanup-required",
    "Approve control sample",
    "Revoked start denial",
    "Stale approval denial",
    "Cancel with receipt",
    "Force kill cleanup-required",
    "Resolve cleanup",
    "retry stays blocked",
    "noGenericShell: true",
    "noProcessPermissionWidening: true",
    "noPackageLifecycleExecution: true",
    "noBrowserDataAccess: true"
  ],
  "runner revocation cancel controls module"
);

requireIncludes(
  tests,
  [
    "revoked grants block start and emit redacted audit receipts",
    "stale approval reuse is denied before native start",
    "cancel and forced kill produce distinct native receipt states",
    "retry is allowed only after cleanup-required is resolved",
    "runner revocation cancel control gate proves UI flows and no capability widening"
  ],
  "runner revocation cancel controls tests"
);

requireIncludes(
  contract,
  [
    "Runner Revocation Cancel Controls",
    "stale approval reuse denial",
    "revoked grant start denial",
    "cancel vs forced-kill",
    "retry blocked until cleanup",
    "redacted audit receipts",
    "source-first",
    "generic shell"
  ],
  "runner revocation cancel controls contract"
);

requireIncludes(
  hook,
  ["createRunnerRevocationCancelControls", "runnerControlSurface", "handleRunnerControlAction", "force-kill", "cleanup-resolved"],
  "runner workspace state hook"
);

requireIncludes(route, ["runnerControlSurface", "handleRunnerControlAction"], "graph/run workspace route");

requireIncludes(types, ["runnerControlSurface", "onRunnerControlAction", "force-kill", "cleanup-resolved"], "run workspace prop types");

requireIncludes(workspace, ["RunnerRevocationCancelControls", "runnerControlSurface", "onRunnerControlAction"], "run workspace controls mount");

requireIncludes(
  controls,
  ["Runner revocation cancel kill controls", "runnerControlSurface", "runnerControlSurface.uiControls.map", "onRunnerControlAction(control.action)"],
  "runner revocation cancel controls component"
);

if (!String(packageJson.scripts?.["validate:runner-revocation-cancel-controls"] ?? "").includes("check-runner-revocation-cancel-controls.mjs")) {
  failures.push("package scripts must define validate:runner-revocation-cancel-controls");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:runner-revocation-cancel-controls")) {
  failures.push("full validate script must include validate:runner-revocation-cancel-controls");
}

if (
  !review.checks.revokedGrantStartDenied ||
  !review.checks.staleApprovalDenied ||
  !review.checks.cancelKillDistinct ||
  !review.checks.retryBlockedUntilCleanup ||
  !review.checks.auditReceiptsRedacted ||
  !review.checks.noCapabilityWidening
) {
  failures.push("runner revocation cancel controls gate must prove denial, stop distinction, retry cleanup gate, redaction, and no capability widening");
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
        "src/core/runner-revocation-cancel-controls.mjs",
        "tests/runner-revocation-cancel-controls.test.mjs",
        "docs/contracts/runner-revocation-cancel-controls.md",
        "src/app-state/useRunnerWorkspaceState.ts",
        "src/workspaces/RunWorkspace.tsx",
        "src/workspaces/RunnerRevocationCancelControls.tsx",
        "package.json"
      ],
      summary: review.summary
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
