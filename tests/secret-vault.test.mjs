import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoInlineSecrets,
  buildRedactionReport,
  createVaultReference,
  redactText,
  sampleVaultState,
  sanitizeForExport
} from "../src/core/secret-vault.mjs";

test("vault references store metadata without inline values", () => {
  assert.equal(sampleVaultState.records.length, 2);
  assert.equal(sampleVaultState.records[0].ref, "vault:providerCredential");
  assert.equal(sampleVaultState.records[0].status, "reference-only");
  assert.doesNotThrow(() => assertNoInlineSecrets(sampleVaultState));
});

test("malformed references and inline sensitive strings fail closed", () => {
  assert.throws(
    () => createVaultReference({ ref: "providerCredential", label: "Provider", kind: "provider" }),
    /malformed/u
  );
  assert.throws(
    () => assertNoInlineSecrets({ credential: ["inline", "secret", "value"].join("-") }),
    /vault reference|inline sensitive/u
  );
});

test("redaction covers UI text, exports, and failure records", () => {
  assert.equal(redactText("Use vault:providerCredential"), "Use redacted:vault-reference");
  const exported = sanitizeForExport({
    output: "vault:webhookCredential",
    failure: { credential: "vault:providerCredential" }
  });
  assert.equal(exported.output, "redacted:vault-reference");
  assert.equal(exported.failure.credential, "redacted:vault-reference");
});

test("redaction report includes references only", () => {
  const report = buildRedactionReport(sampleVaultState.records);
  assert.equal(report.referenceCount, 2);
  assert.equal(report.inlineSecretValues, 0);
  assert.equal(report.exportedValues[0].ref, "redacted:vault-reference");
});
