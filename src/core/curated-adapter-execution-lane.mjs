import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const curatedAdapterExecutionLaneSchemaVersion = "agentique.curatedAdapterExecutionLane.v1";

const fixedNow = "2026-06-13T00:00:00.000Z";

const lanes = Object.freeze([
  lane({
    runtime: "python",
    adapterId: "adapter.local-python",
    runId: "run-python-001",
    digest: "c".repeat(64),
    signature: "verified",
    allowlisted: true,
    supportMode: "locally-runnable",
    status: "succeeded",
    command: "npm run validate:python-adapter-runner",
    files: [
      "runs/run-python-001/run.json",
      "runs/run-python-001/logs/stdout.log",
      "runs/run-python-001/logs/stderr.log",
      "runs/run-python-001/outputs/python-result.json",
      "runs/run-python-001/artifacts/python-result.json",
      "runs/run-python-001/write-receipt.json"
    ],
    envKeys: ["AGENTIQUE_RUN_ID", "AGENTIQUE_ADAPTER_RUNTIME", "AGENTIQUE_ADAPTER_MODE", "PYTHONNOUSERSITE"],
    cleanup: {
      status: "timed-out-cleaned",
      receipt: "runs/run-python-timeout/cleanup-receipt.json"
    }
  }),
  lane({
    runtime: "node",
    adapterId: "adapter.local-node",
    runId: "run-node-001",
    digest: "e".repeat(64),
    signature: "verified",
    allowlisted: true,
    supportMode: "locally-runnable",
    status: "succeeded",
    command: "npm run validate:node-adapter-runner",
    files: [
      "runs/run-node-001/run.json",
      "runs/run-node-001/logs/stdout.log",
      "runs/run-node-001/logs/stderr.log",
      "runs/run-node-001/outputs/node-result.json",
      "runs/run-node-001/artifacts/node-result.json",
      "runs/run-node-001/write-receipt.json"
    ],
    envKeys: ["AGENTIQUE_RUN_ID", "AGENTIQUE_ADAPTER_RUNTIME", "AGENTIQUE_ADAPTER_MODE", "NODE_NO_WARNINGS"],
    cleanup: {
      status: "canceled-cleaned",
      receipt: "runs/run-node-cancel/cleanup-receipt.json"
    }
  })
]);

const blockedSamples = Object.freeze([
  blocked("unsigned", "runner.adapter-blocked", "Unsigned adapter pack fails before launch."),
  blocked("tampered", "runner.adapter-blocked", "Tampered digest fails before launch."),
  blocked("revoked", "runner.adapter-blocked", "Revoked digest fails before launch."),
  blocked("wrong-support-mode", "runner.support-mode", "Wrong support mode cannot enter the local lane."),
  blocked("unsafe-package-policy", "node-adapter.package-policy-blocked", "Package manager, lifecycle scripts, inline scripts, and broad subprocess stay blocked.")
]);

export function createCuratedAdapterExecutionLane({ selectedRuntime = "python", now = fixedNow } = {}) {
  const selected = lanes.find((entry) => entry.runtime === selectedRuntime) ?? lanes[0];
  const review = {
    schemaVersion: curatedAdapterExecutionLaneSchemaVersion,
    generatedAt: now,
    selectedRuntime: selected.runtime,
    status: selected.status,
    lanes,
    selected,
    blockedSamples,
    cleanupSamples: lanes.map((entry) => ({
      runtime: entry.runtime,
      status: entry.cleanup.status,
      receipt: entry.cleanup.receipt
    })),
    summary: {
      signedAllowlisted: lanes.filter((entry) => entry.signature === "verified" && entry.allowlisted).length,
      succeeded: lanes.filter((entry) => entry.status === "succeeded").length,
      blockedBeforeLaunch: blockedSamples.length,
      cleanupReceipts: lanes.filter((entry) => entry.cleanup.receipt).length,
      forwardedAmbient: lanes.flatMap((entry) => entry.environment.forwardedAmbient).length
    },
    notes: [
      "Browser UI displays curated lane evidence from Node validation runners.",
      "React bundle must not import Node-only adapter runner modules.",
      "No package manager, lifecycle script, inline code string, generic shell, or ambient environment lane is enabled."
    ]
  };
  assertNoInlineSecrets(review);
  return freeze(review);
}

export function reviewCuratedAdapterExecutionLane() {
  const review = createCuratedAdapterExecutionLane({ selectedRuntime: "python" });
  const runtimes = new Set(review.lanes.map((entry) => entry.runtime));
  const blockedReasons = new Set(review.blockedSamples.map((entry) => entry.reason));
  const text = JSON.stringify(review);
  const ok = review.schemaVersion === curatedAdapterExecutionLaneSchemaVersion &&
    runtimes.has("python") &&
    runtimes.has("node") &&
    review.lanes.every((entry) => entry.signature === "verified" && entry.allowlisted && entry.supportMode === "locally-runnable") &&
    review.lanes.every((entry) => entry.status === "succeeded" && entry.evidence.files.length >= 6) &&
    review.lanes.every((entry) => entry.environment.forwardedAmbient.length === 0) &&
    blockedReasons.has("unsigned") &&
    blockedReasons.has("tampered") &&
    blockedReasons.has("revoked") &&
    blockedReasons.has("wrong-support-mode") &&
    blockedReasons.has("unsafe-package-policy") &&
    review.cleanupSamples.length === 2 &&
    !/[A-Za-z]:[\\/]|vault:[a-z]|bearer\s+/iu.test(text);

  return freeze({
    schemaVersion: "agentique.curatedAdapterExecutionLaneReview.v1",
    ok,
    checks: {
      python: runtimes.has("python"),
      node: runtimes.has("node"),
      signedAllowlisted: review.summary.signedAllowlisted,
      blockedBeforeLaunch: review.summary.blockedBeforeLaunch,
      cleanupReceipts: review.summary.cleanupReceipts,
      forwardedAmbient: review.summary.forwardedAmbient
    },
    errors: ok ? [] : [issue("curated-adapter-lane.review", "Curated adapter lane review failed.")]
  });
}

function lane({ runtime, adapterId, runId, digest, signature, allowlisted, supportMode, status, command, files, envKeys, cleanup }) {
  return {
    runtime,
    adapterId,
    runId,
    status,
    digest: digest.slice(0, 16),
    signature,
    allowlisted,
    supportMode,
    validationCommand: command,
    permissions: [
      { family: "files", action: "read", target: `workspace:inputs/${runtime}-adapter-request.json` },
      { family: "subprocess", action: "start", target: `adapter:${adapterId}` },
      { family: "artifactRetention", action: "retain", target: "artifact-retention:7d" }
    ],
    environment: {
      adapterEnvKeys: envKeys,
      forwardedAmbient: []
    },
    evidence: {
      runFolder: `runs/${runId}`,
      files,
      output: `runs/${runId}/outputs/${runtime}-result.json`,
      artifact: `runs/${runId}/artifacts/${runtime}-result.json`,
      writeReceipt: `runs/${runId}/write-receipt.json`
    },
    cleanup
  };
}

function blocked(reason, code, message) {
  return {
    reason,
    code,
    status: "blocked-before-launch",
    launched: false,
    message: redactText(message)
  };
}

function issue(code, message) {
  return { code, message: redactText(message) };
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
