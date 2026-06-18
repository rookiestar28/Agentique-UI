export const pythonNodeAdapterPackExpansionSchemaVersion = "agentique.pythonNodeAdapterPackExpansion.v1";

const fixedNow = "2026-06-18T00:00:00.000Z";

const deniedPermissionCeiling = Object.freeze({
  files: "ask",
  network: "deny",
  shell: "deny",
  environment: "deny",
  gpu: "deny",
  containers: "deny",
  externalProviders: "deny",
  secrets: "deny",
  sidecars: "ask",
  browserData: "deny"
});

const blockedReasonCodes = Object.freeze([
  "unsigned",
  "unallowlisted",
  "runtime-mismatch",
  "broad-permission",
  "missing-host-prerequisite",
  "stale-watchdog",
  "missing-artifact-receipt",
  "missing-cleanup",
  "package-install",
  "lifecycle-script",
  "inline-script",
  "broad-subprocess",
  "ambient-env",
  "browser-data",
  "container-start",
  "provider-automation"
]);

export function createPythonNodeAdapterPackExpansion({ selectedRuntime = "python", now = fixedNow } = {}) {
  const packs = Object.freeze([
    pack({
      runtime: "python",
      adapterId: "adapter.local-python",
      manifestId: "manifest.local-python.v1",
      digest: "c".repeat(64),
      validationCommand: "npm run validate:python-adapter-runner",
      hostReceipts: ["receipts/python-runtime.json", "receipts/source-checkout.json"],
      runId: "run-python-001",
      cleanupStatus: "timed-out-cleaned",
      cleanupReceipt: "runs/run-python-timeout/cleanup-receipt.json",
      adapterEnvKeys: ["AGENTIQUE_RUN_ID", "AGENTIQUE_ADAPTER_RUNTIME", "AGENTIQUE_ADAPTER_MODE", "PYTHONNOUSERSITE"]
    }),
    pack({
      runtime: "node",
      adapterId: "adapter.local-node",
      manifestId: "manifest.local-node.v1",
      digest: "e".repeat(64),
      validationCommand: "npm run validate:node-adapter-runner",
      hostReceipts: ["receipts/node-runtime.json", "receipts/source-checkout.json"],
      runId: "run-node-001",
      cleanupStatus: "canceled-cleaned",
      cleanupReceipt: "runs/run-node-cancel/cleanup-receipt.json",
      adapterEnvKeys: ["AGENTIQUE_RUN_ID", "AGENTIQUE_ADAPTER_RUNTIME", "AGENTIQUE_ADAPTER_MODE", "NODE_NO_WARNINGS"]
    })
  ]);
  const selected = packs.find((entry) => entry.runtime === selectedRuntime) ?? packs[0];
  const blockedSamples = Object.freeze(blockedReasonCodes.map((reason) => blocked(reason)));
  const review = {
    schemaVersion: pythonNodeAdapterPackExpansionSchemaVersion,
    generatedAt: now,
    selectedRuntime: selected.runtime,
    selected,
    packs,
    blockedSamples,
    summary: {
      fixedAllowlistedPacks: packs.filter((entry) => entry.fixed && entry.allowlisted).length,
      signedManifests: packs.filter((entry) => entry.manifest.signature === "verified").length,
      hostPrerequisites: packs.filter((entry) => entry.hostPrerequisites.ok).length,
      artifactReceipts: packs.reduce((total, entry) => total + entry.artifacts.receipts.length, 0),
      cleanupReceipts: packs.filter((entry) => entry.cleanup.receipt).length,
      blockedBeforeLaunch: blockedSamples.length,
      forwardedAmbient: packs.flatMap((entry) => entry.environment.forwardedAmbient).length
    },
    notes: [
      "Fixed allowlisted adapter packs are reviewed as descriptor evidence only.",
      "No package manager, lifecycle script, inline script, generic shell, browser data, ambient environment, container, or provider automation is enabled.",
      "Browser surfaces must not import Node-only adapter runner modules."
    ]
  };
  assertSecretFree(review);
  return freeze(review);
}

export function reviewPythonNodeAdapterPackExpansion() {
  const review = createPythonNodeAdapterPackExpansion();
  const runtimes = new Set(review.packs.map((entry) => entry.runtime));
  const blockedReasons = new Set(review.blockedSamples.map((entry) => entry.reason));
  const text = JSON.stringify(review);
  const ok =
    review.schemaVersion === pythonNodeAdapterPackExpansionSchemaVersion &&
    review.packs.length === 2 &&
    runtimes.has("python") &&
    runtimes.has("node") &&
    review.packs.every((entry) => entry.fixed && entry.allowlisted && entry.manifest.signature === "verified") &&
    review.packs.every((entry) => entry.hostPrerequisites.ok && entry.hostPrerequisites.receipts.length >= 2) &&
    review.packs.every((entry) => entry.permissionCeiling.shell === "deny" && entry.permissionCeiling.environment === "deny" && entry.permissionCeiling.browserData === "deny") &&
    review.packs.every((entry) => entry.permissionCeiling.containers === "deny" && entry.permissionCeiling.externalProviders === "deny") &&
    review.packs.every((entry) => entry.watchdog.status === "supervised" && entry.nativeEvents.transport === "native-event-stream") &&
    review.packs.every((entry) => entry.artifacts.receipts.length >= 2 && entry.cleanup.receipt.endsWith("cleanup-receipt.json")) &&
    review.packs.every((entry) => entry.packagePolicy.installAllowed === false && entry.packagePolicy.lifecycleScripts === "blocked") &&
    review.packs.every((entry) => Object.values(entry.authority).every((value) => value === false)) &&
    review.packs.every((entry) => entry.environment.forwardedAmbient.length === 0) &&
    blockedReasonCodes.every((reason) => blockedReasons.has(reason)) &&
    review.blockedSamples.every((entry) => entry.launched === false) &&
    !/[A-Za-z]:[\\/]|bearer\s+|sk-[A-Za-z0-9]|ghp_|github_pat_|vault:/iu.test(text);

  return freeze({
    schemaVersion: "agentique.pythonNodeAdapterPackExpansionReview.v1",
    ok,
    checks: {
      fixedAllowlistedPacks: review.summary.fixedAllowlistedPacks,
      signedManifests: review.summary.signedManifests,
      hostPrerequisites: review.summary.hostPrerequisites,
      artifactReceipts: review.summary.artifactReceipts,
      cleanupReceipts: review.summary.cleanupReceipts,
      blockedBeforeLaunch: review.summary.blockedBeforeLaunch,
      forwardedAmbient: review.summary.forwardedAmbient
    },
    errors: ok ? [] : [issue("python-node-adapter-pack-expansion.review", "Python and Node adapter pack expansion review failed.")]
  });
}

function pack({ runtime, adapterId, manifestId, digest, validationCommand, hostReceipts, runId, cleanupStatus, cleanupReceipt, adapterEnvKeys }) {
  return {
    runtime,
    adapterId,
    fixed: true,
    allowlisted: true,
    manifest: {
      id: manifestId,
      signature: "verified",
      digest: digest.slice(0, 16),
      signer: "agentique-adapter-release",
      supportMode: "locally-runnable",
      version: "0.1.0"
    },
    hostPrerequisites: {
      ok: true,
      receipts: hostReceipts,
      remediation: []
    },
    permissionCeiling: deniedPermissionCeiling,
    packagePolicy: {
      packageManager: "blocked",
      installAllowed: false,
      lifecycleScripts: "blocked",
      inlineScripts: false,
      broadSubprocess: false,
      allowAllEquivalent: false
    },
    watchdog: {
      status: "supervised",
      timeoutMs: 60000,
      heartbeatReceipt: `runs/${runId}/watchdog-heartbeat.json`
    },
    nativeEvents: {
      transport: "native-event-stream",
      replayReceipt: `runs/${runId}/events/replay.json`,
      terminalReceipt: `runs/${runId}/events/terminal.json`
    },
    artifacts: {
      receipts: [`runs/${runId}/write-receipt.json`, `runs/${runId}/artifacts/${runtime}-result.json`],
      viewer: "safe-json",
      redacted: true
    },
    cleanup: {
      status: cleanupStatus,
      receipt: cleanupReceipt,
      idempotent: true
    },
    environment: {
      adapterEnvKeys,
      forwardedAmbient: []
    },
    authority: {
      autoInstall: false,
      lifecycleHooks: false,
      newRuntimeLane: false,
      browserData: false,
      ambientEnvironment: false,
      containerStart: false,
      providerAutomation: false
    },
    validationCommand
  };
}

function blocked(reason) {
  return {
    reason,
    status: "blocked-before-launch",
    launched: false,
    code: `adapter-pack.${reason}`,
    message: `${reason} adapter pack sample fails closed before launch.`
  };
}

function assertSecretFree(value) {
  const text = JSON.stringify(value);
  if (/(bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|vault:[a-z])/iu.test(text)) {
    throw new Error("Python and Node adapter pack expansion contains sensitive material.");
  }
}

function issue(code, message) {
  return { code, message };
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
