import assert from "node:assert/strict";
import test from "node:test";

import { reviewNativeWasmSandbox, sampleNativeWasmSandbox } from "../src/core/native-wasm-sandbox.mjs";

test("fixed native WASM sandbox accepts the exact zero-ambient lane", () => {
  const result = reviewNativeWasmSandbox(sampleNativeWasmSandbox);

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.summary, {
    adapterId: "adapter.local-wasm",
    runtime: "wasm",
    moduleBytes: 36,
    moduleDigest: "32e9891ae7d3cedff10d21cea1ae3a989d4fb5424b89b9c2f93328535cf30af7",
    importCount: 0,
    exportSignature: "run:()->i32",
    fuelMetered: true,
    permissionCount: 1,
    deniedAmbientCapabilities: 11,
    nativeCommands: 16,
    tauriCapabilities: 2,
    windowsVerified: true,
    macosVerified: false
  });
});

test("module identity imports export and resource bounds fail closed", () => {
  const mutations = [
    (value) => (value.module.digest = "f".repeat(64)),
    (value) => value.module.imports.push("wasi_snapshot_preview1.fd_write"),
    (value) => (value.module.exportSignature = "run:(i32)->i32"),
    (value) => (value.module.bytes = 37),
    (value) => (value.resources.fuelMetered = false),
    (value) => (value.resources.fuelBudget = 0),
    (value) => (value.resources.memoryBytes = 0),
    (value) => (value.resources.moduleBytes = 0),
    (value) => (value.resources.stackBytes = 0),
    (value) => (value.runtime.engineLimits = "default"),
    (value) => (value.runtime.floatingPoint = true),
    (value) => value.runtime.features.push("wat"),
    (value) => (value.runtime.version = "latest")
  ];

  for (const mutate of mutations) {
    const candidate = structuredClone(sampleNativeWasmSandbox);
    mutate(candidate);
    assert.equal(reviewNativeWasmSandbox(candidate).ok, false);
  }
});

test("permissions requests and ambient authority cannot widen", () => {
  const mutations = [
    (value) => value.permissionCeiling.push("subprocess:fixed-adapter-only"),
    (value) => value.permissionCeiling.push("files:workspace-runs"),
    (value) => (value.ambient.network = "loopback"),
    (value) => (value.ambient.filesystem = "workspace"),
    (value) => (value.ambient.environment = "vault-only"),
    (value) => (value.ambient.clock = "deterministic"),
    (value) => (value.ambient.random = "seeded"),
    (value) => value.requestFields.push("modulePath"),
    (value) => (value.execution.callerSelectedModule = true),
    (value) => (value.execution.wasiLinked = true),
    (value) => (value.execution.hostImports = 1)
  ];

  for (const mutate of mutations) {
    const candidate = structuredClone(sampleNativeWasmSandbox);
    mutate(candidate);
    const review = reviewNativeWasmSandbox(candidate);
    assert.equal(review.ok, false);
    assert.ok(review.errors.length > 0);
  }
});

test("existing native command capability and platform claims remain exact", () => {
  const mutations = [
    (value) => value.nativeCommands.push("agentique_runner_execute_wasm"),
    (value) => value.tauriCapabilities.push("shell:allow-execute"),
    (value) => (value.platforms.macos.verified = true),
    (value) => (value.platforms.linux.claimed = true),
    (value) => (value.claims.genericWasm = true),
    (value) => (value.claims.releaseReady = true)
  ];

  for (const mutate of mutations) {
    const candidate = structuredClone(sampleNativeWasmSandbox);
    mutate(candidate);
    assert.equal(reviewNativeWasmSandbox(candidate).ok, false);
  }
});
