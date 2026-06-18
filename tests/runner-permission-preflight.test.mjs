import assert from "node:assert/strict";
import test from "node:test";
import {
  approveRunnerPermissionGrants,
  createAllowedRunnerPermissionPreflight,
  createBlockedRunnerPermissionScenario,
  createInitialRunnerPermissionStore,
  createRunnerPermissionReview,
  reviewRunnerPermissionPreflightGate,
  revokeRunnerPermissionGrant,
  runnerPermissionPreflightSchemaVersion
} from "../src/core/runner-permission-preflight.mjs";

test("empty runner permission store blocks start preflight", () => {
  const review = createRunnerPermissionReview({ store: createInitialRunnerPermissionStore() });

  assert.equal(review.schemaVersion, runnerPermissionPreflightSchemaVersion);
  assert.equal(review.ok, false);
  assert.equal(review.status, "blocked");
  assert.equal(review.summary.allowed, 0);
  assert.equal(review.summary.blocked > 0, true);
});

test("approve flow grants required scoped permissions and allows start", () => {
  const review = approveRunnerPermissionGrants(createInitialRunnerPermissionStore());

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.status, "allowed");
  assert.equal(review.summary.allowed, review.summary.required);
  assert.equal(review.summary.currentGrants, review.summary.required);
  assert.equal(review.auditArtifact.path, "artifacts/permission-audit.json");
});

test("revoke flow disables start and records revoked evidence", () => {
  const approved = approveRunnerPermissionGrants(createInitialRunnerPermissionStore());
  const revoked = revokeRunnerPermissionGrant(approved.store, "grant.network-connect");

  assert.equal(revoked.ok, false);
  assert.equal(revoked.status, "blocked");
  assert.equal(revoked.summary.revoked, 1);
  assert.ok(revoked.errors.some((error) => error.code === "permission-grant.revoked"));
});

test("blocked sample covers expired wrong-run hidden ambient browser data and shell blockers", () => {
  const blocked = createBlockedRunnerPermissionScenario();
  const codes = new Set(blocked.errors.map((error) => error.code));

  assert.equal(blocked.ok, false);
  for (const code of [
    "permission-grant.expired",
    "permission-grant.wrong-run",
    "permission-grant.hidden-file",
    "permission-grant.hidden-network",
    "permission-grant.ambient-env",
    "permission-grant.unsupported-family",
    "permission-grant.generic-shell"
  ]) {
    assert.equal(codes.has(code), true, code);
  }
});

test("permission audit export redacts vault references and raw secret-like values", () => {
  const approved = approveRunnerPermissionGrants(createInitialRunnerPermissionStore());
  const blocked = createBlockedRunnerPermissionScenario();
  const text = JSON.stringify({ approved, blocked });

  assert.doesNotMatch(text, /vault:providerCredential/u);
  assert.doesNotMatch(text, /bearer\s+[A-Za-z0-9._-]+/iu);
  assert.match(text, /redacted:vault-reference/u);
});

test("rerun after grant uses an allowed permission preflight", () => {
  const allowed = createAllowedRunnerPermissionPreflight();

  assert.equal(allowed.ok, true);
  assert.equal(allowed.status, "allowed");
});

test("runner permission preflight review covers approve revoke blocked and rerun flows", () => {
  const review = reviewRunnerPermissionPreflightGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.approved, "allowed");
  assert.equal(review.checks.revoked, "blocked");
  assert.equal(review.checks.blocked, "blocked");
});
