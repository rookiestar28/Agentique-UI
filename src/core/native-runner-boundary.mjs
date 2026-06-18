import fs from "node:fs";
import path from "node:path";

export const allowedNativeRunnerCommands = Object.freeze([
  "agentique_runner_prepare",
  "agentique_runner_start",
  "agentique_runner_cancel",
  "agentique_runner_status",
  "agentique_runner_logs",
  "agentique_runner_artifacts",
  "agentique_runner_cleanup"
]);

const allowedCommandSet = new Set(allowedNativeRunnerCommands);
const approvedTransitionGate = Object.freeze({
  state: "fixed-lane-transition",
  approvedAdapterId: "adapter.local-python",
  approvedPermissionProfileId: "permission.local-python.minimal",
  readyState: "succeeded"
});
const forbiddenRustPatterns = Object.freeze([
  { code: "native.shell-plugin", pattern: /tauri[_-]plugin[_-]shell|plugin-shell/iu },
  { code: "native.package-lifecycle", pattern: /\b(?:npm|pnpm|yarn)\s+(?:install|run|exec)\b/iu }
]);
const forbiddenRequestFieldPattern = /\b(?:path|cwd|args|env|environment|script|shell|executable|command_line)\s*:/iu;
const forbiddenPermissionPattern = /\b(?:shell|process|command|fs:|filesystem|path:|allow-execute|allow-spawn)\b/iu;
const frontendInvokePattern = /\binvoke\s*\(\s*["'`]([^"'`]+)["'`]/gu;
const allowedRequestFields = new Set(["resource_id", "session_id", "run_id", "command_id", "adapter_id", "approval_id", "permission_profile_id", "permission_grant_id"]);
const allowedCommandNewArgs = new Set(["&python_executable", "candidate"]);

export function readNativeRunnerBoundaryInputs(root = process.cwd()) {
  return {
    rustSource: fs.readFileSync(path.join(root, "src-tauri/src/lib.rs"), "utf8"),
    capability: JSON.parse(fs.readFileSync(path.join(root, "src-tauri/capabilities/default.json"), "utf8")),
    cargoToml: fs.readFileSync(path.join(root, "src-tauri/Cargo.toml"), "utf8"),
    frontendSources: listFrontendSources(path.join(root, "src")).map((filePath) => ({
      path: path.relative(root, filePath).replaceAll(path.sep, "/"),
      text: fs.readFileSync(filePath, "utf8")
    }))
  };
}

export function reviewNativeRunnerBoundary(input = readNativeRunnerBoundaryInputs()) {
  const errors = [];
  const rustSource = String(input.rustSource ?? "");
  const registeredCommands = parseRegisteredCommands(rustSource);
  const declaredCommands = parseDeclaredCommands(rustSource);
  const requestBody = parseRunnerRequestBody(rustSource);
  const requestFields = parseStructFields(requestBody);
  const transitionGate = reviewTransitionGate(rustSource);

  for (const command of allowedNativeRunnerCommands) {
    if (!registeredCommands.includes(command)) {
      errors.push(issue("native.command-missing", `${command} is not registered in the Tauri invoke handler.`));
    }
    if (!declaredCommands.some((entry) => entry.name === command)) {
      errors.push(issue("native.command-missing", `${command} command handler is not declared.`));
    }
  }

  for (const command of new Set([...registeredCommands, ...declaredCommands.map((entry) => entry.name)])) {
    if (!allowedCommandSet.has(command)) {
      errors.push(issue("native.command-unapproved", `${command} is not an approved runner boundary command.`));
    }
  }

  for (const command of declaredCommands) {
    if (!/\brequest\s*:\s*RunnerCommandRequest\b/u.test(command.signature)) {
      errors.push(issue("native.command-shape", `${command.name} must accept a single RunnerCommandRequest.`));
    }
  }

  if (!requestBody) {
    errors.push(issue("native.request-missing", "RunnerCommandRequest is required."));
  } else {
    for (const field of ["resource_id", "session_id", "run_id"]) {
      if (!new RegExp(`\\b${field}\\s*:\\s*String\\b`, "u").test(requestBody)) {
        errors.push(issue("native.request-field", `RunnerCommandRequest missing ${field}.`));
      }
    }
    for (const field of ["command_id", "adapter_id", "approval_id", "permission_profile_id", "permission_grant_id"]) {
      if (!new RegExp(`\\b${field}\\s*:\\s*Option\\s*<\\s*String\\s*>`, "u").test(requestBody)) {
        errors.push(issue("native.request-field", `RunnerCommandRequest missing optional opaque ${field}.`));
      }
    }
    for (const field of requestFields) {
      if (!allowedRequestFields.has(field.name)) {
        errors.push(issue("native.request-field-forbidden", "RunnerCommandRequest must not accept raw paths, shell, args, cwd, or env fields."));
      }
    }
    if (forbiddenRequestFieldPattern.test(requestBody)) {
      errors.push(issue("native.request-field-forbidden", "RunnerCommandRequest must not accept raw paths, shell, args, cwd, or env fields."));
    }
  }

  for (const rule of forbiddenRustPatterns) {
    if (rule.pattern.test(rustSource)) {
      errors.push(issue(rule.code, "Native runner boundary must not include process spawn, shell plugin, or package lifecycle execution."));
    }
  }
  errors.push(...validateNativeProcessUsage(rustSource));

  if (!/runner_transition_receipt[\s\S]*false[\s\S]*None/u.test(rustSource) || !/execute_fixed_python_adapter/u.test(rustSource)) {
    errors.push(issue("native.spawn-receipt", "Native runner receipts must distinguish non-start no-spawn receipts from the fixed native Python launch receipt."));
  }
  errors.push(...transitionGate.errors);

  validateCapability(input.capability, errors);
  validateCargoToml(String(input.cargoToml ?? ""), errors);
  validateFrontendInvokes(input.frontendSources ?? [], errors);

  return {
    schemaVersion: "agentique.nativeRunnerBoundaryReview.v1",
    ok: errors.length === 0,
    commands: {
      allowed: [...allowedNativeRunnerCommands],
      registered: registeredCommands,
      declared: declaredCommands.map((entry) => entry.name)
    },
    permissions: {
      defaultCapabilityPermissions: Array.isArray(input.capability?.permissions) ? input.capability.permissions.length : 0
    },
    transitionGate: {
      state: approvedTransitionGate.state,
      approvedAdapterId: approvedTransitionGate.approvedAdapterId,
      approvedPermissionProfileId: approvedTransitionGate.approvedPermissionProfileId,
      readyState: approvedTransitionGate.readyState,
      prepareCreatesPendingRecord: transitionGate.prepareCreatesPendingRecord,
      startAllowsApprovedFixedLane: transitionGate.startAllowsApprovedFixedLane,
      consumesApproval: transitionGate.consumesApproval,
      rejectsRevokedAdapter: transitionGate.rejectsRevokedAdapter,
      rejectsBroadPermissionProfile: transitionGate.rejectsBroadPermissionProfile,
      fixedNativePythonExecution: transitionGate.fixedNativePythonExecution,
      willSpawnProcess: transitionGate.willSpawnProcess,
      nonStartWillSpawnProcessFalse: transitionGate.nonStartWillSpawnProcessFalse,
      actualProcessLaunch: transitionGate.actualProcessLaunch
    },
    errors,
    summary: {
      registeredCommands: registeredCommands.length,
      declaredCommands: declaredCommands.length,
      blockingErrors: errors.length
    }
  };
}

function reviewTransitionGate(rustSource) {
  const text = String(rustSource ?? "");
  const result = {
    prepareCreatesPendingRecord: /NativeRunRecord/u.test(text) && /PendingApproval/u.test(text) && /pending-approval/u.test(text),
    startAllowsApprovedFixedLane: /adapter\.local-python/u.test(text) && /permission\.local-python\.minimal/u.test(text) && /native-controlled-ready/u.test(text),
    fixedNativePythonExecution: /execute_fixed_python_adapter/u.test(text) && /agentique\.nativePythonExecutionReceipt\.v1/u.test(text),
    consumesApproval: /approval_consumed/u.test(text) && /approval_consumed\s*=\s*true/u.test(text),
    rejectsRevokedAdapter: /adapter\.local-python\.revoked/u.test(text),
    rejectsBroadPermissionProfile: /permissionProfileId is not the fixed minimal native runner profile/u.test(text),
    willSpawnProcess: true,
    nonStartWillSpawnProcessFalse: /runner_transition_receipt[\s\S]*false/u.test(text),
    actualProcessLaunch: true,
    errors: []
  };
  result.startAllowsApprovedFixedLane = /adapter\.local-python/u.test(text) && /permission\.local-python\.minimal/u.test(text) && /succeeded/u.test(text);
  if (
    result.prepareCreatesPendingRecord !== true ||
    result.startAllowsApprovedFixedLane !== true ||
    result.consumesApproval !== true ||
    result.rejectsRevokedAdapter !== true ||
    result.rejectsBroadPermissionProfile !== true ||
    result.fixedNativePythonExecution !== true ||
    result.nonStartWillSpawnProcessFalse !== true
  ) {
    result.errors.push(issue("native.transition-gate", "Native runner must implement the fixed-lane native Python execution gate before start can be accepted."));
  }
  return result;
}

function validateNativeProcessUsage(rustSource) {
  const errors = [];
  const args = [...String(rustSource ?? "").matchAll(/Command::new\s*\(([^)]*)\)/gu)].map((entry) => entry[1].trim());
  for (const arg of args) {
    if (!allowedCommandNewArgs.has(arg)) {
      errors.push(issue("native.process-spawn", "Native process construction must be limited to fixed Python executable resolution and the fixed helper launch."));
    }
  }
  if (/Command::new\s*\(\s*request\./u.test(rustSource) || /tokio::process/iu.test(rustSource)) {
    errors.push(issue("native.process-spawn", "Native process construction must not use request-controlled command material."));
  }
  if (/\.arg\s*\(\s*&?\s*request\./u.test(rustSource)) {
    errors.push(issue("native.process-args", "Native process args must not use request-controlled fields."));
  }
  return errors;
}

function validateCapability(capability, errors) {
  const permissions = Array.isArray(capability?.permissions) ? capability.permissions : [];
  if (permissions.length !== 0) {
    errors.push(issue("native.permission-nonempty", "Default capability must not grant runtime permissions."));
  }
  for (const permission of permissions) {
    if (forbiddenPermissionPattern.test(String(permission))) {
      errors.push(issue("native.permission-broad", "Default capability must not include shell, process, filesystem, or path scopes."));
    }
  }
}

function validateCargoToml(cargoToml, errors) {
  if (/tauri-plugin-shell|tauri_plugin_shell/iu.test(cargoToml)) {
    errors.push(issue("native.cargo-shell-plugin", "Cargo dependencies must not include a shell plugin."));
  }
}

function validateFrontendInvokes(frontendSources, errors) {
  for (const source of frontendSources) {
    if (/@tauri-apps\/plugin-shell|plugin-shell/iu.test(source.text)) {
      errors.push(issue("native.frontend-shell-plugin", `${source.path} imports a shell plugin.`));
    }
    for (const match of source.text.matchAll(frontendInvokePattern)) {
      const command = match[1];
      if (!allowedCommandSet.has(command)) {
        errors.push(issue("native.frontend-invoke", `${source.path} invokes an unapproved native command.`));
      }
    }
  }
}

function parseRegisteredCommands(rustSource) {
  const match = rustSource.match(/generate_handler!\s*\[([\s\S]*?)\]/u);
  if (!match) return [];
  return [...new Set([...match[1].matchAll(/\b(agentique_runner_[a-z_]+)\b/gu)].map((entry) => entry[1]))];
}

function parseDeclaredCommands(rustSource) {
  return [...rustSource.matchAll(/#\s*\[\s*tauri::command\s*\]\s*fn\s+(agentique_runner_[a-z_]+)\s*\(([^)]*)\)/gu)].map((entry) => ({
    name: entry[1],
    signature: entry[2]
  }));
}

function parseRunnerRequestBody(rustSource) {
  const match = rustSource.match(/struct\s+RunnerCommandRequest\s*\{([\s\S]*?)\n\}/u);
  return match?.[1] ?? "";
}

function parseStructFields(body) {
  return [...String(body ?? "").matchAll(/^\s*([a-z_][a-z0-9_]*)\s*:\s*([^,\n]+),/gmu)].map((entry) => ({
    name: entry[1],
    type: entry[2].trim()
  }));
}

function listFrontendSources(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFrontendSources(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/iu.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function issue(code, message) {
  return { code, message };
}
