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
    adapterSource: readText(repoRoot, "adapters/python/echo_adapter.py"),
    packageJson: readJson(repoRoot, "package.json"),
    validationStageSource: readText(repoRoot, "src/core/validation-stage-reporting.mjs"),
    runHistorySource: readText(repoRoot, "src/core/run-history-evidence.mjs"),
    runWorkspaceSource: readText(repoRoot, "src/workspaces/RunWorkspace.tsx")
  };
}

export function reviewNativeRunnerCleanupRecovery(input = readNativeRunnerCleanupRecoveryInputs()) {
  const rustSource = String(input.rustSource ?? "");
  const adapterSource = String(input.adapterSource ?? "");
  const packageJson = input.packageJson ?? {};
  const validationStageSource = String(input.validationStageSource ?? "");
  const runHistorySource = String(input.runHistorySource ?? "");
  const runWorkspaceSource = String(input.runWorkspaceSource ?? "");
  const cancelBody = parseFunctionBody(rustSource, "agentique_runner_cancel");
  const cleanupBody = parseFunctionBody(rustSource, "agentique_runner_cleanup");
  const replayBody = parseFunctionBody(rustSource, "native_replay_receipt");
  const spawnBody = parseFunctionBody(rustSource, "spawn_fixed_native_adapter");
  const cleanupReceiptBody = parseFunctionBody(rustSource, "native_cleanup_recovery_receipt");
  const cleanupTransitionBody = parseFunctionBody(rustSource, "cleanup_recovery_transition");
  const cleanupTestBody = parseFunctionBody(rustSource, "native_runner_cancel_timeout_cleanup_recovery");
  const runtimeResolverBody = parseFunctionBody(rustSource, "resolve_fixed_python_executable");
  const hostAdapterModeBody = parseFunctionBody(rustSource, "native_adapter_mode_for_host");
  const debugAdapterModeBody = parseFunctionBody(rustSource, "debug_native_adapter_mode");
  const runnerRequestBody = parseStructBody(rustSource, "RunnerCommandRequest");
  const errors = [];

  const assignmentOffset = spawnBody.indexOf("process_tree_supervisor.assign_child(&child)");
  const workloadOffset = spawnBody.indexOf("write_fixed_adapter_request(&mut child");
  const evidenceDerivedReceipt =
    cleanupReceiptBody.includes("process_tree_cleanup: cleanup.process_tree_cleanup") &&
    cleanupReceiptBody.includes("orphan_count: cleanup.orphan_count") &&
    !/process_tree_cleanup:\s*true/u.test(cleanupReceiptBody) &&
    !/orphan_count:\s*(?:Some\s*\(\s*)?0/u.test(cleanupReceiptBody);

  if (unsafeReceiptPattern.test(rustSource) || unsafeReceiptPattern.test(runHistorySource) || unsafeReceiptPattern.test(runWorkspaceSource)) {
    errors.push(issue("native-cleanup.unsafe-receipt", "Native cleanup recovery must not expose raw local paths, secrets, or private workspace paths."));
  }

  const cleanupRecovery = {
    nativeBacked:
      rustSource.includes("agentique.nativeRunnerCleanupRecovery.v2") && rustSource.includes("NativeRunnerCleanupRecoveryReceipt") && /native_backed:\s*true/u.test(rustSource),
    descriptorOnly: /descriptor_only:\s*true/u.test(rustSource) ? true : /descriptor_only:\s*false/u.test(rustSource) ? false : null,
    cancelCommandNativeBacked:
      cancelBody.includes("cleanup_recovery_transition") &&
      cancelBody.includes("cancel-cleanup") &&
      /coordinator\s*\.\s*cancel_requested\s*\.\s*store\s*\(\s*true/u.test(cancelBody) &&
      /coordinator\s*\.\s*terminal_intent/u.test(cancelBody) &&
      cancelBody.includes("NativeRunState::Canceling") &&
      !/runner_boundary_receipt\s*\(/u.test(cancelBody),
    cleanupCommandIdempotent:
      cleanupBody.includes("cleanup_recovery_transition") &&
      cleanupBody.includes("cleanup-retry") &&
      cleanupBody.includes("NativeRunState::CleanedUp") &&
      cleanupBody.includes("NativeRunState::CleanupRequired") &&
      !/runner_boundary_receipt\s*\(/u.test(cleanupBody),
    timeoutCleanup:
      cleanupTestBody.includes("NativeAdapterTestMode::DescendantSleep") &&
      cleanupTestBody.includes('wait_for_run_state("run.tree-timeout", &["timed-out"])') &&
      cleanupTestBody.includes('timeout_cleanup.transition, "timeout-cleanup"'),
    restartRecovery:
      rustSource.includes("recover_stale_native_run_if_needed") &&
      rustSource.includes("restart-recovery") &&
      rustSource.includes("stale-incomplete-run") &&
      replayBody.includes("recover_stale_native_run_if_needed"),
    noOrphanEvidence:
      evidenceDerivedReceipt && cleanupTestBody.includes("timeout_cleanup.orphan_count, Some(0)") && cleanupTestBody.includes("live_cancel_cleanup.orphan_count, Some(0)"),
    windowsJobObjectContainment:
      rustSource.includes("struct NativeProcessTreeSupervisor") &&
      rustSource.includes("CreateJobObjectW") &&
      rustSource.includes("SetInformationJobObject") &&
      rustSource.includes("JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE") &&
      rustSource.includes("AssignProcessToJobObject"),
    assignmentBeforeWorkload: assignmentOffset >= 0 && workloadOffset >= 0 && assignmentOffset < workloadOffset,
    processTreeTerminationQuery:
      rustSource.includes("TerminateJobObject") &&
      rustSource.includes("QueryInformationJobObject") &&
      rustSource.includes("JobObjectBasicAccountingInformation") &&
      rustSource.includes("windows-job-drain-timeout"),
    evidenceDerivedReceipt,
    realDescendantCoverage:
      rustSource.includes("NativeAdapterTestMode::DescendantSleep") &&
      adapterSource.includes('"descendant-sleep"') &&
      adapterSource.includes("subprocess.Popen(") &&
      adapterSource.includes('[sys.executable, "-c", "import time; time.sleep(30)"]') &&
      cleanupTestBody.includes('wait_for_process_tree_count("run.tree-cancel", 2)') &&
      cleanupTestBody.includes('wait_for_process_tree_count("run.tree-timeout", 2)'),
    testModeNativeOnly:
      !/\bmode\s*:/u.test(runnerRequestBody) &&
      (rustSource.includes("start_native_run(request, NativeAdapterTestMode::Success") ||
        (rustSource.includes("start_native_run(request, native_adapter_mode_for_host()") &&
          hostAdapterModeBody.includes("#[cfg(debug_assertions)]") &&
          hostAdapterModeBody.includes("#[cfg(not(debug_assertions))]") &&
          hostAdapterModeBody.includes("NativeAdapterTestMode::Success") &&
          debugAdapterModeBody.includes('Some("sleep")') &&
          debugAdapterModeBody.includes('Some("exit-failure")'))) &&
      !adapterSource.includes('request.get("executable")') &&
      !adapterSource.includes('request.get("args")'),
    restartFailsClosed:
      rustSource.includes('NativeProcessCleanupObservation::unverified("restart-supervisor-unavailable")') &&
      cleanupTransitionBody.includes("NativeRunState::CleanupRequired") &&
      cleanupTransitionBody.includes('"cleanup.required"') &&
      cleanupTestBody.includes("first.orphan_count, None") &&
      cleanupTestBody.includes("!first.process_tree_cleanup"),
    unixDedicatedProcessGroup:
      rustSource.includes("process_group_id: AtomicI32") &&
      rustSource.includes("command.process_group(0)") &&
      rustSource.includes("libc::getpgid(child_id)") &&
      rustSource.includes("observed_group != child_id") &&
      rustSource.includes("child_id <= 0"),
    unixGroupTerminationProbe:
      rustSource.includes("libc::killpg(process_group_id, 0)") &&
      rustSource.includes("libc::killpg(process_group_id, libc::SIGKILL)") &&
      rustSource.includes("Some(libc::ESRCH)") &&
      rustSource.includes("unix-process-group-drain-timeout") &&
      rustSource.includes("unix-process-group-descendant-drained"),
    crossPlatformDescendantCoverage:
      /#\[cfg\(any\(target_os = "windows", unix\)\)\]\s*#\[test\]\s*fn native_runner_cancel_timeout_cleanup_recovery/u.test(rustSource) &&
      cleanupTestBody.includes("wait_for_unix_process_tree_active") &&
      cleanupTestBody.includes("NativeAdapterTestMode::DescendantExit") &&
      adapterSource.includes('"descendant-exit"'),
    noShellOrPackageFallback:
      runtimeResolverBody.includes('["python", "python3"]') && !/["'](?:sh|bash|zsh|cmd|powershell|npm|pnpm|yarn|pip|brew|apt)["']/u.test(runtimeResolverBody),
    missingRuntimeDeterministic:
      rustSource.includes("fn fixed_python_runtime_missing_is_deterministic_without_fallback") &&
      rustSource.includes("agentique-intentionally-missing-python-runtime") &&
      rustSource.includes("Python interpreter was not available for the fixed native adapter."),
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

function parseStructBody(source, structName) {
  const start = source.indexOf(`struct ${structName}`);
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
