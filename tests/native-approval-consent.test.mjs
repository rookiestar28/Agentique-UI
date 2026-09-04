import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeNativeApproval,
  createNativeApprovalStore,
  decideNativeApproval,
  prepareNativeApproval,
  reviewNativeApprovalConsentGate,
  revokeNativeApproval,
  translateRuntimeApprovalRequest
} from "../src/core/native-approval-consent.mjs";

const now = "2026-09-04T00:00:00.000Z";

function prepare() {
  return prepareNativeApproval(createNativeApprovalStore(), {}, { now });
}

function approve(prepared, overrides = {}) {
  return decideNativeApproval(
    prepared.store,
    {
      proposalId: prepared.proposal.proposalId,
      proposalDigest: prepared.proposal.proposalDigest,
      decision: "approved",
      actorId: "actor.local-user",
      ...overrides
    },
    { now: "2026-09-04T00:01:00.000Z" }
  );
}

function exactEffect(approved, overrides = {}) {
  return {
    ...approved.proposal.effect,
    grantId: approved.grant.grantId,
    proposalId: approved.proposal.proposalId,
    proposalDigest: approved.proposal.proposalDigest,
    actorId: approved.decision.actorId,
    ...overrides
  };
}

test("prepare creates only a pending exact proposal and no permission grant", () => {
  const prepared = prepare();

  assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
  assert.equal(prepared.status, "pending");
  assert.equal(prepared.proposal.status, "pending");
  assert.equal(prepared.grant, null);
  assert.equal(prepared.proposal.policyOwner, "agentique-native-host");
  assert.equal(prepared.proposal.presentationOwner, "agentique-ui");
  assert.equal(prepared.proposal.effect.address.runId, "run.native-consent-001");
});

test("explicit approve binds the canonical digest and permits exactly one matching effect", () => {
  const prepared = prepare();
  const approved = approve(prepared);

  assert.equal(approved.ok, true, JSON.stringify(approved.errors));
  assert.equal(approved.status, "approved");
  assert.equal(approved.decision.explicitUserAction, true);
  assert.equal(approved.decision.proposalDigest, prepared.proposal.proposalDigest);
  assert.equal(approved.grant.status, "active");

  const consumed = consumeNativeApproval(approved.store, exactEffect(approved), { now: "2026-09-04T00:02:00.000Z" });
  assert.equal(consumed.ok, true, JSON.stringify(consumed.errors));
  assert.equal(consumed.status, "consumed");

  const replay = consumeNativeApproval(consumed.store, exactEffect(approved), { now: "2026-09-04T00:03:00.000Z" });
  assert.equal(replay.ok, false);
  assert.ok(replay.errors.some((error) => error.code === "native-consent.grant-consumed"));
});

test("missing denial expiry and revocation all block before effect", () => {
  const prepared = prepare();
  const missing = consumeNativeApproval(prepared.store, { ...prepared.proposal.effect, grantId: "grant.missing" }, { now });
  assert.equal(missing.ok, false);

  const denied = decideNativeApproval(
    prepared.store,
    {
      proposalId: prepared.proposal.proposalId,
      proposalDigest: prepared.proposal.proposalDigest,
      decision: "denied",
      actorId: "actor.local-user"
    },
    { now: "2026-09-04T00:01:00.000Z" }
  );
  assert.equal(denied.ok, true);
  assert.equal(denied.grant, null);
  assert.equal(consumeNativeApproval(denied.store, { ...denied.proposal.effect, grantId: "grant.none" }, { now }).ok, false);

  const approved = approve(prepare());
  const expired = consumeNativeApproval(approved.store, exactEffect(approved), { now: "2026-09-04T02:00:00.000Z" });
  assert.equal(expired.ok, false);
  assert.ok(expired.errors.some((error) => error.code === "native-consent.grant-expired"));

  const revoked = revokeNativeApproval(approved.store, approved.grant.grantId, { now: "2026-09-04T00:02:00.000Z" });
  assert.equal(revoked.ok, true);
  const afterRevoke = consumeNativeApproval(revoked.store, exactEffect(approved), { now: "2026-09-04T00:03:00.000Z" });
  assert.equal(afterRevoke.ok, false);
  assert.ok(afterRevoke.errors.some((error) => error.code === "native-consent.grant-revoked"));
});

test("every confused-deputy binding and proposal drift fails closed", () => {
  const approved = approve(prepare());
  const cases = [
    { actorId: "actor.other" },
    { address: { ...approved.proposal.effect.address, runId: "run.other" } },
    { adapterId: "adapter.other" },
    { runtimeId: "runtime.other" },
    { manifestDigest: "d".repeat(64) },
    { actionId: "adapter.delete" },
    { targetRefs: ["workspace:outputs"] },
    { risk: "high" },
    { capabilityCeiling: ["files"] },
    { distributionMode: "user-installed" },
    { abortPath: "none" },
    { proposalDigest: "f".repeat(64) }
  ];

  for (const changed of cases) {
    const effect = exactEffect(approved, changed);
    const result = consumeNativeApproval(approved.store, effect, { now: "2026-09-04T00:02:00.000Z" });
    assert.equal(result.ok, false, JSON.stringify(changed));
    assert.ok(result.errors.some((error) => error.code === "native-consent.effect-mismatch" || error.code === "native-consent.proposal-digest"));
  }
});

test("broad hidden ambient command browser and credential-value proposals are rejected", () => {
  const unsafeInputs = [
    { effect: { capabilities: [{ family: "files", action: "read", target: "workspace:*" }] } },
    { effect: { capabilities: [{ family: "files", action: "read", target: "workspace:hidden/config" }] } },
    { effect: { capabilities: [{ family: "network", action: "connect", target: "https://example.invalid" }] } },
    { effect: { capabilities: [{ family: "envVault", action: "read", target: "env:PATH" }] } },
    { effect: { capabilities: [{ family: "subprocess", action: "start", target: "shell:powershell" }] } },
    { effect: { capabilities: [{ family: "browserData", action: "read", target: "browser:cookies" }] } },
    { effect: { capabilities: [{ family: "externalProviders", action: "connect", target: "credential:raw-secret-value" }], credentialValues: ["raw-secret-value"] } },
    { effect: { hidden: true } }
  ];

  for (const input of unsafeInputs) {
    const result = prepareNativeApproval(createNativeApprovalStore(), input, { now });
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.equal(result.grant, null);
  }
});

test("credential names are visible but values never enter consent evidence", () => {
  const prepared = prepareNativeApproval(
    createNativeApprovalStore(),
    {
      effect: {
        capabilities: [{ family: "externalProviders", action: "connect", target: "credential:providerCredential" }],
        capabilityCeiling: ["externalProviders"],
        credentialNames: ["providerCredential"]
      }
    },
    { now }
  );

  assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
  const text = JSON.stringify(prepared);
  assert.match(text, /providerCredential/u);
  assert.doesNotMatch(text, /credentialValues|raw-secret-value/u);
});

test("runtime requests translate behind Agentique policy without granting authority", () => {
  const translated = translateRuntimeApprovalRequest({
    requestId: "runtime.request-001",
    action: "adapter.run",
    targets: ["workspace:inputs"],
    capabilities: ["files", "subprocess"]
  });

  assert.equal(translated.ok, true, JSON.stringify(translated.errors));
  assert.equal(translated.proposal.policyOwner, "agentique-native-host");
  assert.equal(translated.proposal.presentationOwner, "agentique-ui");
  assert.equal(translated.proposal.status, "pending");
  assert.equal(translated.grant, null);
});

test("legacy approval and grant identifiers are non-authorizing evidence", () => {
  const store = createNativeApprovalStore({
    legacyEvidence: [{ approvalId: "approval.legacy", permissionGrantId: "grant.legacy" }]
  });
  const result = consumeNativeApproval(store, {
    grantId: "grant.legacy",
    proposalId: "approval.legacy",
    proposalDigest: "a".repeat(64)
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "native-consent.legacy-non-authorizing"));
});

test("native approval consent review covers accepted and blocked paths", () => {
  const review = reviewNativeApprovalConsentGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.preparePending, true);
  assert.equal(review.checks.explicitApprove, true);
  assert.equal(review.checks.singleUse, true);
  assert.equal(review.checks.runtimeTranslationPending, true);
  assert.equal(review.checks.noPackageAdoption, true);
});
