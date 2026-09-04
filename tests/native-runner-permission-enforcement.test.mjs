import assert from "node:assert/strict";
import test from "node:test";
import { readNativeRunnerPermissionEnforcementInputs, reviewNativeRunnerPermissionEnforcement } from "../src/core/native-runner-permission-enforcement.mjs";

test("native runner permission enforcement validation gate passes", () => {
  const review = reviewNativeRunnerPermissionEnforcement();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.permission.nativeBacked, true);
  assert.equal(review.permission.prepareCreatesProposalWithoutGrant, true);
  assert.equal(review.permission.explicitDecisionOwnsGrant, true);
  assert.equal(review.permission.legacyIdentifiersNonAuthorizing, true);
  assert.equal(review.permission.startRequiresGrantId, true);
  assert.equal(review.permission.consumesGrant, true);
  assert.equal(review.permission.revokedBlocked, true);
  assert.equal(review.permission.expiredBlocked, true);
  assert.equal(review.permission.productRevocationCommand, true);
  assert.equal(review.permission.liveRevocationStopsExactHandle, true);
  assert.equal(review.permission.redactedAndPathNeutral, true);
});

test("native runner permission enforcement rejects raw grant request fields", () => {
  const input = readNativeRunnerPermissionEnforcementInputs();
  const weakened = reviewNativeRunnerPermissionEnforcement({
    ...input,
    rustSource: input.rustSource.replace("permission_grant_id: Option<String>,", "permission_grant_id: Option<String>,\n    permission_targets: Vec<String>,")
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-permission.request-field-forbidden"));
});

test("native runner permission enforcement rejects unsafe receipt material", () => {
  const input = readNativeRunnerPermissionEnforcementInputs();
  const unsafePath = ["C", ":/Users/example/raw "].join("");
  const unsafeSecret = ["bearer", "abcdefghijklmnop"].join(" ");
  const unsafeRust = `${input.rustSource}\nconst BAD_PERMISSION_RECEIPT: &str = "${unsafePath}${unsafeSecret}";`;
  const weakened = reviewNativeRunnerPermissionEnforcement({ ...input, rustSource: unsafeRust });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-permission.unsafe-receipt"));
});

test("native runner permission enforcement rejects removal of live product revocation", () => {
  const input = readNativeRunnerPermissionEnforcementInputs();
  const withoutCommand = reviewNativeRunnerPermissionEnforcement({
    ...input,
    rustSource: input.rustSource.replace("fn agentique_runner_revoke_permission", "fn removed_runner_revoke_permission")
  });
  assert.equal(withoutCommand.ok, false);
  assert.ok(withoutCommand.errors.some((error) => error.code === "native-permission.product-revocation-command"));

  const withoutExactHandleSignal = reviewNativeRunnerPermissionEnforcement({
    ...input,
    rustSource: input.rustSource.replace("authorization withdrawal must serialize its durable revocation event", "authorization withdrawal serialization removed")
  });
  assert.equal(withoutExactHandleSignal.ok, false);
  assert.ok(withoutExactHandleSignal.errors.some((error) => error.code === "native-permission.live-revocation-stops-exact-handle"));
});
