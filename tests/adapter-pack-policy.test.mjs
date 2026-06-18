import assert from "node:assert/strict";
import test from "node:test";
import {
  reviewAdapterPack,
  sampleAdapterPack,
  sampleAdapterPolicy
} from "../src/core/adapter-pack-policy.mjs";

const resource = Object.freeze({ supportMode: "visualizable" });

test("signed allowlisted adapter pack passes runtime policy review", () => {
  const review = reviewAdapterPack(sampleAdapterPack, sampleAdapterPolicy, resource);
  assert.equal(review.ok, true);
  assert.equal(review.adapter.runtime, "python");
  assert.equal(review.trust.signature, "verified");
  assert.equal(review.trust.allowlisted, true);
  assert.equal(review.summary.blockingErrors, 0);
});

test("unsigned adapter pack fails closed", () => {
  const review = reviewAdapterPack({
    ...sampleAdapterPack,
    signature: { ...sampleAdapterPack.signature, status: "missing" }
  }, sampleAdapterPolicy, resource);
  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "adapter.unsigned"));
});

test("tampered digest fails closed", () => {
  const review = reviewAdapterPack({
    ...sampleAdapterPack,
    artifact: { ...sampleAdapterPack.artifact, digest: "b".repeat(64) }
  }, sampleAdapterPolicy, resource);
  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "adapter.not-allowlisted"));
  assert.ok(review.errors.some((error) => error.code === "adapter.digest-mismatch"));
});

test("revoked adapter pack fails closed", () => {
  const review = reviewAdapterPack({
    ...sampleAdapterPack,
    revocation: { status: "revoked", checkedAt: "2026-06-11T00:40:00.000Z" }
  }, sampleAdapterPolicy, resource);
  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "adapter.revoked"));
});

test("incompatible resource type fails closed", () => {
  const review = reviewAdapterPack(sampleAdapterPack, sampleAdapterPolicy, { supportMode: "external-handoff" });
  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "adapter.resource-type"));
});

test("permissions exceeding policy fail closed", () => {
  const review = reviewAdapterPack({
    ...sampleAdapterPack,
    permissions: { ...sampleAdapterPack.permissions, shell: "allow" }
  }, sampleAdapterPolicy, resource);
  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "adapter.permission-excess"));
});
