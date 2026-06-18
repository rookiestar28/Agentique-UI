import fs from "node:fs";
import path from "node:path";

const privatePlanSegment = ["", "planning"].join(".");
const privateResearchSegment = ["ref", "erence"].join("") + "/";
const bearerTokenPattern = ["bear", "er"].join("") + "\\s+[A-Za-z0-9._-]{12,}";
const secretKeyPattern = ["s", "k"].join("") + "-[A-Za-z0-9_-]{16,}";
const unsafeReceiptPattern = new RegExp(
  `(?<![A-Za-z])[A-Za-z]:[\\\\/]|${bearerTokenPattern}|${secretKeyPattern}|${escapeForRegex(privatePlanSegment)}|${escapeForRegex(privateResearchSegment)}`,
  "iu"
);

export function readNativeRunnerCleanupRecoveryInputs(root = process.cwd()) {
  const repoRoot = path.resolve(root);
  return {
    root: repoRoot,
    rustSource: readText(repoRoot, "src-tauri/src/lib.rs"),
    packageJson: readJson(repoRoot, "package.json"),
    validationStageSource: readText(repoRoot, "src/core/validation-stage-reporting.mjs"),
    runHistorySource: readText(repoRoot, "src/core/run-history-evidence.mjs"),
    runWorkspaceSource: readText(repoRoot, "src/workspaces/RunWorkspace.tsx")
  };
}

export function reviewNativeRunnerCleanupRecovery(input = readNativeRunnerCleanupRecoveryInputs()) {
  const rustSource = String(input.rustSource ?? "");
  const packageJson = input.packageJson ?? {};
  const validationStageSource = String(input.validationStageSource ?? "");
  const runHistorySource = String(input.runHistorySource ?? "");
  const runWorkspaceSource = String(input.runWorkspaceSource ?? "");
  const cancelBody = parseFunctionBody(rustSource, "agentique_runner_cancel");
  const cleanupBody = parseFunctionBody(rustSource, "agentique_runner_cleanup");
  const replayBody = parseFunctionBody(rustSource, "native_replay_receipt");
  const errors = [];

  if (unsafeReceiptPattern.test(rustSource) || unsafeReceiptPattern.test(runHistorySource) || unsafeReceiptPattern.test(runWorkspaceSource)) {
    errors.push(issue("native-cleanup.unsafe-receipt", "Native cleanup recovery must not expose raw local paths, secrets, or private workspace paths."));
  }

  const cleanupRecovery = {
    nativeBacked:
      rustSource.includes("agentique.nativeRunnerCleanupRecovery.v1") && rustSource.includes("NativeRunnerCleanupRecoveryReceipt") && /native_backed:\s*true/u.test(rustSource),
    descriptorOnly: /descriptor_only:\s*true/u.test(rustSource) ? true : /descriptor_only:\s*false/u.test(rustSource) ? false : null,
    cancelCommandNativeBacked:
      cancelBody.includes("cleanup_recovery_transition") &&
      cancelBody.includes("cancel-cleanup") &&
      cancelBody.includes("NativeRunState::Canceled") &&
      !/runner_boundary_receipt\s*\(/u.test(cancelBody),
    cleanupCommandIdempotent:
      cleanupBody.includes("cleanup_recovery_transition") &&
      cleanupBody.includes("cleanup-retry") &&
      cleanupBody.includes("NativeRunState::CleanedUp") &&
      cleanupBody.includes("NativeRunState::CleanupRequired") &&
      !/runner_boundary_receipt\s*\(/u.test(cleanupBody),
    timeoutCleanup: rustSource.includes("simulate_native_timeout_for_tests") && rustSource.includes("timeout-cleanup") && rustSource.includes("NativeRunState::TimedOut"),
    restartRecovery:
      rustSource.includes("recover_stale_native_run_if_needed") &&
      rustSource.includes("restart-recovery") &&
      rustSource.includes("stale-incomplete-run") &&
      replayBody.includes("recover_stale_native_run_if_needed"),
    noOrphanEvidence: /orphan_count:\s*0/u.test(rustSource) && rustSource.includes("process_tree_cleanup: true") && rustSource.includes("no-tested-platform-orphans"),
    pathNeutralReceiptRefs:
      rustSource.includes("cleanup-recovery-receipt.json") &&
      rustSource.includes("cleanup-receipt.json") &&
      rustSource.includes("safe_event_token(run_id)") &&
      !/process[_-]?id|pid\b/iu.test(rustSource),
    runHistoryRecovery: runHistorySource.includes("cleanup-required") && runHistorySource.includes("stale-incomplete-run") && runHistorySource.includes("idempotent: true"),
    runWorkspaceRecoveryVisible:
      runWorkspaceSource.includes("cleanup required") && runWorkspaceSource.includes("cleanup-again") && runWorkspaceSource.includes("runHistoryEvidence.actionEvidence.recovery")
  };

  for (const [name, ok] of Object.entries(cleanupRecovery)) {
    if (name === "descriptorOnly") {
      if (ok !== false) errors.push(issue("native-cleanup.descriptor-only", "Native cleanup recovery must set descriptorOnly=false."));
      continue;
    }
    if (ok !== true) {
      errors.push(issue(nativeCleanupIssueCode(name), `Native cleanup recovery gate is missing ${name}.`));
    }
  }

  const scripts = packageJson.scripts ?? {};
  if (!String(scripts["validate:native-runner-cleanup-recovery"] ?? "").includes("scripts/check-native-runner-cleanup-recovery.mjs")) {
    errors.push(issue("native-cleanup.package-script", "package.json must expose validate:native-runner-cleanup-recovery."));
  }
  if (!String(scripts.validate ?? "").includes("npm run validate:native-runner-cleanup-recovery")) {
    errors.push(issue("native-cleanup.validate-chain", "npm run validate must include native runner cleanup recovery validation."));
  }
  if (!validationStageSource.includes("validate:native-runner-cleanup-recovery")) {
    errors.push(issue("native-cleanup.stage-reporting", "Validation stage reporting must include native runner cleanup recovery."));
  }

  return {
    schemaVersion: "agentique.nativeRunnerCleanupRecoveryReview.v1",
    ok: errors.length === 0,
    cleanupRecovery,
    errors
  };
}

function parseFunctionBody(source, functionName) {
  const start = source.indexOf(`fn ${functionName}`);
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return "";
}

function readText(root, relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function readJson(root, relPath) {
  return JSON.parse(readText(root, relPath));
}

function kebab(value) {
  return String(value).replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

function nativeCleanupIssueCode(name) {
  if (name === "cancelCommandNativeBacked") return "native-cleanup.cancel-command";
  if (name === "cleanupCommandIdempotent") return "native-cleanup.cleanup-command";
  return `native-cleanup.${kebab(name)}`;
}

function escapeForRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function issue(code, message) {
  return { code, message };
}
