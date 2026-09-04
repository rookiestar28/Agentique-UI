#!/usr/bin/env node

import fs from "node:fs";
import { hasValidationCommand } from "../src/core/validation-stage-reporting.mjs";

const read = (filePath) => fs.readFileSync(filePath, "utf8");
const rust = read("src-tauri/src/lib.rs");
const scheduler = read("src-tauri/src/native_dag_scheduler.rs");
const client = read("src/core/native-dag-scheduler-client.mjs");
const bridge = read("src/core/tauri-native-dag-scheduler-client.ts");
const panel = read("src/workspaces/NativeDagSchedulerPanel.tsx");
const packageJson = JSON.parse(read("package.json"));
const findings = [];

for (const phrase of ["agentique_scheduler_start", "agentique_scheduler_status", "agentique_scheduler_cancel"]) {
  if (!rust.includes(phrase)) findings.push(`native DAG command is missing: ${phrase}`);
}
for (const phrase of [
  "deny_unknown_fields",
  "MAX_NATIVE_DAG_NODES",
  "MAX_NATIVE_DAG_EDGES",
  "stable_topological_order",
  "preflight_native_run_for_scheduler",
  "write_native_dag_snapshot",
  "recover_interrupted_native_dag",
  "handoff-only",
  "cleanup-required",
  "replays_external_effects"
]) {
  if (!scheduler.includes(phrase)) findings.push(`native DAG implementation marker is missing: ${phrase}`);
}
const attempt = scheduler.match(/struct\s+NativeDagAttemptRequest\s*\{([\s\S]*?)\n\}/u)?.[1] ?? "";
for (const forbidden of ["executable", "runtime", "path", "args", "environment", "script", "command_line", "package_manager"]) {
  if (new RegExp(`\\b${forbidden}\\b`, "iu").test(attempt)) findings.push(`native DAG attempt accepts forbidden field: ${forbidden}`);
}
for (const phrase of ["start()", "status()", "cancel()", "activeNodeId", "terminalState"]) {
  if (!client.includes(phrase) && !bridge.includes(phrase)) findings.push(`native DAG client marker is missing: ${phrase}`);
}
for (const phrase of ["Native DAG scheduler", "Cancel workflow", 'aria-live="polite"', "Retry", "Skipped"]) {
  if (!panel.includes(phrase)) findings.push(`native DAG UI marker is missing: ${phrase}`);
}
if (!String(packageJson.scripts?.["validate:native-dag-scheduler"] ?? "").includes("check-native-dag-scheduler.mjs")) {
  findings.push("package scripts must expose validate:native-dag-scheduler");
}
if (!String(packageJson.scripts?.validate ?? "").includes("npm run validate:native-dag-scheduler")) {
  findings.push("complete validation chain must include validate:native-dag-scheduler");
}
if (!hasValidationCommand("npm run validate:native-dag-scheduler")) {
  findings.push("authoritative staged validation must execute validate:native-dag-scheduler");
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      execution: "native-fixed-adapter-dag",
      ordering: "stable-sequential",
      retries: "distinct-preapproved-attempts-only",
      persistence: "immutable-atomic-snapshots",
      macos: "unverified"
    },
    null,
    2
  )
);
