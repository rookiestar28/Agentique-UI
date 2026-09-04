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

for (const phrase of ["agentique_scheduler_resume", "preflight_native_interrupt_pending", "preflight_native_interrupt_decision"]) {
  if (!rust.includes(phrase)) findings.push(`native approval interrupt owner is missing: ${phrase}`);
}
for (const phrase of [
  "approval-interrupt",
  "paused-approval",
  "pending-approval",
  "capture_native_working_set",
  "checkpoint_generation_digest",
  "compare_exchange",
  "cleanup-required"
]) {
  if (!scheduler.includes(phrase)) findings.push(`native approval interrupt implementation marker is missing: ${phrase}`);
}
const resume = scheduler.match(/struct\s+NativeDagResumeRequest[\s\S]*?\n\}/u)?.[0] ?? "";
for (const forbidden of ["executable", "path", "args", "environment", "script", "package_manager", "payload"]) {
  if (new RegExp(`\\b${forbidden}\\b`, "iu").test(resume)) findings.push(`native resume accepts forbidden field: ${forbidden}`);
}
for (const phrase of ["resume(", "agentique_scheduler_resume", "checkpointGenerationDigest", "decisionId"]) {
  if (!client.includes(phrase) && !bridge.includes(phrase)) findings.push(`native approval client marker is missing: ${phrase}`);
}
for (const phrase of ["Approval interrupt", "Resume approved step", "Record denial", "Checkpoint", "Decision identity", 'aria-live="polite"']) {
  if (!panel.includes(phrase)) findings.push(`native approval UI marker is missing: ${phrase}`);
}
if (!String(packageJson.scripts?.["validate:native-approval-interrupt"] ?? "").includes("check-native-approval-interrupt.mjs")) {
  findings.push("package scripts must expose validate:native-approval-interrupt");
}
if (!String(packageJson.scripts?.validate ?? "").includes("npm run validate:native-approval-interrupt")) {
  findings.push("complete validation chain must include validate:native-approval-interrupt");
}
if (!hasValidationCommand("npm run validate:native-approval-interrupt")) {
  findings.push("authoritative staged validation must execute validate:native-approval-interrupt");
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", interrupt: "checkpoint-bound", resume: "explicit-native-decision", replay: "blocked", macos: "unverified" }, null, 2));
