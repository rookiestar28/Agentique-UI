import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  createHumanApprovalResumeRerunUxSurface,
  humanApprovalResumeRerunUxSchemaVersion,
  requiredHumanApprovalResumeRerunScenarios,
  reviewHumanApprovalResumeRerunUx,
  validateHumanApprovalResumeRerunUxSurface
} from "../src/core/human-approval-resume-rerun-ux.mjs";

test("human approval resume rerun UX review gate passes", () => {
  const review = reviewHumanApprovalResumeRerunUx();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.schemaVersion, "agentique.humanApprovalResumeRerunUxReview.v1");
  assert.equal(review.checks.scenarioCoverage, true);
  assert.equal(review.checks.deniedApprovalBlocksResume, true);
  assert.equal(review.checks.staleApprovalReuseDenied, true);
  assert.equal(review.checks.rerunRetryCancelLedgerMapped, true);
  assert.equal(review.checks.forcedCleanupBlocksRetry, true);
  assert.equal(review.checks.receiptIdempotency, true);
  assert.equal(review.checks.noCapabilityWidening, true);
  assert.equal(review.checks.publicSafe, true);
});

test("scenario catalog covers approval resume rerun cancel and cleanup states", () => {
  const surface = createHumanApprovalResumeRerunUxSurface();

  assert.equal(surface.schemaVersion, humanApprovalResumeRerunUxSchemaVersion);
  assert.deepEqual(
    surface.scenarioControls.map((scenario) => scenario.id),
    requiredHumanApprovalResumeRerunScenarios
  );
  assert.deepEqual(requiredHumanApprovalResumeRerunScenarios, [
    "pending",
    "approve-resume",
    "deny",
    "stale-approval",
    "rerun",
    "retry-blocked-cleanup",
    "cancel-idempotent",
    "cleanup-resolved"
  ]);
});

test("denied approval and resume mismatch cannot run paused node", () => {
  const denied = createHumanApprovalResumeRerunUxSurface({ scenario: "deny" });
  const mismatch = createHumanApprovalResumeRerunUxSurface({ scenario: "pending", approvalAction: "resume-mismatch" });

  assert.equal(denied.approval.decisionStatus, "rejected");
  assert.equal(denied.approval.runState, "canceled");
  assert.equal(denied.approval.resumeGate.ok, false);
  assert.equal(denied.approval.pausedNodeExecuted, false);
  assert.equal(mismatch.approval.resumeGate.code, "approval.resume-mismatch");
  assert.equal(mismatch.approval.pausedNodeExecuted, false);
});

test("stale approval reuse is blocked before start with audit receipts", () => {
  const surface = createHumanApprovalResumeRerunUxSurface({ scenario: "stale-approval" });

  assert.equal(surface.approval.staleReuseDenied, true);
  assert.equal(surface.runner.startDecision.status, "blocked");
  assert.equal(surface.runner.startDecision.code, "runner-control.stale-approval");
  assert.equal(surface.runner.nativeReceipt.kind, "start-denied");
  assert.ok(surface.receipts.some((receipt) => receipt.kind === "approval-reuse-denied" && receipt.redacted === true));
});

test("rerun retry cancel and cleanup transitions map to ledger or run-folder receipts", () => {
  const rerun = createHumanApprovalResumeRerunUxSurface({ scenario: "rerun" });
  const cancel = createHumanApprovalResumeRerunUxSurface({ scenario: "cancel-idempotent" });
  const cleanupBlocked = createHumanApprovalResumeRerunUxSurface({ scenario: "retry-blocked-cleanup" });
  const cleanupResolved = createHumanApprovalResumeRerunUxSurface({ scenario: "cleanup-resolved" });

  assert.equal(rerun.rerun.newRunId, "run-history-success-rerun-001");
  assert.equal(rerun.rerun.previousEvidencePreserved, true);
  assert.equal(
    rerun.receipts.every((receipt) => receipt.ref.startsWith("runs/") || receipt.ref === "ledger:source-first-json-ledger"),
    true
  );
  assert.equal(cancel.cancel.state, "canceled");
  assert.equal(cancel.cancel.idempotent, true);
  assert.equal(cleanupBlocked.retry.status, "blocked");
  assert.equal(cleanupBlocked.cleanup.required, true);
  assert.equal(cleanupResolved.retry.status, "allowed");
  assert.equal(cleanupResolved.cleanup.required, false);
});

test("surface validation rejects unsafe receipt references and authority widening", () => {
  const safe = createHumanApprovalResumeRerunUxSurface({ scenario: "rerun" });
  const unsafeRef = structuredClone(safe);
  unsafeRef.receipts[0].ref = ["C", "/Users/example/receipt.txt"].join(":");
  const widened = structuredClone(safe);
  widened.boundary.noGenericShell = false;

  assert.equal(validateHumanApprovalResumeRerunUxSurface(safe).ok, true);
  assert.equal(validateHumanApprovalResumeRerunUxSurface(unsafeRef).ok, false);
  assert.match(validateHumanApprovalResumeRerunUxSurface(unsafeRef).errors[0].code, /unsafe-receipt/u);
  assert.equal(validateHumanApprovalResumeRerunUxSurface(widened).ok, false);
  assert.match(validateHumanApprovalResumeRerunUxSurface(widened).errors[0].code, /authority/u);
});

test("Run workspace exposes interactive approval resume rerun panel wiring", () => {
  const hook = fs.readFileSync("src/app-state/useRunnerWorkspaceState.ts", "utf8");
  const types = fs.readFileSync("src/workspaces/TrustRunSettingsTypes.ts", "utf8");
  const runWorkspace = fs.readFileSync("src/workspaces/RunWorkspace.tsx", "utf8");
  const panel = fs.existsSync("src/workspaces/HumanApprovalResumeRerunPanel.tsx") ? fs.readFileSync("src/workspaces/HumanApprovalResumeRerunPanel.tsx", "utf8") : "";

  assert.match(hook, /createHumanApprovalResumeRerunUxSurface/u);
  assert.match(hook, /handleHumanApprovalResumeRerunScenario/u);
  assert.match(hook, /setWatchdogSupervisorScenario\("healthy"\)/u);
  assert.match(hook, /setDurableRunLedgerAction\("replay"\)/u);
  assert.match(hook, /setDurableRunLedgerAction\("export"\)/u);
  assert.match(types, /humanApprovalResumeRerunSurface/u);
  assert.match(runWorkspace, /HumanApprovalResumeRerunPanel/u);
  assert.match(panel, /aria-label="Approval resume rerun controls"/u);
  assert.match(panel, /aria-label="Approval resume rerun receipt ledger"/u);
  assert.match(panel, /onHumanApprovalResumeRerunScenario\(scenario\.id as HumanApprovalResumeRerunScenario\)/u);
});

test("human approval resume rerun output stays public safe and path neutral", () => {
  const review = reviewHumanApprovalResumeRerunUx();
  const text = JSON.stringify(review);

  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/u);
  assert.doesNotMatch(text, /vault:[a-z][a-zA-Z0-9._-]+/u);
  assert.doesNotMatch(text, /bearer\s+[A-Za-z0-9._-]+/iu);
  assert.doesNotMatch(text, /cookie=/iu);
  assert.doesNotMatch(text, /signed installer|production desktop runtime|generic shell/iu);
});
