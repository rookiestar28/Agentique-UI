import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("native source owns one exact in-process fuel-metered WASM adapter", () => {
  const lib = read("src-tauri/src/lib.rs");
  const runtime = read("src-tauri/src/native_wasm_sandbox.rs");
  const cargo = read("src-tauri/Cargo.toml");

  assert.match(lib, /mod native_wasm_sandbox;/u);
  assert.match(runtime, /adapter\.local-wasm/u);
  assert.match(runtime, /permission\.local-wasm\.sandboxed/u);
  assert.match(lib, /start_native_wasm_worker/u);
  assert.match(lib, /process_tree_supervisor: Option<Arc<NativeProcessTreeSupervisor>>/u);
  assert.match(lib, /outputs\/wasm-result\.json/u);
  assert.match(lib, /artifacts\/wasm-result\.json/u);
  assert.match(lib, /native-wasm-runner/u);
  assert.match(runtime, /32e9891ae7d3cedff10d21cea1ae3a989d4fb5424b89b9c2f93328535cf30af7/u);
  assert.match(runtime, /consume_fuel\(true\)/u);
  assert.match(runtime, /set_fuel/u);
  assert.match(runtime, /module\.imports\(\)/u);
  assert.match(runtime, /get_typed_func::<\(\), i32>/u);
  assert.doesNotMatch(runtime, /std::process::Command|TcpStream|UdpSocket|std::env::var|wasmi_wasi/u);
  assert.match(cargo, /wasmi\s*=\s*\{\s*version\s*=\s*"=2\.0\.0"/u);
  assert.match(cargo, /default-features\s*=\s*false/u);
  assert.match(cargo, /"prefer-btree-collections"/u);
  assert.doesNotMatch(cargo, /wasmi[_-]wasi|"wat"|"memory64"/u);
});

test("renderer exposes only the fixed adapter selector and static sandbox evidence", () => {
  const jsClient = read("src/core/native-async-run-client.mjs");
  const typedClient = read("src/core/tauri-native-async-run-client.ts");
  const lifecyclePanel = read("src/workspaces/NativeAsyncRunLifecyclePanel.tsx");
  const runWorkspace = read("src/workspaces/RunWorkspace.tsx");

  assert.match(jsClient, /"adapter\.local-wasm": "permission\.local-wasm\.sandboxed"/u);
  assert.match(typedClient, /"adapter\.local-wasm"/u);
  assert.match(lifecyclePanel, /value="adapter\.local-wasm"/u);
  assert.match(lifecyclePanel, /WASM \(fixed native sandbox\)/u);
  assert.match(runWorkspace, /Native WASM sandbox/u);
  assert.match(runWorkspace, /Zero imports/u);
  assert.doesNotMatch(lifecyclePanel, /modulePath|moduleUrl|moduleBytes|exportName|fuelBudget|memoryBytes/u);
});

test("command and capability surfaces do not widen", () => {
  const lib = read("src-tauri/src/lib.rs");
  const capability = JSON.parse(read("src-tauri/capabilities/default.json"));
  const commandCount = (lib.match(/#\[tauri::command\]/gu) ?? []).length;

  assert.equal(commandCount, 16);
  assert.deepEqual(capability.permissions, ["core:event:allow-listen", "core:event:allow-unlisten"]);
});

test("contract and direct validator preserve bounded claims", () => {
  const contract = read("docs/contracts/native-wasm-sandbox.md");
  const packageJson = JSON.parse(read("package.json"));

  assert.match(contract, /Windows-verified/u);
  assert.match(contract, /macOS remains\s+unverified and unsupported/u);
  assert.match(contract, /Caller-selected modules are\s+not supported/u);
  assert.match(contract, /no WASI or host\s+imports/u);
  assert.match(packageJson.scripts["validate:native-wasm-sandbox"], /^node scripts\/check-native-wasm-sandbox\.mjs/u);
});
