import fs from "node:fs";
import path from "node:path";

const fixedAdapterId = "adapter.local-python";
const requestProcessFieldPattern = /\b(?:executable|executable_path|script|script_path|cwd|args|env|environment|shell|command_line|runtime_mode|inline_code)\s*:/iu;
const shellOrLifecyclePattern = /Command::new\s*\(\s*["'`](?:cmd\.exe|powershell|bash|sh)["'`]|["'`](?:npm|pnpm|yarn)\s+(?:install|run|exec)/iu;
const shellPluginPattern = /tauri-plugin-shell|tauri_plugin_shell|@tauri-apps\/plugin-shell|plugin-shell/iu;
const broadPermissionPattern = /\b(?:shell|allow-execute|allow-spawn|process|filesystem|fs:|path:|browser|cookie|session)\b/iu;
const localPathReceiptPattern = /root_ref\s*:\s*(?:native_run_root|.*(?:display|to_string_lossy))/u;

export function readNativeRunnerPythonExecutionInputs(root = process.cwd()) {
  const repoRoot = path.resolve(root);
  return {
    root: repoRoot,
    rustSource: readText(repoRoot, "src-tauri/src/lib.rs"),
    cargoToml: readText(repoRoot, "src-tauri/Cargo.toml"),
    tauriConfig: readJson(repoRoot, "src-tauri/tauri.conf.json"),
    defaultCapability: readJson(repoRoot, "src-tauri/capabilities/default.json"),
    packageJson: readJson(repoRoot, "package.json"),
    nativeContract: readText(repoRoot, "docs/contracts/native-runner-boundary.md"),
    pythonContract: readText(repoRoot, "docs/contracts/python-adapter-runner.md")
  };
}

export function reviewNativeRunnerPythonExecution(input = readNativeRunnerPythonExecutionInputs()) {
  const rustSource = String(input.rustSource ?? "");
  const cargoToml = String(input.cargoToml ?? "");
  const packageJson = input.packageJson ?? {};
  const tauriConfig = input.tauriConfig ?? {};
  const defaultCapability = input.defaultCapability ?? {};
  const nativeContract = String(input.nativeContract ?? "");
  const pythonContract = String(input.pythonContract ?? "");
  const requestBody = parseRunnerRequestBody(rustSource);
  const commandNewArgs = [...rustSource.matchAll(/Command::new\s*\(([^)]*)\)/gu)].map((entry) => entry[1].trim());
  const externalBin = Array.isArray(tauriConfig?.bundle?.externalBin) ? tauriConfig.bundle.externalBin : [];
  const permissions = Array.isArray(defaultCapability?.permissions) ? defaultCapability.permissions : [];
  const errors = [];

  const genericCommandArgs = commandNewArgs.filter((arg) => arg !== "&python_executable" && arg !== "candidate");
  if (genericCommandArgs.length > 0 || /Command::new\s*\(\s*request\./u.test(rustSource)) {
    errors.push(issue("native-python.generic-process", "Native execution must use only the fixed Python helper command construction."));
  }
  if (requestProcessFieldPattern.test(requestBody)) {
    errors.push(issue("native-python.request-process-field", "RunnerCommandRequest must not accept executable, cwd, args, env, shell, or command text."));
  }
  if (shellPluginPattern.test(cargoToml) || shellPluginPattern.test(JSON.stringify(packageJson))) {
    errors.push(issue("native-python.shell-plugin", "Native Python execution must not depend on the Tauri shell plugin."));
  }
  if (externalBin.length > 0) {
    errors.push(issue("native-python.external-bin", "Native Python execution must not enable Tauri externalBin sidecars."));
  }
  if (permissions.some((permission) => broadPermissionPattern.test(JSON.stringify(permission)))) {
    errors.push(issue("native-python.broad-permission", "Default capability must not grant broad shell/process/filesystem/browser permissions."));
  }
  if (shellOrLifecyclePattern.test(rustSource)) {
    errors.push(issue("native-python.shell-or-lifecycle", "Native execution must not call shells or package lifecycle commands."));
  }
  if (localPathReceiptPattern.test(rustSource)) {
    errors.push(issue("native-python.local-path-receipt", "Native execution receipts must stay path-neutral."));
  }

  const execution = {
    fixedAdapterId,
    runtime: "python",
    nativeStartLaunches: /agentique_runner_start[\s\S]*execute_fixed_python_adapter\s*\(/u.test(rustSource),
    launchesOnlyFixedHelper:
      commandNewArgs.includes("&python_executable") &&
      /resolve_fixed_python_executable/u.test(rustSource) &&
      /fixed_python_adapter_script_path/u.test(rustSource) &&
      /echo_adapter\.py/u.test(rustSource) &&
      genericCommandArgs.length === 0,
    usesJsonStdinStdout:
      /serde_json::json!/u.test(rustSource) &&
      /\.stdin\s*\(\s*Stdio::piped\s*\(\s*\)\s*\)/u.test(rustSource) &&
      /\.stdout\s*\(\s*Stdio::piped\s*\(\s*\)\s*\)/u.test(rustSource) &&
      /\.stderr\s*\(\s*Stdio::piped\s*\(\s*\)\s*\)/u.test(rustSource),
    minimalEnv:
      /\.env_clear\s*\(\s*\)/u.test(rustSource) &&
      /build_minimal_adapter_env/u.test(rustSource) &&
      /PYTHONNOUSERSITE/u.test(rustSource) &&
      !/std::env::vars\s*\(/u.test(rustSource),
    writesRunFolder: /write_native_run_folder/u.test(rustSource) && /agentique\.nativeRunFolderWriteReceipt\.v1/u.test(rustSource) && /logs\/stdout\.log/u.test(rustSource),
    redactsLogs: /redact_runner_text/u.test(rustSource) && /redacted:inline-sensitive-material/u.test(rustSource),
    receiptPathNeutral: /root_ref/u.test(rustSource) && /native-python-runner/u.test(rustSource) && !localPathReceiptPattern.test(rustSource),
    shellPluginPresent: shellPluginPattern.test(cargoToml) || shellPluginPattern.test(JSON.stringify(packageJson)),
    externalBinCount: externalBin.length
  };

  for (const [name, ok] of Object.entries({
    nativeStartLaunches: execution.nativeStartLaunches,
    launchesOnlyFixedHelper: execution.launchesOnlyFixedHelper,
    usesJsonStdinStdout: execution.usesJsonStdinStdout,
    minimalEnv: execution.minimalEnv,
    writesRunFolder: execution.writesRunFolder,
    redactsLogs: execution.redactsLogs,
    receiptPathNeutral: execution.receiptPathNeutral
  })) {
    if (ok !== true) {
      errors.push(issue(`native-python.${kebab(name)}`, `Native Python execution gate is missing ${name}.`));
    }
  }
  if (!String(packageJson.scripts?.["validate:native-runner-python-execution"] ?? "").includes("scripts/check-native-runner-python-execution.mjs")) {
    errors.push(issue("native-python.package-script", "package.json must expose validate:native-runner-python-execution."));
  }
  if (!String(packageJson.scripts?.validate ?? "").includes("npm run validate:native-runner-python-execution")) {
    errors.push(issue("native-python.validate-chain", "npm run validate must include native runner Python execution validation."));
  }
  for (const phrase of ["native-controlled Python", "JSON stdin", "minimal environment", "run folder", "redacted"]) {
    if (!nativeContract.includes(phrase) && !pythonContract.includes(phrase)) {
      errors.push(issue("native-python.contract", `Contract docs must mention ${phrase}.`));
    }
  }

  return {
    schemaVersion: "agentique.nativeRunnerPythonExecution.v1",
    ok: errors.length === 0,
    execution,
    commandNewArgs,
    errors
  };
}

function parseRunnerRequestBody(rustSource) {
  const match = String(rustSource ?? "").match(/struct\s+RunnerCommandRequest\s*\{([\s\S]*?)\n\}/u);
  return match?.[1] ?? "";
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

function issue(code, message) {
  return { code, message };
}
