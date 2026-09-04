import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("native boundary registers two non-executing checkpoint time-travel commands", () => {
  const rust = read("src-tauri/src/lib.rs");
  const boundary = read("src/core/native-runner-boundary.mjs");
  for (const command of ["agentique_runner_checkpoint_history", "agentique_runner_time_travel_prepare"]) {
    assert.match(rust, new RegExp(command, "u"));
    assert.match(boundary, new RegExp(command, "u"));
  }
  assert.match(rust, /NativeTimeTravelPrepareRequest/u);
  assert.match(rust, /deny_unknown_fields/u);
  assert.match(rust, /requires_fresh_approval:\s*true/u);
  assert.match(rust, /will_spawn_process:\s*false/u);
});

test("generation validation and source eligibility precede target publication", () => {
  const rust = read("src-tauri/src/lib.rs");
  const start = rust.indexOf("fn agentique_runner_time_travel_prepare(");
  const requestValidation = rust.indexOf("validate_native_time_travel_request(", start);
  const validate = rust.indexOf("load_validated_native_working_set_generation(", start);
  const eligible = rust.indexOf("review_native_time_travel_source(", start);
  const publish = rust.indexOf("fs::rename(&staging_root, &target_scope)", start);
  assert.ok(start > 0 && requestValidation > start && validate > start && eligible > start && publish > validate && publish > eligible);
  const validator = rust.slice(rust.indexOf("fn validate_native_time_travel_request("), rust.indexOf("fn native_time_travel_source_request("));
  assert.match(validator, /source_run_id\s*==\s*request\.target_run_id/u);
});

test("fresh approval binds lineage and start rechecks target generation before launch", () => {
  const rust = read("src-tauri/src/lib.rs");
  assert.match(rust, /time_travel_lineage/u);
  assert.match(rust, /target_generation_digest/u);
  assert.match(rust, /canonical_native_approval_digest/u);
  assert.match(rust, /revalidate_native_time_travel_target/u);
  const start = rust.indexOf("fn start_native_run(");
  const revalidate = rust.indexOf("revalidate_native_time_travel_target", start);
  const consume = rust.indexOf("consume_native_permission_grant", start);
  const launch = rust.indexOf("spawn_fixed_native_adapter", start);
  assert.ok(revalidate > start && consume > revalidate && launch > consume);
});

test("staging cleanup failure persists non-authorizing recovery evidence", () => {
  const rust = read("src-tauri/src/lib.rs");
  assert.match(rust, /agentique\.nativeTimeTravelCleanupRequired\.v1/u);
  assert.match(rust, /persist_native_time_travel_cleanup_required/u);
  assert.match(rust, /requires_manual_cleanup:\s*true/u);
  assert.match(rust, /will_spawn_process:\s*false/u);
  assert.match(rust, /replays_external_effects:\s*false/u);
  assert.match(rust, /time-travel target is cleanup-required and cannot enter approval preparation/u);
});

test("client and UI expose bounded history without raw content or automatic replay", () => {
  const client = read("src/core/native-checkpoint-time-travel.mjs");
  const bridge = read("src/core/tauri-native-async-run-client.ts");
  const hook = read("src/app-state/useNativeAsyncRunLifecycle.ts");
  const panel = read("src/workspaces/NativeAsyncRunLifecyclePanel.tsx");
  const combined = `${client}\n${bridge}\n${hook}\n${panel}`;
  for (const phrase of ["checkpointHistory", "prepareTimeTravel", "fresh approval", "branch-ready"]) assert.match(combined, new RegExp(phrase, "iu"));
  assert.doesNotMatch(combined, /checkpointContent|checkpointPathInput|restorePath|automaticReplay/u);
});
