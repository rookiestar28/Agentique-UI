import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("native source owns one fixed rootless-only container adapter", () => {
  const lib = read("src-tauri/src/lib.rs");
  const runtime = read("src-tauri/src/native_rootless_container.rs");

  assert.match(lib, /mod native_rootless_container;/u);
  assert.match(runtime, /adapter\.local-container/u);
  assert.match(runtime, /permission\.local-container\.rootless/u);
  assert.match(runtime, /\/usr\/bin\/podman/u);
  assert.match(runtime, /\/usr\/bin\/docker/u);
  assert.match(runtime, /name=rootless/u);
  assert.match(runtime, /--pull=never/u);
  assert.match(runtime, /--network=none/u);
  assert.match(runtime, /--read-only/u);
  assert.match(runtime, /--cap-drop=ALL/u);
  assert.match(runtime, /--security-opt=no-new-privileges/u);
  assert.match(runtime, /--user=65532:65532/u);
  assert.match(runtime, /--memory=64m/u);
  assert.match(runtime, /--pids-limit=32/u);
  assert.match(runtime, /env_clear\(\)/u);
  assert.match(runtime, /read_bounded_pipe/u);
  assert.match(runtime, /let run_result = run_bounded_command/u);
  assert.match(runtime, /let cleanup = cleanup_exact_container/u);
  assert.doesNotMatch(runtime, /Command::new\([^)]*(?:request|input|env)/u);
});

test("renderer selects only the fixed adapter id and exposes no container controls", () => {
  const jsClient = read("src/core/native-async-run-client.mjs");
  const typedClient = read("src/core/tauri-native-async-run-client.ts");
  const lifecyclePanel = read("src/workspaces/NativeAsyncRunLifecyclePanel.tsx");

  assert.match(jsClient, /"adapter\.local-container": "permission\.local-container\.rootless"/u);
  assert.match(typedClient, /"adapter\.local-container"/u);
  assert.match(lifecyclePanel, /value="adapter\.local-container"/u);
  assert.match(lifecyclePanel, /Container \(fixed rootless sandbox\)/u);
  assert.match(lifecyclePanel, /data-container-runtime-status="host-proof-required"/u);
  assert.match(lifecyclePanel, /Windows\s+execution is unavailable/u);
  assert.doesNotMatch(lifecyclePanel, /imageInput|runtimePath|socketPath|containerArgs|mountsInput|environmentInput/u);
});

test("container evidence joins the accepted run-folder and product projection paths", () => {
  const lib = read("src-tauri/src/lib.rs");

  assert.match(lib, /outputs\/container-result\.json/u);
  assert.match(lib, /artifacts\/container-result\.json/u);
  assert.match(lib, /native-rootless-container-runner/u);
  assert.match(lib, /agentique\.containerAdapterResult\.v1/u);
  assert.match(lib, /agentique\.nativeContainerRun\.v1/u);
});

test("native command capability and request surfaces remain exact", () => {
  const lib = read("src-tauri/src/lib.rs");
  const capability = JSON.parse(read("src-tauri/capabilities/default.json"));
  const commandCount = (lib.match(/#\[tauri::command\]/gu) ?? []).length;
  const request = lib.match(/struct RunnerCommandRequest \{(?<body>[\s\S]*?)\n\}/u)?.groups?.body ?? "";

  assert.equal(commandCount, 16);
  assert.deepEqual(capability.permissions, ["core:event:allow-listen", "core:event:allow-unlisten"]);
  assert.doesNotMatch(request, /runtime|socket|image|entrypoint|argument|environment|mount|network|resource_limit|capabilit/u);
});
