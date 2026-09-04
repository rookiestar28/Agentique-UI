import fs from "node:fs";
import path from "node:path";

export function readNativeRunRegistryInputs(root = process.cwd()) {
  const repoRoot = path.resolve(root);
  return {
    rustSource: fs.readFileSync(path.join(repoRoot, "src-tauri/src/lib.rs"), "utf8"),
    packageJson: JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"))
  };
}

export function reviewNativeRunRegistry(input = readNativeRunRegistryInputs()) {
  const rust = String(input.rustSource ?? "");
  const scripts = input.packageJson?.scripts ?? {};
  const recordBody = parseStructBody(rust, "NativeDurableRunRegistryRecord");
  const prepareBody = parseFunctionBody(rust, "agentique_runner_prepare");
  const startBody = parseFunctionBody(rust, "start_native_run");
  const terminalBody = parseFunctionBody(rust, "commit_native_run_terminal");
  const cleanupBody = parseFunctionBody(rust, "cleanup_recovery_transition");
  const replayBody = parseFunctionBody(rust, "native_replay_receipt");
  const recoveryBody = parseFunctionBody(rust, "recover_native_registry_record_if_needed");
  const persistenceBody = parseFunctionBody(rust, "persist_native_run_registry_locked");

  const checks = {
    strictSchema:
      rust.includes('const NATIVE_RUN_REGISTRY_SCHEMA: &str = "agentique.nativeRunRegistryRecord.v1"') &&
      rust.includes("struct NativeDurableRunRegistryRecord") &&
      rust.includes('#[serde(rename_all = "camelCase", deny_unknown_fields)]\nstruct NativeDurableRunRegistryRecord'),
    boundedAppendOnlyLedger:
      rust.includes("MAX_NATIVE_RUN_REGISTRY_RECORDS") &&
      rust.includes("MAX_NATIVE_RUN_REGISTRY_RECORD_BYTES") &&
      rust.includes("fn read_durable_native_run_registry") &&
      rust.includes("fn persist_native_run_registry") &&
      persistenceBody.includes("fs::rename(&temporary, &final_path)"),
    exactAddressAndManifest:
      recordBody.includes("resource_id: String") &&
      recordBody.includes("session_id: String") &&
      recordBody.includes("run_id: String") &&
      recordBody.includes("adapter_manifest_id: String") &&
      recordBody.includes("adapter_manifest_digest: String") &&
      rust.includes("durable native run registry address mismatch") &&
      rust.includes("durable native run registry manifest mismatch"),
    nonAuthorizing:
      recordBody.length > 0 &&
      !recordBody.includes("approval_id") &&
      !recordBody.includes("permission_grant_id") &&
      recordBody.includes("replays_external_effects: bool") &&
      rust.includes("restart-reauthorization-required"),
    transitionBeforeAcknowledgement:
      before(prepareBody, "initialize_native_run_registry", "record_native_event") &&
      before(startBody, "persist_native_run_registry", '"start.accepted"') &&
      before(terminalBody, "persist_native_run_registry", "record_native_event") &&
      cleanupBody.includes("persist_native_run_registry"),
    restartReconciliation:
      before(replayBody, "recover_native_registry_record_if_needed", "recover_native_projection_record_if_needed") &&
      recoveryBody.includes("NativeRunState::PendingApproval") &&
      recoveryBody.includes("NativeRunState::Running | NativeRunState::Canceling") &&
      recoveryBody.includes("NativeRunState::CleanupRequired") &&
      recoveryBody.includes("read_committed_native_projection"),
    corruptionFailsClosed:
      rust.includes("durable_native_run_registry_rejects_corruption_gap_and_scope_tamper") &&
      rust.includes("durable native run registry sequence is not contiguous") &&
      rust.includes("NativeRunState::CleanupRequired"),
    restartBehaviorCovered:
      rust.includes("durable_native_run_registry_recovers_pending_active_and_terminal_states") &&
      rust.includes("restart-reauthorization-required") &&
      rust.includes("restart-supervisor-unavailable"),
    packageGate:
      String(scripts["validate:durable-run-ledger"] ?? "").includes("check-native-runner-durable-registry.mjs") &&
      String(scripts["validate:durable-run-ledger"] ?? "").includes("native-runner-durable-registry.test.mjs")
  };

  const errors = Object.entries(checks)
    .filter(([, ok]) => ok !== true)
    .map(([name]) => ({ code: `native-run-registry.${kebab(name)}`, message: `Native run registry gate is missing ${name}.` }));

  return { schemaVersion: "agentique.nativeRunRegistryReview.v1", ok: errors.length === 0, checks, errors };
}

function before(source, first, second) {
  const firstOffset = source.indexOf(first);
  const secondOffset = source.indexOf(second);
  return firstOffset >= 0 && secondOffset >= 0 && firstOffset < secondOffset;
}

function parseFunctionBody(source, name) {
  return parseBlock(source, source.indexOf(`fn ${name}`));
}

function parseStructBody(source, name) {
  return parseBlock(source, source.indexOf(`struct ${name}`));
}

function parseBlock(source, start) {
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return "";
}

function kebab(value) {
  return String(value).replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}
