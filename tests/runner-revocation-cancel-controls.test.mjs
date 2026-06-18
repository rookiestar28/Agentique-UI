import assert from "node:assert/strict";
import test from "node:test";
import {
  createRunnerRevocationCancelControls,
  reviewRunnerRevocationCancelControlsGate,
  runnerRevocationCancelControlsSchemaVersion
} from "../src/core/runner-revocation-cancel-controls.mjs";

test("runner control surface starts from a reviewed active grant", () => {
  const surface = createRunnerRevocationCancelControls({ action: "ready" });

  assert.equal(surface.schemaVersion, runnerRevocationCancelControlsSchemaVersion);
  assert.equal(surface.approval.status, "active");
  assert.equal(surface.grant.status, "active");
  assert.equal(surface.startDecision.status, "allowed");
  assert.equal(surface.retry.status, "allowed");
  assert.ok(surface.uiControls.some((control) => control.action === "ready" && control.label === "Approve control sample"));
});

test("revoked grants block start and emit redacted audit receipts", () => {
  const surface = createRunnerRevocationCancelControls({ action: "revoked-start" });

  assert.equal(surface.grant.status, "revoked");
  assert.equal(surface.startDecision.status, "blocked");
  assert.equal(surface.startDecision.code, "runner-control.revoked-grant");
  assert.equal(surface.nativeReceipt.reason, "post-prepare-revocation");
  assert.equal(
    surface.auditReceipts.every((receipt) => receipt.redacted === true),
    true
  );
  assert.doesNotMatch(JSON.stringify(surface), /[A-Za-z]:[\\/]|Bearer\s+|sk-[a-z0-9_-]+|cookie|token/iu);
});

test("stale approval reuse is denied before native start", () => {
  const surface = createRunnerRevocationCancelControls({ action: "stale-approval" });

  assert.equal(surface.approval.status, "consumed");
  assert.equal(surface.approval.staleReuseDenied, true);
  assert.equal(surface.startDecision.status, "blocked");
  assert.equal(surface.startDecision.code, "runner-control.stale-approval");
  assert.equal(surface.nativeReceipt.enforcedBeforeStart, true);
});

test("cancel and forced kill produce distinct native receipt states", () => {
  const cancel = createRunnerRevocationCancelControls({ action: "cancel" });
  const forced = createRunnerRevocationCancelControls({ action: "force-kill" });

  assert.equal(cancel.stopDecision.mode, "cancel");
  assert.equal(cancel.stopDecision.state, "canceled");
  assert.equal(cancel.cleanup.status, "graceful-cleaned");
  assert.equal(cancel.retry.status, "allowed");

  assert.equal(forced.stopDecision.mode, "forced-kill");
  assert.equal(forced.stopDecision.state, "cleanup-required");
  assert.equal(forced.cleanup.status, "cleanup-required");
  assert.equal(forced.retry.status, "blocked");
  assert.equal(forced.retry.blockedUntilCleanupResolved, true);
});

test("retry is allowed only after cleanup-required is resolved", () => {
  const forced = createRunnerRevocationCancelControls({ action: "force-kill" });
  const resolved = createRunnerRevocationCancelControls({ action: "cleanup-resolved" });

  assert.equal(forced.cleanup.status, "cleanup-required");
  assert.equal(forced.retry.status, "blocked");
  assert.equal(resolved.cleanup.status, "cleaned-up");
  assert.equal(resolved.cleanup.resolutionReceipt.status, "accepted");
  assert.equal(resolved.retry.status, "allowed");
});

test("runner revocation cancel control gate proves UI flows and no capability widening", () => {
  const review = reviewRunnerRevocationCancelControlsGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.deepEqual(review.checks.uiInteractionFlows, ["approve", "revoke", "start-denied", "cancel", "kill", "cleanup-resolved"]);
  assert.equal(review.checks.revokedGrantStartDenied, true);
  assert.equal(review.checks.staleApprovalDenied, true);
  assert.equal(review.checks.cancelKillDistinct, true);
  assert.equal(review.checks.retryBlockedUntilCleanup, true);
  assert.equal(review.checks.auditReceiptsRedacted, true);
  assert.equal(review.checks.noCapabilityWidening, true);
});
