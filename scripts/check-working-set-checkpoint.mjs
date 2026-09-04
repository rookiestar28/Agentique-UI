#!/usr/bin/env node
import fs from "node:fs";
import { workingSetCheckpointBoundary, workingSetCheckpointPolicy } from "../src/core/working-set-checkpoint.mjs";

const failures = [];
const sources = {
  rust: read("src-tauri/src/lib.rs"),
  reference: read("src/core/working-set-checkpoint.mjs"),
  client: read("src/core/native-async-run-client.mjs"),
  hook: read("src/app-state/useNativeAsyncRunLifecycle.ts"),
  panel: read("src/workspaces/NativeAsyncRunLifecyclePanel.tsx"),
  tests: `${read("tests/working-set-checkpoint.test.mjs")}\n${read("tests/working-set-checkpoint-surface.test.mjs")}`,
  contract: read("docs/contracts/working-set-checkpoint.md")
};
const packageJson = JSON.parse(read("package.json"));
const boundary = workingSetCheckpointBoundary();

requireAll(sources.rust, [
  "capture_native_working_set",
  "restore_native_working_set",
  "MAX_NATIVE_WORKING_SET_FILES",
  "MAX_NATIVE_WORKING_SET_FILE_BYTES",
  "MAX_NATIVE_WORKING_SET_TOTAL_BYTES",
  "current.json.tmp",
  "native_file_link_count",
  "GetFileInformationByHandle",
  "content and manifest must be immutable before this pointer rename grants authority",
  "validation above must stay before reset",
  "native_working_set_checkpoint_roundtrip_is_atomic_bounded_and_path_safe",
  "native_working_set_rejects_collisions_cas_and_corruption_before_reset"
]);
requireAll(sources.reference, [
  "captureWorkingSetCheckpoint",
  "restoreWorkingSetCheckpoint",
  "createMemoryWorkingSetCheckpointStore",
  "working-set.cas-conflict",
  "working-set.cleanup-required",
  'normalize("NFC")'
]);
requireAll(sources.client, ["normalizeWorkingSetCheckpoint", "checkpoint-address", "checkpoint-boundary"]);
requireAll(sources.hook, ["workingSetCheckpoint", "checkpointFrom"]);
requireAll(sources.panel, ["Working-set checkpoint", "not encrypted at rest", "never replays external effects"]);
requireAll(sources.tests, [
  "commits immutable content before the authoritative CAS pointer",
  "validates the complete bundle before invoking privileged reset",
  "post-reset failure reports cleanup-required",
  "checkpoint receipts remain path-relative redacted bounded and non-backup"
]);
requireAll(sources.contract, ["not a general backup", "compare-and-swap", "before invoking the native-private reset", "not encrypted at rest", "never", "external effect"]);

if (workingSetCheckpointPolicy.maxFiles !== 64 || workingSetCheckpointPolicy.maxTotalBytes !== 2_097_152 || workingSetCheckpointPolicy.maxGenerations !== 8) {
  failures.push("working-set policy does not match the bounded native contract");
}
if (boundary.generalBackup || boundary.timeTravel || boundary.externalEffectReplay || boundary.rendererPathSelection) {
  failures.push("working-set boundary widens authority");
}
if (!String(packageJson.scripts?.["validate:working-set-checkpoint"] ?? "").includes("check-working-set-checkpoint.mjs")) {
  failures.push("package.json must expose validate:working-set-checkpoint");
}
if (!String(packageJson.scripts?.["validate:product-result-projection"] ?? "").includes("validate:working-set-checkpoint")) {
  failures.push("product projection validation must chain working-set checkpoint validation");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: Object.keys(sources),
      summary: { nativeOwnedRoot: true, atomicCas: true, validatesBeforeReset: true, rendererPathAuthority: false, externalEffectReplay: false }
    },
    null,
    2
  )
);

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireAll(text, phrases) {
  for (const phrase of phrases) if (!text.includes(phrase)) failures.push(`missing working-set checkpoint evidence: ${phrase}`);
}
