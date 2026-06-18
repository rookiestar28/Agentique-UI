import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import {
  createRunDashboardQueueMonitorSurface,
  createRunDashboardQueueScenario,
  requiredQueueMonitorStates,
  requiredRunDashboardStates,
  reviewRunDashboardQueueMonitor,
  runDashboardQueueMonitorSchemaVersion,
  validateRunDashboardQueueMonitorSurface
} from "../src/core/run-dashboard-queue-monitor.mjs";

test("run dashboard queue monitor validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-run-dashboard-queue-monitor.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);

  assert.equal(result.status, "passed");
  assert.equal(result.schemaVersion, runDashboardQueueMonitorSchemaVersion);
  assert.equal(result.summary.runStates, requiredRunDashboardStates.length);
  assert.equal(result.summary.queueStates, requiredQueueMonitorStates.length);
  assert.equal(result.summary.interactionViewports, 2);
});

test("dashboard exposes required run lifecycle states", () => {
  const surface = createRunDashboardQueueMonitorSurface();
  const states = new Set(surface.runStates.map((entry) => entry.state));

  assert.equal(surface.schemaVersion, runDashboardQueueMonitorSchemaVersion);
  for (const state of requiredRunDashboardStates) {
    assert.equal(states.has(state), true, state);
  }
  assert.equal(surface.summary.activeRuns >= 1, true);
  assert.equal(surface.summary.cleanupRequiredRuns >= 1, true);
});

test("queue monitor exposes schedule event cleanup and retry states", () => {
  const surface = createRunDashboardQueueMonitorSurface();
  const queueStates = new Set(surface.queueStates.map((entry) => entry.state));
  const actionIds = new Set(surface.actionStates.map((entry) => entry.id));

  for (const state of requiredQueueMonitorStates) {
    assert.equal(queueStates.has(state), true, state);
  }
  for (const action of ["cancel", "force-kill", "cleanup", "retry"]) {
    assert.equal(actionIds.has(action), true, action);
  }
  assert.equal(
    surface.queueStates.every((entry) => typeof entry.eventId === "string" && entry.eventId.startsWith("evt-")),
    true
  );
  assert.equal(
    surface.queueStates.some((entry) => entry.state === "orphan-cleanup" && entry.cleanupReceipt?.status === "cleaned"),
    true
  );
  assert.equal(surface.summary.boundedLogs > 0, true);
});

test("accepted runner evidence is visible without new authority", () => {
  const surface = createRunDashboardQueueMonitorSurface();
  const signalIds = new Set(surface.signalStates.map((entry) => entry.id));

  for (const signal of ["native-event-transport", "watchdog", "ledger-replay", "artifact-receipt", "permission-center"]) {
    assert.equal(signalIds.has(signal), true, signal);
  }

  assert.equal(surface.boundary.frontendAuthority, "display-and-request-only");
  assert.equal(surface.boundary.nativeAuthorityRequired, true);
  assert.equal(surface.boundary.capabilityWidening, false);
  assert.equal(surface.boundary.genericProcessManager, false);
  assert.equal(surface.boundary.genericShellEnabled, false);
  assert.equal(surface.boundary.shellPluginEnabled, false);
  assert.equal(surface.boundary.packageLifecycleEnabled, false);
  assert.equal(surface.boundary.browserDataEnabled, false);
  assert.equal(surface.boundary.containerStartEnabled, false);
  assert.equal(surface.boundary.externalProviderAutomationEnabled, false);
});

test("scenario controls cover active queued terminal and cleanup views", () => {
  const scenarios = ["active", "queued", "completed", "canceled", "failed", "timed-out", "cleanup-required"].map((scenario) => createRunDashboardQueueScenario(scenario));
  const activeStatuses = new Set(scenarios.map((surface) => surface.activeScenario.status));

  for (const status of ["active", "queued", "completed", "canceled", "failed", "timed-out", "cleanup-required"]) {
    assert.equal(activeStatuses.has(status), true, status);
  }
  for (const surface of scenarios) {
    assert.equal(
      surface.controls.every((control) => control.keyboardAccessible === true),
      true
    );
  }
});

test("dashboard contract validates public safe exports", () => {
  const review = reviewRunDashboardQueueMonitor();
  const text = JSON.stringify(review.surface);

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(validateRunDashboardQueueMonitorSurface(review.surface).ok, true);
  assert.doesNotMatch(text, /bearer\s+[A-Za-z0-9._-]+/iu);
  assert.doesNotMatch(text, /sk-[A-Za-z0-9_-]{16,}/iu);
  assert.doesNotMatch(text, /[A-Z]:[\\/]/u);
  assert.doesNotMatch(text, /\/Users\/|\/home\//u);
  const internalMarkerPattern = new RegExp([String.raw`\.plan`, "ning|ref", "erence/|R[0-9]{4}"].join(""), "iu");
  assert.doesNotMatch(text, internalMarkerPattern);
});

test("run workspace renders dashboard queue monitor with accessible controls", () => {
  const source = fs.readFileSync("src/workspaces/RunWorkspace.tsx", "utf8");
  const route = fs.readFileSync("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx", "utf8");
  const state = fs.readFileSync("src/app-state/useRunnerWorkspaceState.ts", "utf8");
  const panel = fs.readFileSync("src/workspaces/RunDashboardQueueMonitorPanel.tsx", "utf8");

  assert.match(panel, /aria-label="Run dashboard and queue monitor"/u);
  assert.match(panel, /aria-label="Run dashboard scenario actions"/u);
  assert.match(source, /RunDashboardQueueMonitorPanel/u);
  assert.match(source, /runDashboardQueueMonitorSurface/u);
  assert.match(route, /runDashboardQueueMonitorSurface/u);
  assert.match(state, /createRunDashboardQueueMonitorSurface/u);
});
