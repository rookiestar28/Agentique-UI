import assert from "node:assert/strict";
import test from "node:test";
import {
  createHumanApprovalInterrupt,
  humanApprovalInterruptSchemaVersion,
  reviewHumanApprovalInterruptGate
} from "../src/core/human-approval-interrupt.mjs";

test("sample graph pauses at approval checkpoint", () => {
  const interrupt = createHumanApprovalInterrupt({ action: "pending" });

  assert.equal(interrupt.schemaVersion, humanApprovalInterruptSchemaVersion);
  assert.equal(interrupt.run.state, "paused");
  assert.equal(interrupt.run.paused, true);
  assert.equal(interrupt.interrupt.status, "pending");
  assert.equal(interrupt.resumeGate.ok, false);
});

test("approval resumes only with matching run checkpoint and interrupt ids", () => {
  const approved = createHumanApprovalInterrupt({ action: "approve" });
  const mismatch = createHumanApprovalInterrupt({ action: "resume-mismatch" });

  assert.equal(approved.resumeGate.ok, true);
  assert.equal(approved.run.state, "resumed");
  assert.equal(approved.resumeAttempt.runId, approved.checkpoint.runId);
  assert.equal(approved.resumeAttempt.checkpointId, approved.checkpoint.checkpointId);
  assert.equal(approved.resumeAttempt.pendingInterruptId, approved.checkpoint.pendingInterruptId);
  assert.equal(mismatch.resumeGate.ok, false);
  assert.equal(mismatch.resumeGate.code, "approval.resume-mismatch");
});

test("rejection reaches terminal canceled state without running paused node", () => {
  const rejected = createHumanApprovalInterrupt({ action: "reject" });

  assert.equal(rejected.run.state, "canceled");
  assert.equal(rejected.run.terminal, true);
  assert.equal(rejected.run.pausedNodeExecuted, false);
  assert.equal(rejected.resumeGate.code, "approval.rejected");
});

test("edited input is redacted validated and recorded", () => {
  const edited = createHumanApprovalInterrupt({
    action: "edit-input",
    editedInput: "Use vault:providerCredential with bearer abcdefghijklmnop and continue."
  });
  const text = JSON.stringify(edited);

  assert.equal(edited.decision.edited, true);
  assert.equal(edited.decision.editedInput.redacted, true);
  assert.equal(edited.decision.editedInput.validation, "accepted-redacted-text");
  assert.match(text, /redacted:(vault-reference|sensitive-evidence)/u);
  assert.doesNotMatch(text, /vault:providerCredential/u);
  assert.doesNotMatch(text, /bearer\s+[A-Za-z0-9._-]+/iu);
});

test("handoff decision remains descriptor only", () => {
  const handoff = createHumanApprovalInterrupt({ action: "handoff" });

  assert.equal(handoff.run.state, "handoff-required");
  assert.equal(handoff.boundary.descriptorOnly, true);
  assert.equal(handoff.boundary.externalRuntimeStarted, false);
  assert.equal(handoff.decision.handoffDescriptor.startsRuntime, false);
});

test("approval interrupt output is path neutral and secret free", () => {
  const interrupt = createHumanApprovalInterrupt({ action: "approve" });
  const text = JSON.stringify(interrupt);

  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/u);
  assert.doesNotMatch(text, /vault:[a-z][a-zA-Z0-9._-]+/u);
  assert.doesNotMatch(text, /cookie=/iu);
  assert.equal(interrupt.boundary.browserWritesFiles, false);
});

test("human approval interrupt review gate passes", () => {
  const review = reviewHumanApprovalInterruptGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.approved, "resumed");
  assert.equal(review.checks.rejected, "canceled");
  assert.equal(review.checks.editedRedacted, true);
  assert.equal(review.checks.mismatchBlocked, true);
});
