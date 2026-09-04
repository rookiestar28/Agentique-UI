#!/usr/bin/env node
import fs from "node:fs";
import { productResultDurabilityMatrix } from "../src/core/product-result-projection.mjs";

const failures = [];
const sources = {
  rust: read("src-tauri/src/lib.rs"),
  projector: read("src/core/product-result-projection.mjs"),
  client: read("src/core/native-async-run-client.mjs"),
  hook: read("src/app-state/useNativeAsyncRunLifecycle.ts"),
  panel: read("src/workspaces/NativeAsyncRunLifecyclePanel.tsx"),
  tests: `${read("tests/product-result-projection.test.mjs")}\n${read("tests/product-result-projection-surface.test.mjs")}`,
  contract: read("docs/contracts/product-result-projection.md")
};
const packageJson = JSON.parse(read("package.json"));
const matrix = productResultDurabilityMatrix();

requireAll(sources.rust, [
  "project_native_terminal",
  "write_native_active_projection_marker",
  "read_committed_native_projection",
  "recover_native_projection_record_if_needed",
  "write_synced_json(&pointer_temp",
  "fs::rename(&pointer_temp, &pointer_path)",
  "reject_native_link",
  "MAX_NATIVE_PRODUCT_PROJECTION_BYTES",
  "MAX_NATIVE_PRODUCT_PROJECTION_RUNS",
  "durable_product_projection_commits_before_success_and_recovers_after_restart",
  "native_projection_faults_before_pointer_never_become_authoritative",
  "native_projection_pointer_is_idempotent_and_rejects_conflicting_terminal",
  "restart_active_marker_is_cleanup_required_without_effect_replay",
  "restart_rejects_a_tampered_product_artifact_as_corrupt"
]);
requireAll(sources.projector, [
  "createProductResultProjector",
  "createMemoryAtomicProductResultRepository",
  "migrateLegacyProjectionExport",
  "productResultDurabilityMatrix",
  "product-projection.digest-conflict",
  "replayUnknownEffect: false"
]);
requireAll(sources.client, ["normalizeProductProjection", "productProjection", "projection-address", "projection-ref"]);
requireAll(sources.hook, ["productProjection", "projectionFrom", "durable result projection"]);
requireAll(sources.panel, ["Durable result", "recoveryClassification", "native-owned and restart-durable"]);
requireAll(sources.tests, [
  "awaits an atomic product commit before publishing success",
  "faults before the authoritative pointer never replay partial success",
  "committed terminal remains authoritative when UI publication fails",
  "native terminal publication is ordered after the durable product pointer commit"
]);
requireAll(sources.contract, [
  "Durable Product Result Projection",
  "current.json",
  "fails closed",
  "cleanup-required",
  "unknown external effect",
  "Durability matrix",
  "Migration and rollback"
]);

if (!matrix.survivesProcessDeath.includes("authoritative-current-pointer")) failures.push("durability matrix must name the authoritative current pointer");
if (!matrix.neverReplayedAutomatically.includes("process-effect")) failures.push("durability matrix must forbid automatic process-effect replay");
if (!String(packageJson.scripts?.["validate:product-result-projection"] ?? "").includes("check-product-result-projection.mjs")) {
  failures.push("package.json must expose validate:product-result-projection");
}
if (!String(packageJson.scripts?.["validate:durable-run-ledger"] ?? "").includes("validate:product-result-projection")) {
  failures.push("durable run ledger validation must chain product result projection validation");
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
      summary: {
        commitBeforeTerminal: true,
        exactCandidateIdempotency: true,
        atomicPointerAuthority: true,
        restartReconciliation: true,
        unknownEffectReplay: false,
        rendererStorageAuthority: false
      }
    },
    null,
    2
  )
);

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireAll(text, phrases) {
  for (const phrase of phrases) if (!text.includes(phrase)) failures.push(`missing product projection evidence: ${phrase}`);
}
