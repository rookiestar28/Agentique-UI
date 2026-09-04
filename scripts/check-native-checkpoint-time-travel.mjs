#!/usr/bin/env node
import fs from "node:fs";

import {
  checkpointTimeTravelBoundary,
  reviewCheckpointHistory,
  reviewTimeTravelPrepareReceipt,
  sampleCheckpointHistory,
  sampleTimeTravelPrepareReceipt
} from "../src/core/native-checkpoint-time-travel.mjs";
import { reviewNativeRunnerBoundary } from "../src/core/native-runner-boundary.mjs";

const failures = [];
const sourceAddress = Object.freeze({
  resourceId: "resource.validator",
  sessionId: "session.validator",
  runId: "run.validator-source"
});
const targetAddress = Object.freeze({
  resourceId: sourceAddress.resourceId,
  sessionId: sourceAddress.sessionId,
  runId: "run.validator-target"
});

try {
  const history = reviewCheckpointHistory(sampleCheckpointHistory(sourceAddress));
  const prepared = reviewTimeTravelPrepareReceipt(sampleTimeTravelPrepareReceipt({ sourceAddress, targetAddress }));
  const boundary = checkpointTimeTravelBoundary();
  const native = reviewNativeRunnerBoundary();
  const rust = fs.readFileSync("src-tauri/src/lib.rs", "utf8");
  const panel = fs.readFileSync("src/workspaces/NativeAsyncRunLifecyclePanel.tsx", "utf8");

  if (history.generationCount < 1 || history.generationCount > 8 || history.includesContent !== false) {
    failures.push("checkpoint history must remain bounded and content-free");
  }
  if (prepared.state !== "branch-ready" || prepared.requiresFreshApproval !== true || prepared.willSpawnProcess !== false || prepared.replaysExternalEffects !== false) {
    failures.push("time-travel preparation must remain non-executing and fresh-approval gated");
  }
  if (boundary.commands.length !== 2 || boundary.sourceImmutable !== true || boundary.rendererPathSelection !== false) {
    failures.push("checkpoint time-travel command and renderer boundary changed");
  }
  if (!native.ok || native.commands.allowed.length !== 16 || native.permissions.defaultCapabilityPermissions !== 2) {
    failures.push("native runner boundary must remain exactly 16 commands and two event permissions");
  }
  for (const marker of [
    "review_native_time_travel_source(&source_request)?",
    "load_validated_native_working_set_generation(",
    "fs::rename(&staging_root, &target_scope)",
    "persist_native_time_travel_cleanup_required(",
    "time-travel target is cleanup-required and cannot enter approval preparation",
    "revalidate_native_time_travel_target(&request, &approval_id)?"
  ]) {
    if (!rust.includes(marker)) failures.push(`native source is missing required guard: ${marker}`);
  }
  for (const phrase of ["Inspect checkpoint history", "Prepare non-executing branch", "fresh approval", "not encrypted at rest"]) {
    if (!panel.toLowerCase().includes(phrase.toLowerCase())) failures.push(`product surface is missing: ${phrase}`);
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        status: "passed",
        historyLimit: 8,
        nativeCommands: 16,
        tauriEventPermissions: 2,
        sourceImmutable: true,
        branchOnly: true,
        cleanupFailureNonAuthorizing: true,
        freshApprovalRequired: true,
        macosVerified: false
      },
      null,
      2
    )
  );
}
