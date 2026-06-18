#!/usr/bin/env node
import fs from "node:fs";
import { reviewWatchdogHeartbeatSupervisorGate } from "../src/core/watchdog-heartbeat-supervisor.mjs";

const failures = [];
const review = reviewWatchdogHeartbeatSupervisorGate();
const moduleText = readText("src/core/watchdog-heartbeat-supervisor.mjs");
const tests = readText("tests/watchdog-heartbeat-supervisor.test.mjs");
const contract = readText("docs/contracts/watchdog-heartbeat-supervisor.md");
const hook = readText("src/app-state/useRunnerWorkspaceState.ts");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const workspace = readText("src/workspaces/RunWorkspace.tsx");
const panel = readText("src/workspaces/WatchdogHeartbeatSupervisorPanel.tsx");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message ?? error.code));
}

requireIncludes(
  moduleText,
  [
    "agentique.watchdogHeartbeatSupervisor.v1",
    "createWatchdogHeartbeatSupervisor",
    "reviewWatchdogHeartbeatSupervisorGate",
    "native-fixed-lane",
    "timeout-forced-cleanup",
    "grace-expired-forced-cleanup",
    "processTreeCleanup: true",
    "orphanCount: 0",
    "noGenericProcessManager: true",
    "noShellPlugin: true",
    "noPackageLifecycleExecution: true",
    "noBrowserDataAccess: true",
    "noAmbientEnvironmentForwarding: true"
  ],
  "watchdog heartbeat supervisor module"
);

requireIncludes(
  tests,
  [
    "watchdog supervisor records bounded native heartbeat cadence",
    "timeout budget enforcement produces cleanup-required forced cleanup evidence",
    "graceful cancel escalates to forced cleanup after the grace window",
    "terminal receipts are idempotent",
    "watchdog receipts stay redacted path-neutral and capability-closed",
    "watchdog heartbeat supervisor gate proves all acceptance checks"
  ],
  "watchdog heartbeat supervisor tests"
);

requireIncludes(
  contract,
  [
    "Watchdog Heartbeat Supervisor",
    "heartbeat receipt cadence",
    "timeout budget",
    "graceful cancel escalation",
    "forced cleanup evidence",
    "terminal idempotency",
    "zero tested-platform orphan",
    "generic process manager",
    "source-first"
  ],
  "watchdog heartbeat supervisor contract"
);

requireIncludes(hook, ["createWatchdogHeartbeatSupervisor", "watchdogSupervisorSurface", "handleWatchdogSupervisorScenario", "terminal-idempotent"], "runner workspace state hook");
requireIncludes(route, ["watchdogSupervisorSurface", "handleWatchdogSupervisorScenario"], "graph/run workspace route");
requireIncludes(types, ["watchdogSupervisorSurface", "onWatchdogSupervisorScenario", "WatchdogSupervisorScenario"], "run workspace prop types");
requireIncludes(workspace, ["WatchdogHeartbeatSupervisorPanel", "watchdogSupervisorSurface", "onWatchdogSupervisorScenario"], "run workspace watchdog supervisor mount");
requireIncludes(
  panel,
  ["Watchdog heartbeat supervisor controls", "watchdogSupervisorSurface", "watchdogSupervisorSurface.controls.map", "onWatchdogSupervisorScenario(control.scenario)"],
  "watchdog heartbeat supervisor panel"
);

if (!String(packageJson.scripts?.["validate:watchdog-heartbeat-supervisor"] ?? "").includes("check-watchdog-heartbeat-supervisor.mjs")) {
  failures.push("package scripts must define validate:watchdog-heartbeat-supervisor");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:watchdog-heartbeat-supervisor")) {
  failures.push("full validate script must include validate:watchdog-heartbeat-supervisor");
}

if (
  !review.checks.heartbeatCadence ||
  !review.checks.timeoutBudget ||
  !review.checks.gracefulCancelEscalation ||
  !review.checks.forcedCleanupEvidence ||
  !review.checks.terminalIdempotency ||
  !review.checks.zeroTestedPlatformOrphans ||
  !review.checks.noCapabilityWidening
) {
  failures.push("watchdog heartbeat supervisor gate must prove cadence, timeout, cancel escalation, cleanup, idempotency, zero orphan, and closed capabilities");
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
        "src/core/watchdog-heartbeat-supervisor.mjs",
        "tests/watchdog-heartbeat-supervisor.test.mjs",
        "docs/contracts/watchdog-heartbeat-supervisor.md",
        "src/app-state/useRunnerWorkspaceState.ts",
        "src/workspaces/WatchdogHeartbeatSupervisorPanel.tsx",
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
