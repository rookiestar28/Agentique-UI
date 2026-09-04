import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("native terminal path commits a working-set checkpoint before product terminal publication", () => {
  const rust = read("src-tauri/src/lib.rs");
  const terminal = rust.indexOf("fn commit_native_run_terminal(");
  const checkpoint = rust.indexOf("finalize_native_working_set(request, &next_state)", terminal);
  const product = rust.indexOf("project_native_terminal(request, &next_state, execution)", terminal);
  const event = rust.indexOf("record_native_event(", product);
  assert.ok(checkpoint > terminal);
  assert.ok(product > checkpoint);
  assert.ok(event > product);
  assert.match(rust, /content and manifest must be immutable before this pointer rename grants authority/u);
  assert.match(rust, /validation above must stay before reset/u);
});

test("renderer exposes bounded checkpoint evidence without adding path or restore authority", () => {
  const client = read("src/core/native-async-run-client.mjs");
  const bridge = read("src/core/tauri-native-async-run-client.ts");
  const hook = read("src/app-state/useNativeAsyncRunLifecycle.ts");
  const panel = read("src/workspaces/NativeAsyncRunLifecyclePanel.tsx");
  assert.match(client, /normalizeWorkingSetCheckpoint/u);
  assert.match(hook, /workingSetCheckpoint/u);
  assert.match(panel, /Working-set checkpoint/u);
  assert.match(panel, /not encrypted at rest/u);
  assert.doesNotMatch(`${client}\n${bridge}\n${hook}\n${panel}`, /selectWorkingSetPath|restorePath|checkpointRootInput|agentique_runner_restore_checkpoint/u);
});
