#!/usr/bin/env node
import fs from "node:fs";
import { createAgentProtocolBridgeReview } from "../src/core/agent-protocol-bridge.mjs";
import { readNativeRunnerBoundaryInputs, reviewNativeRunnerBoundary } from "../src/core/native-runner-boundary.mjs";

const failures = [];
const review = createAgentProtocolBridgeReview();
const nativeReview = reviewNativeRunnerBoundary(readNativeRunnerBoundaryInputs());
const moduleText = fs.readFileSync("src/core/agent-protocol-bridge.mjs", "utf8");
const panelText = fs.readFileSync("src/workspaces/AgentProtocolBridgePanel.tsx", "utf8");
const contractText = fs.readFileSync("docs/contracts/agent-protocol-bridge.md", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

if (!review.ok || review.operations.length !== 8 || review.snapshot.status !== "cleaned") {
  failures.push("agent protocol bridge lifecycle review must pass all eight operations");
}
if (review.checks.capabilities !== 5 || review.checks.deniedAuthority !== 11) {
  failures.push("agent bridge capability and denied-authority sets must remain exact");
}
if (review.checks.handoffPackageAdopted !== false || review.checks.dynamicExtensionLoading !== false) {
  failures.push("agent bridge must not adopt a package bridge or dynamic extension loader");
}
if (!nativeReview.ok || nativeReview.commands.allowed.length !== 16) {
  failures.push("native command allowlist must remain exactly 16 fixed commands");
}
if (nativeReview.permissions.defaultCapabilityPermissions !== 2) {
  failures.push("default native capability must remain exactly two event permissions");
}
if (Object.keys(packageJson.dependencies ?? {}).some((name) => name.startsWith("@heddleagent/"))) {
  failures.push("Heddle runtime and run-client dependencies must remain absent");
}
for (const phrase of ["Signed extension", "Capability scope", "Explicit permission", "Host-owned dispatch", "Generic authority denied", "No package bridge adopted"]) {
  if (!panelText.includes(phrase)) failures.push(`agent protocol bridge UI missing required phrase: ${phrase}`);
}
for (const phrase of [
  "initialize",
  "permission",
  "prepare",
  "start",
  "cancel",
  "event",
  "artifact",
  "cleanup",
  "exactly 16",
  "two event permissions",
  "macOS remains unverified"
]) {
  if (!contractText.includes(phrase)) failures.push(`agent protocol bridge contract missing required phrase: ${phrase}`);
}
const effectPattern = /node:child_process|child_process|node:fs|writeFile|appendFile|createWriteStream|spawn\(|execFile\(|exec\(|fetch\(|WebSocket\(|invoke\(|import\(/u;
if (effectPattern.test(moduleText) || effectPattern.test(panelText)) {
  failures.push("agent protocol bridge module and UI must contain no process, file-write, network, native invoke, or dynamic-load API");
}
if (/onClick=/u.test(panelText)) failures.push("agent protocol bridge panel must remain evidence-only");
if (!String(packageJson.scripts?.["validate:agent-protocol-bridge"] ?? "").includes("check-agent-protocol-bridge.mjs")) {
  failures.push("package scripts must define validate:agent-protocol-bridge");
}
if (!String(packageJson.scripts?.validate ?? "").includes("validate:agent-protocol-bridge")) {
  failures.push("authoritative staged validation must include the agent protocol bridge gate");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      operations: review.operations.length,
      acceptedMessages: review.checks.acceptedMessages,
      capabilities: review.checks.capabilities,
      deniedAuthority: review.checks.deniedAuthority,
      nativeCommands: nativeReview.commands.allowed.length,
      nativePermissions: nativeReview.permissions.defaultCapabilityPermissions,
      packageBridgeAdopted: review.checks.handoffPackageAdopted
    },
    null,
    2
  )
);
