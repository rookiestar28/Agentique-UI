import fs from "node:fs";
import path from "node:path";

export const validationStageReportingSchemaVersion = "agentique.validationStageReporting.v1";

export const validationStages = Object.freeze([
  stage("contracts", "Contracts And Alignment", [
    npmRun("validate:contracts"),
    npmRun("validate:core-alignment"),
    npmRun("validate:tauri"),
    npmRun("validate:native-runner-boundary"),
    npmRun("validate:native-runner-adapter-manifest"),
    npmRun("validate:adapter-registry-manifest-trust-policy"),
    npmRun("validate:python-node-adapter-pack-expansion"),
    npmRun("validate:repo-local-task-runner-lane"),
    npmRun("validate:native-runner-python-execution"),
    npmRun("validate:native-runner-event-replay"),
    npmRun("validate:active-native-event-transport"),
    npmRun("validate:runner-revocation-cancel-controls"),
    npmRun("validate:durable-run-ledger"),
    npmRun("validate:watchdog-heartbeat-supervisor"),
    npmRun("validate:artifact-receipt-binding"),
    npmRun("validate:runtime-prerequisite-readiness"),
    npmRun("validate:native-runner-permission-enforcement"),
    npmRun("validate:native-runner-artifact-readback"),
    npmRun("validate:native-runner-cleanup-recovery"),
    npmRun("validate:native-runner-sidecar-gate"),
    npmRun("validate:local-run-state-machine"),
    npmRun("validate:permission-grants"),
    npmRun("validate:permission-center-policy-diff"),
    npmRun("validate:run-dashboard-queue-monitor"),
    npmRun("validate:logs-artifact-workbench"),
    npmRun("validate:library-update-lifecycle")
  ]),
  stage("runner-foundations", "Runner Foundations", [
    npmRun("validate:run-folder-writer"),
    npmRun("validate:run-history-evidence"),
    npmRun("validate:python-adapter-runner"),
    npmRun("validate:node-adapter-runner"),
    npmRun("validate:curated-adapter-lane"),
    npmRun("validate:workflow-scheduler"),
    npmRun("validate:runner-event-stream"),
    npmRun("validate:human-approval-interrupt"),
    npmRun("validate:human-approval-resume-rerun-ux"),
    npmRun("validate:graph-run-plan"),
    npmRun("validate:workflow-template-run-plan-builder")
  ]),
  stage("platform-graph-boundaries", "Platform And Graph Boundaries", [
    npmRun("validate:external-handoff-descriptors"),
    npmRun("validate:external-agent-client-pack-expansion"),
    npmRun("validate:mcp-bridge-readiness-descriptor"),
    npmRun("validate:multi-lane-execution-readiness"),
    npmRun("validate:source-roundtrip-handoff"),
    npmRun("validate:execution-validation-pack"),
    npmRun("validate:platform-format-adapter"),
    npmRun("validate:platform-ir-normalizer"),
    npmRun("validate:platform-fixture-conformance"),
    npmRun("validate:platform-capability-classifier"),
    npmRun("validate:secondary-format-compatibility"),
    npmRun("validate:graph-run-execution-ui"),
    npmRun("validate:external-runtime-bridge-guard"),
    npmRun("validate:wasm-wasi-sandbox-gate"),
    npmRun("validate:rootless-container-preflight-gate"),
    npmRun("validate:browser-automation-consent-gate"),
    npmRun("validate:local-vault-secrets-ux"),
    npmRun("validate:diagnostics-support-bundle"),
    npmRun("validate:function-expansion-closeout"),
    npmRun("validate:desktop-runner-validation-gate"),
    npmRun("validate:runner-capability-closeout"),
    npmRun("validate:executable-capability-closeout-pack"),
    npmRun("validate:companion-integration-closeout"),
    npmRun("validate:closeout")
  ]),
  stage("ui-and-i18n-boundaries", "UI And I18n Boundaries", [
    npmRun("validate:style-source-boundary"),
    npmRun("validate:visual"),
    npmRun("validate:visual-redesign"),
    npmRun("validate:rebuilt-ui"),
    npmRun("validate:i18n-workspace-copy"),
    npmRun("validate:i18n-catalog-loading"),
    npmRun("validate:i18n-locale-qa"),
    npmRun("validate:graph-interaction-hotfix"),
    npmRun("validate:live-data-boundary")
  ]),
  stage("tooling-baseline", "Tooling Baseline", [
    npmRun("validate:stage-reporting"),
    npmRun("lint"),
    npmRun("format:check"),
    npmRun("typecheck:js"),
    npmRun("validate:type-lint-format"),
    npmRun("validate:tech-debt-risk-baseline"),
    npmRun("validate:workspace-file-budgets")
  ]),
  stage("release-readiness", "Release Readiness", [
    npmRun("validate:phase2"),
    npmRun("validate:phase3"),
    npmRun("validate:launch"),
    npmRun("validate:release-boundary"),
    npmRun("validate:release-metadata"),
    npmRun("validate:release-windows"),
    npmRun("validate:release-macos"),
    npmRun("validate:release-linux"),
    npmRun("validate:release-updater"),
    npmRun("validate:release-workflow"),
    npmRun("validate:release-docs"),
    npmRun("validate:release-packaging-preflight"),
    npmRun("validate:release-smoke"),
    npmRun("validate:rebuilt-workspace-closeout"),
    npmRun("validate:release-final")
  ]),
  stage("build-test-public", "Build Test And Public Boundary", [
    npmRun("typecheck"),
    npmRun("build"),
    npmRun("validate:build-payload-budget"),
    npmTest(),
    npmRun("validate:public")
  ])
]);

export const requiredValidationCommandTexts = Object.freeze(flattenValidationCommands(validationStages).map((command) => command.text));

export const requiredValidationCommandFamilies = Object.freeze({
  publicBoundary: ["npm run validate:public"],
  i18n: ["npm run validate:i18n-workspace-copy", "npm run validate:i18n-catalog-loading", "npm run validate:i18n-locale-qa"],
  noBentoUi: ["npm run validate:rebuilt-ui", "npm run validate:graph-interaction-hotfix", "npm run validate:workspace-file-budgets"],
  release: ["npm run validate:release-boundary", "npm run validate:release-metadata", "npm run validate:release-docs", "npm run validate:release-final"],
  runner: ["npm run validate:python-adapter-runner", "npm run validate:node-adapter-runner", "npm run validate:runner-capability-closeout"],
  executableCapabilityCloseout: ["npm run validate:executable-capability-closeout-pack"],
  buildPayload: ["npm run build", "npm run validate:build-payload-budget", "npm test"],
  typeLintFormat: ["npm run lint", "npm run format:check", "npm run typecheck:js", "npm run validate:type-lint-format"],
  stageReporting: ["npm run validate:stage-reporting"],
  liveDataBoundary: ["npm run validate:live-data-boundary"],
  nativeRunnerAdapterManifest: ["npm run validate:native-runner-adapter-manifest"],
  adapterRegistryManifestTrustPolicy: ["npm run validate:adapter-registry-manifest-trust-policy"],
  pythonNodeAdapterPackExpansion: ["npm run validate:python-node-adapter-pack-expansion"],
  repoLocalTaskRunnerLane: ["npm run validate:repo-local-task-runner-lane"],
  externalAgentClientPackExpansion: ["npm run validate:external-agent-client-pack-expansion"],
  mcpBridgeReadinessDescriptor: ["npm run validate:mcp-bridge-readiness-descriptor"],
  browserAutomationConsentGate: ["npm run validate:browser-automation-consent-gate"],
  localVaultSecretsUx: ["npm run validate:local-vault-secrets-ux"],
  diagnosticsSupportBundle: ["npm run validate:diagnostics-support-bundle"],
  functionExpansionCloseout: ["npm run validate:function-expansion-closeout"],
  nativeRunnerPythonExecution: ["npm run validate:native-runner-python-execution"],
  nativeRunnerEventReplay: ["npm run validate:native-runner-event-replay"],
  activeNativeEventTransport: ["npm run validate:active-native-event-transport"],
  runnerRevocationCancelControls: ["npm run validate:runner-revocation-cancel-controls"],
  durableRunLedger: ["npm run validate:durable-run-ledger"],
  watchdogHeartbeatSupervisor: ["npm run validate:watchdog-heartbeat-supervisor"],
  artifactReceiptBinding: ["npm run validate:artifact-receipt-binding"],
  runtimePrerequisiteReadiness: ["npm run validate:runtime-prerequisite-readiness"],
  multiLaneExecutionReadiness: ["npm run validate:multi-lane-execution-readiness"],
  nativeRunnerPermissionEnforcement: ["npm run validate:native-runner-permission-enforcement"],
  nativeRunnerArtifactReadback: ["npm run validate:native-runner-artifact-readback"],
  nativeRunnerCleanupRecovery: ["npm run validate:native-runner-cleanup-recovery"],
  nativeRunnerSidecarGate: ["npm run validate:native-runner-sidecar-gate"],
  libraryUpdateLifecycle: ["npm run validate:library-update-lifecycle"],
  permissionCenterPolicyDiff: ["npm run validate:permission-center-policy-diff"],
  runDashboardQueueMonitor: ["npm run validate:run-dashboard-queue-monitor"],
  logsArtifactWorkbench: ["npm run validate:logs-artifact-workbench"],
  humanApprovalResumeRerunUx: ["npm run validate:human-approval-resume-rerun-ux"],
  workflowTemplateRunPlanBuilder: ["npm run validate:workflow-template-run-plan-builder"]
});

export function reviewValidationStageReporting({ root = process.cwd() } = {}) {
  const report = collectValidationStageReport({ root });
  return {
    report,
    validation: validateValidationStageReport(report)
  };
}

export function flattenValidationCommands(stages = validationStages) {
  return stages.flatMap((currentStage, stageIndex) =>
    currentStage.commands.map((command, commandIndex) => ({
      ...command,
      stageId: currentStage.id,
      stageLabel: currentStage.label,
      stageIndex,
      commandIndex
    }))
  );
}

export function hasValidationCommand(commandText) {
  return requiredValidationCommandTexts.includes(commandText);
}

export function collectValidationStageReport({ root = process.cwd() } = {}) {
  const repoRoot = path.resolve(root);
  const packageJson = readJsonIfExists(repoRoot, "package.json") ?? {};
  const scripts = packageJson.scripts ?? {};
  const commands = flattenValidationCommands(validationStages);
  const packageScriptCommands = Object.fromEntries(commands.map((command) => [command.text, hasPackageScriptForCommand(scripts, command)]));

  return {
    schemaVersion: validationStageReportingSchemaVersion,
    stages: validationStages.map((currentStage) => ({
      id: currentStage.id,
      label: currentStage.label,
      commandCount: currentStage.commands.length,
      commands: currentStage.commands.map((command) => command.text)
    })),
    commands: commands.map((command) => ({
      id: command.id,
      text: command.text,
      stageId: command.stageId,
      stageLabel: command.stageLabel,
      stageIndex: command.stageIndex,
      commandIndex: command.commandIndex,
      npmScript: command.npmScript
    })),
    commandFamilies: requiredValidationCommandFamilies,
    packageScripts: {
      validate: scripts.validate ?? "",
      validateStageReporting: scripts["validate:stage-reporting"] ?? "",
      packageScriptCommands
    },
    files: {
      runner: fileFacts(repoRoot, "scripts/run-validate-staged.mjs"),
      checker: fileFacts(repoRoot, "scripts/check-validation-stage-reporting.mjs"),
      source: fileFacts(repoRoot, "src/core/validation-stage-reporting.mjs")
    }
  };
}

export function validateValidationStageReport(report) {
  const failures = [];
  if (report?.schemaVersion !== validationStageReportingSchemaVersion) {
    failures.push(issue("schema-version", "Unsupported validation stage reporting schema version."));
  }

  if (!String(report?.packageScripts?.validate ?? "").startsWith("node scripts/run-validate-staged.mjs")) {
    failures.push(issue("validate-runner", "npm run validate must execute scripts/run-validate-staged.mjs."));
  }
  if (!String(report?.packageScripts?.validateStageReporting ?? "").includes("scripts/check-validation-stage-reporting.mjs")) {
    failures.push(issue("stage-reporting-script", "package.json must expose validate:stage-reporting."));
  }

  for (const [name, facts] of Object.entries(report?.files ?? {})) {
    if (facts?.exists !== true) {
      failures.push(issue("missing-file", `${name} file is missing: ${facts?.path ?? "unknown"}.`));
    }
  }

  const commandIds = report?.commands?.map((command) => command.id) ?? [];
  const commandTexts = report?.commands?.map((command) => command.text) ?? [];
  for (const duplicated of duplicates(commandIds)) {
    failures.push(issue("duplicate-command-id", `Duplicate validation command id: ${duplicated}.`));
  }
  for (const duplicated of duplicates(commandTexts)) {
    failures.push(issue("duplicate-command-text", `Duplicate validation command text: ${duplicated}.`));
  }
  for (const requiredText of requiredValidationCommandTexts) {
    if (!commandTexts.includes(requiredText)) {
      failures.push(issue("missing-command", `Validation stage manifest is missing ${requiredText}.`));
    }
  }
  for (const [family, requiredTexts] of Object.entries(report?.commandFamilies ?? {})) {
    for (const requiredText of requiredTexts) {
      if (!commandTexts.includes(requiredText)) {
        failures.push(issue("missing-family-command", `${family} validation family is missing ${requiredText}.`));
      }
    }
  }

  const packageScriptCommands = report?.packageScripts?.packageScriptCommands ?? {};
  for (const requiredText of requiredValidationCommandTexts) {
    if (packageScriptCommands[requiredText] !== true) {
      failures.push(issue("missing-package-script", `${requiredText} does not map to an executable package script.`));
    }
  }

  requireCommandOrder(commandTexts, ["npm run build", "npm run validate:build-payload-budget", "npm test"], failures);
  requireCommandOrder(commandTexts, ["npm run validate:stage-reporting", "npm run lint", "npm run format:check", "npm run typecheck:js"], failures);
  requireCommandOrder(
    commandTexts,
    ["npm run validate:release-workflow", "npm run validate:release-docs", "npm run validate:release-packaging-preflight", "npm run validate:release-smoke"],
    failures
  );
  requireCommandOrder(commandTexts, ["npm run validate:release-smoke", "npm run validate:rebuilt-workspace-closeout", "npm run validate:release-final"], failures);

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    summary: {
      stages: report?.stages?.length ?? 0,
      commands: report?.commands?.length ?? 0,
      families: Object.keys(report?.commandFamilies ?? {}).length
    }
  };
}

export function buildValidationFailureSummary({ stage, command, exitCode, signal = null, durationMs = 0 }) {
  return {
    status: "failed",
    failed: {
      stageId: stage?.id ?? command?.stageId ?? "unknown",
      stageLabel: stage?.label ?? command?.stageLabel ?? "Unknown Stage",
      commandId: command?.id ?? "unknown",
      commandText: command?.text ?? "unknown",
      exitCode,
      signal
    },
    durationMs
  };
}

export function formatValidationStageReport(report, validation) {
  return {
    status: validation.ok ? "passed" : "failed",
    schemaVersion: report.schemaVersion,
    summary: validation.summary,
    stages: report.stages,
    files: report.files,
    failures: validation.failures
  };
}

function stage(id, label, commands) {
  return Object.freeze({
    id,
    label,
    commands: Object.freeze(commands)
  });
}

function npmRun(scriptName) {
  return Object.freeze({
    id: `npm-run-${scriptName.replaceAll(":", "-")}`,
    kind: "npm",
    npmScript: scriptName,
    args: Object.freeze(["run", scriptName]),
    text: `npm run ${scriptName}`
  });
}

function npmTest() {
  return Object.freeze({
    id: "npm-test",
    kind: "npm",
    npmScript: "test",
    args: Object.freeze(["test"]),
    text: "npm test"
  });
}

function hasPackageScriptForCommand(scripts, command) {
  if (command.text === "npm test") return typeof scripts.test === "string" && scripts.test.length > 0;
  if (command.text === "npm run build") return typeof scripts.build === "string" && scripts.build.length > 0;
  if (command.npmScript && !command.npmScript.startsWith("validate:")) return typeof scripts[command.npmScript] === "string" && scripts[command.npmScript].length > 0;
  return typeof scripts[command.npmScript] === "string" && scripts[command.npmScript].length > 0;
}

function requireCommandOrder(commandTexts, orderedTexts, failures) {
  let previousIndex = -1;
  for (const text of orderedTexts) {
    const index = commandTexts.indexOf(text);
    if (index === -1) {
      failures.push(issue("ordered-command-missing", `Ordered validation command is missing: ${text}.`));
      return;
    }
    if (index <= previousIndex) {
      failures.push(issue("command-order", `Validation command order drifted: ${orderedTexts.join(" -> ")}.`));
      return;
    }
    previousIndex = index;
  }
}

function duplicates(values) {
  const seen = new Set();
  const duplicateValues = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicateValues.add(value);
    seen.add(value);
  }
  return [...duplicateValues];
}

function fileFacts(repoRoot, relPath) {
  const fullPath = path.join(repoRoot, relPath);
  return {
    path: relPath,
    exists: fs.existsSync(fullPath),
    bytes: fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0
  };
}

function readJsonIfExists(repoRoot, relPath) {
  const fullPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function issue(code, message) {
  return { code, message };
}
