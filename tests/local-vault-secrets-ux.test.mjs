import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLocalVaultSecretsPolicySafe,
  createLocalVaultSecretsReview,
  reviewLocalVaultSecretsGate,
  sampleLocalVaultSecretsUxRequest
} from "../src/core/local-vault-secrets-ux.mjs";

test("complete local vault review is reference-only and redacted", () => {
  const review = createLocalVaultSecretsReview();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.status, "reference-only-ready");
  assert.equal(review.storesSecretValues, false);
  assert.equal(review.exposesSecretValues, false);
  assert.equal(review.packagesSecretValues, false);
  assert.equal(review.keychainFeasibility.status, "reviewed-not-integrated");
  assert.equal(review.keychainFeasibility.nativeIntegration, false);
  assert.equal(review.keychainFeasibility.secretReadbackToWebLayer, false);
  assert.equal(review.redactionEvidence.status, "ready");
  assert.equal(review.redactionEvidence.screenshotsMode, "metadata-only");
  assert.equal(review.supportBundle.includesRawSecrets, false);
  assert.equal(review.sourceBoundaries.status, "ready");
  assert.equal(review.oauthWebhookBoundary.status, "reference-only");
  assert.equal(review.operations.length >= 4, true);
  assert.match(JSON.stringify(review), /redacted:vault-reference/u);
  assert.doesNotMatch(JSON.stringify(review), /vault:providerCredential|vault:webhookCredential/u);
  assert.doesNotThrow(() => assertLocalVaultSecretsPolicySafe(sampleLocalVaultSecretsUxRequest));
});

test("inline secret material and malformed references fail closed", () => {
  const inline = createLocalVaultSecretsReview({
    ...sampleLocalVaultSecretsUxRequest,
    records: [{ ...sampleLocalVaultSecretsUxRequest.records[0], label: ["bearer", "abcdefghijklmnop"].join(" ") }]
  });
  const malformed = createLocalVaultSecretsReview({
    ...sampleLocalVaultSecretsUxRequest,
    records: [{ ...sampleLocalVaultSecretsUxRequest.records[0], ref: "providerCredential" }]
  });

  assert.equal(inline.ok, false);
  assert.ok(inline.errors.some((error) => error.code === "vault.inline-secret"));
  assert.equal(malformed.ok, false);
  assert.ok(malformed.errors.some((error) => error.code === "vault.reference"));
});

test("native keychain overclaims and web-layer readback fail closed", () => {
  const review = createLocalVaultSecretsReview({
    ...sampleLocalVaultSecretsUxRequest,
    keychainFeasibility: {
      ...sampleLocalVaultSecretsUxRequest.keychainFeasibility,
      nativeIntegration: true,
      secretReadbackToWebLayer: true
    },
    claims: {
      ...sampleLocalVaultSecretsUxRequest.claims,
      osKeychainIntegrated: true,
      secretValuesAvailable: true
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "vault.native-claim"));
  assert.ok(review.errors.some((error) => error.code === "vault.unsupported-claim"));
});

test("raw exports logs screenshots packaged secrets and unsafe sources are rejected", () => {
  const review = createLocalVaultSecretsReview({
    ...sampleLocalVaultSecretsUxRequest,
    redactionEvidence: {
      ...sampleLocalVaultSecretsUxRequest.redactionEvidence,
      previewsRedacted: false,
      logsRedacted: false,
      screenshotsMode: "raw",
      packagedSecretsIncluded: true,
      rawLogsIncluded: true
    },
    sourceBoundaries: {
      ...sampleLocalVaultSecretsUxRequest.sourceBoundaries,
      ambientEnvironmentImport: true,
      browserDataImport: true,
      cookieImport: true,
      storageStateImport: true,
      localFileSecretImport: true
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "vault.redaction"));
  assert.ok(review.errors.some((error) => error.code === "vault.packaged-secret"));
  assert.ok(review.errors.some((error) => error.code === "vault.raw-evidence"));
  assert.ok(review.errors.some((error) => error.code === "vault.source-boundary"));
});

test("OAuth webhook and provider boundaries stay reference-only", () => {
  const review = createLocalVaultSecretsReview({
    ...sampleLocalVaultSecretsUxRequest,
    oauthWebhookBoundary: {
      ...sampleLocalVaultSecretsUxRequest.oauthWebhookBoundary,
      tokenExchange: true,
      webhookExecution: true,
      externalProviderAutomation: true
    }
  });
  const gate = reviewLocalVaultSecretsGate();

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "vault.oauth-webhook"));
  assert.equal(gate.ok, true, JSON.stringify(gate));
  assert.equal(gate.inlineSecretBlocked, true);
  assert.equal(gate.malformedReferenceBlocked, true);
  assert.equal(gate.unsupportedNativeClaimBlocked, true);
  assert.equal(gate.rawEvidenceBlocked, true);
  assert.equal(gate.unsafeSourcesBlocked, true);
});
