import fs from "node:fs";
import path from "node:path";
import { readNativeRunnerBoundaryInputs, reviewNativeRunnerBoundary } from "./native-runner-boundary.mjs";

export const nativeRunnerSidecarGateSchemaVersion = "agentique.nativeRunnerSidecarGate.v1";

const validationCommand = "npm run validate:native-runner-sidecar-gate";
const approvedAdapterId = "adapter.local-python";
const allowedSidecarNames = Object.freeze(["binaries/agentique-adapter-local-python"]);
const requiredGateCodes = Object.freeze([
  "signed-adapter",
  "permission-preflight",
  "workspace-boundary",
  "platform-compatibility",
  "run-folder-boundary",
  "log-redaction",
  "cleanup-receipt",
  "transition-receipt"
]);
const requiredPlatforms = Object.freeze(["windows", "macos", "linux"]);
const forbiddenPermissionPattern = /\b(?:shell|process|command|fs:|filesystem|path:|allow-execute|allow-spawn|browser|cookie|session|environment|env)\b/iu;
const shellPermissionPattern = /^shell:allow-(?:execute|spawn)$/u;
const shellPluginPattern = /(?:tauri-plugin-shell|tauri_plugin_shell|@tauri-apps\/plugin-shell|plugin-shell|ShellExt|Command\.sidecar|\.sidecar\s*\()/iu;
const packageLifecyclePattern = /\b(?:npm|pnpm|yarn)\s+(?:install|exec|run|dlx|create)\b/iu;
const unsafeSidecarNamePattern = /(^[A-Za-z]:[\\/]|^\/|\\|(?:^|\/)\.\.(?:\/|$)|\s|["'`;|&<>])/u;

export const nativeRunnerSidecarContract = Object.freeze({
  schemaVersion: "agentique.nativeRunnerSidecarContract.v1",
  command: "agentique_runner_start",
  executionState: "native-controlled-fixed-python-execution",
  sidecars: Object.freeze([
    sidecarDescriptor({
      id: "local-python-adapter",
      runtime: "python",
      externalBin: "binaries/agentique-adapter-local-python",
      adapterId: approvedAdapterId
    })
  ]),
  requiredGates: requiredGateCodes,
  requiredReceipts: Object.freeze(["blocked-receipt", "write-receipt", "cleanup-receipt"]),
  forbidden: Object.freeze([
    "generic-shell",
    "generic-process",
    "package-lifecycle",
    "browser-data",
    "ambient-environment",
    "hidden-network",
    "hidden-file",
    "production-runtime-claim"
  ])
});

export function readNativeRunnerSidecarGateInputs(root = process.cwd()) {
  const repoRoot = path.resolve(root);
  return {
    root: repoRoot,
    tauriConfig: readJsonIfExists(repoRoot, "src-tauri/tauri.conf.json") ?? {},
    capabilityFiles: readCapabilityFiles(repoRoot),
    cargoToml: readTextIfExists(repoRoot, "src-tauri/Cargo.toml"),
    rustSource: readTextIfExists(repoRoot, "src-tauri/src/lib.rs"),
    packageJson: readJsonIfExists(repoRoot, "package.json") ?? {},
    supportSources: {
      runnerCapability: readTextIfExists(repoRoot, "src/core/runner-capability.mjs"),
      permissionPreflight: readTextIfExists(repoRoot, "src/core/runner-permission-preflight.mjs"),
      runFolderWriter: readTextIfExists(repoRoot, "src/core/run-folder-writer.mjs"),
      nodeAdapterRunner: readTextIfExists(repoRoot, "src/core/node-adapter-runner.mjs"),
      pythonAdapterRunner: readTextIfExists(repoRoot, "src/core/python-adapter-runner.mjs")
    },
    nativeBoundaryInputs: readNativeRunnerBoundaryInputs(repoRoot),
    sidecarContract: nativeRunnerSidecarContract
  };
}

export function reviewNativeRunnerSidecarGate(input = readNativeRunnerSidecarGateInputs()) {
  const sidecarContract = input.sidecarContract ?? nativeRunnerSidecarContract;
  const packageJson = input.packageJson ?? {};
  const nativeBoundaryInputs = input.nativeBoundaryInputs ?? {
    rustSource: input.rustSource ?? "",
    capability: firstCapabilityJson(input.capabilityFiles),
    cargoToml: input.cargoToml ?? "",
    frontendSources: []
  };
  const nativeBoundary = input.nativeBoundaryReview ?? reviewNativeRunnerBoundary(nativeBoundaryInputs);

  const capabilitySummary = summarizeCapabilityFiles(input.capabilityFiles ?? []);
  const externalBin = extractExternalBin(input.tauriConfig);
  const shellPlugin = detectShellPlugin(input);
  const scripts = packageJson.scripts ?? {};
  const sidecarNames = new Set(sidecarContract.sidecars.map((sidecar) => sidecar.externalBin));
  const platformCoverage = stableUnique(sidecarContract.sidecars.flatMap((sidecar) => sidecar.platforms));
  const prerequisiteGates = reviewPrerequisiteSources(input.supportSources ?? {}, platformCoverage);

  const report = {
    schemaVersion: nativeRunnerSidecarGateSchemaVersion,
    contract: sidecarContract,
    currentTauriState: {
      externalBin,
      externalBinCount: externalBin.length,
      capabilityFiles: capabilitySummary.files,
      shellPermissionGrants: capabilitySummary.shellPermissionGrants,
      broadPermissionFindings: capabilitySummary.broadPermissionFindings,
      shellPluginPresent: shellPlugin.present,
      shellPluginFindings: shellPlugin.findings,
      createUpdaterArtifacts: input.tauriConfig?.bundle?.createUpdaterArtifacts === true
    },
    nativeStart: {
      boundaryOk: nativeBoundary.ok,
      commandRegistered: nativeBoundary.commands.registered.includes("agentique_runner_start"),
      commandDeclared: nativeBoundary.commands.declared.includes("agentique_runner_start"),
      transitionGateReady:
        nativeBoundary.transitionGate?.prepareCreatesPendingRecord === true &&
        nativeBoundary.transitionGate?.startAllowsApprovedFixedLane === true &&
        nativeBoundary.transitionGate?.consumesApproval === true &&
        nativeBoundary.transitionGate?.fixedNativePythonExecution === true,
      approvedAdapterId: nativeBoundary.transitionGate?.approvedAdapterId ?? "",
      transitionReceipt:
        /succeeded/u.test(input.rustSource ?? nativeBoundaryInputs.rustSource ?? "") && /fixed-lane-transition/u.test(input.rustSource ?? nativeBoundaryInputs.rustSource ?? ""),
      fixedPythonExecution: /execute_fixed_python_adapter/u.test(input.rustSource ?? nativeBoundaryInputs.rustSource ?? ""),
      errors: nativeBoundary.errors
    },
    prerequisiteGates,
    sidecarReadiness: {
      sidecars: sidecarContract.sidecars.map((sidecar) => ({
        id: sidecar.id,
        runtime: sidecar.runtime,
        externalBin: sidecar.externalBin,
        configured: externalBin.includes(sidecar.externalBin),
        permissionGranted: capabilitySummary.shellPermissionGrants.some((grant) => grant.name === sidecar.externalBin),
        argsValidatorRequired: Array.isArray(sidecar.args) && sidecar.args.every((arg) => typeof arg === "string" || typeof arg.validator === "string"),
        platformCount: sidecar.platforms.length
      })),
      unapprovedConfiguredSidecars: externalBin.filter((name) => !sidecarNames.has(name)),
      actualSidecarExecutionEnabled: externalBin.length > 0 || capabilitySummary.shellPermissionGrants.length > 0 || shellPlugin.present
    },
    packageScripts: {
      validateNativeRunnerSidecarGate: scripts["validate:native-runner-sidecar-gate"] ?? "",
      validateIncludesNativeRunnerSidecarGate: String(scripts.validate ?? "").includes(validationCommand)
    },
    contractIssues: validateContractShape(sidecarContract),
    sourceIssues: [...capabilitySummary.issues, ...shellPlugin.issues, ...detectLifecycleIssues(input), ...detectUnsupportedClaimIssues(input)]
  };

  return {
    report,
    validation: validateNativeRunnerSidecarGateReport(report)
  };
}

export function validateNativeRunnerSidecarGateReport(report) {
  const failures = [];
  if (report?.schemaVersion !== nativeRunnerSidecarGateSchemaVersion) {
    failures.push(issue("schema-version", "Unsupported native runner sidecar gate schema version."));
  }
  failures.push(...(report?.contractIssues ?? []));
  failures.push(...(report?.sourceIssues ?? []));

  if (report?.currentTauriState?.externalBinCount !== 0) {
    failures.push(issue("sidecar.external-bin-enabled", "Tauri external sidecar binaries must stay disabled for this gate."));
  }
  if (report?.currentTauriState?.shellPermissionGrants?.length !== 0) {
    failures.push(issue("sidecar.shell-permission-enabled", "Sidecar shell permissions must not be granted by the current default-deny gate."));
  }
  if (report?.currentTauriState?.shellPluginPresent === true) {
    failures.push(issue("sidecar.shell-plugin-enabled", "Tauri shell plugin must not be enabled by this gate."));
  }
  if (report?.currentTauriState?.createUpdaterArtifacts === true) {
    failures.push(issue("sidecar.release-claim", "Updater artifacts must not be enabled by the sidecar gate."));
  }
  if (report?.nativeStart?.boundaryOk !== true) {
    failures.push(issue("sidecar.native-boundary", "Native runner boundary review must pass."));
  }
  if (report?.nativeStart?.commandRegistered !== true || report?.nativeStart?.commandDeclared !== true) {
    failures.push(issue("sidecar.native-command", "agentique_runner_start must remain registered and declared."));
  }
  if (
    report?.nativeStart?.transitionGateReady !== true ||
    report?.nativeStart?.approvedAdapterId !== approvedAdapterId ||
    report?.nativeStart?.transitionReceipt !== true ||
    report?.nativeStart?.fixedPythonExecution !== true
  ) {
    failures.push(issue("sidecar.transition-receipt", "agentique_runner_start must expose only the fixed-lane native Python execution receipt."));
  }
  for (const [name, gate] of Object.entries(report?.prerequisiteGates ?? {})) {
    if (gate?.ok !== true && name !== "logRedaction") {
      failures.push(issue(`sidecar.${kebab(name)}`, `${name} prerequisite gate must pass before sidecar readiness can be considered.`));
    }
  }
  if (report?.prerequisiteGates?.logRedaction?.required !== true || report.prerequisiteGates.logRedaction.errorsRedacted !== true) {
    failures.push(issue("sidecar.log-redaction", "Log redaction must be required and sidecar gate evidence must be redacted."));
  }
  if (report?.sidecarReadiness?.actualSidecarExecutionEnabled !== false) {
    failures.push(issue("sidecar.execution-enabled", "Actual Tauri sidecar execution must remain disabled in this gate."));
  }
  if ((report?.sidecarReadiness?.unapprovedConfiguredSidecars ?? []).length > 0) {
    failures.push(issue("sidecar.unapproved-configured", "Configured sidecars must match the approved sidecar contract."));
  }
  if (!String(report?.packageScripts?.validateNativeRunnerSidecarGate ?? "").includes("scripts/check-native-runner-sidecar-gate.mjs")) {
    failures.push(issue("sidecar.package-script", "package.json must expose validate:native-runner-sidecar-gate."));
  }
  if (report?.packageScripts?.validateIncludesNativeRunnerSidecarGate !== true) {
    failures.push(issue("sidecar.validate-chain", "npm run validate must include validate:native-runner-sidecar-gate."));
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    summary: {
      sidecars: report?.contract?.sidecars?.length ?? 0,
      capabilityFiles: report?.currentTauriState?.capabilityFiles?.length ?? 0,
      shellPermissionGrants: report?.currentTauriState?.shellPermissionGrants?.length ?? 0,
      externalBin: report?.currentTauriState?.externalBinCount ?? 0,
      requiredGates: report?.contract?.requiredGates?.length ?? 0
    }
  };
}

function reviewPrerequisiteSources(supportSources, platformCoverage) {
  const runnerCapability = String(supportSources.runnerCapability ?? "");
  const permissionPreflight = String(supportSources.permissionPreflight ?? "");
  const runFolderWriter = String(supportSources.runFolderWriter ?? "");
  const adapterRunners = `${supportSources.nodeAdapterRunner ?? ""}\n${supportSources.pythonAdapterRunner ?? ""}`;
  const permissionCodes = ["permission-grant.hidden-file", "permission-grant.hidden-network", "permission-grant.ambient-env", "permission-grant.generic-shell"];

  return {
    signedAdapter: {
      ok:
        /signature:\s*\{[\s\S]*status:\s*"verified"/u.test(runnerCapability) &&
        /trustedSigners/u.test(runnerCapability) &&
        /allowlist/u.test(runnerCapability) &&
        /revokedDigests/u.test(runnerCapability),
      signature: /status:\s*"verified"/u.test(runnerCapability) ? "verified" : "missing",
      allowlisted: /allowlist/u.test(runnerCapability)
    },
    permissionPreflight: {
      ok: /reviewRunnerPermissionPreflightGate/u.test(permissionPreflight) && permissionCodes.every((code) => permissionPreflight.includes(code)),
      checks: permissionCodes,
      blockedReasons: permissionCodes.filter((code) => permissionPreflight.includes(code)).length
    },
    workspaceBoundary: {
      ok: /normalizeRootDir|isInside|unsafeRelativePathPattern/u.test(runFolderWriter),
      rootScoped: /isInside/u.test(runFolderWriter),
      traversalBlocked: /unsafeRelativePathPattern/u.test(runFolderWriter)
    },
    runFolder: {
      ok:
        /agentique\.runFolderWriteReceipt\.v1/u.test(runFolderWriter) &&
        /agentique\.runFolderCleanupReceipt\.v1/u.test(runFolderWriter) &&
        /cleanupRunFolder/u.test(runFolderWriter),
      writeReceipt: /agentique\.runFolderWriteReceipt\.v1/u.test(runFolderWriter),
      cleanupReceipt: /agentique\.runFolderCleanupReceipt\.v1/u.test(runFolderWriter),
      cleanupOk: /cleanupRunFolder/u.test(runFolderWriter)
    },
    logRedaction: {
      required: /logRedaction:\s*"required"/u.test(runnerCapability) && /redactText/u.test(runFolderWriter) && /redactRunnerText/u.test(adapterRunners),
      errorsRedacted: /redactPermissionText/u.test(permissionPreflight) && /redactText/u.test(runFolderWriter) && /redactRunnerText/u.test(adapterRunners)
    },
    platformCompatibility: {
      required: [...requiredPlatforms],
      covered: platformCoverage,
      ok: requiredPlatforms.every((platform) => platformCoverage.includes(platform)) && requiredPlatforms.every((platform) => runnerCapability.includes(`"${platform}"`))
    }
  };
}

function sidecarDescriptor({ id, runtime, externalBin, adapterId }) {
  return Object.freeze({
    id,
    runtime,
    externalBin,
    adapterId,
    command: "agentique_runner_start",
    mode: "contract-only",
    args: Object.freeze([
      "--run-id",
      { validator: "^[A-Za-z0-9:_-]{3,96}$" },
      "--session-id",
      { validator: "^[A-Za-z0-9._-]{3,96}$" },
      "--resource-id",
      { validator: "^[A-Za-z0-9._-]{3,128}$" }
    ]),
    platforms: requiredPlatforms
  });
}

function validateContractShape(contract) {
  const failures = [];
  if (contract?.schemaVersion !== "agentique.nativeRunnerSidecarContract.v1") {
    failures.push(issue("sidecar.contract-schema", "Native runner sidecar contract schema is unsupported."));
  }
  if (contract?.command !== "agentique_runner_start") {
    failures.push(issue("sidecar.contract-command", "Sidecar contract must bind to agentique_runner_start."));
  }
  if (contract?.executionState !== "native-controlled-fixed-python-execution") {
    failures.push(issue("sidecar.contract-state", "Sidecar contract must use the fixed-lane native Python execution state."));
  }
  const sidecars = Array.isArray(contract?.sidecars) ? contract.sidecars : [];
  if (sidecars.length !== 1) {
    failures.push(issue("sidecar.contract-sidecars", "Sidecar contract must specify exactly the fixed Python sidecar descriptor for this gate."));
  }
  for (const duplicated of duplicates(sidecars.map((sidecar) => sidecar.externalBin))) {
    failures.push(issue("sidecar.contract-duplicate-name", `Duplicate sidecar name: ${duplicated}.`));
  }
  for (const sidecar of sidecars) {
    if (!allowedSidecarNames.includes(sidecar.externalBin)) {
      failures.push(issue("sidecar.contract-name", "Sidecar name is not in the approved contract allowlist."));
    }
    if (sidecar.adapterId !== approvedAdapterId) {
      failures.push(issue("sidecar.contract-adapter", "Sidecar descriptor must bind to the approved fixed adapter id."));
    }
    if (unsafeSidecarNamePattern.test(String(sidecar.externalBin ?? ""))) {
      failures.push(issue("sidecar.contract-path", "Sidecar name must be a safe relative externalBin name."));
    }
    if (sidecar.command !== "agentique_runner_start") {
      failures.push(issue("sidecar.contract-command-binding", "Every sidecar descriptor must bind to agentique_runner_start."));
    }
    if (sidecar.args === true) {
      failures.push(issue("sidecar.contract-allow-all-args", "Sidecar contract must not allow all args."));
    }
    if (!Array.isArray(sidecar.args) || !sidecar.args.some((arg) => typeof arg === "object" && typeof arg.validator === "string")) {
      failures.push(issue("sidecar.contract-args-validator", "Sidecar contract requires validator-constrained dynamic args."));
    }
    for (const platform of requiredPlatforms) {
      if (!sidecar.platforms?.includes(platform)) {
        failures.push(issue("sidecar.contract-platform", `Sidecar contract missing ${platform} platform coverage.`));
      }
    }
  }
  for (const gate of requiredGateCodes) {
    if (!contract?.requiredGates?.includes(gate)) {
      failures.push(issue("sidecar.contract-gate", `Sidecar contract missing required gate: ${gate}.`));
    }
  }
  return failures;
}

function summarizeCapabilityFiles(capabilityFiles) {
  const files = [];
  const issues = [];
  const shellPermissionGrants = [];
  const broadPermissionFindings = [];

  for (const file of capabilityFiles) {
    const permissions = Array.isArray(file.json?.permissions) ? file.json.permissions : [];
    const summary = {
      path: file.path,
      permissions: permissions.length,
      shellPermissions: 0,
      broadPermissions: 0
    };
    for (const permission of permissions) {
      const normalized = normalizePermission(permission);
      if (normalized.shellIdentifier) {
        summary.shellPermissions += 1;
        issues.push(issue("sidecar.permission-shell-current", `${file.path} grants ${normalized.identifier}; current sidecar gate must remain disabled.`));
        for (const grant of normalized.allow) {
          const grantSummary = {
            file: file.path,
            identifier: normalized.identifier,
            name: String(grant.name ?? ""),
            sidecar: grant.sidecar === true,
            args: grant.args ?? null
          };
          shellPermissionGrants.push(grantSummary);
          if (grant.sidecar !== true) {
            issues.push(issue("sidecar.permission-missing-sidecar", "Shell permission allow entries must be sidecar-scoped."));
          }
          if (!allowedSidecarNames.includes(grantSummary.name)) {
            issues.push(issue("sidecar.permission-unapproved-name", "Shell permission sidecar name is not approved."));
          }
          if (grant.args === true) {
            issues.push(issue("sidecar.permission-allow-all-args", "Shell permission must not allow all sidecar args."));
          }
          if (Array.isArray(grant.args) && !grant.args.some((arg) => typeof arg === "object" && typeof arg.validator === "string")) {
            issues.push(issue("sidecar.permission-missing-validator", "Shell permission dynamic args require validators."));
          }
        }
      }
      if (normalized.broadPermission) {
        summary.broadPermissions += 1;
        broadPermissionFindings.push({ file: file.path, permission: normalized.identifier });
        issues.push(issue("sidecar.permission-broad", `${file.path} contains a broad or unsupported permission.`));
      }
    }
    files.push(summary);
  }
  return { files, issues, shellPermissionGrants, broadPermissionFindings };
}

function normalizePermission(permission) {
  if (typeof permission === "string") {
    return {
      identifier: permission,
      allow: [],
      shellIdentifier: shellPermissionPattern.test(permission),
      broadPermission: forbiddenPermissionPattern.test(permission)
    };
  }
  const identifier = String(permission?.identifier ?? "");
  return {
    identifier,
    allow: Array.isArray(permission?.allow) ? permission.allow : [],
    shellIdentifier: shellPermissionPattern.test(identifier),
    broadPermission: forbiddenPermissionPattern.test(identifier) && !shellPermissionPattern.test(identifier)
  };
}

function detectShellPlugin(input) {
  const sources = [
    ["src-tauri/Cargo.toml", input.cargoToml ?? ""],
    ["src-tauri/src/lib.rs", input.rustSource ?? ""],
    ["package.json", JSON.stringify(input.packageJson ?? {})],
    ["src-tauri/tauri.conf.json", JSON.stringify(input.tauriConfig ?? {})],
    ...(input.capabilityFiles ?? []).map((file) => [file.path, file.text])
  ];
  const findings = sources.filter(([, text]) => shellPluginPattern.test(String(text ?? ""))).map(([filePath]) => filePath);
  return {
    present: findings.length > 0,
    findings,
    issues: findings.map((filePath) => issue("sidecar.shell-plugin-source", `${filePath} contains shell plugin sidecar execution hooks.`))
  };
}

function detectLifecycleIssues(input) {
  const sources = [["src-tauri/src/lib.rs", input.rustSource ?? ""], ...(input.capabilityFiles ?? []).map((file) => [file.path, file.text])];
  return sources
    .filter(([, text]) => packageLifecyclePattern.test(String(text ?? "")))
    .map(([filePath]) => issue("sidecar.package-lifecycle", `${filePath} contains package lifecycle command text.`));
}

function detectUnsupportedClaimIssues(input) {
  const issues = [];
  const tauriConfig = input.tauriConfig ?? {};
  if (tauriConfig.bundle?.createUpdaterArtifacts === true) {
    issues.push(issue("sidecar.updater-artifacts", "Sidecar gate must not enable updater artifacts."));
  }
  return issues;
}

function extractExternalBin(tauriConfig) {
  const externalBin = tauriConfig?.bundle?.externalBin;
  if (!Array.isArray(externalBin)) return [];
  return externalBin.map((entry) => String(entry ?? "")).filter(Boolean);
}

function firstCapabilityJson(capabilityFiles) {
  const defaultCapability = capabilityFiles?.find((file) => file.path.endsWith("default.json"));
  return defaultCapability?.json ?? { permissions: [] };
}

function readCapabilityFiles(repoRoot) {
  const dir = path.join(repoRoot, "src-tauri/capabilities");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const relPath = `src-tauri/capabilities/${entry.name}`;
      const text = readTextIfExists(repoRoot, relPath);
      return {
        path: relPath,
        text,
        json: JSON.parse(text)
      };
    });
}

function readJsonIfExists(repoRoot, relPath) {
  const text = readTextIfExists(repoRoot, relPath);
  return text ? JSON.parse(text) : null;
}

function readTextIfExists(repoRoot, relPath) {
  const filePath = path.join(repoRoot, relPath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function duplicates(values) {
  const seen = new Set();
  const duplicatesFound = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicatesFound.add(value);
    seen.add(value);
  }
  return [...duplicatesFound];
}

function stableUnique(values) {
  return [...new Set(values)].sort();
}

function kebab(value) {
  return String(value).replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

function issue(code, message) {
  return { code, message: redactLocalText(message) };
}

function redactLocalText(value) {
  return String(value ?? "")
    .replace(/(?:bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/giu, "redacted:inline-sensitive-material")
    .replace(/vault:[a-z][a-zA-Z0-9._-]{2,80}/gu, "redacted:vault-reference");
}
