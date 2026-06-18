import assert from "node:assert/strict";
import test from "node:test";
import {
  capabilityFamiliesList,
  reviewCapabilityManifest,
  revokeCapability,
  sampleCapabilityManifest
} from "../src/core/capability-policy.mjs";

test("capability manifest covers required local access families", () => {
  assert.deepEqual(capabilityFamiliesList(), [
    "files",
    "network",
    "shell",
    "environment",
    "gpu",
    "containers",
    "externalProviders",
    "secrets",
    "sidecars",
    "browserData"
  ]);
});

test("sample capability manifest reviews as default-deny with ask-only exceptions", () => {
  const review = reviewCapabilityManifest(sampleCapabilityManifest);
  assert.equal(review.ok, true);
  assert.equal(review.summary.allow, 0);
  assert.equal(review.summary.ask, 3);
  assert.equal(review.summary.deny, 7);
  assert.equal(review.capabilities.shell.decision, "deny");
  assert.equal(review.capabilities.browserData.decision, "deny");
  assert.equal(review.audit.action, "review-only");
});

test("unsafe ambient access and unknown capability families fail closed", () => {
  const review = reviewCapabilityManifest({
    ...sampleCapabilityManifest,
    capabilities: {
      ...sampleCapabilityManifest.capabilities,
      shell: { decision: "allow", scope: "any command" },
      unknownLocalAccess: { decision: "allow", scope: "unexpected" }
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "capability.ambient-access"));
  assert.ok(review.errors.some((error) => error.code === "capability.unknown-family"));
});

test("revocation forces a capability back to deny", () => {
  const review = reviewCapabilityManifest(sampleCapabilityManifest);
  const revoked = revokeCapability(review, "files");
  assert.equal(revoked.capabilities.files.decision, "deny");
  assert.equal(revoked.capabilities.files.revoked, true);
  assert.equal(revoked.audit.action, "revoked");
});

