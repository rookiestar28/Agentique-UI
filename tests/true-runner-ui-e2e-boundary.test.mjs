import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

test("renderer evidence redaction initializes without Node Buffer authority", async () => {
  const originalBuffer = globalThis.Buffer;
  try {
    globalThis.Buffer = undefined;
    const module = await import(`../src/core/evidence-redaction-boundary.mjs?browser-runtime=${Date.now()}`);
    assert.equal(module.syntheticEvidenceCorpus().entries.length >= 1, true);
  } finally {
    globalThis.Buffer = originalBuffer;
  }
});

test("synchronous renderer hashing matches the SHA-256 contract", async () => {
  const { sha256HexSync } = await import("../src/core/sha256-sync.mjs");
  assert.equal(sha256HexSync("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("native lifecycle surface exposes bounded user-driven readback and cleanup", () => {
  const hook = read("src/app-state/useNativeAsyncRunLifecycle.ts");
  const panel = read("src/workspaces/NativeAsyncRunLifecyclePanel.tsx");

  for (const phrase of ["client.logs()", "client.artifacts()", "client.cleanup()", "nativeStatusFrom", "receiptSummary"]) {
    assert.match(hook, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  for (const phrase of ["Read native logs", "Read native artifacts", "Clean up native run", "Native receipt evidence", 'aria-live="polite"']) {
    assert.match(panel, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("desktop Playwright harness requires an actual Tauri WebView2 transport", () => {
  const packageJson = JSON.parse(read("package.json"));
  const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json"));
  const tauriCapabilities = JSON.parse(read("src-tauri/capabilities/default.json"));
  const config = read("playwright.native.config.mjs");
  const launcher = read("scripts/run-native-runner-e2e.mjs");
  const spec = read("e2e/native-runner.spec.mjs");

  assert.match(String(packageJson.devDependencies?.["@playwright/test"] ?? ""), /^1\./u);
  assert.match(String(packageJson.scripts?.["test:e2e:native-runner"] ?? ""), /run-native-runner-e2e/u);
  assert.match(tauriConfig.app.security.csp, /connect-src[^;]*http:\/\/ipc\.localhost/u);
  assert.match(read("index.html"), /connect-src[^;]*http:\/\/ipc\.localhost/u);
  assert.deepEqual(tauriCapabilities.permissions, ["core:event:allow-listen", "core:event:allow-unlisten"]);
  assert.match(config, /connectOverCDP/u);
  assert.match(launcher, /WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS/u);
  assert.match(launcher, /--remote-debugging-port=0/u);
  assert.match(launcher, /DevToolsActivePort/u);
  assert.match(launcher, /WEBVIEW2_USER_DATA_FOLDER/u);
  assert.match(launcher, /APPDATA/u);
  assert.match(launcher, /AGENTIQUE_E2E_APP_DATA_ROOT/u);
  assert.match(launcher, /finally/u);
  assert.match(spec, /__TAURI_INTERNALS__/u);
  assert.match(spec, /data-native-transport/u);
  assert.match(spec, /getByRole/u);
  assert.match(spec, /toBeDisabled/u);
  assert.match(spec, /toBeEnabled/u);
  assert.doesNotMatch(spec, /window\.__TAURI_INTERNALS__\s*=/u);
});

test("fixed E2E adapter modes are host-selected in debug and production stays success-only", () => {
  const rust = read("src-tauri/src/lib.rs");
  assert.match(rust, /fn native_adapter_mode_for_host/u);
  assert.match(rust, /cfg\(debug_assertions\)/u);
  assert.match(rust, /AGENTIQUE_E2E_ADAPTER_MODE/u);
  assert.match(rust, /AGENTIQUE_E2E_APP_DATA_ROOT/u);
  assert.match(rust, /NativeAdapterTestMode::Sleep/u);
  assert.match(rust, /NativeAdapterTestMode::ExitFailure/u);
  assert.match(rust, /cfg\(not\(debug_assertions\)\)/u);
  assert.match(rust, /NativeAdapterTestMode::Success/u);
  assert.doesNotMatch(read("src/core/tauri-native-async-run-client.ts"), /adapterMode|testScenario|executable|arguments/u);
});

test("development dependency discovery is confined to the product entry", () => {
  const vite = read("vite.config.ts");
  assert.match(vite, /optimizeDeps/u);
  assert.match(vite, /entries:\s*\["index\.html"\]/u);
});
