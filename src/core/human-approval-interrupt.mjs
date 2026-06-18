import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const humanApprovalInterruptSchemaVersion = "agentique.humanApprovalInterrupt.v1";

const fixedNow = "2026-06-13T00:00:00.000Z";
const runId = "run-approval-001";
const checkpointId = "checkpoint-human-review-001";
const pendingInterruptId = "interrupt-human-review-001";
const pausedNodeId = "human-review";
const unsafeEvidencePattern = /(?<![A-Za-z])[A-Za-z]:[\\/]|vault:[a-z][a-zA-Z0-9._-]{2,80}|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|cookie=/iu;

export function createHumanApprovalInterrupt({ action = "pending", editedInput = "Review output with vault:providerCredential and bearer abcdefghijklmnop redacted.", now = fixedNow } = {}) {
  const normalizedAction = ["pending", "approve", "reject", "edit-input", "handoff", "resume-mismatch"].includes(action) ? action : "pending";
  const checkpoint = createCheckpoint(now);
  const decision = decisionFor(normalizedAction, editedInput, now);
  const resumeAttempt = resumeAttemptFor(normalizedAction, checkpoint, now);
  const resumeGate = evaluateResumeGate(checkpoint, decision, resumeAttempt);
  const state = runStateFor(normalizedAction, resumeGate);
  const evidence = {
    schemaVersion: humanApprovalInterruptSchemaVersion,
    generatedAt: now,
    action: normalizedAction,
    run: {
      runId,
      state,
      paused: state === "paused",
      terminal: ["canceled", "handoff-required"].includes(state),
      resumed: state === "resumed",
      pausedNodeExecuted: state === "resumed" ? resumeGate.ok : false
    },
    checkpoint,
    interrupt: {
      interruptId: pendingInterruptId,
      status: decision.status,
      requiredDecision: "human-approval",
      nodeId: pausedNodeId,
      nodeType: "approval-required",
      prompt: "Review normalized output before continuing local execution."
    },
    decision,
    resumeAttempt,
    resumeGate,
    timeline: timelineFor(state, decision, resumeGate, now),
    boundary: {
      descriptorOnly: true,
      externalRuntimeStarted: false,
      secretsRedacted: true,
      browserWritesFiles: false
    },
    summary: {
      paused: state === "paused",
      resumed: state === "resumed",
      rejected: normalizedAction === "reject",
      edited: decision.edited,
      handoff: normalizedAction === "handoff",
      mismatchBlocked: normalizedAction === "resume-mismatch" && !resumeGate.ok,
      pausedNodeExecuted: state === "resumed" ? resumeGate.ok : false
    }
  };
  assertNoInlineSecrets(evidence);
  if (unsafeEvidencePattern.test(JSON.stringify(evidence))) {
    throw new Error("Human approval interrupt contains unsafe evidence.");
  }
  return freeze(evidence);
}

export function reviewHumanApprovalInterruptGate() {
  const pending = createHumanApprovalInterrupt({ action: "pending" });
  const approved = createHumanApprovalInterrupt({ action: "approve" });
  const rejected = createHumanApprovalInterrupt({ action: "reject" });
  const edited = createHumanApprovalInterrupt({ action: "edit-input" });
  const handoff = createHumanApprovalInterrupt({ action: "handoff" });
  const mismatch = createHumanApprovalInterrupt({ action: "resume-mismatch" });
  const text = JSON.stringify({ pending, approved, rejected, edited, handoff, mismatch });
  const ok = pending.run.state === "paused" &&
    approved.resumeGate.ok === true &&
    approved.run.state === "resumed" &&
    rejected.run.state === "canceled" &&
    rejected.run.pausedNodeExecuted === false &&
    edited.decision.edited === true &&
    edited.decision.editedInput.redacted === true &&
    edited.run.state === "paused" &&
    mismatch.resumeGate.ok === false &&
    mismatch.resumeGate.code === "approval.resume-mismatch" &&
    handoff.run.state === "handoff-required" &&
    handoff.boundary.externalRuntimeStarted === false &&
    !unsafeEvidencePattern.test(text);

  return freeze({
    schemaVersion: "agentique.humanApprovalInterruptReview.v1",
    ok,
    checks: {
      pending: pending.run.state,
      approved: approved.run.state,
      rejected: rejected.run.state,
      editedRedacted: edited.decision.editedInput.redacted,
      mismatchBlocked: mismatch.summary.mismatchBlocked,
      handoffDescriptorOnly: handoff.boundary.descriptorOnly
    },
    errors: ok ? [] : [issue("approval-interrupt.review", "Human approval interrupt review failed.")]
  });
}

function createCheckpoint(now) {
  return {
    checkpointId,
    runId,
    nodeId: pausedNodeId,
    status: "pending",
    pendingInterruptId,
    createdAt: now,
    resumeRequirements: {
      runId,
      checkpointId,
      pendingInterruptId
    }
  };
}

function decisionFor(action, editedInput, now) {
  if (action === "approve" || action === "resume-mismatch") {
    return decision("approved", "approve", now);
  }
  if (action === "reject") {
    return decision("rejected", "reject", now);
  }
  if (action === "edit-input") {
    return {
      ...decision("pending", "edit-input", now),
      edited: true,
      editedInput: {
        redacted: true,
        value: safeText(editedInput),
        validation: "accepted-redacted-text"
      }
    };
  }
  if (action === "handoff") {
    return {
      ...decision("handoff-required", "handoff", now),
      handoffDescriptor: {
        target: "external-review",
        startsRuntime: false,
        reason: "Human decision selected descriptor-only handoff."
      }
    };
  }
  return decision("pending", "awaiting-human", now);
}

function decision(status, type, now) {
  return {
    status,
    type,
    decidedAt: status === "pending" ? null : now,
    edited: false,
    editedInput: null
  };
}

function resumeAttemptFor(action, checkpoint, now) {
  if (action === "approve") {
    return {
      attemptedAt: now,
      runId: checkpoint.runId,
      checkpointId: checkpoint.checkpointId,
      pendingInterruptId: checkpoint.pendingInterruptId
    };
  }
  if (action === "resume-mismatch") {
    return {
      attemptedAt: now,
      runId: "run-approval-other",
      checkpointId: checkpoint.checkpointId,
      pendingInterruptId: "interrupt-human-review-other"
    };
  }
  return null;
}

function evaluateResumeGate(checkpoint, decision, resumeAttempt) {
  if (decision.status !== "approved") {
    return {
      ok: false,
      status: "blocked",
      code: decision.status === "rejected" ? "approval.rejected" : "approval.pending",
      message: decision.status === "rejected" ? "Checkpoint was rejected; paused node does not run." : "Human decision is required before resume."
    };
  }
  if (!resumeAttempt ||
    resumeAttempt.runId !== checkpoint.runId ||
    resumeAttempt.checkpointId !== checkpoint.checkpointId ||
    resumeAttempt.pendingInterruptId !== checkpoint.pendingInterruptId) {
    return {
      ok: false,
      status: "blocked",
      code: "approval.resume-mismatch",
      message: "Resume requires matching run id, checkpoint id, and pending interrupt id."
    };
  }
  return {
    ok: true,
    status: "accepted",
    code: "approval.resume-accepted",
    message: "Checkpoint resume accepted."
  };
}

function runStateFor(action, resumeGate) {
  if (resumeGate.ok) return "resumed";
  if (action === "reject") return "canceled";
  if (action === "handoff") return "handoff-required";
  return "paused";
}

function timelineFor(state, decision, resumeGate, now) {
  const rows = [
    timelineEvent(1, "checkpoint-created", "paused", "Approval checkpoint created.", now),
    timelineEvent(2, "interrupt-pending", "paused", "Run paused before approval-required node.", now)
  ];
  if (decision.edited) {
    rows.push(timelineEvent(rows.length + 1, "input-edited", "paused", "Edited input recorded with redaction.", now));
  }
  if (decision.status !== "pending") {
    rows.push(timelineEvent(rows.length + 1, `decision-${decision.type}`, state, resumeGate.message, now));
  }
  if (resumeGate.ok) {
    rows.push(timelineEvent(rows.length + 1, "resume-accepted", "resumed", "Run can continue from accepted checkpoint.", now));
  }
  return rows;
}

function timelineEvent(sequence, type, state, label, now) {
  return {
    id: `approval-${String(sequence).padStart(3, "0")}-${safeToken(type)}`,
    sequence,
    type: safeText(type),
    state: safeText(state),
    label: safeText(label),
    createdAt: now
  };
}

function safeToken(value) {
  return String(value ?? "event").toLowerCase().replace(/[^a-z0-9._:-]/gu, "-").slice(0, 80) || "event";
}

function safeText(value) {
  return redactText(String(value ?? "").replace(/\s+/gu, " ").trim())
    .replace(unsafeEvidencePattern, "redacted:sensitive-evidence")
    .slice(0, 220);
}

function issue(code, message) {
  return { code, message: safeText(message) };
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
