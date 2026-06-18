import assert from "node:assert/strict";
import test from "node:test";
import { createWatchdogHeartbeatSupervisor, reviewWatchdogHeartbeatSupervisorGate, watchdogHeartbeatSupervisorSchemaVersion } from "../src/core/watchdog-heartbeat-supervisor.mjs";

test("watchdog supervisor records bounded native heartbeat cadence", () => {
  const healthy = createWatchdogHeartbeatSupervisor({ scenario: "healthy" });

  assert.equal(healthy.schemaVersion, watchdogHeartbeatSupervisorSchemaVersion);
  assert.equal(healthy.supervision.owner, "native-fixed-lane");
  assert.equal(healthy.heartbeat.cadenceOk, true);
  assert.deepEqual(
    healthy.heartbeat.receipts.map((receipt) => receipt.offsetMs),
    [0, 5000, 10000, 15000]
  );
});

test("timeout budget enforcement produces cleanup-required forced cleanup evidence", () => {
  const timeout = createWatchdogHeartbeatSupervisor({ scenario: "timeout" });

  assert.equal(timeout.timeout.enforced, true);
  assert.equal(timeout.timeout.elapsedMs > timeout.timeout.budgetMs, true);
  assert.equal(timeout.terminal.state, "cleanup-required");
  assert.equal(timeout.cleanup.forced, true);
  assert.equal(timeout.cleanup.processTreeCleanup, true);
  assert.equal(timeout.cleanup.orphanCount, 0);
});

test("graceful cancel escalates to forced cleanup after the grace window", () => {
  const cancel = createWatchdogHeartbeatSupervisor({ scenario: "cancel-escalation" });

  assert.equal(cancel.cancel.requested, true);
  assert.equal(cancel.cancel.gracefulWindowMs, 3000);
  assert.equal(cancel.cancel.escalated, true);
  assert.equal(cancel.cleanup.transition, "grace-expired-forced-cleanup");
  assert.equal(cancel.terminal.state, "cleanup-required");
});

test("terminal receipts are idempotent", () => {
  const terminal = createWatchdogHeartbeatSupervisor({ scenario: "terminal-idempotent" });

  assert.equal(terminal.terminal.idempotent, true);
  assert.equal(terminal.terminal.firstReceipt.digest, terminal.terminal.secondReceipt.digest);
  assert.equal(terminal.terminal.firstReceipt.state, terminal.terminal.secondReceipt.state);
});

test("watchdog receipts stay redacted path-neutral and capability-closed", () => {
  const forced = createWatchdogHeartbeatSupervisor({ scenario: "forced-cleanup" });

  assert.equal(forced.cleanup.forced, true);
  assert.equal(forced.cleanup.orphanCount, 0);
  assert.equal(forced.boundary.noGenericProcessManager, true);
  assert.equal(forced.boundary.noShellPlugin, true);
  assert.equal(forced.boundary.noPackageLifecycleExecution, true);
  assert.equal(forced.boundary.noBrowserDataAccess, true);
  assert.equal(forced.boundary.noAmbientEnvironmentForwarding, true);
  assert.doesNotMatch(JSON.stringify(forced), /[A-Za-z]:[\\/]|Bearer\s+|sk-[a-z0-9_-]+|cookie|token|processId|pid\b|vault:[a-z]/iu);
});

test("watchdog heartbeat supervisor gate proves all acceptance checks", () => {
  const review = reviewWatchdogHeartbeatSupervisorGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.heartbeatCadence, true);
  assert.equal(review.checks.timeoutBudget, true);
  assert.equal(review.checks.gracefulCancelEscalation, true);
  assert.equal(review.checks.forcedCleanupEvidence, true);
  assert.equal(review.checks.terminalIdempotency, true);
  assert.equal(review.checks.zeroTestedPlatformOrphans, true);
  assert.equal(review.checks.noCapabilityWidening, true);
});
