#!/usr/bin/env node
import fs from "node:fs";
import { assertExternalHandoffNonExecution, createExternalHandoffDescriptors } from "../src/core/external-handoff-descriptors.mjs";
import { createExternalBridgeReview, sampleExternalBridgeRequest } from "../src/core/external-runtime-bridge-guard.mjs";
import { assertExternalRuntimeDescriptorSafe, createExternalRuntimeHandoff } from "../src/core/external-runtime-adapter.mjs";
import { readNativeRunnerBoundaryInputs, reviewNativeRunnerBoundary } from "../src/core/native-runner-boundary.mjs";
import { sampleWorkflowIr } from "../src/core/workflow-ir.mjs";

const failures = [];
const handoff = createExternalHandoffDescriptors();
const runtime = createExternalRuntimeHandoff(sampleWorkflowIr, "n8n", { createdAt: "2026-06-11T00:20:00.000Z" });
const bridge = createExternalBridgeReview(sampleExternalBridgeRequest);
const nativeReview = reviewNativeRunnerBoundary(readNativeRunnerBoundaryInputs());
const ui = fs.readFileSync("src/workspaces/ExternalHandoffPanel.tsx", "utf8");
const tests = fs.readFileSync("tests/external-runtime-handoff-non-execution.test.mjs", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

try {
  assertExternalHandoffNonExecution(handoff);
  assertExternalRuntimeDescriptorSafe(runtime);
} catch (error) {
  failures.push(error.message);
}

if (handoff.executionClass !== "external-user-owned-handoff" || handoff.descriptors.some((row) => row.completion.externalExecutionStatus !== "not-executed")) {
  failures.push("handoff descriptors must use the exact non-execution class and status");
}
if (!bridge.ok || bridge.status !== "preflight-ready" || bridge.approvedForLaunch !== false || bridge.launchAuthorized !== false) {
  failures.push("bridge review must be preflight-only and must not grant launch authority");
}
if (!nativeReview.ok || nativeReview.commands.allowed.length !== 16 || nativeReview.commands.allowed.some((command) => /external|bridge|handoff/iu.test(command))) {
  failures.push("native command allowlist must remain exactly 16 commands and external-free");
}
if (nativeReview.permissions.defaultCapabilityPermissions !== 2) {
  failures.push("default native capability must remain event-listen-only");
}

for (const phrase of ["Not executed by Agentique UI", "User-owned destination", "Separate bridge acceptance required"]) {
  if (!ui.includes(phrase)) failures.push(`external handoff UI missing required phrase: ${phrase}`);
}
if (/onClick|invoke\(/u.test(ui)) failures.push("external handoff UI must not expose execution controls");
for (const phrase of ["contradictory and widened non-execution receipts fail closed", "native command and capability boundaries remain unchanged and external-free"]) {
  if (!tests.includes(phrase)) failures.push(`external handoff tests missing required case: ${phrase}`);
}
if (!String(packageJson.scripts?.["validate:external-runtime-handoff-non-execution"] ?? "").includes("check-external-runtime-handoff-non-execution.mjs")) {
  failures.push("package scripts must define validate:external-runtime-handoff-non-execution");
}
if (!String(packageJson.scripts?.validate ?? "").includes("run-validate-staged.mjs")) {
  failures.push("validate must remain routed through the staged validation runner");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      classification: handoff.executionClass,
      descriptors: handoff.descriptors.length,
      bridgeStatus: bridge.status,
      nativeCommands: nativeReview.commands.allowed.length,
      nativePermissions: nativeReview.permissions.defaultCapabilityPermissions
    },
    null,
    2
  )
);
