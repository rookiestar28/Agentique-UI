import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWasiCapabilitiesSafe,
  createWasmWasiSandboxReview,
  reviewWasmWasiSandboxGate,
  sampleWasmWasiPermissionStore,
  sampleWasmWasiSandboxRequest
} from "../src/core/wasm-wasi-sandbox-gate.mjs";
import { revokePermissionGrant } from "../src/core/permission-grants.mjs";

test("complete WASM WASI sandbox contract is preflight-ready but execution stays disabled", () => {
  const review = createWasmWasiSandboxReview(sampleWasmWasiSandboxRequest);

  assert.equal(review.ok, true);
  assert.equal(review.status, "preflight-ready");
  assert.equal(review.enabledForExecution, false);
  assert.equal(review.executionDecision, "disabled-pending-runtime-evidence");
  assert.equal(review.adapter.runtime, "wasm-wasi");
  assert.equal(review.limits.memoryBytes, 67108864);
  assert.equal(review.limits.instructionMetering.mode, "fuel");
  assert.equal(review.wasi.network.mode, "loopback-only");
  assert.equal(review.permissions.status, "allowed");
  assert.equal(review.artifacts.cleanupStatus, "ready");
});

test("execution cannot be enabled by the sandbox gate item", () => {
  const review = createWasmWasiSandboxReview({
    ...sampleWasmWasiSandboxRequest,
    lane: {
      status: "enabled",
      enabledForExecution: true,
      deterministicPreflight: true
    }
  });

  assert.equal(review.ok, false);
  assert.equal(review.enabledForExecution, false);
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.lane-status"));
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.execution-disabled"));
});

test("memory time stream artifact and instruction metering limits are mandatory", () => {
  const review = createWasmWasiSandboxReview({
    ...sampleWasmWasiSandboxRequest,
    limits: {
      memoryBytes: 0,
      maxExecutionMs: 120000,
      instructionMetering: { mode: "wall-clock-only", refill: true },
      maxStdoutBytes: 0,
      maxStderrBytes: 999999999,
      maxArtifacts: 0,
      maxArtifactBytes: 999999999
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.memory-limit"));
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.time-limit"));
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.instruction-metering"));
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.stream-limit"));
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.artifact-limit"));
});

test("broad host filesystem access and traversal are rejected", () => {
  for (const path of [["C", ":\\host\\module.wasm"].join(""), "../module.wasm", "/home/user/module.wasm", "workspace:../module.wasm"]) {
    const review = createWasmWasiSandboxReview({
      ...sampleWasmWasiSandboxRequest,
      wasi: {
        ...sampleWasmWasiSandboxRequest.wasi,
        files: [{ access: "read", path }]
      }
    });
    assert.equal(review.ok, false);
    assert.ok(review.errors.some((error) => error.code === "wasm-wasi.file-scope"));
  }
});

test("public network access and ambient environment are rejected", () => {
  const review = createWasmWasiSandboxReview({
    ...sampleWasmWasiSandboxRequest,
    wasi: {
      ...sampleWasmWasiSandboxRequest.wasi,
      network: { mode: "public", allow: [{ protocol: "https", host: "example.com", port: 443 }] },
      environment: { mode: "ambient", variables: ["PATH", "bearer unsafeToken1234567890"] }
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.network-mode"));
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.network-loopback"));
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.environment-mode"));
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.environment-vault" || error.code === "vault.inline-secret"));
});

test("host execution browser data clocks and random sources fail closed", () => {
  const review = createWasmWasiSandboxReview({
    ...sampleWasmWasiSandboxRequest,
    wasi: {
      ...sampleWasmWasiSandboxRequest.wasi,
      clocks: "host",
      random: "host",
      subprocess: "allow",
      shell: "allow",
      browserData: "allow"
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.clock"));
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.random"));
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.host-execution"));
});

test("permission preflight must pass before WASM sandbox readiness", () => {
  const revoked = revokePermissionGrant(sampleWasmWasiPermissionStore, "grant.wasm.network", { now: "2026-06-12T00:00:00.000Z" });
  const review = createWasmWasiSandboxReview({
    ...sampleWasmWasiSandboxRequest,
    permissionStore: revoked.store
  });

  assert.equal(review.ok, false);
  assert.equal(review.permissions.status, "blocked");
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.permission-preflight"));
});

test("WASM execution production and universal runtime claims are rejected", () => {
  const review = createWasmWasiSandboxReview({
    ...sampleWasmWasiSandboxRequest,
    claims: {
      wasmExecutionAvailable: true,
      universalWasmRuntime: true,
      productionDesktopRuntime: true,
      installerUpdater: true,
      automaticExecution: true,
      ambientHostAccess: true
    }
  });

  assert.equal(review.ok, false);
  assert.equal(review.claims.wasmExecutionAvailable, true);
  assert.ok(review.errors.some((error) => error.code === "wasm-wasi.unsupported-claim"));
});

test("WASI capability helper accepts bounded descriptors and rejects unsafe declarations", () => {
  assert.equal(assertWasiCapabilitiesSafe(sampleWasmWasiSandboxRequest.wasi), true);

  assert.throws(
    () =>
      assertWasiCapabilitiesSafe({
        ...sampleWasmWasiSandboxRequest.wasi,
        network: { mode: "public", allow: [{ protocol: "https", host: "example.com", port: 443 }] }
      }),
    /network mode/u
  );
});

test("WASM sandbox gate review proves approved preflight and blocked unsafe lanes", () => {
  const summary = reviewWasmWasiSandboxGate();

  assert.equal(summary.ok, true);
  assert.equal(summary.approvedStatus, "preflight-ready");
  assert.equal(summary.executionEnabled, false);
  assert.equal(summary.broadHostAccessBlocked, true);
  assert.equal(summary.missingMeteringBlocked, true);
  assert.equal(summary.publicNetworkBlocked, true);
});
