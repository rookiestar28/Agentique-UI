import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("run page exposes WASM WASI sandbox gate evidence", () => {
  const app = [
    "src/workspaces/TrustRunSettingsTypes.ts",
    "src/workspaces/WasmWasiSandboxGatePanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  for (const phrase of [
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
  ]) {
    assert.match(app, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  }
});

test("WASM WASI sandbox surface stays review-only without runtime effects", () => {
  const browserSurface = [
    "src/workspaces/WasmWasiSandboxGatePanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(
    browserSurface,
    /WebAssembly\.(?:instantiate|compile|compileStreaming|instantiateStreaming)|\bnew\s+WASI\b|\bWASI\s*\(|node:wasi|node:child_process|child_process|node:fs|writeFile|appendFile|createWriteStream|spawn\(|execFile\(|exec\(|fetch\(|WebSocket\(|invoke\(|npm install|postinstall|preinstall|wasmtime|wasmer|wasi.start|wasi.initialize/u
  );
});
