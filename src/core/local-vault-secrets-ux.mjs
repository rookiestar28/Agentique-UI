import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

const schemaVersion = "agentique.localVaultSecretsUx.v1";
const vaultRefPattern = /^vault:[a-z][a-zA-Z0-9._-]{2,80}$/u;
const allowedRecordStatuses = new Set(["reference-only", "missing", "stale", "rotation-required", "removed"]);
const allowedOperationActions = new Set(["add-reference", "remove-reference", "rotate-reference", "unlock-failed"]);
const requiredDeniedAuthorities = Object.freeze([
  "raw-secret-storage",
  "raw-secret-preview",
  "raw-secret-export",
  "raw-secret-log",
  "raw-secret-screenshot",
  "packaged-secret",
  "ambient-environment-import",
  "browser-data-import",
  "cookie-import",
  "storage-state-import",
  "local-file-secret-import",
  "token-exchange",
  "webhook-execution",
  "native-keychain-claim"
]);

export const sampleLocalVaultSecretsUxRequest = Object.freeze({
  records: [
    {
      ref: "vault:providerCredential",
      label: "Provider credential",
      kind: "external-provider",
      provider: "review-provider",
      scopes: ["read:metadata"],
      status: "reference-only",
      lastRotatedAt: "2026-06-12T00:00:00.000Z",
      expiresAt: "2026-07-12T00:00:00.000Z",
      receiptId: "receipt.vault.provider.001"
    },
    {
      ref: "vault:webhookCredential",
      label: "Webhook credential",
      kind: "webhook",
      provider: "review-webhook",
      scopes: ["receive:event"],
      status: "rotation-required",
      lastRotatedAt: "2026-05-12T00:00:00.000Z",
      expiresAt: "2026-06-20T00:00:00.000Z",
      receiptId: "receipt.vault.webhook.001"
    },
    {
      ref: "vault:missingOauthReference",
      label: "OAuth reference",
      kind: "oauth",
      provider: "review-oauth",
      scopes: ["profile:read"],
      status: "missing",
      lastRotatedAt: null,
      expiresAt: null,
      receiptId: "receipt.vault.oauth.001"
    }
  ],
  operations: [
    {
      action: "add-reference",
      ref: "vault:newProviderReference",
      status: "ready",
      receiptId: "receipt.vault.add.001",
      valueMaterialPresent: false,
      rawValueVisible: false
    },
    {
      action: "rotate-reference",
      ref: "vault:providerCredential",
      status: "ready",
      receiptId: "receipt.vault.rotate.001",
      valueMaterialPresent: false,
      rawValueVisible: false
    },
    {
      action: "remove-reference",
      ref: "vault:oldProviderReference",
      status: "ready",
      receiptId: "receipt.vault.remove.001",
      valueMaterialPresent: false,
      rawValueVisible: false
    },
    {
      action: "unlock-failed",
      ref: "vault:providerCredential",
      status: "blocked",
      receiptId: "receipt.vault.unlock.001",
      valueMaterialPresent: false,
      rawValueVisible: false,
      reason: "unlock-failed-redacted"
    }
  ],
  keychainFeasibility: {
    status: "reviewed-not-integrated",
    selectedStrategy: "secret-reference-only",
    osKeychainCandidate: true,
    strongholdCandidate: true,
    storeMetadataOnly: true,
    nativeIntegration: false,
    secretReadbackToWebLayer: false,
    candidates: [
      { id: "os-keychain", platform: "windows-macos-linux", status: "candidate", nativeIntegration: "not-integrated", secretReadbackToWebLayer: false },
      { id: "tauri-stronghold", platform: "desktop", status: "candidate", nativeIntegration: "not-integrated", secretReadbackToWebLayer: false },
      { id: "tauri-store", platform: "desktop", status: "metadata-only", nativeIntegration: "not-secret-storage", secretReadbackToWebLayer: false }
    ]
  },
  redactionEvidence: {
    previewsRedacted: true,
    exportsRedacted: true,
    logsRedacted: true,
    screenshotsMode: "metadata-only",
    supportBundleRedacted: true,
    rawVaultRefsRemoved: true,
    pathNeutral: true,
    localPathsRemoved: true,
    internalMarkersRemoved: true,
    boundedBytes: 4096,
    packagedSecretsIncluded: false,
    rawLogsIncluded: false,
    rawScreenshotsIncluded: false
  },
  sourceBoundaries: {
    packagedSecrets: false,
    ambientEnvironmentImport: false,
    browserDataImport: false,
    cookieImport: false,
    storageStateImport: false,
    localFileSecretImport: false,
    rawLogImport: false,
    rawScreenshotImport: false
  },
  oauthWebhookBoundary: {
    credentialReferenceFieldsOnly: true,
    scopeMetadataOnly: true,
    tokenExchange: false,
    webhookExecution: false,
    externalProviderAutomation: false
  },
  deniedAuthorities: requiredDeniedAuthorities,
  claims: {
    osKeychainIntegrated: false,
    strongholdIntegrated: false,
    secretValuesAvailable: false,
    packagedSecrets: false,
    ambientEnvironmentImport: false,
    browserDataImport: false,
    tokenExchange: false,
    webhookExecution: false,
    externalProviderAutomation: false,
    productionDesktopRuntime: false
  }
});

export function createLocalVaultSecretsReview(request = sampleLocalVaultSecretsUxRequest) {
  const errors = [];
  assertNoInlineSecretMaterial(request, errors);
  const records = reviewRecords(request?.records, errors);
  const operations = reviewOperations(request?.operations, errors);
  const keychainFeasibility = reviewKeychainFeasibility(request?.keychainFeasibility, errors);
  const redactionEvidence = reviewRedactionEvidence(request?.redactionEvidence, errors);
  const sourceBoundaries = reviewSourceBoundaries(request?.sourceBoundaries, errors);
  const oauthWebhookBoundary = reviewOauthWebhookBoundary(request?.oauthWebhookBoundary, errors);
  const deniedAuthorities = reviewDeniedAuthorities(Array.from(request?.deniedAuthorities ?? []), errors);
  const claims = reviewClaims(request?.claims, errors);
  const ok = errors.length === 0;

  return sanitizeReview({
    schemaVersion,
    ok,
    status: ok ? "reference-only-ready" : "blocked",
    storesSecretValues: false,
    exposesSecretValues: false,
    packagesSecretValues: false,
    records,
    operations,
    keychainFeasibility,
    redactionEvidence,
    sourceBoundaries,
    oauthWebhookBoundary,
    deniedAuthorities,
    claims,
    supportBundle: {
      status: redactionEvidence.status === "ready" && sourceBoundaries.status === "ready" ? "redacted-ready" : "blocked",
      pathNeutral: redactionEvidence.pathNeutral,
      boundedBytes: redactionEvidence.boundedBytes,
      includesRawSecrets: false,
      includesLocalPaths: false
    },
    errors: errors.map((error) => ({ code: error.code, message: redactText(error.message) }))
  });
}

export function reviewLocalVaultSecretsGate() {
  const approved = createLocalVaultSecretsReview();
  const inlineSecret = createLocalVaultSecretsReview({
    ...sampleLocalVaultSecretsUxRequest,
    records: [
      {
        ...sampleLocalVaultSecretsUxRequest.records[0],
        label: ["bearer", "abcdefghijklmnop"].join(" ")
      }
    ]
  });
  const malformedReference = createLocalVaultSecretsReview({
    ...sampleLocalVaultSecretsUxRequest,
    records: [{ ...sampleLocalVaultSecretsUxRequest.records[0], ref: "providerCredential" }]
  });
  const unsupportedNativeClaim = createLocalVaultSecretsReview({
    ...sampleLocalVaultSecretsUxRequest,
    keychainFeasibility: { ...sampleLocalVaultSecretsUxRequest.keychainFeasibility, nativeIntegration: true, secretReadbackToWebLayer: true },
    claims: { ...sampleLocalVaultSecretsUxRequest.claims, osKeychainIntegrated: true, secretValuesAvailable: true }
  });
  const rawEvidence = createLocalVaultSecretsReview({
    ...sampleLocalVaultSecretsUxRequest,
    redactionEvidence: {
      ...sampleLocalVaultSecretsUxRequest.redactionEvidence,
      logsRedacted: false,
      screenshotsMode: "raw",
      packagedSecretsIncluded: true
    }
  });
  const unsafeSources = createLocalVaultSecretsReview({
    ...sampleLocalVaultSecretsUxRequest,
    sourceBoundaries: {
      ...sampleLocalVaultSecretsUxRequest.sourceBoundaries,
      ambientEnvironmentImport: true,
      browserDataImport: true,
      cookieImport: true,
      storageStateImport: true,
      localFileSecretImport: true
    },
    oauthWebhookBoundary: {
      ...sampleLocalVaultSecretsUxRequest.oauthWebhookBoundary,
      tokenExchange: true,
      webhookExecution: true,
      externalProviderAutomation: true
    }
  });

  return {
    schemaVersion: "agentique.localVaultSecretsGateReview.v1",
    ok: approved.ok && !inlineSecret.ok && !malformedReference.ok && !unsupportedNativeClaim.ok && !rawEvidence.ok && !unsafeSources.ok,
    approvedStatus: approved.status,
    storesSecretValues: approved.storesSecretValues,
    exposesSecretValues: approved.exposesSecretValues,
    keychainStatus: approved.keychainFeasibility.status,
    inlineSecretBlocked: inlineSecret.errors.some((error) => error.code === "vault.inline-secret"),
    malformedReferenceBlocked: malformedReference.errors.some((error) => error.code === "vault.reference"),
    unsupportedNativeClaimBlocked: unsupportedNativeClaim.errors.some((error) => ["vault.native-claim", "vault.unsupported-claim"].includes(error.code)),
    rawEvidenceBlocked: rawEvidence.errors.some((error) => ["vault.redaction", "vault.packaged-secret"].includes(error.code)),
    unsafeSourcesBlocked: unsafeSources.errors.some((error) => ["vault.source-boundary", "vault.oauth-webhook"].includes(error.code)),
    summary: {
      records: approved.records.length,
      operations: approved.operations.length,
      deniedAuthorities: approved.deniedAuthorities.authorities.length,
      redaction: approved.redactionEvidence.status
    }
  };
}

export function assertLocalVaultSecretsPolicySafe(policy) {
  const review = createLocalVaultSecretsReview(policy);
  if (!review.ok) {
    const first = review.errors[0] ?? { code: "vault.policy", message: "Local vault secrets policy failed." };
    throw issue(first.code, first.message);
  }
  return true;
}

function reviewRecords(records = [], errors) {
  const list = Array.isArray(records) ? records : [];
  if (list.length === 0) {
    errors.push(issue("vault.records", "Local vault review requires at least one reference record."));
  }
  return list.map((record) => {
    const ref = String(record?.ref ?? "");
    const status = String(record?.status ?? "");
    if (!vaultRefPattern.test(ref)) {
      errors.push(issue("vault.reference", "Vault record references must use opaque vault references."));
    }
    if (!allowedRecordStatuses.has(status)) {
      errors.push(issue("vault.record-status", "Vault record status is not supported."));
    }
    const scopes = Array.isArray(record?.scopes) ? record.scopes.map((scope) => redactText(String(scope))) : [];
    if (scopes.length === 0) {
      errors.push(issue("vault.scopes", "Vault record requires scope metadata."));
    }
    return {
      ref: vaultRefPattern.test(ref) ? redactText(ref) : "blocked",
      label: redactText(record?.label ?? ""),
      kind: redactText(record?.kind ?? "unknown"),
      provider: redactText(record?.provider ?? "unknown"),
      scopes,
      status: allowedRecordStatuses.has(status) ? status : "blocked",
      lastRotatedAt: safeIsoOrNull(record?.lastRotatedAt, errors, "lastRotatedAt"),
      expiresAt: safeIsoOrNull(record?.expiresAt, errors, "expiresAt"),
      receiptId: sanitizeId(record?.receiptId ?? "receipt.vault.unknown", "receiptId", errors)
    };
  });
}

function reviewOperations(operations = [], errors) {
  const list = Array.isArray(operations) ? operations : [];
  const actions = new Set(list.map((operation) => String(operation?.action ?? "")));
  for (const requiredAction of allowedOperationActions) {
    if (!actions.has(requiredAction)) {
      errors.push(issue("vault.operation-missing", "Vault lifecycle operation evidence is incomplete."));
      break;
    }
  }
  return list.map((operation) => {
    const action = String(operation?.action ?? "");
    const ref = String(operation?.ref ?? "");
    if (!allowedOperationActions.has(action)) {
      errors.push(issue("vault.operation-action", "Vault operation action is not supported."));
    }
    if (!vaultRefPattern.test(ref)) {
      errors.push(issue("vault.operation-reference", "Vault operation must target an opaque vault reference."));
    }
    if (operation?.valueMaterialPresent === true || operation?.rawValueVisible === true) {
      errors.push(issue("vault.raw-value", "Vault lifecycle operations must not include raw secret material."));
    }
    return {
      action: allowedOperationActions.has(action) ? action : "blocked",
      ref: vaultRefPattern.test(ref) ? redactText(ref) : "blocked",
      status: redactText(operation?.status ?? "unknown"),
      receiptId: sanitizeId(operation?.receiptId ?? "receipt.vault.unknown", "receiptId", errors),
      valueMaterialPresent: operation?.valueMaterialPresent === true,
      rawValueVisible: operation?.rawValueVisible === true,
      reason: operation?.reason ? redactText(operation.reason) : null
    };
  });
}

function reviewKeychainFeasibility(feasibility = {}, errors) {
  if (feasibility.status !== "reviewed-not-integrated" || feasibility.selectedStrategy !== "secret-reference-only") {
    errors.push(issue("vault.keychain-status", "Keychain feasibility must remain reviewed and not integrated for this gate."));
  }
  if (
    feasibility.nativeIntegration === true ||
    feasibility.secretReadbackToWebLayer === true ||
    feasibility.candidates?.some?.((candidate) => candidate.nativeIntegration === "integrated" || candidate.secretReadbackToWebLayer === true)
  ) {
    errors.push(issue("vault.native-claim", "Native keychain integration and web-layer secret readback are not accepted by this gate."));
  }
  const candidates = Array.isArray(feasibility.candidates) ? feasibility.candidates : [];
  if (!candidates.some((candidate) => candidate.id === "os-keychain") || !candidates.some((candidate) => candidate.id === "tauri-stronghold")) {
    errors.push(issue("vault.keychain-candidates", "Vault feasibility must review OS keychain and Stronghold candidates."));
  }
  return {
    status: feasibility.status === "reviewed-not-integrated" ? feasibility.status : "blocked",
    selectedStrategy: feasibility.selectedStrategy === "secret-reference-only" ? feasibility.selectedStrategy : "blocked",
    osKeychainCandidate: feasibility.osKeychainCandidate === true,
    strongholdCandidate: feasibility.strongholdCandidate === true,
    storeMetadataOnly: feasibility.storeMetadataOnly === true,
    nativeIntegration: feasibility.nativeIntegration === true,
    secretReadbackToWebLayer: feasibility.secretReadbackToWebLayer === true,
    candidates: candidates.map((candidate) => ({
      id: redactText(candidate?.id ?? "unknown"),
      platform: redactText(candidate?.platform ?? "unknown"),
      status: redactText(candidate?.status ?? "unknown"),
      nativeIntegration: redactText(candidate?.nativeIntegration ?? "unknown"),
      secretReadbackToWebLayer: candidate?.secretReadbackToWebLayer === true
    }))
  };
}

function reviewRedactionEvidence(evidence = {}, errors) {
  if (
    evidence.previewsRedacted !== true ||
    evidence.exportsRedacted !== true ||
    evidence.logsRedacted !== true ||
    evidence.screenshotsMode !== "metadata-only" ||
    evidence.supportBundleRedacted !== true ||
    evidence.rawVaultRefsRemoved !== true ||
    evidence.pathNeutral !== true ||
    evidence.localPathsRemoved !== true ||
    evidence.internalMarkersRemoved !== true
  ) {
    errors.push(issue("vault.redaction", "Vault previews, exports, logs, screenshots, and support evidence must be redacted and path-neutral."));
  }
  const boundedBytes = Number(evidence.boundedBytes);
  if (!Number.isInteger(boundedBytes) || boundedBytes < 1 || boundedBytes > 16384) {
    errors.push(issue("vault.redaction-bound", "Vault redaction evidence must be bounded."));
  }
  if (evidence.packagedSecretsIncluded === true) {
    errors.push(issue("vault.packaged-secret", "Packaged secrets are blocked."));
  }
  if (evidence.rawLogsIncluded === true || evidence.rawScreenshotsIncluded === true) {
    errors.push(issue("vault.raw-evidence", "Raw logs and raw screenshots are blocked."));
  }
  const ready =
    evidence.previewsRedacted === true &&
    evidence.exportsRedacted === true &&
    evidence.logsRedacted === true &&
    evidence.screenshotsMode === "metadata-only" &&
    evidence.supportBundleRedacted === true &&
    evidence.pathNeutral === true;
  return {
    previewsRedacted: evidence.previewsRedacted === true,
    exportsRedacted: evidence.exportsRedacted === true,
    logsRedacted: evidence.logsRedacted === true,
    screenshotsMode: evidence.screenshotsMode === "metadata-only" ? "metadata-only" : "blocked",
    supportBundleRedacted: evidence.supportBundleRedacted === true,
    rawVaultRefsRemoved: evidence.rawVaultRefsRemoved === true,
    pathNeutral: evidence.pathNeutral === true,
    localPathsRemoved: evidence.localPathsRemoved === true,
    internalMarkersRemoved: evidence.internalMarkersRemoved === true,
    boundedBytes,
    packagedSecretsIncluded: evidence.packagedSecretsIncluded === true,
    rawLogsIncluded: evidence.rawLogsIncluded === true,
    rawScreenshotsIncluded: evidence.rawScreenshotsIncluded === true,
    status: ready ? "ready" : "blocked"
  };
}

function reviewSourceBoundaries(boundaries = {}, errors) {
  const normalized = {
    packagedSecrets: boundaries.packagedSecrets === true,
    ambientEnvironmentImport: boundaries.ambientEnvironmentImport === true,
    browserDataImport: boundaries.browserDataImport === true,
    cookieImport: boundaries.cookieImport === true,
    storageStateImport: boundaries.storageStateImport === true,
    localFileSecretImport: boundaries.localFileSecretImport === true,
    rawLogImport: boundaries.rawLogImport === true,
    rawScreenshotImport: boundaries.rawScreenshotImport === true
  };
  if (Object.values(normalized).some(Boolean)) {
    errors.push(issue("vault.source-boundary", "Packaged, environment, browser, local-file, raw-log, and screenshot secret sources are blocked."));
  }
  return {
    ...normalized,
    status: Object.values(normalized).some(Boolean) ? "blocked" : "ready"
  };
}

function reviewOauthWebhookBoundary(boundary = {}, errors) {
  if (
    boundary.credentialReferenceFieldsOnly !== true ||
    boundary.scopeMetadataOnly !== true ||
    boundary.tokenExchange === true ||
    boundary.webhookExecution === true ||
    boundary.externalProviderAutomation === true
  ) {
    errors.push(issue("vault.oauth-webhook", "OAuth, webhook, and provider fields must remain reference-only metadata."));
  }
  return {
    credentialReferenceFieldsOnly: boundary.credentialReferenceFieldsOnly === true,
    scopeMetadataOnly: boundary.scopeMetadataOnly === true,
    tokenExchange: boundary.tokenExchange === true,
    webhookExecution: boundary.webhookExecution === true,
    externalProviderAutomation: boundary.externalProviderAutomation === true,
    status: boundary.credentialReferenceFieldsOnly === true && boundary.scopeMetadataOnly === true ? "reference-only" : "blocked"
  };
}

function reviewDeniedAuthorities(deniedAuthorities = [], errors) {
  const authorities = Array.isArray(deniedAuthorities) ? deniedAuthorities.map(String) : [];
  const missing = requiredDeniedAuthorities.filter((authority) => !authorities.includes(authority));
  if (missing.length > 0) {
    errors.push(issue("vault.denied-authority-list", "Local vault denied authority list is incomplete."));
  }
  return {
    status: missing.length === 0 ? "complete" : "incomplete",
    authorities,
    missing
  };
}

function reviewClaims(claims = {}, errors) {
  const normalized = {
    osKeychainIntegrated: claims.osKeychainIntegrated === true,
    strongholdIntegrated: claims.strongholdIntegrated === true,
    secretValuesAvailable: claims.secretValuesAvailable === true,
    packagedSecrets: claims.packagedSecrets === true,
    ambientEnvironmentImport: claims.ambientEnvironmentImport === true,
    browserDataImport: claims.browserDataImport === true,
    tokenExchange: claims.tokenExchange === true,
    webhookExecution: claims.webhookExecution === true,
    externalProviderAutomation: claims.externalProviderAutomation === true,
    productionDesktopRuntime: claims.productionDesktopRuntime === true
  };
  for (const [claim, value] of Object.entries(normalized)) {
    if (value === true) {
      errors.push(issue("vault.unsupported-claim", `${claim} is not supported by the local vault secrets UX gate.`));
    }
  }
  return normalized;
}

function assertNoInlineSecretMaterial(value, errors) {
  try {
    assertNoInlineSecrets(value);
  } catch (caught) {
    errors.push(issue(caught.code ?? "vault.inline-secret", caught.message));
  }
}

function sanitizeReview(value) {
  if (value == null) return value;
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeReview(item));
  if (typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sanitizeReview(nested)]));
}

function safeIsoOrNull(value, errors, fieldName) {
  if (value == null) return null;
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    errors.push(issue("vault.invalid-date", `${fieldName} must be an ISO timestamp or null.`));
    return "blocked";
  }
  return new Date(parsed).toISOString();
}

function sanitizeId(value, fieldName, errors) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u.test(text) || text.includes("..") || text.includes("/") || text.includes("\\") || text.includes(":")) {
    errors.push(issue("vault.invalid-id", `${fieldName} must be an opaque id.`));
    return "blocked";
  }
  return text;
}

function issue(code, message) {
  return Object.assign(new Error(redactText(message)), { code });
}
