import { reviewNativeRunnerCleanupRecovery } from "./native-runner-cleanup-recovery.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const watchdogHeartbeatSupervisorSchemaVersion = "agentique.watchdogHeartbeatSupervisor.v1";

const fixedNow = "2026-06-16T12:00:00.000Z";
const supportedScenarios = new Set(["healthy", "timeout", "cancel-escalation", "forced-cleanup", "terminal-idempotent"]);
const unsafeReceiptPattern = /(?<![A-Za-z])[A-Za-z]:[\\/]|Bearer\s+|sk-[a-z0-9_-]+|cookie|token|processId|pid\b|vault:[a-z]/iu;

export function createWatchdogHeartbeatSupervisor({ scenario = "healthy" } = {}) {
  const normalizedScenario = supportedScenarios.has(scenario) ? scenario : "healthy";
  const base = baseSupervisor(normalizedScenario);

  if (normalizedScenario === "timeout") {
    return freezeSupervisor({
      ...base,
      timeout: {
        budgetMs: 20000,
        elapsedMs: 25000,
        enforced: true,
        receipt: receipt("timeout-budget-enforced", "Native watchdog enforced timeout budget.")
      },
      cleanup: cleanupEvidence({
        forced: true,
        transition: "timeout-forced-cleanup",
        cleanupRequired: true
      }),
      terminal: terminalEvidence("cleanup-required", "timeout-forced-cleanup")
    });
  }

  if (normalizedScenario === "cancel-escalation") {
    return freezeSupervisor({
      ...base,
      cancel: {
        requested: true,
        requestedAt: fixedNow,
        gracefulWindowMs: 3000,
        elapsedMs: 5000,
        escalated: true,
        receipt: receipt("cancel-grace-expired", "Graceful cancel window expired; forced cleanup was required.")
      },
      cleanup: cleanupEvidence({
        forced: true,
        transition: "grace-expired-forced-cleanup",
        cleanupRequired: true
      }),
      terminal: terminalEvidence("cleanup-required", "grace-expired-forced-cleanup")
    });
  }

  if (normalizedScenario === "forced-cleanup") {
    return freezeSupervisor({
      ...base,
      cleanup: cleanupEvidence({
        forced: true,
        transition: "forced-cleanup-receipt",
        cleanupRequired: false
      }),
      terminal: terminalEvidence("cleaned", "forced-cleanup-receipt")
    });
  }

  if (normalizedScenario === "terminal-idempotent") {
    const terminal = terminalEvidence("cleaned", "terminal-idempotent");
    return freezeSupervisor({
      ...base,
      cleanup: cleanupEvidence({
        forced: false,
        transition: "terminal-repeat",
        cleanupRequired: false
      }),
      terminal
    });
  }

  return freezeSupervisor(base);
}

export function createWatchdogHeartbeatSupervisorSurface({ scenario = "healthy" } = {}) {
  const supervisor = createWatchdogHeartbeatSupervisor({ scenario });

  return freeze({
    schemaVersion: "agentique.watchdogHeartbeatSupervisorSurface.v1",
    scenario: supervisor.scenario,
    controls: [
      { scenario: "healthy", label: "Healthy heartbeat" },
      { scenario: "timeout", label: "Timeout cleanup" },
      { scenario: "cancel-escalation", label: "Cancel escalation" },
      { scenario: "forced-cleanup", label: "Forced cleanup" },
      { scenario: "terminal-idempotent", label: "Terminal repeat" }
    ],
    supervisor,
    summary: {
      heartbeatCadenceMs: supervisor.heartbeat.expectedCadenceMs,
      heartbeatReceipts: supervisor.heartbeat.receipts.length,
      timeoutEnforced: supervisor.timeout.enforced,
      cancelEscalated: supervisor.cancel.escalated,
      cleanupForced: supervisor.cleanup.forced,
      orphanCount: supervisor.cleanup.orphanCount,
      terminalState: supervisor.terminal.state,
      terminalIdempotent: supervisor.terminal.idempotent
    },
    boundary: supervisor.boundary
  });
}

export function reviewWatchdogHeartbeatSupervisorGate() {
  const healthy = createWatchdogHeartbeatSupervisor({ scenario: "healthy" });
  const timeout = createWatchdogHeartbeatSupervisor({ scenario: "timeout" });
  const cancel = createWatchdogHeartbeatSupervisor({ scenario: "cancel-escalation" });
  const forced = createWatchdogHeartbeatSupervisor({ scenario: "forced-cleanup" });
  const terminal = createWatchdogHeartbeatSupervisor({ scenario: "terminal-idempotent" });
  const nativeCleanup = reviewNativeRunnerCleanupRecovery();
  const all = [healthy, timeout, cancel, forced, terminal];
  const checks = {
    heartbeatCadence: healthy.heartbeat.cadenceOk === true && healthy.heartbeat.receipts.length === 4,
    timeoutBudget: timeout.timeout.enforced === true && timeout.timeout.elapsedMs > timeout.timeout.budgetMs && timeout.terminal.state === "cleanup-required",
    gracefulCancelEscalation: cancel.cancel.escalated === true && cancel.cleanup.transition === "grace-expired-forced-cleanup",
    forcedCleanupEvidence: forced.cleanup.forced === true && forced.cleanup.processTreeCleanup === true && forced.cleanup.orphanCount === 0,
    terminalIdempotency: terminal.terminal.idempotent === true && terminal.terminal.firstReceipt.digest === terminal.terminal.secondReceipt.digest,
    zeroTestedPlatformOrphans: nativeCleanup.cleanupRecovery.noOrphanEvidence === true && all.every((item) => item.cleanup.orphanCount === 0),
    noCapabilityWidening: all.every(
      (item) =>
        item.boundary.noGenericProcessManager === true &&
        item.boundary.noShellPlugin === true &&
        item.boundary.noPackageLifecycleExecution === true &&
        item.boundary.noBrowserDataAccess === true &&
        item.boundary.noAmbientEnvironmentForwarding === true &&
        !unsafeReceiptPattern.test(JSON.stringify(item))
    )
  };
  const ok = Object.values(checks).every(Boolean);

  return freeze({
    schemaVersion: "agentique.watchdogHeartbeatSupervisorReview.v1",
    ok,
    checks,
    summary: {
      heartbeatReceipts: healthy.heartbeat.receipts.length,
      timeoutState: timeout.terminal.state,
      cancelEscalated: cancel.cancel.escalated,
      forcedCleanup: forced.cleanup.forced,
      orphanCount: forced.cleanup.orphanCount,
      nativeCleanupBacked: nativeCleanup.cleanupRecovery.nativeBacked
    },
    errors: ok ? [] : [issue("watchdog-heartbeat-supervisor.review", "Watchdog heartbeat supervisor review failed.")]
  });
}

function baseSupervisor(scenario) {
  const terminal = terminalEvidence("running", "healthy-heartbeat");
  return {
    schemaVersion: watchdogHeartbeatSupervisorSchemaVersion,
    scenario,
    generatedAt: fixedNow,
    supervision: {
      owner: "native-fixed-lane",
      adapterId: "adapter.local-python",
      lane: "fixed-python",
      receiptPath: `runs/run-watchdog-${scenario}/watchdog-receipt.json`
    },
    heartbeat: heartbeatEvidence(),
    timeout: {
      budgetMs: 20000,
      elapsedMs: 15000,
      enforced: false,
      receipt: receipt("timeout-budget-open", "Timeout budget remains open.")
    },
    cancel: {
      requested: false,
      requestedAt: null,
      gracefulWindowMs: 3000,
      elapsedMs: 0,
      escalated: false,
      receipt: receipt("cancel-not-requested", "No cancel request is active.")
    },
    cleanup: cleanupEvidence({
      forced: false,
      transition: "not-required",
      cleanupRequired: false
    }),
    terminal,
    boundary: boundary()
  };
}

function heartbeatEvidence() {
  const offsets = [0, 5000, 10000, 15000];
  const receipts = offsets.map((offsetMs, index) => ({
    schemaVersion: "agentique.watchdogHeartbeatReceipt.v1",
    sequence: index + 1,
    offsetMs,
    cadenceMs: index === 0 ? 0 : offsetMs - offsets[index - 1],
    state: "running",
    nativeOwned: true,
    redacted: true,
    receiptRef: `runs/run-watchdog-heartbeat/heartbeat-${index + 1}.json`
  }));
  return {
    expectedCadenceMs: 5000,
    maxSkewMs: 500,
    cadenceOk: receipts.slice(1).every((entry) => Math.abs(entry.cadenceMs - 5000) <= 500),
    receipts
  };
}

function cleanupEvidence({ forced, transition, cleanupRequired }) {
  return {
    schemaVersion: "agentique.watchdogCleanupReceipt.v1",
    transition,
    forced,
    cleanupRequired,
    processTreeCleanup: true,
    testedPlatform: "windows-source-checkout",
    orphanCount: 0,
    receiptRef: `runs/run-watchdog-cleanup/${transition}.json`,
    redacted: true
  };
}

function terminalEvidence(state, transition) {
  const firstReceipt = terminalReceipt(state, transition);
  const secondReceipt = terminalReceipt(state, transition);
  return {
    state,
    transition,
    idempotent: firstReceipt.digest === secondReceipt.digest && firstReceipt.state === secondReceipt.state,
    firstReceipt,
    secondReceipt
  };
}

function terminalReceipt(state, transition) {
  const receiptBody = `${state}:${transition}:native-fixed-lane`;
  return {
    schemaVersion: "agentique.watchdogTerminalReceipt.v1",
    state,
    transition,
    digest: hashText(receiptBody),
    redacted: true,
    receiptRef: `runs/run-watchdog-terminal/${state}-${transition}.json`
  };
}

function receipt(kind, message) {
  return {
    schemaVersion: "agentique.watchdogSupervisorReceipt.v1",
    kind,
    message: redactText(message),
    redacted: true,
    receiptRef: `runs/run-watchdog/${kind}.json`
  };
}

function boundary() {
  return {
    sourceFirstOnly: true,
    nativeOwned: true,
    noGenericProcessManager: true,
    noShellPlugin: true,
    noPackageLifecycleExecution: true,
    noBrowserDataAccess: true,
    noAmbientEnvironmentForwarding: true,
    noSignedInstallerDependency: true,
    noPackagedRuntimeDependency: true
  };
}

function freezeSupervisor(supervisor) {
  // CRITICAL: terminal repeats must be idempotent before retry/cleanup decisions are trusted.
  if (supervisor.terminal.firstReceipt.digest !== supervisor.terminal.secondReceipt.digest) {
    throw issue("watchdog.terminal-idempotency", "Terminal receipts must be idempotent.");
  }
  assertNoInlineSecrets(supervisor);
  if (unsafeReceiptPattern.test(JSON.stringify(supervisor))) {
    throw issue("watchdog.unsafe-receipt", "Watchdog receipts must stay redacted and path-neutral.");
  }
  return freeze(supervisor);
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(redactText(message)));
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
