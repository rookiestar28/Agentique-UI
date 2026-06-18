import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import {
  createPermissionCenterSurface,
  createPermissionCenterScenario,
  permissionCenterPolicyDiffSchemaVersion,
  reviewPermissionCenterPolicyDiff,
  requiredDeniedPermissionFamilies,
  requiredPermissionCenterSections
} from "../src/core/permission-center-policy-diff.mjs";

test("permission center validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-permission-center-policy-diff.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);

  assert.equal(result.status, "passed");
  assert.equal(result.schemaVersion, permissionCenterPolicyDiffSchemaVersion);
  assert.equal(result.summary.sections, requiredPermissionCenterSections.length);
  assert.equal(result.summary.deniedFamilies, requiredDeniedPermissionFamilies.length);
  assert.equal(result.summary.interactionViewports, 2);
});

test("permission center lists required governance sections", () => {
  const surface = createPermissionCenterSurface();

  assert.equal(surface.schemaVersion, permissionCenterPolicyDiffSchemaVersion);
  assert.deepEqual(
    surface.sections.map((section) => section.id),
    requiredPermissionCenterSections
  );
  assert.equal(surface.summary.grants > 0, true);
  assert.equal(surface.summary.revocations > 0, true);
  assert.equal(surface.summary.staleGrants > 0, true);
  assert.equal(surface.summary.policyDiffs > 0, true);
  assert.equal(surface.summary.auditReceipts > 0, true);
  assert.equal(surface.summary.riskExplanations > 0, true);
});

test("broad permission families fail closed with risk explanations", () => {
  const review = reviewPermissionCenterPolicyDiff();
  const deniedFamilies = new Set(review.surface.deniedFamilies.map((entry) => entry.family));
  const riskCodes = new Set(review.surface.riskExplanations.map((entry) => entry.code));

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  for (const family of requiredDeniedPermissionFamilies) {
    assert.equal(deniedFamilies.has(family), true, family);
  }
  for (const code of [
    "permission-center.broad-file",
    "permission-center.hidden-network",
    "permission-center.generic-shell",
    "permission-center.ambient-env",
    "permission-center.browser-data",
    "permission-center.container-start",
    "permission-center.provider-without-vault"
  ]) {
    assert.equal(riskCodes.has(code), true, code);
  }
});

test("policy diffs distinguish baseline requested and effective decisions", () => {
  const surface = createPermissionCenterSurface();
  const diff = surface.policyDiffs.find((entry) => entry.family === "shell");

  assert.ok(diff);
  assert.equal(diff.baseline, "deny");
  assert.equal(diff.requested, "allow");
  assert.equal(diff.effective, "deny");
  assert.equal(diff.status, "blocked");
});

test("adapter ceilings block permission widening", () => {
  const surface = createPermissionCenterSurface();
  const exceeded = surface.adapterCeilings.find((entry) => entry.status === "exceeded");

  assert.ok(exceeded);
  assert.equal(exceeded.adapterId, "adapter.local-python");
  assert.ok(exceeded.requestedFamilies.includes("shell"));
  assert.ok(exceeded.blockedFamilies.includes("shell"));
});

test("audit receipts and exported text are public safe", () => {
  const surface = createPermissionCenterSurface();
  const text = JSON.stringify(surface);

  assert.equal(
    surface.auditReceipts.every((receipt) => receipt.redacted === true),
    true
  );
  assert.doesNotMatch(text, /vault:providerCredential/u);
  assert.doesNotMatch(text, /bearer\s+[A-Za-z0-9._-]+/iu);
  assert.doesNotMatch(text, /[A-Z]:\\\\/u);
  const internalMarkerPattern = new RegExp([String.raw`\.plan`, "ning|ref", "erence/"].join(""), "iu");
  assert.doesNotMatch(text, internalMarkerPattern);
});

test("scenario actions cover required approved revoked blocked and stale states", () => {
  const scenarios = ["required", "approved", "revoked", "blocked", "stale"].map((scenario) => createPermissionCenterScenario(scenario));
  const statuses = new Set(scenarios.map((surface) => surface.status));

  for (const status of ["required", "allowed", "revoked", "blocked", "stale"]) {
    assert.equal(statuses.has(status), true, status);
  }
  for (const surface of scenarios) {
    assert.equal(
      surface.controls.every((control) => control.keyboardAccessible === true),
      true
    );
  }
});

test("run workspace renders permission center with accessible controls", () => {
  const source = fs.readFileSync("src/workspaces/RunWorkspace.tsx", "utf8");
  const route = fs.readFileSync("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx", "utf8");
  const panel = fs.readFileSync("src/workspaces/PermissionCenterPolicyDiffPanel.tsx", "utf8");

  assert.match(panel, /aria-label="Permission center and policy diff"/u);
  assert.match(source, /PermissionCenterPolicyDiffPanel/u);
  assert.match(source, /onPermissionCenterScenario/u);
  assert.match(route, /createPermissionCenterSurface/u);
  assert.match(route, /permissionCenterSurface/u);
});
