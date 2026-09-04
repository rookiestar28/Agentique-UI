import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("desktop run workspace binds official Tauri invoke and listen to canonical lifecycle events", () => {
  const adapter = fs.readFileSync("src/core/tauri-native-async-run-client.ts", "utf8");
  const hook = fs.readFileSync("src/app-state/useNativeAsyncRunLifecycle.ts", "utf8");
  const panel = fs.readFileSync("src/workspaces/NativeAsyncRunLifecyclePanel.tsx", "utf8");
  const workspace = fs.readFileSync("src/workspaces/RunWorkspace.tsx", "utf8");

  assert.match(adapter, /@tauri-apps\/api\/core/u);
  assert.match(adapter, /@tauri-apps\/api\/event/u);
  assert.match(adapter, /createNativeAsyncRunClient/u);
  assert.match(adapter, /NativeProductProjectionReceipt/u);
  assert.match(adapter, /allowedNativeCommands/u);
  assert.match(adapter, /if \(!allowedNativeCommands\.has\(command\)\)/u);
  assert.match(hook, /client\.disconnect\(\)/u);
  assert.match(hook, /client\.prepare\(\)/u);
  assert.match(hook, /client\.decideApproval/u);
  assert.match(hook, /client\.start/u);
  assert.match(hook, /client\.cancel\(\)/u);
  assert.match(hook, /client\.revoke/u);
  assert.match(hook, /client\.resync\(\)/u);
  assert.match(hook, /productProjection/u);
  assert.match(panel, /Start asynchronously/u);
  assert.match(panel, /Cancel retained handle/u);
  assert.match(panel, /Revoke exact grant/u);
  assert.match(panel, /restart-durable/u);
  assert.match(panel, /never replays\s+an external effect/u);
  assert.match(panel, /Durable result/u);
  assert.match(panel, /Fixed native adapter/u);
  assert.match(panel, /adapter\.local-node/u);
  assert.match(panel, /disabled=\{state\.status !== "idle"\}/u);
  assert.match(panel, /recoveryClassification/u);
  assert.match(panel, /No PID, executable path, arguments, environment values/u);
  assert.match(workspace, /NativeAsyncRunLifecyclePanel/u);
});

test("native lifecycle controls preserve explicit approval ordering", () => {
  const panel = fs.readFileSync("src/workspaces/NativeAsyncRunLifecyclePanel.tsx", "utf8");
  assert.match(panel, /canPrepare/u);
  assert.match(panel, /canDecide/u);
  assert.match(panel, /canStart/u);
  assert.match(panel, /canRevoke/u);
  assert.match(panel, /state\.permissionGrantId/u);
  assert.match(panel, /Approve exact effect/u);
  assert.match(panel, /Deny/u);
});
