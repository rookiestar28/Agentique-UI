#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const failures = [];
const app = readText("src/App.tsx");
const graphWorkspace = ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map(readText).join("\n");
const previewHandoff = readText("src/workspaces/PreviewHandoffWorkspaces.tsx");
const trustRunSettings = [
  "src/workspaces/TrustRunSettingsWorkspaces.tsx",
  "src/workspaces/TrustRunSettingsTypes.ts",
  "src/workspaces/VerifyWorkspace.tsx",
  "src/workspaces/RunWorkspace.tsx",
  "src/workspaces/AdapterRegistryTrustPanel.tsx",
  "src/workspaces/PythonNodeAdapterPackExpansionPanel.tsx",
  "src/workspaces/RepoLocalTaskRunnerLanePanel.tsx",
  "src/workspaces/ExternalAgentClientPackExpansionPanel.tsx",
  "src/workspaces/McpBridgeReadinessPanel.tsx",
  "src/workspaces/WasmWasiSandboxGatePanel.tsx",
  "src/workspaces/RootlessContainerPreflightGatePanel.tsx",
  "src/workspaces/BrowserAutomationConsentGatePanel.tsx",
  "src/workspaces/SettingsWorkspace.tsx"
]
  .map(readText)
  .join("\n");
const launchSurface = `${app}\n${graphWorkspace}\n${previewHandoff}\n${trustRunSettings}`;
const workflowEditor = readText("src/core/workflow-editor.mjs");
const externalRuntime = readText("src/core/external-runtime-adapter.mjs");
const agentClient = readText("src/core/agent-client-handoff.mjs");
const adapterRegistry = readText("src/core/adapter-registry.mjs");
const releaseReadiness = readText("src/core/release-readiness.mjs");
const closeout = readText("docs/validation/launch-readiness-closeout.md");
const distribution = readText("docs/validation/distribution-readiness.md");
const packageJson = JSON.parse(readText("package.json"));
const tauriConfig = JSON.parse(readText("src-tauri/tauri.conf.json"));
const capability = JSON.parse(readText("src-tauri/capabilities/default.json"));
const controlledRuntimeApiFiles = new Set(["src/core/python-adapter-runner.mjs", "src/core/node-adapter-runner.mjs"]);

requireIncludes(
  closeout,
  [
    "Launch Readiness Closeout",
    "Workflow graph editor contract",
    "External runtime handoff contract",
    "Agent-client handoff contract",
    "Adapter registry contract",
    "Distribution readiness gate",
    "Released desktop installer",
    "Signed updater or update channel",
    "npm run validate"
  ],
  "launch closeout document"
);

requireIncludes(
  distribution,
  ["Distribution Readiness Gate", "bundle metadata active", "does not yet publish a desktop installer", "Updater artifacts remain disabled", "Clean environment smoke test"],
  "distribution readiness document"
);

requireIncludes(
  launchSurface,
  [
    "Workflow editor state summary",
    "External runtime handoff summary",
    "Agent client handoff summary",
    "Adapter registry review summary",
    "settings.release.summaryLabel",
    "settings.release.noInstallerClaimTitle"
  ],
  "app launch readiness surface"
);

requireIncludes(
  workflowEditor,
  ["createWorkflowEditorState", "applyWorkflowEdit", "undoWorkflowEdit", "redoWorkflowEdit", "workflow-editor.raw-mutation-blocked"],
  "workflow editor module"
);

requireIncludes(
  externalRuntime,
  ["createExternalRuntimeHandoff", "externalRuntimeTargets", "universalRuntimeClaim: false", "willExecute: false"],
  "external runtime handoff module"
);

requireIncludes(agentClient, ["createAgentClientHandoffPlan", "agentClientTargets", "startsBridge: false", "willExecute: false"], "agent client handoff module");

requireIncludes(
  adapterRegistry,
  ["reviewRegistryAdapter", "resolveAdapterUpdate", "migrateAdapterRegistry", "registry.downgrade-blocked", "registry.revoked"],
  "adapter registry module"
);

requireIncludes(
  releaseReadiness,
  ["evaluateDistributionReadiness", "sampleIncompleteDistributionEvidence", "sampleCompleteDistributionEvidence", "distribution.bundle-disabled", "cleanEnvironmentSmoke"],
  "release readiness module"
);

if (!String(packageJson.scripts?.["validate:launch"] ?? "").includes("check-launch-closeout.mjs")) {
  failures.push("package scripts must define validate:launch");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:launch")) {
  failures.push("validate script must include validate:launch");
}

if (tauriConfig.bundle?.active !== true) {
  failures.push("Tauri bundle metadata must be active for release packaging validation");
}

if (tauriConfig.bundle?.createUpdaterArtifacts !== false) {
  failures.push("updater artifacts must remain disabled until updater signing evidence exists");
}

if (!Array.isArray(capability.permissions) || capability.permissions.length !== 0) {
  failures.push("default Tauri capability must not grant permissions");
}

for (const [label, text] of [
  ["launch closeout", closeout],
  ["distribution readiness", distribution]
]) {
  for (const rule of [
    { id: "released-installer", pattern: /\bships\s+(?:a\s+)?desktop installer\b/iu },
    { id: "production-runtime", pattern: /\bproduction-ready\s+desktop\s+runtime\b/iu },
    { id: "automatic-execution", pattern: /\bprovides\s+automatic\s+workflow\s+execution\b/iu },
    { id: "universal-runtime", pattern: /\bprovides\s+(?:a\s+)?universal\s+workflow\s+runtime\b/iu },
    { id: "signed-updater", pattern: /\bsigned\s+updater\s+is\s+available\b/iu }
  ]) {
    if (rule.pattern.test(text)) {
      failures.push(`${label} overclaims: ${rule.id}`);
    }
  }
}

failures.push(...scanSourceForRuntimeBypass("src"));

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: [
        "launch-readiness-closeout.md",
        "distribution-readiness.md",
        "App.tsx",
        "GraphWorkspace.tsx",
        "PreviewHandoffWorkspaces.tsx",
        "workflow-editor.mjs",
        "external-runtime-adapter.mjs",
        "agent-client-handoff.mjs",
        "adapter-registry.mjs",
        "release-readiness.mjs",
        "tauri.conf.json",
        "capabilities/default.json",
        "package.json"
      ]
    },
    null,
    2
  )
);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}

function scanSourceForRuntimeBypass(dir) {
  const findings = [];
  for (const filePath of listFiles(dir)) {
    const rel = filePath.replaceAll(path.sep, "/");
    const text = fs.readFileSync(filePath, "utf8");
    for (const rule of [
      { id: "network-fetch", pattern: /\bfetch\s*\(/u },
      { id: "websocket", pattern: /\bWebSocket\s*\(/u },
      { id: "xml-http-request", pattern: /\bXMLHttpRequest\s*\(/u },
      { id: "child-process", pattern: /node:child_process|child_process/u },
      { id: "filesystem-write", pattern: /\b(writeFile|appendFile|createWriteStream)\s*\(/u },
      { id: "tauri-invoke", pattern: /\binvoke\s*\(/u }
    ]) {
      if (rule.pattern.test(text)) {
        if (rule.id === "child-process" && controlledRuntimeApiFiles.has(rel)) continue;
        findings.push(`${rel} uses forbidden runtime API: ${rule.id}`);
      }
    }
  }
  return findings;
}

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full));
    } else if (entry.isFile() && /\.(mjs|ts|tsx|css)$/iu.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}
