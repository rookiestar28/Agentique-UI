import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("native terminal publication is ordered after the durable product pointer commit", () => {
  const rust = read("src-tauri/src/lib.rs");
  const commitIndex = rust.indexOf("let projection = project_native_terminal(request, &next_state, execution);");
  const eventIndex = rust.indexOf("record_native_event(", commitIndex);
  assert.ok(commitIndex >= 0, "native terminal path must call the product projector");
  assert.ok(eventIndex > commitIndex, "terminal event must be recorded only after projection returns");
  assert.match(rust, /write_synced_json\(&pointer_temp/u);
  assert.match(rust, /fs::rename\(&pointer_temp, &pointer_path\)/u);
  assert.match(rust, /write_native_active_projection_marker/u);
});

test("native and renderer surfaces expose bounded honest recovery without storage authority widening", () => {
  const rust = read("src-tauri/src/lib.rs");
  const client = read("src/core/native-async-run-client.mjs");
  const hook = read("src/app-state/useNativeAsyncRunLifecycle.ts");
  const panel = read("src/workspaces/NativeAsyncRunLifecyclePanel.tsx");

  for (const classification of ["completed", "cleanup-required", "partial", "corrupt", "unsupported"]) {
    assert.match(`${rust}\n${client}`, new RegExp(classification, "u"));
  }
  assert.match(rust, /MAX_NATIVE_PRODUCT_PROJECTION_BYTES/u);
  assert.match(rust, /MAX_NATIVE_PRODUCT_PROJECTION_RUNS/u);
  assert.match(rust, /app_data_dir/u);
  assert.match(rust, /replaysUnknownEffects/u);
  assert.match(client, /normalizeProductProjection/u);
  assert.match(client, /projection-address/u);
  assert.match(hook, /productProjection/u);
  assert.match(panel, /Durable result/u);
  assert.doesNotMatch(`${client}\n${hook}\n${panel}`, /selectProjectionPath|storageRootInput|replayUnknownEffect\s*:\s*true/u);
});
