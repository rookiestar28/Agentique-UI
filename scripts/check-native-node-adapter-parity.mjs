#!/usr/bin/env node

import fs from "node:fs";
import { fixedNativeAdapterProfiles } from "../src/core/native-async-run-client.mjs";
import { reviewSupportedLocalClaimBoundary, supportedLocalClaimBoundary } from "../src/core/supported-local-claim-boundary.mjs";

const rust = read("src-tauri/src/lib.rs");
const nodeHelper = read("adapters/node/echo-adapter.mjs");
const panel = read("src/workspaces/NativeAsyncRunLifecyclePanel.tsx");
const contract = read("docs/contracts/node-adapter-runner.md");
const packageJson = JSON.parse(read("package.json"));
const findings = [];

for (const phrase of [
  'const NODE_ADAPTER_ID: &str = "adapter.local-node"',
  'const NODE_ADAPTER_PERMISSION_PROFILE_ID: &str = "permission.local-node.minimal"',
  "fn fixed_node_adapter_manifest()",
  "fn fixed_node_adapter_script_path()",
  "fn resolve_fixed_node_executable()",
  "fn spawn_fixed_native_adapter(",
  "fn complete_fixed_native_adapter(",
  "agentique.nativeAdapterExecutionReceipt.v1",
  "native_node_success_failure_and_evidence_parity",
  "native_node_cancel_timeout_descendant_cleanup_and_missing_runtime"
]) {
  if (!rust.includes(phrase)) findings.push(`native runner missing fixed Node parity marker: ${phrase}`);
}

for (const forbidden of [/Command::new\(["'](?:npm|npx|yarn|pnpm|cmd|powershell|sh|bash)["']\)/u, /\.arg\(["']-e["']\)/u, /\.arg\(["']--eval["']\)/u]) {
  if (forbidden.test(rust)) findings.push("native fixed-adapter path contains forbidden launch authority");
}

for (const mode of ["invalid-json", "exit-failure", "descendant-sleep", "descendant-exit"]) {
  if (!nodeHelper.includes(mode)) findings.push(`fixed Node helper missing deterministic mode: ${mode}`);
}

if (fixedNativeAdapterProfiles["adapter.local-node"] !== "permission.local-node.minimal") {
  findings.push("native client does not bind fixed Node to its exact permission profile");
}
if (!panel.includes('value="adapter.local-node"') || !panel.includes('disabled={state.status !== "idle"}')) {
  findings.push("native UI does not expose a fixed, pre-prepare Node selection");
}

const claimReview = reviewSupportedLocalClaimBoundary(supportedLocalClaimBoundary);
if (!claimReview.ok || !claimReview.supportedExecutionLanes.includes("fixed-native-node")) {
  findings.push("supported-local policy does not bind the verified fixed Node lane");
}
for (const phrase of ["native process-tree", "package managers", "lifecycle scripts", "inline scripts", "Windows", "Linux"]) {
  if (!contract.toLowerCase().includes(phrase.toLowerCase())) {
    findings.push(`Node native contract missing boundary phrase: ${phrase}`);
  }
}

const command = String(packageJson.scripts?.["validate:native-node-adapter-parity"] ?? "");
if (!command.includes("check-native-node-adapter-parity.mjs")) {
  findings.push("package scripts must define the native Node parity gate");
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      adapterId: "adapter.local-node",
      permissionProfileId: fixedNativeAdapterProfiles["adapter.local-node"],
      verifiedPlatforms: claimReview.verifiedPlatforms,
      macos: "unverified",
      forbiddenAuthority: ["package-manager", "lifecycle-script", "inline-script", "generic-subprocess"]
    },
    null,
    2
  )
);

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}
