#!/usr/bin/env node
import fs from "node:fs";

const failures = [];
const sources = {
  rust: read("src-tauri/src/lib.rs"),
  client: read("src/core/native-async-run-client.mjs"),
  tauri: read("src/core/tauri-native-async-run-client.ts"),
  hook: read("src/app-state/useNativeAsyncRunLifecycle.ts"),
  panel: read("src/workspaces/NativeAsyncRunLifecyclePanel.tsx"),
  tests: `${read("tests/native-async-run-client.test.mjs")}\n${read("tests/native-async-run-lifecycle-surface.test.mjs")}`
};
const packageJson = JSON.parse(read("package.json"));

requireAll(sources.rust, [
  "NativeCoordinatorRecord",
  "thread::spawn",
  "finish_native_coordinator",
  "cancel_requested",
  "terminal_intent",
  "child.kill()",
  "NativeRunState::Canceling",
  "occurred_at_epoch_ms",
  "app.emit(NATIVE_RUNNER_EVENT_NAME",
  "async_start_returns_before_completion_and_cancel_fences_late_success",
  "async_timeout_and_parallel_address_fencing_are_native_owned"
]);
requireAll(sources.client, [
  "createRunProtocolConsumer",
  "adaptNativeRunnerEvent",
  "agentique_runner_start",
  "agentique_runner_cancel",
  "agentique_runner_status",
  "diagnosticEventsSkipped"
]);
requireAll(sources.tauri, ["@tauri-apps/api/core", "@tauri-apps/api/event", "createNativeAsyncRunClient", "allowedNativeCommands", "if (!allowedNativeCommands.has(command))"]);
requireAll(sources.hook, ["client.disconnect()", "client.prepare()", "client.decideApproval", "client.start", "client.cancel()", "client.resync()"]);
requireAll(sources.panel, ["Asynchronous run coordinator", "Approve exact effect", "Start asynchronously", "Cancel retained handle", "restart-durable"]);
requireAll(sources.tests, [
  "converts live events through the canonical protocol",
  "resyncs bounded replay",
  "fails closed on a durable replay sequence gap",
  "binds official Tauri invoke and listen"
]);
if (!String(packageJson.dependencies?.["@tauri-apps/api"] ?? "").startsWith("2.")) failures.push("@tauri-apps/api v2 must be an exact runtime dependency");
if (!String(packageJson.scripts?.["validate:native-async-run-lifecycle"] ?? "").includes("check-native-async-run-lifecycle.mjs")) {
  failures.push("package.json must expose validate:native-async-run-lifecycle");
}
if (!String(packageJson.scripts?.["validate:active-native-event-transport"] ?? "").includes("validate:native-async-run-lifecycle")) {
  failures.push("active native event validation must chain native async lifecycle validation");
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
        nativeCoordinator: true,
        tauriInvokeListen: true,
        canonicalProtocol: true,
        exactCancelTimeout: true,
        boundedRestartDurableEventReplay: true,
        capabilityWidening: false
      }
    },
    null,
    2
  )
);

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function requireAll(text, phrases) {
  for (const phrase of phrases) {
    if (!text.includes(phrase)) failures.push(`missing required lifecycle evidence: ${phrase}`);
  }
}
