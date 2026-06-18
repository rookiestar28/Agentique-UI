const vaultRefPattern = /^vault:[a-z][a-zA-Z0-9._-]{2,80}$/u;
const sensitiveKeyPattern = /(secret|token|password|credential|privateKey|apiKey|authorization)/iu;
const sensitiveValuePattern = /(inline-secret-value|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|ya29\.[A-Za-z0-9._-]+)/iu;

export const sampleVaultState = Object.freeze({
  schemaVersion: "agentique.localVault.v1",
  records: [
    createVaultReference({
      ref: "vault:providerCredential",
      label: "Provider credential",
      kind: "external-provider",
      status: "reference-only",
      lastUsedAt: null
    }),
    createVaultReference({
      ref: "vault:webhookCredential",
      label: "Webhook credential",
      kind: "network",
      status: "missing",
      lastUsedAt: null
    })
  ]
});

export function createVaultReference(input) {
  const ref = String(input?.ref ?? "");
  if (!vaultRefPattern.test(ref)) {
    throw issue("vault.invalid-reference", "Vault reference is malformed.");
  }
  const record = {
    schemaVersion: "agentique.vaultReference.v1",
    ref,
    label: requireText(input.label, "label"),
    kind: requireText(input.kind, "kind"),
    status: requireText(input.status ?? "reference-only", "status"),
    lastUsedAt: input.lastUsedAt ?? null
  };
  assertNoInlineSecrets(record);
  return record;
}

export function assertNoInlineSecrets(value, path = "value") {
  if (value == null) return true;
  if (typeof value === "string") {
    if (sensitiveValuePattern.test(value)) {
      throw issue("vault.inline-secret", `${path} contains inline sensitive material.`);
    }
    return true;
  }
  if (typeof value !== "object") return true;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (sensitiveKeyPattern.test(key) && typeof nested === "string" && !vaultRefPattern.test(nested)) {
      throw issue("vault.inline-secret", `${nestedPath} must use a vault reference.`);
    }
    assertNoInlineSecrets(nested, nestedPath);
  }
  return true;
}

export function redactText(value) {
  const text = String(value ?? "");
  if (sensitiveValuePattern.test(text)) {
    return text.replace(sensitiveValuePattern, "redacted:inline-sensitive-material");
  }
  return text.replace(/vault:[a-z][a-zA-Z0-9._-]{2,80}/gu, "redacted:vault-reference");
}

export function sanitizeForExport(value) {
  assertNoInlineSecrets(value);
  return sanitizeValue(value);
}

export function buildRedactionReport(records) {
  const list = Array.isArray(records) ? records : [];
  return {
    schemaVersion: "agentique.redactionReport.v1",
    referenceCount: list.length,
    inlineSecretValues: 0,
    exportedValues: list.map((record) => ({
      ref: redactText(record.ref),
      label: record.label,
      status: record.status
    }))
  };
}

function sanitizeValue(value) {
  if (value == null) return value;
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
    if (sensitiveKeyPattern.test(key)) {
      return [key, vaultRefPattern.test(String(nested)) ? redactText(nested) : "redacted:vault-reference"];
    }
    return [key, sanitizeValue(nested)];
  }));
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw issue("vault.invalid-field", `${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(message));
  error.code = code;
  return error;
}
