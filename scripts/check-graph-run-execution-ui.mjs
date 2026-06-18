#!/usr/bin/env node
import fs from "node:fs";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];
const app = [readText("src/App.tsx"), readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx")].join("\n");
const runnerState = readText("src/app-state/useRunnerWorkspaceState.ts");
const graph = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map(readText).join("\n");
const run = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map(readText).join("\n");
const css = readStyleSourceBundle();
const scheduler = readText("src/core/workflow-scheduler.mjs");
const runnerSession = readText("src/core/workflow-runner-session.mjs");
const runnerEventStream = readText("src/core/runner-event-stream.mjs");
const permissionPreflight = readText("src/core/runner-permission-preflight.mjs");
const evidence = readText("docs/validation/runner-ui-execution-evidence.md");
const packageJson = JSON.parse(readText("package.json"));

requireIncludes(app, [
  "runnerSession",
  "runnerPermissionReview",
  "runnerPermissionBlockedReview",
  "runnerStartAllowed",
  "activeWorkflowIr",
  "blockedGraphRunPlan",
  "handleApproveRunnerPermissions",
  "handleRevokeRunnerPermissions",
  "handleShowBlockedRunnerPermissions",
  "handleStartRunner",
  "handleCancelRunner",
  "handleRetryRunner",
  "handleFailureRunner",
  "runnerEventStream"
], "app runner state");

requireIncludes(runnerState, [
  "runnerPermissionsApproved",
  "createRunnerEventStream",
  "runAcceptedWorkflowSession",
  "createIdleWorkflowRunnerSession"
], "runner state implementation");

requireIncludes(graph, [
  "blockedGraphRunPlan",
  "runnerStartAllowed",
  "aria-label=\"Graph runner execution controls\"",
  "data-runner-status={runnerSession.status}",
  "isRunnerPanelExpanded",
  "aria-label=\"Expand graph runner controls\"",
  "aria-label=\"Minimize graph runner controls\"",
  "aria-label=\"Start reviewed run\"",
  "aria-label=\"Cancel active run\"",
  "aria-label=\"Graph runner logs and artifacts\"",
  "aria-label=\"Graph permission preflight review\"",
  "aria-label=\"Graph required runner grants\"",
  "aria-label=\"Runner retry and failure evidence\"",
  "aria-label=\"Graph runner compact timeline\"",
  "aria-label=\"Graph runner node result evidence\"",
  "aria-label=\"Graph runner cleanup receipt\"",
  "aria-label=\"Blocked high-risk run plan sample\"",
  "Retry sample",
  "Failure sample",
  "Revoke network grant",
  "Blocked grants",
  "Blocked sample plan",
  "Approve scoped grants",
  "workspace.graph.subtitle",
  "workspace.graph.capabilityMatrix",
  "Executable",
  "Permission required",
  "Blocked",
  "Handoff only",
  "fail-closed by default",
  "external runtime boundary"
], "graph runner controls");

if (/no workflow execution/iu.test(graph)) {
  failures.push("graph copy must not claim no workflow execution after supported-local-only runner evidence exists");
}

requireIncludes(run, [
  "blockedGraphRunPlan",
  "runnerStartAllowed",
  "aria-label=\"Runner execution controls\"",
  "aria-label=\"Run start cancel controls\"",
  "aria-label=\"Runner logs\"",
  "aria-label=\"Runner artifacts\"",
  "aria-label=\"Runner permission preflight review\"",
  "aria-label=\"Required runner grants\"",
  "aria-label=\"Current runner grant status\"",
  "aria-label=\"Blocked permission samples\"",
  "aria-label=\"Runner permission audit evidence\"",
  "aria-label=\"Runner node results\"",
  "aria-label=\"Runner cleanup receipt\"",
  "aria-label=\"Scheduler lifecycle evidence\"",
  "aria-label=\"Run streaming timeline\"",
  "aria-label=\"Run per-node execution evidence\"",
  "aria-label=\"Run dependency chain evidence\"",
  "aria-label=\"Run bounded redacted log preview\"",
  "aria-label=\"Adapter lane event timeline\"",
  "aria-label=\"Run cleanup stream evidence\"",
  "aria-label=\"Blocked run plan safety sample\"",
  "data-runner-status={runnerSession.status}",
  "Start reviewed run",
  "Cancel active run",
  "Retry sample",
  "Failure sample",
  "Approve scoped grants",
  "Revoke network grant",
  "Blocked grant sample",
  "permissionAudit: runnerSession.permissionPreflight.artifactPath"
], "run workspace controls");

requireIncludes(css, [
  ".graph-runner-panel",
  ".graph-runner-toggle",
  ".graph-capability-matrix",
  ".graph-capability-row",
  ".graph-panel-icon-button",
  ".runner-control-panel",
  ".runner-status-grid",
  ".runner-actions",
  ".runner-log-list",
  ".runner-artifact-list",
  ".runner-node-result-list",
  ".runner-timeline-strip",
  ".runner-event-timeline",
  ".runner-event-list",
  ".runner-node-timeline",
  ".runner-dependency-chain",
  ".runner-log-preview",
  ".runner-cleanup-receipt",
  ".permission-preflight-panel",
  ".permission-preflight-strip",
  ".permission-grant-list",
  ".blocked-run-plan-strip",
  "button:disabled"
], "runner control CSS");

requireIncludes(scheduler, [
  "utf8ByteLength",
  "do not replace this with Node Buffer"
], "browser-safe scheduler execution");

if (/\bBuffer\s*\.(?:alloc|byteLength|concat|from)\b/u.test(scheduler)) {
  failures.push("workflow scheduler imported by browser UI must not use Node Buffer APIs");
}

requireIncludes(runnerSession, [
  "agentique.workflowRunnerSession.v1",
  "runAcceptedWorkflowSession",
  "createIdleWorkflowRunnerSession",
  "reviewWorkflowRunnerSessionGate",
  "permissionPreflight",
  "workflow-runner-session.permission-preflight-missing",
  "workflow-runner-session.permission-preflight-blocked",
  "action === \"retry\"",
  "action === \"failure\"",
  "runPlan.status !== \"accepted\"",
  "scheduler was not invoked"
], "workflow runner session module");

requireIncludes(runnerEventStream, [
  "agentique.runnerEventStream.v1",
  "createRunnerEventStream",
  "reviewRunnerEventStreamGate",
  "dependencyChainsFor",
  "boundedLogPreview",
  "liveTransport: false"
], "runner event stream module");

requireIncludes(permissionPreflight, [
  "agentique.runnerPermissionPreflightReview.v1",
  "approveRunnerPermissionGrants",
  "revokeRunnerPermissionGrant",
  "createBlockedRunnerPermissionScenario",
  "createAllowedRunnerPermissionPreflight",
  "artifacts/permission-audit.json"
], "runner permission preflight module");

requireIncludes(evidence, [
  "Runner UI Execution Evidence",
  "Playwright interaction evidence",
  "runner-ui-graph-desktop.png",
  "runner-ui-run-mobile.png",
  "start, cancel, status, log, and artifact controls",
  "permission preflight, approve, revoke, blocked grant sample, rerun-after-grant",
  "retry, failure propagation, skipped dependency, and cleanup receipt evidence",
  "per-node streaming timeline",
  "dependency-chain evidence",
  "bounded redacted log preview",
  "No production desktop runtime"
], "runner UI evidence doc");

for (const artifact of [
  "docs/validation/artifacts/runner-ui-graph-desktop.png",
  "docs/validation/artifacts/runner-ui-run-mobile.png"
]) {
  if (!fs.existsSync(artifact)) {
    failures.push(`missing screenshot artifact: ${artifact}`);
  } else if (fs.statSync(artifact).size < 1000) {
    failures.push(`screenshot artifact is unexpectedly small: ${artifact}`);
  }
}

if (!String(packageJson.scripts?.["validate:graph-run-execution-ui"] ?? "").includes("check-graph-run-execution-ui.mjs")) {
  failures.push("package scripts must define validate:graph-run-execution-ui");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:graph-run-execution-ui")) {
  failures.push("validate script must include validate:graph-run-execution-ui");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/App.tsx",
    "src/app-state/useRunnerWorkspaceState.ts",
    "src/core/runner-permission-preflight.mjs",
    "src/core/workflow-runner-session.mjs",
    "src/core/runner-event-stream.mjs",
    "src/workspaces/GraphWorkspace.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx",
    "src/styles.css",
    "docs/validation/runner-ui-execution-evidence.md",
    "docs/validation/artifacts/runner-ui-graph-desktop.png",
    "docs/validation/artifacts/runner-ui-run-mobile.png"
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
