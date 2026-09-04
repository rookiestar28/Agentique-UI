import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createNativeApprovalConsentSurface } from "../src/core/native-approval-consent.mjs";

test("native approval UI states keep start blocked except for an active explicit decision", () => {
  for (const scenario of ["pending", "denied", "expired", "revoked", "consumed", "mismatched"]) {
    const surface = createNativeApprovalConsentSurface(scenario);
    assert.equal(surface.startAllowed, false, scenario);
  }
  const approved = createNativeApprovalConsentSurface("approved");
  assert.equal(approved.startAllowed, true);
  assert.equal(approved.summary.explicitUserAction, true);
  assert.equal(approved.grant.status, "active");
});

test("native approval panel exposes exact capability summary and interactive decision states", () => {
  const panel = fs.readFileSync(new URL("../src/workspaces/NativeApprovalConsentPanel.tsx", import.meta.url), "utf8");
  const route = fs.readFileSync(new URL("../src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx", import.meta.url), "utf8");
  const workspace = fs.readFileSync(new URL("../src/workspaces/RunWorkspace.tsx", import.meta.url), "utf8");

  for (const label of ["Pending proposal", "Explicit approve", "Deny", "Expired", "Revoked", "Consumed", "Scope mismatch"]) {
    assert.match(panel, new RegExp(label, "u"));
  }
  assert.match(panel, /Exact native approval capabilities/u);
  assert.match(panel, /Native start remains blocked/u);
  assert.match(panel, /surface\.proposal\.effect\.actionId/u);
  assert.match(panel, /surface\.proposal\.effect\.capabilities\.map/u);
  assert.match(route, /useState<NativeApprovalScenario>\("pending"\)/u);
  assert.match(route, /createNativeApprovalConsentSurface\(nativeApprovalScenario\)/u);
  assert.match(workspace, /NativeApprovalConsentPanel/u);
});

test("native approval surface remains path-neutral and credential-value free", () => {
  for (const scenario of ["pending", "approved", "denied", "expired", "revoked", "consumed", "mismatched"]) {
    const text = JSON.stringify(createNativeApprovalConsentSurface(scenario));
    assert.doesNotMatch(text, /(?<![A-Za-z])[A-Za-z]:[\\/]/u);
    assert.doesNotMatch(text, /"credentialValues":|browser:cookies|env:PATH|shell:/u);
  }
});
