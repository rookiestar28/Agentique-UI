import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");

test("native runner owns an exact fixed Node manifest and executor", () => {
  for (const phrase of [
    'const NODE_ADAPTER_ID: &str = "adapter.local-node"',
    'const NODE_ADAPTER_PERMISSION_PROFILE_ID: &str = "permission.local-node.minimal"',
    "fn fixed_node_adapter_manifest()",
    "fn resolve_fixed_node_executable()",
    "fn fixed_node_adapter_script_path()",
    "agentique.nativeAdapterExecutionReceipt.v1"
  ]) {
    assert.match(rust, new RegExp(escapeRegExp(phrase), "u"), phrase);
  }
});

test("native request surface remains opaque and rejects launch configuration fields", () => {
  const request = rust.match(/struct RunnerCommandRequest \{(?<body>[\s\S]*?)\n\}/u)?.groups?.body ?? "";
  for (const forbidden of ["executable", "runtime", "path", "args", "environment", "script", "package_manager"])
    assert.doesNotMatch(request, new RegExp(`\\b${forbidden}\\b`, "iu"), forbidden);
  assert.match(rust, /deny_unknown_fields/u);
  assert.doesNotMatch(rust, /Command::new\(["'](?:npm|npx|yarn|pnpm|cmd|powershell|sh|bash)["']\)/u);
  assert.doesNotMatch(rust, /\.arg\(["']-e["']\)/u);
});

test("fixed Node helper implements bounded native parity modes", () => {
  const cases = [
    ["success", 0, true],
    ["invalid-json", 0, false],
    ["exit-failure", 7, false],
    ["secret", 0, true]
  ];
  for (const [mode, expectedStatus, shouldParse] of cases) {
    const runId = `run.node-parity-${mode}`;
    const result = spawnSync(process.execPath, ["adapters/node/echo-adapter.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      input: `${JSON.stringify({
        schemaVersion: "agentique.nodeAdapterRun.v1",
        runId,
        mode,
        sleepMs: 0,
        resource: { id: "resource.node-parity", version: "0.1.0", digest: "e".repeat(64), supportMode: "locally-runnable" },
        payload: { message: "node-adapter-ready" }
      })}\n`,
      env: { AGENTIQUE_RUN_ID: runId, AGENTIQUE_ADAPTER_RUNTIME: "node", AGENTIQUE_ADAPTER_MODE: mode }
    });
    assert.equal(result.status, expectedStatus, `${mode}: ${result.stderr}`);
    if (shouldParse) {
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.schemaVersion, "agentique.nodeAdapterResult.v1");
      assert.equal(parsed.payload.runId, runId);
    } else if (mode === "invalid-json") {
      assert.equal(result.stdout.trim(), "not-json");
    }
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
