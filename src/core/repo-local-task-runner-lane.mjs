export const repoLocalTaskRunnerLaneSchemaVersion = "agentique.repoLocalTaskRunnerLane.v1";

const fixedNow = "2026-06-18T00:00:00.000Z";

const permissionCeiling = Object.freeze({
  files: "repo-relative-ask",
  network: "deny",
  genericShell: "deny",
  packageInstall: "deny",
  lifecycleHooks: "deny",
  environment: "whitelist-only",
  browserData: "deny",
  containers: "deny",
  externalProviders: "deny"
});

const blockedReasonCodes = Object.freeze([
  "arbitrary-shell",
  "package-install",
  "lifecycle-hook",
  "generated-adapter-hook",
  "downloaded-workflow",
  "broad-subprocess",
  "ambient-env",
  "browser-data",
  "container-start",
  "provider-automation",
  "absolute-working-directory",
  "path-traversal",
  "missing-approval",
  "missing-dry-run",
  "missing-artifact-receipt",
  "missing-cleanup"
]);

export function createRepoLocalTaskRunnerLane({ selectedTaskId = "task.validate-public", now = fixedNow } = {}) {
  const tasks = Object.freeze([
    task({
      taskId: "task.validate-public",
      manifestId: "tasks/agentique.validate-public.json",
      commandId: "validate-public",
      commandLabel: "Validate public boundary",
      argv: ["npm", "run", "validate:public"],
      dryRunReceipt: "receipts/tasks/validate-public/dry-run.json",
      artifactReceipts: ["runs/task-validate-public/write-receipt.json", "runs/task-validate-public/public-boundary-summary.json"],
      cleanupReceipt: "runs/task-validate-public/cleanup-receipt.json"
    }),
    task({
      taskId: "task.run-unit-tests",
      manifestId: "tasks/agentique.unit-tests.json",
      commandId: "npm-test",
      commandLabel: "Run unit and workspace tests",
      argv: ["npm", "test"],
      dryRunReceipt: "receipts/tasks/npm-test/dry-run.json",
      artifactReceipts: ["runs/task-npm-test/write-receipt.json", "runs/task-npm-test/test-summary.json"],
      cleanupReceipt: "runs/task-npm-test/cleanup-receipt.json"
    })
  ]);
  const selected = tasks.find((entry) => entry.taskId === selectedTaskId) ?? tasks[0];
  const blockedSamples = Object.freeze(blockedReasonCodes.map((reason) => blocked(reason)));
  const review = {
    schemaVersion: repoLocalTaskRunnerLaneSchemaVersion,
    generatedAt: now,
    selectedTaskId: selected.taskId,
    selected,
    tasks,
    blockedSamples,
    permissionCeiling,
    summary: {
      repoOwnedManifests: tasks.filter((entry) => entry.manifest.repoOwned).length,
      approvedFixedCommands: tasks.filter((entry) => entry.command.approvedFixedCommand && entry.command.allowlisted).length,
      dryRunReceipts: tasks.filter((entry) => entry.dryRun.receipt).length,
      approvalReceipts: tasks.filter((entry) => entry.approval.receipt).length,
      artifactReceipts: tasks.reduce((total, entry) => total + entry.artifacts.receipts.length, 0),
      cleanupReceipts: tasks.filter((entry) => entry.cleanup.receipt).length,
      auditEvents: tasks.reduce((total, entry) => total + entry.audit.events.length, 0),
      blockedBeforeLaunch: blockedSamples.length,
      forwardedAmbient: tasks.flatMap((entry) => entry.environment.forwardedAmbient).length
    },
    notes: [
      "Repo-local task runner lane is reviewed as descriptor evidence only.",
      "Only repo-owned manifests and approved fixed command ids can pass the lane review.",
      "Approval receipts are evidence gates; they do not grant sandbox authority."
    ]
  };
  assertSecretFree(review);
  return freeze(review);
}

export function reviewRepoLocalTaskRunnerLane() {
  const review = createRepoLocalTaskRunnerLane();
  const blockedReasons = new Set(review.blockedSamples.map((entry) => entry.reason));
  const text = JSON.stringify(review);
  const ok =
    review.schemaVersion === repoLocalTaskRunnerLaneSchemaVersion &&
    review.tasks.length === 2 &&
    review.tasks.every((entry) => entry.manifest.repoOwned && entry.manifest.source === "repo-local") &&
    review.tasks.every((entry) => entry.command.approvedFixedCommand && entry.command.allowlisted) &&
    review.tasks.every((entry) => entry.command.packageInstall === false && entry.command.lifecycleHook === false && entry.command.generatedAdapterHook === false) &&
    review.tasks.every((entry) => entry.command.downloadedWorkflow === false && entry.command.broadSubprocess === false) &&
    review.tasks.every((entry) => entry.dryRun.status === "passed" && entry.dryRun.receipt.endsWith(".json")) &&
    review.tasks.every((entry) => entry.approval.required && entry.approval.userApproved && entry.approval.receipt.endsWith("approval-receipt.json")) &&
    review.tasks.every((entry) => entry.workingDirectory.scope === "repo-relative" && entry.workingDirectory.insideRepo) &&
    review.tasks.every((entry) => entry.workingDirectory.absolute === false && entry.workingDirectory.traversal === false) &&
    review.tasks.every((entry) => entry.environment.forwardedAmbient.length === 0 && entry.environment.whitelist.includes("AGENTIQUE_RUN_ID")) &&
    review.tasks.every((entry) => entry.artifacts.receipts.length >= 2 && entry.cleanup.receipt.endsWith("cleanup-receipt.json")) &&
    review.tasks.every((entry) => entry.audit.events.length >= 2) &&
    Object.values(review.permissionCeiling).every((value) => String(value).includes("deny") || value === "repo-relative-ask" || value === "whitelist-only") &&
    review.tasks.every((entry) => Object.values(entry.authority).every((value) => value === false)) &&
    blockedReasonCodes.every((reason) => blockedReasons.has(reason)) &&
    review.blockedSamples.every((entry) => entry.launched === false) &&
    !/[A-Za-z]:[\\/]|bearer\s+|sk-[A-Za-z0-9]{20,}|ghp_|github_pat_|vault:/iu.test(text);

  return freeze({
    schemaVersion: "agentique.repoLocalTaskRunnerLaneReview.v1",
    ok,
    checks: {
      repoOwnedManifests: review.summary.repoOwnedManifests,
      approvedFixedCommands: review.summary.approvedFixedCommands,
      dryRunReceipts: review.summary.dryRunReceipts,
      approvalReceipts: review.summary.approvalReceipts,
      artifactReceipts: review.summary.artifactReceipts,
      cleanupReceipts: review.summary.cleanupReceipts,
      auditEvents: review.summary.auditEvents,
      blockedBeforeLaunch: review.summary.blockedBeforeLaunch,
      forwardedAmbient: review.summary.forwardedAmbient
    },
    errors: ok ? [] : [issue("repo-local-task-runner-lane.review", "Repo-local task runner lane review failed.")]
  });
}

function task({ taskId, manifestId, commandId, commandLabel, argv, dryRunReceipt, artifactReceipts, cleanupReceipt }) {
  return {
    taskId,
    manifest: {
      id: manifestId,
      schemaVersion: "agentique.repoTaskManifest.v1",
      repoOwned: true,
      source: "repo-local",
      digest: `${commandId.replaceAll("-", "")}`.padEnd(16, "0").slice(0, 16),
      reviewedAt: fixedNow
    },
    command: {
      id: commandId,
      label: commandLabel,
      argv,
      approvedFixedCommand: true,
      allowlisted: true,
      packageInstall: false,
      lifecycleHook: false,
      generatedAdapterHook: false,
      downloadedWorkflow: false,
      broadSubprocess: false
    },
    dryRun: {
      status: "passed",
      receipt: dryRunReceipt,
      sideEffects: []
    },
    approval: {
      required: true,
      userApproved: true,
      receipt: `receipts/tasks/${commandId}/approval-receipt.json`,
      stale: false
    },
    workingDirectory: {
      scope: "repo-relative",
      path: ".",
      insideRepo: true,
      absolute: false,
      traversal: false
    },
    environment: {
      whitelist: ["AGENTIQUE_RUN_ID", "AGENTIQUE_TASK_ID", "NODE_ENV"],
      forwardedAmbient: []
    },
    artifacts: {
      receipts: artifactReceipts,
      redacted: true,
      pathNeutral: true
    },
    cleanup: {
      status: "receipt-ready",
      receipt: cleanupReceipt,
      idempotent: true
    },
    audit: {
      events: [`${taskId}.manifest-reviewed`, `${taskId}.approval-recorded`, `${taskId}.dry-run-recorded`],
      redacted: true
    },
    authority: {
      arbitraryShell: false,
      packageInstall: false,
      lifecycleHook: false,
      generatedAdapterHook: false,
      downloadedWorkflow: false,
      broadSubprocess: false,
      browserData: false,
      ambientEnvironment: false,
      containerStart: false,
      providerAutomation: false
    }
  };
}

function blocked(reason) {
  return {
    reason,
    status: "blocked-before-launch",
    launched: false,
    code: `repo-task.${reason}`,
    message: `${reason} repo-local task sample fails closed before launch.`
  };
}

function assertSecretFree(value) {
  const text = JSON.stringify(value);
  if (/(bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|vault:[a-z])/iu.test(text)) {
    throw new Error("Repo-local task runner lane contains sensitive material.");
  }
}

function issue(code, message) {
  return { code, message };
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
