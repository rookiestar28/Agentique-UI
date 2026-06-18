import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import {
  createPermissionGrantStore,
  evaluateRunStartGrants,
  exportPermissionAudit,
  grantPermission,
  permissionGrantFamilies,
  reviewPermissionGrantEnforcement,
  revokePermissionGrant,
  samplePermissionGrantStore,
  sampleRunPermissionRequirements
} from "../src/core/permission-grants.mjs";

const now = "2026-06-12T00:00:00.000Z";

test("permission grant validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-permission-grants.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.deepEqual(result.families, permissionGrantFamilies);
});

test("permission grants cover all required start families", () => {
  const review = reviewPermissionGrantEnforcement();
  assert.equal(review.ok, true);
  assert.deepEqual(review.families, permissionGrantFamilies);
  const preflight = evaluateRunStartGrants(samplePermissionGrantStore, sampleRunPermissionRequirements, { now });
  assert.equal(preflight.ok, true, JSON.stringify(preflight.errors));
  assert.equal(preflight.decisions.length, permissionGrantFamilies.length);
  assert.equal(preflight.status, "allowed");
});

test("permission grants block missing required grants", () => {
  const store = createPermissionGrantStore({ runId: "run.local-001", grants: [] }, { now });
  const result = evaluateRunStartGrants(store, sampleRunPermissionRequirements, { now });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "permission-grant.missing"));
});

test("permission grants block revoked grants", () => {
  const revoked = revokePermissionGrant(samplePermissionGrantStore, "grant.network", { now });
  assert.equal(revoked.ok, true);
  const result = evaluateRunStartGrants(revoked.store, sampleRunPermissionRequirements, { now });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "permission-grant.revoked"));
});

test("permission grants are scoped per run", () => {
  const store = createPermissionGrantStore({
    runId: "run.current",
    grants: [
      { id: "grant.files", runId: "run.other", family: "files", targets: ["workspace:inputs"], expiresAt: "2026-06-12T01:00:00.000Z" }
    ]
  }, { now });
  const result = evaluateRunStartGrants(store, [{ family: "files", action: "read", target: "workspace:inputs/example.json" }], { now });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "permission-grant.wrong-run"));
});

test("permission grants block expired grants", () => {
  const store = createPermissionGrantStore({
    runId: "run.expired",
    grants: [
      { id: "grant.files", family: "files", targets: ["workspace:inputs"], expiresAt: "2026-06-11T23:59:59.000Z" }
    ]
  }, { now });
  const result = evaluateRunStartGrants(store, [{ family: "files", action: "read", target: "workspace:inputs/example.json" }], { now });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "permission-grant.expired"));
});

test("permission grants block ambient environment browser data hidden file and hidden network", () => {
  const result = evaluateRunStartGrants(samplePermissionGrantStore, [
    { family: "envVault", action: "read", target: "env:PATH" },
    { family: "browserData", action: "read", target: "browser:session" },
    { family: "files", action: "read", target: ["workspace:inputs", "..", "secret"].join("/") },
    { family: "network", action: "connect", target: "http://192.0.2.10:8080/hidden" }
  ], { now });
  assert.equal(result.ok, false);
  for (const code of [
    "permission-grant.ambient-env",
    "permission-grant.unsupported-family",
    "permission-grant.hidden-file",
    "permission-grant.hidden-network"
  ]) {
    assert.ok(result.errors.some((error) => error.code === code), code);
  }
});

test("permission grants block generic shell subprocess", () => {
  const result = evaluateRunStartGrants(samplePermissionGrantStore, [
    { family: "subprocess", action: "start", target: "adapter:shell" }
  ], { now });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "permission-grant.generic-shell"));
});

test("permission grant audit export redacts vault references and raw secrets", () => {
  const granted = grantPermission(samplePermissionGrantStore, {
    id: "grant.secret",
    family: "externalProviders",
    targets: ["vault:providerCredential"],
    expiresAt: "2026-06-12T01:00:00.000Z"
  }, { now });
  assert.equal(granted.ok, true);
  const result = evaluateRunStartGrants(granted.store, [
    { family: "externalProviders", action: "connect", target: "vault:providerCredential" },
    { family: "network", action: "connect", target: "bearer abcdefghijklmnop" }
  ], { now });
  const audit = exportPermissionAudit(result.store);
  const text = JSON.stringify(audit);
  assert.doesNotMatch(text, /vault:providerCredential/u);
  assert.doesNotMatch(text, /bearer abcdefghijklmnop/u);
  assert.match(text, /redacted/u);
});

test("permission grant public contract documents blocked ambient access", () => {
  const text = fs.readFileSync("docs/contracts/permission-grants.md", "utf8");
  for (const phrase of [
    "per-run",
    "revoked",
    "ambient environment",
    "browser data",
    "redacted audit"
  ]) {
    assert.match(text, new RegExp(escapeRegExp(phrase), "u"));
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
