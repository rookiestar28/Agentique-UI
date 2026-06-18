import assert from "node:assert/strict";
import test from "node:test";
import {
  assertExternalBridgePayloadSafe,
  createExternalBridgeReview,
  reviewExternalBridgeGuard,
  sampleExternalBridgePermissionStore,
  sampleExternalBridgeRequest
} from "../src/core/external-runtime-bridge-guard.mjs";
import { revokePermissionGrant } from "../src/core/permission-grants.mjs";

test("explicit opt-in localhost bridge review is approved without starting a bridge", () => {
  const review = createExternalBridgeReview(sampleExternalBridgeRequest);

  assert.equal(review.ok, true);
  assert.equal(review.status, "approved");
  assert.equal(review.approvedForLaunch, true);
  assert.equal(review.startsBridge, false);
  assert.equal(review.network.bindHost, "127.0.0.1");
  assert.equal(review.network.auth, "per-launch-token");
  assert.equal(review.network.authMaterial, "redacted:ephemeral-reference");
  assert.equal(review.permissions.status, "allowed");
  assert.equal(review.shutdown.status, "ready");
  assert.equal(review.cleanup.status, "ready");
});

test("deep link public readback and descriptor view cannot start bridges", () => {
  for (const source of ["deep-link", "public-readback", "descriptor-view"]) {
    const review = createExternalBridgeReview({ ...sampleExternalBridgeRequest, source });
    assert.equal(review.ok, false);
    assert.equal(review.approvedForLaunch, false);
    assert.ok(review.errors.some((error) => error.code === "external-bridge.autostart-source"));
  }
});

test("missing explicit opt-in fails closed", () => {
  const review = createExternalBridgeReview({ ...sampleExternalBridgeRequest, userOptIn: false });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "external-bridge.opt-in"));
});

test("bridge network must bind to localhost with per-launch auth", () => {
  const review = createExternalBridgeReview({
    ...sampleExternalBridgeRequest,
    network: {
      mode: "public",
      bindHost: "0.0.0.0",
      port: 80,
      auth: "none",
      authMaterialRef: "bearer unsafeToken1234567890",
      allowedHosts: ["127.0.0.1", "192.0.2.10"]
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "external-bridge.network-mode"));
  assert.ok(review.errors.some((error) => error.code === "external-bridge.public-bind"));
  assert.ok(review.errors.some((error) => error.code === "external-bridge.auth"));
  assert.ok(review.errors.some((error) => error.code === "external-bridge.raw-auth"));
  assert.ok(review.errors.some((error) => error.code === "external-bridge.host-allowlist"));
});

test("unsafe payloads are rejected before bridge approval", () => {
  for (const payload of [
    { command: "npm run external-runtime" },
    { path: ["C", ":\\tmp\\bridge.json"].join("") },
    { token: "bearer unsafeToken1234567890" },
    { callbackUrl: "https://example.com/hidden" },
    { note: [".", "planning", "/private"].join("") }
  ]) {
    const review = createExternalBridgeReview({ ...sampleExternalBridgeRequest, payload });
    assert.equal(review.ok, false);
    assert.ok(review.errors.some((error) => error.code.startsWith("external-bridge.")));
  }
});

test("payload safety helper accepts loopback descriptor and rejects commands", () => {
  assert.equal(assertExternalBridgePayloadSafe({ callbackUrl: "http://127.0.0.1:49153/health", descriptorOnly: true }), true);
  assert.throws(
    () => assertExternalBridgePayloadSafe({ copyText: "powershell start bridge" }),
    /executable commands/u
  );
});

test("permission preflight must pass for bridge launch", () => {
  const revoked = revokePermissionGrant(sampleExternalBridgePermissionStore, "grant.bridge.network", { now: "2026-06-12T00:00:00.000Z" });
  const review = createExternalBridgeReview({
    ...sampleExternalBridgeRequest,
    permissionStore: revoked.store
  });

  assert.equal(review.ok, false);
  assert.equal(review.permissions.status, "blocked");
  assert.ok(review.errors.some((error) => error.code === "external-bridge.permission-preflight"));
});

test("shutdown and cleanup plans are required", () => {
  const review = createExternalBridgeReview({
    ...sampleExternalBridgeRequest,
    shutdown: { required: false },
    cleanup: { required: false, receiptRequired: false, removes: [] }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "external-bridge.shutdown-required"));
  assert.ok(review.errors.some((error) => error.code === "external-bridge.cleanup-required"));
});

test("bridge guard review summary proves approved and blocked lanes", () => {
  const summary = reviewExternalBridgeGuard();

  assert.equal(summary.ok, true);
  assert.equal(summary.approvedStatus, "approved");
  assert.equal(summary.publicBindBlocked, true);
  assert.equal(summary.unsafePayloadBlocked, true);
  assert.equal(summary.summary.startsBridge, false);
});
