#!/usr/bin/env node
import fs from "node:fs";
import { reviewWasmWasiSandboxGate } from "../src/core/wasm-wasi-sandbox-gate.mjs";

const failures = [];
const moduleText = readText("src/core/wasm-wasi-sandbox-gate.mjs");
const tests = readText("tests/wasm-wasi-sandbox-gate.test.mjs");
const surfaceTests = readText("tests/wasm-wasi-sandbox-surface.test.mjs");
const docs = readText("docs/contracts/wasm-wasi-sandbox-gate.md");
const panel = readText("src/workspaces/WasmWasiSandboxGatePanel.tsx");
const runWorkspace = readText("src/workspaces/RunWorkspace.tsx");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const packageJson = JSON.parse(readText("package.json"));
const review = reviewWasmWasiSandboxGate();

requireIncludes(
  moduleText,
  [
    "agentique.wasmWasiSandboxGate.v1",
    "enabledForExecution: false",
    "disabled-pending-runtime-evidence",
    "instructionMetering",
    "loopback-only",
    "vault-references-only",
    "cleanupReceiptRequired",
    "evaluateRunStartGrants",
    "assertWasiCapabilitiesSafe"
  ],
  "WASM sandbox gate module"
);

requireIncludes(
  tests,
  [
    "complete WASM WASI sandbox contract is preflight-ready but execution stays disabled",
    "execution cannot be enabled by the sandbox gate item",
    "memory time stream artifact and instruction metering limits are mandatory",
    "broad host filesystem access and traversal are rejected",
    "public network access and ambient environment are rejected",
    "permission preflight must pass before WASM sandbox readiness",
    "WASM execution production and universal runtime claims are rejected"
  ],
  "WASM sandbox gate tests"
);

requireIncludes(
  surfaceTests,
  [
    "run page exposes WASM WASI sandbox gate evidence",
    "WASM WASI sandbox surface stays review-only without runtime effects",
    "WebAssembly\\.(?:instantiate|compile|compileStreaming|instantiateStreaming)",
    "node:wasi",
    "wasmtime"
  ],
  "WASM sandbox gate surface tests"
);

requireIncludes(
  docs,
  [
    "WASM/WASI Sandbox Gate Contract",
    "guarded preflight only",
    "does not execute WebAssembly",
    "fuel or equivalent deterministic instruction metering",
    "workspace-scoped file declarations only",
    "disabled or loopback-only network declarations",
    "enabledForExecution: false",
    "does not provide a production desktop runtime"
  ],
  "WASM sandbox gate docs"
);

requireIncludes(
  panel,
  [
    "WASM/WASI sandbox gate",
    "Preflight status",
    "Execution decision",
    "Resource limits",
    "Instruction metering",
    "Host imports",
    "Filesystem grants",
    "Network grants",
    "Watchdog",
    "Artifact receipts",
    "Blocked unsafe WASM samples",
    "No universal runtime claim"
  ],
  "WASM sandbox gate panel"
);

requireIncludes(runWorkspace, ["WasmWasiSandboxGatePanel", "wasmWasiSandboxGate"], "Run workspace WASM sandbox wiring");

requireIncludes(route, ["createWasmWasiSandboxReview", "wasmWasiSandboxGate", "wasmWasiSandboxGate={wasmWasiSandboxGate}"], "Run route WASM sandbox wiring");

requireIncludes(types, ["wasmWasiSandboxGate: AnyRecord"], "Run workspace props");

const browserSurface = [panel, runWorkspace, route].join("\n");
const forbiddenBrowserRuntime =
  /WebAssembly\.(?:instantiate|compile|compileStreaming|instantiateStreaming)|\bnew\s+WASI\b|\bWASI\s*\(|node:wasi|node:child_process|child_process|node:fs|writeFile|appendFile|createWriteStream|spawn\(|execFile\(|exec\(|fetch\(|WebSocket\(|invoke\(|npm install|postinstall|preinstall|wasmtime|wasmer|wasi.start|wasi.initialize/u;
if (forbiddenBrowserRuntime.test(browserSurface)) {
  failures.push("WASM sandbox gate browser surface must stay review-only and avoid runtime-effect APIs");
}

if (!review.ok || review.approvedStatus !== "preflight-ready" || review.executionEnabled !== false) {
  failures.push("WASM sandbox gate review must prove preflight readiness while execution remains disabled");
}

if (!review.broadHostAccessBlocked || !review.missingMeteringBlocked || !review.publicNetworkBlocked) {
  failures.push("WASM sandbox gate review must prove unsafe file, metering, and network paths are blocked");
}

if (!String(packageJson.scripts?.["validate:wasm-wasi-sandbox-gate"] ?? "").includes("check-wasm-wasi-sandbox-gate.mjs")) {
  failures.push("package scripts must define validate:wasm-wasi-sandbox-gate");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:wasm-wasi-sandbox-gate")) {
  failures.push("validate script must include validate:wasm-wasi-sandbox-gate");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: [
        "src/core/wasm-wasi-sandbox-gate.mjs",
        "tests/wasm-wasi-sandbox-gate.test.mjs",
        "tests/wasm-wasi-sandbox-surface.test.mjs",
        "src/workspaces/WasmWasiSandboxGatePanel.tsx",
        "src/workspaces/RunWorkspace.tsx",
        "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx",
        "src/workspaces/TrustRunSettingsTypes.ts",
        "docs/contracts/wasm-wasi-sandbox-gate.md"
      ],
      summary: review.summary
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
