#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

const failures = [];
const app = readText("src/App.tsx");
const trustRunSettings = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map(readText).join("\n");
const css = readStyleSourceBundle();
const adapterPolicy = readText("src/core/adapter-pack-policy.mjs");
const sidecarRunner = readText("src/core/sidecar-runner.mjs");
const permissionEngine = readText("src/core/permission-engine.mjs");
const runFolder = readText("src/core/run-folder.mjs");
const closeout = readText("docs/validation/phase3-closeout.md");
const packageJson = JSON.parse(readText("package.json"));
const tauriConfig = JSON.parse(readText("src-tauri/tauri.conf.json"));
const capability = JSON.parse(readText("src-tauri/capabilities/default.json"));
const controlledRuntimeApiFiles = new Set(["src/core/python-adapter-runner.mjs", "src/core/node-adapter-runner.mjs"]);

requireIncludes(closeout, [
  "Controlled Execution Foundation Closeout",
  "Adapter pack trust policy",
  "Python sidecar launch plan",
  "Node sidecar package lifecycle boundary",
  "Permission audit engine",
  "Run folder manifest",
  "No direct process spawn from the web layer",
  "Side effects remain an explicit empty list",
  "does not introduce a released installer",
  "native command backend",
  "npm run validate"
], "phase 3 closeout document");

requireIncludes(trustRunSettings, [
  "workspace.run.title",
  "Python sidecar",
  "Node sidecar",
  "Permission enforcement",
  "Run folder",
  "Adapter review only",
  "Launch plan only",
  "Node package execution blocked",
  "Permission audit summary",
  "Run folder manifest summary"
], "phase 3 run workspace surface");

requireIncludes(css, [
  ".run-state",
  ".permission-audit"
], "phase 3 CSS surface");

requireIncludes(adapterPolicy, [
  "reviewAdapterPack",
  "sampleAdapterPolicy",
  "sampleAdapterPack",
  "sampleNodeAdapterPack",
  "adapter.revoked",
  "adapter.permission-excess"
], "adapter policy module");

requireIncludes(sidecarRunner, [
  "createSidecarLaunchPlan",
  "samplePythonSidecarRequest",
  "sampleNodeSidecarRequest",
  "willSpawnProcessFromWebLayer: false",
  "sidecar.node-lifecycle",
  "sidecar.cleanup"
], "sidecar runner module");

requireIncludes(permissionEngine, [
  "evaluatePermissionRequest",
  "evaluatePermissionBatch",
  "revokePermission",
  "permission.path-traversal",
  "permission.host-allowlist",
  "permission.prompt-required"
], "permission engine module");

requireIncludes(runFolder, [
  "createRunFolderManifest",
  "validateRunFolderManifest",
  "agentique.runJson.v1",
  "sideEffects: []",
  "reproducibility",
  "redactRunText"
], "run folder module");

if (!String(packageJson.scripts?.validate ?? "").includes("validate:phase3")) {
  failures.push("validate script must include validate:phase3");
}

if (tauriConfig.bundle?.active !== true) {
  failures.push("Tauri bundle metadata must remain active for release packaging validation");
}

if (!Array.isArray(capability.permissions) || capability.permissions.length !== 0) {
  failures.push("default Tauri capability must not grant permissions");
}

for (const rule of [
  { id: "ready-runtime", pattern: /\bis\s+(?:a\s+)?production-ready desktop runtime\b/iu },
  { id: "universal-runtime", pattern: /\bprovides\s+(?:a\s+)?universal workflow runtime\b/iu },
  { id: "automatic-execution", pattern: /\benables\s+automatic execution of downloaded workflows\b/iu }
]) {
  if (rule.pattern.test(closeout)) {
    failures.push(`phase 3 closeout overclaims: ${rule.id}`);
  }
}

failures.push(...scanSourceForRuntimeBypass("src"));

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "phase3-closeout.md",
    "App.tsx",
    "styles.css",
    "adapter-pack-policy.mjs",
    "sidecar-runner.mjs",
    "permission-engine.mjs",
    "run-folder.mjs",
    "tauri.conf.json",
    "capabilities/default.json",
    "package.json"
  ]
}, null, 2));

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
