export const libraryUpdateLifecycleSchemaVersion = "agentique.localLibraryUpdateLifecycle.v1";

export const requiredLibraryUpdateStates = Object.freeze(["current", "available", "stale", "conflict", "error", "offline"]);

const requiredFailClosedCodes = Object.freeze(["unsafe-downgrade", "digest-mismatch", "inline-private-field", "stale-ticket"]);
const secretKeyPattern = /(secret|token|password|credential|privatekey|api[_-]?key|authorization)/iu;
const secretValuePattern =
  /(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|ya29\.[A-Za-z0-9._-]+|bearer\s+[A-Za-z0-9._-]{12,}|secret-ref:|-----BEGIN [A-Z ]*PRIVATE KEY-----)/iu;
const sampleNow = "2026-06-17T12:00:00.000Z";
const sampleCurrentResource = Object.freeze({
  resourceId: "example.visual-guide",
  title: "Example Visual Guide",
  version: "0.1.0",
  digest: "e".repeat(64),
  supportMode: "visualizable",
  provenance: {
    sourceDigest: "b".repeat(64),
    publishedDigest: "c".repeat(64),
    verificationStatus: "verified",
    signer: "agentique-example"
  }
});

export const sampleLibraryUpdateLifecycle = createLibraryUpdateLifecycle({
  currentRecord: sampleCurrentResource,
  now: sampleNow,
  includeOffline: true,
  candidates: [
    sampleCandidate({ id: "available-update", version: "0.2.0", digest: "a".repeat(64), sourceDigest: "d".repeat(64) }),
    sampleCandidate({ id: "stale-metadata", stateHint: "stale", version: "0.2.0", digest: "6".repeat(64), sourceDigest: "7".repeat(64) }),
    sampleCandidate({ id: "provenance-conflict", stateHint: "conflict", version: "0.2.0", digest: "8".repeat(64), sourceDigest: "9".repeat(64) }),
    sampleCandidate({ id: "unsafe-downgrade", version: "0.0.9", digest: "1".repeat(64), sourceDigest: "1".repeat(64) }),
    sampleCandidate({ id: "digest-mismatch", version: "0.2.1", digest: "2".repeat(64), expectedDigest: "3".repeat(64), sourceDigest: "2".repeat(64) }),
    sampleCandidate({
      id: "private-field",
      version: "0.2.2",
      digest: "4".repeat(64),
      sourceDigest: "4".repeat(64),
      metadata: { apiKey: "redacted-placeholder" }
    }),
    sampleCandidate({
      id: "stale-ticket",
      version: "0.2.3",
      digest: "5".repeat(64),
      sourceDigest: "5".repeat(64),
      ticketExpiresAt: "2026-06-17T11:59:59.000Z"
    })
  ]
});

export function reviewLibraryUpdateLifecycle({ lifecycle = sampleLibraryUpdateLifecycle } = {}) {
  const validation = validateLibraryUpdateLifecycle(lifecycle);
  return {
    status: validation.ok ? "passed" : "failed",
    lifecycle: clone(lifecycle),
    validation,
    summary: validation.summary
  };
}

/**
 * @param {{ currentRecord?: any, candidates?: any[], now?: string, includeOffline?: boolean }} [options]
 */
export function createLibraryUpdateLifecycle({ currentRecord = null, candidates = [], now = new Date().toISOString(), includeOffline = false } = {}) {
  const checkedAt = requireIsoDate(now, "now");
  const current = normalizeCurrentRecord(currentRecord);
  const entries = [createCurrentEntry(current, checkedAt)];

  for (const rawCandidate of candidates) {
    entries.push(createCandidateEntry(current, rawCandidate, checkedAt));
  }
  if (includeOffline) {
    entries.push(createOfflineEntry(current, checkedAt));
  }

  const lifecycle = {
    schemaVersion: libraryUpdateLifecycleSchemaVersion,
    generatedAt: checkedAt,
    resource: {
      resourceId: current.resourceId,
      title: current.title,
      supportMode: current.supportMode
    },
    interactionEvidence: interactionEvidence(current),
    entries
  };
  assertNoInlinePrivateMaterial(lifecycle);
  return clone(lifecycle);
}

export function validateLibraryUpdateLifecycle(lifecycle) {
  const failures = [];
  if (lifecycle?.schemaVersion !== libraryUpdateLifecycleSchemaVersion) {
    failures.push(issue("schema-version", "Unsupported library update lifecycle schema version."));
  }

  const entries = Array.isArray(lifecycle?.entries) ? lifecycle.entries : [];
  if (entries.length === 0) {
    failures.push(issue("missing-entries", "Library update lifecycle must include entries."));
  }

  const states = new Set(entries.map((entry) => entry.state));
  for (const state of requiredLibraryUpdateStates) {
    if (!states.has(state)) {
      failures.push(issue("missing-state", `Library update lifecycle is missing ${state} state.`));
    }
  }

  try {
    assertNoInlinePrivateMaterial(lifecycle);
  } catch (error) {
    failures.push(issue(errorCode(error, "inline-private-field"), errorMessage(error, "Update lifecycle contains inline private metadata.")));
  }

  for (const entry of entries) {
    validateEntry(entry, failures);
  }

  const failClosedCodes = new Set(entries.filter((entry) => entry.state === "error").flatMap((entry) => (entry.failClosed ?? []).map((failure) => failure.code)));
  const interactionViewports = new Set((lifecycle?.interactionEvidence ?? []).map((entry) => entry.viewport));
  for (const viewport of ["desktop", "narrow"]) {
    if (!interactionViewports.has(viewport)) {
      failures.push(issue("missing-interaction-evidence", `Missing ${viewport} library update lifecycle interaction evidence.`));
    }
  }

  for (const requiredCode of requiredFailClosedCodes) {
    if (!failClosedCodes.has(requiredCode)) {
      failures.push(issue("missing-fail-closed-case", `Missing fail-closed case: ${requiredCode}.`));
    }
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    summary: {
      entries: entries.length,
      requiredStates: requiredLibraryUpdateStates.length,
      failClosedCases: requiredFailClosedCodes.filter((code) => failClosedCodes.has(code)).length,
      interactionViewports: interactionViewports.size,
      previewableEntries: entries.filter((entry) => entry.preview?.allowed === true).length
    }
  };
}

function createCandidateEntry(current, rawCandidate, now) {
  try {
    const candidate = normalizeCandidate(rawCandidate);
    if (candidate.stateHint === "stale") {
      return createStaleEntry(current, candidate, now);
    }
    if (candidate.stateHint === "conflict") {
      return createConflictEntry(current, candidate, now);
    }

    if (compareVersions(candidate.version, current.version) < 0) {
      return createErrorEntry(current, candidate, "unsafe-downgrade", "Candidate version is lower than the current local version.", now);
    }
    if (new Date(candidate.ticketExpiresAt).getTime() <= new Date(now).getTime()) {
      return createErrorEntry(current, candidate, "stale-ticket", "Update ticket is stale and must be refreshed before preview.", now);
    }
    if (candidate.digest !== candidate.expectedDigest) {
      return createErrorEntry(current, candidate, "digest-mismatch", "Candidate digest does not match the expected update digest.", now);
    }

    return createAvailableEntry(current, candidate, now);
  } catch (error) {
    const candidate = safeCandidatePreview(rawCandidate);
    return createErrorEntry(current, candidate, errorCode(error, "candidate-invalid"), errorMessage(error, "Candidate update metadata is invalid."), now);
  }
}

function createCurrentEntry(current, now) {
  return baseEntry({
    id: `${current.resourceId}:current:${current.version}`,
    state: "current",
    current,
    candidate: currentCandidate(current),
    now,
    digestComparison: sameDigestComparison(current),
    provenanceComparison: sameProvenanceComparison(current),
    preview: preview("current-local-version", false),
    rollback: rollback(false, current),
    cleanup: cleanup(false, []),
    offline: offline(true, true),
    failClosed: []
  });
}

function createAvailableEntry(current, candidate, now) {
  return baseEntry({
    id: `${current.resourceId}:available:${candidate.version}`,
    state: "available",
    current,
    candidate,
    now,
    digestComparison: digestComparison(current, candidate),
    provenanceComparison: provenanceComparison(current, candidate),
    preview: preview("review-update-preview", true),
    rollback: rollback(true, current),
    cleanup: cleanup(true, [current.version]),
    offline: offline(true, true),
    failClosed: []
  });
}

function createStaleEntry(current, candidate, now) {
  return baseEntry({
    id: `${current.resourceId}:stale:${candidate.id}`,
    state: "stale",
    current,
    candidate,
    now,
    digestComparison: digestComparison(current, candidate),
    provenanceComparison: provenanceComparison(current, candidate),
    preview: preview("refresh-update-metadata", false),
    rollback: rollback(true, current),
    cleanup: cleanup(true, [current.version]),
    offline: offline(true, true),
    failClosed: []
  });
}

function createConflictEntry(current, candidate, now) {
  return baseEntry({
    id: `${current.resourceId}:conflict:${candidate.id}`,
    state: "conflict",
    current,
    candidate,
    now,
    digestComparison: digestComparison(current, candidate, "conflict"),
    provenanceComparison: provenanceComparison(current, candidate, "conflict"),
    preview: preview("resolve-provenance-conflict", false),
    rollback: rollback(true, current),
    cleanup: cleanup(false, []),
    offline: offline(true, true),
    failClosed: []
  });
}

function createErrorEntry(current, candidate, code, message, now) {
  return baseEntry({
    id: `${current.resourceId}:error:${candidate.id ?? code}`,
    state: "error",
    current,
    candidate,
    now,
    digestComparison: digestComparison(current, candidate, code === "digest-mismatch" ? "mismatch" : undefined),
    provenanceComparison: provenanceComparison(current, candidate),
    preview: preview(`blocked-${code}`, false),
    rollback: rollback(true, current),
    cleanup: cleanup(false, []),
    offline: offline(true, true),
    failClosed: [{ code, message }]
  });
}

function createOfflineEntry(current, now) {
  return baseEntry({
    id: `${current.resourceId}:offline:${current.version}`,
    state: "offline",
    current,
    candidate: currentCandidate(current),
    now,
    digestComparison: sameDigestComparison(current),
    provenanceComparison: sameProvenanceComparison(current),
    preview: preview("offline-cached-metadata-only", false),
    rollback: rollback(true, current),
    cleanup: cleanup(false, []),
    offline: offline(true, true, "cached-metadata-only"),
    failClosed: []
  });
}

function baseEntry({
  id,
  state,
  current,
  candidate,
  now,
  digestComparison: digest,
  provenanceComparison: provenance,
  preview: previewData,
  rollback: rollbackData,
  cleanup: cleanupData,
  offline: offlineData,
  failClosed
}) {
  return {
    id,
    state,
    checkedAt: now,
    resource: {
      resourceId: current.resourceId,
      title: current.title,
      supportMode: current.supportMode
    },
    current: {
      version: current.version,
      digest: current.digest,
      provenance: current.provenance
    },
    available: {
      version: candidate.version,
      digest: candidate.digest,
      expectedDigest: candidate.expectedDigest,
      ticketIssuedAt: candidate.ticketIssuedAt,
      ticketExpiresAt: candidate.ticketExpiresAt,
      provenance: candidate.provenance
    },
    digestComparison: digest,
    provenanceComparison: provenance,
    preview: previewData,
    rollback: rollbackData,
    cleanup: cleanupData,
    offline: offlineData,
    failClosed
  };
}

function normalizeCurrentRecord(record) {
  assertPlainObject(record, "currentRecord");
  return {
    resourceId: requireText(record.resourceId, "currentRecord.resourceId"),
    title: requireText(record.title, "currentRecord.title"),
    version: requireText(record.version, "currentRecord.version"),
    digest: requireDigest(record.digest, "currentRecord.digest"),
    supportMode: requireText(record.supportMode, "currentRecord.supportMode"),
    provenance: normalizeProvenance(record.provenance, "currentRecord.provenance")
  };
}

function normalizeCandidate(rawCandidate) {
  assertNoInlinePrivateMaterial(rawCandidate);
  assertPlainObject(rawCandidate, "candidate");
  const digest = requireDigest(rawCandidate.digest, "candidate.digest");
  return {
    id: requireText(rawCandidate.id, "candidate.id"),
    stateHint: rawCandidate.stateHint ? requireText(rawCandidate.stateHint, "candidate.stateHint") : null,
    version: requireText(rawCandidate.version, "candidate.version"),
    digest,
    expectedDigest: requireDigest(rawCandidate.expectedDigest ?? digest, "candidate.expectedDigest"),
    ticketIssuedAt: requireIsoDate(rawCandidate.ticketIssuedAt, "candidate.ticketIssuedAt"),
    ticketExpiresAt: requireIsoDate(rawCandidate.ticketExpiresAt, "candidate.ticketExpiresAt"),
    provenance: normalizeProvenance(rawCandidate.provenance, "candidate.provenance")
  };
}

function validateEntry(entry, failures) {
  if (!requiredLibraryUpdateStates.includes(entry?.state)) {
    failures.push(issue("unknown-state", `Unknown update lifecycle state: ${entry?.state ?? "missing"}.`));
  }
  if (!entry?.resource?.resourceId || !entry?.current?.version || !isDigest(entry?.current?.digest)) {
    failures.push(issue("resource-metadata", "Lifecycle entry must include resource id, current version, and current digest."));
  }
  if (entry?.preview?.reviewOnly !== true) {
    failures.push(issue("preview-review-only", "Update lifecycle preview must be review-only."));
  }
  if (entry?.preview?.installAutomatically === true) {
    failures.push(issue("automatic-install", "Update lifecycle must not allow automatic install."));
  }
  if (entry?.preview?.executesCode === true) {
    failures.push(issue("hidden-execution", "Update lifecycle must not execute code."));
  }
  if (entry?.preview?.requiresCloudSession === true || entry?.offline?.noCloudSessionRequired !== true) {
    failures.push(issue("cloud-session", "Update lifecycle must not require a cloud session."));
  }
  if (entry?.state === "available" && entry?.rollback?.available !== true) {
    failures.push(issue("rollback-missing", "Available updates must include rollback metadata."));
  }
  if (entry?.state === "error" && (!Array.isArray(entry.failClosed) || entry.failClosed.length === 0 || entry.preview?.allowed !== false)) {
    failures.push(issue("error-fail-closed", "Error update lifecycle entries must fail closed."));
  }
  if (entry?.cleanup?.receipt?.kind !== "library-cleanup") {
    failures.push(issue("cleanup-receipt", "Lifecycle entry must include a cleanup receipt."));
  }
  if (hasUnsafeReceiptPath(entry?.rollback?.receipt?.path) || hasUnsafeReceiptPath(entry?.cleanup?.receipt?.path)) {
    failures.push(issue("unsafe-receipt-path", "Lifecycle receipt paths must be path-neutral."));
  }
}

function sampleCandidate({
  id,
  version,
  digest,
  expectedDigest = digest,
  sourceDigest = digest,
  stateHint = null,
  metadata = undefined,
  ticketExpiresAt = "2026-06-17T13:00:00.000Z"
}) {
  return {
    id,
    stateHint,
    version,
    digest,
    expectedDigest,
    ticketIssuedAt: "2026-06-17T11:00:00.000Z",
    ticketExpiresAt,
    provenance: {
      sourceDigest,
      publishedDigest: digest,
      verificationStatus: "verified",
      signer: "agentique-example"
    },
    metadata
  };
}

function currentCandidate(current) {
  return {
    id: "current",
    version: current.version,
    digest: current.digest,
    expectedDigest: current.digest,
    ticketIssuedAt: null,
    ticketExpiresAt: null,
    provenance: current.provenance
  };
}

function safeCandidatePreview(rawCandidate) {
  const version = typeof rawCandidate?.version === "string" && rawCandidate.version.trim().length > 0 ? rawCandidate.version.trim() : "unknown";
  const digest = isDigest(rawCandidate?.digest) ? rawCandidate.digest.toLowerCase() : "0".repeat(64);
  const expectedDigest = isDigest(rawCandidate?.expectedDigest) ? rawCandidate.expectedDigest.toLowerCase() : digest;
  return {
    id: typeof rawCandidate?.id === "string" && rawCandidate.id.trim().length > 0 ? rawCandidate.id.trim() : "candidate",
    version,
    digest,
    expectedDigest,
    ticketIssuedAt: typeof rawCandidate?.ticketIssuedAt === "string" ? rawCandidate.ticketIssuedAt : null,
    ticketExpiresAt: typeof rawCandidate?.ticketExpiresAt === "string" ? rawCandidate.ticketExpiresAt : null,
    provenance: safeProvenance(rawCandidate?.provenance, digest)
  };
}

function normalizeProvenance(value, fieldName) {
  assertPlainObject(value, fieldName);
  return {
    sourceDigest: requireDigest(value.sourceDigest, `${fieldName}.sourceDigest`),
    publishedDigest: requireDigest(value.publishedDigest, `${fieldName}.publishedDigest`),
    verificationStatus: requireText(value.verificationStatus, `${fieldName}.verificationStatus`),
    signer: requireText(value.signer, `${fieldName}.signer`)
  };
}

function safeProvenance(value, fallbackDigest) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      sourceDigest: fallbackDigest,
      publishedDigest: fallbackDigest,
      verificationStatus: "unknown",
      signer: "unknown"
    };
  }
  return {
    sourceDigest: isDigest(value.sourceDigest) ? value.sourceDigest.toLowerCase() : fallbackDigest,
    publishedDigest: isDigest(value.publishedDigest) ? value.publishedDigest.toLowerCase() : fallbackDigest,
    verificationStatus: typeof value.verificationStatus === "string" && value.verificationStatus.trim().length > 0 ? value.verificationStatus.trim() : "unknown",
    signer: typeof value.signer === "string" && value.signer.trim().length > 0 ? value.signer.trim() : "unknown"
  };
}

function digestComparison(current, candidate, forcedStatus = null) {
  return {
    status: forcedStatus ?? (current.digest === candidate.digest ? "same" : "changed"),
    currentDigest: current.digest,
    availableDigest: candidate.digest,
    expectedDigest: candidate.expectedDigest,
    matchesExpected: candidate.digest === candidate.expectedDigest
  };
}

function sameDigestComparison(current) {
  return {
    status: "same",
    currentDigest: current.digest,
    availableDigest: current.digest,
    expectedDigest: current.digest,
    matchesExpected: true
  };
}

function provenanceComparison(current, candidate, forcedStatus = null) {
  const sourceMatches = current.provenance.sourceDigest === candidate.provenance.sourceDigest;
  const publishedMatches = current.provenance.publishedDigest === candidate.provenance.publishedDigest;
  return {
    status: forcedStatus ?? (sourceMatches && publishedMatches ? "same" : "changed"),
    currentSourceDigest: current.provenance.sourceDigest,
    availableSourceDigest: candidate.provenance.sourceDigest,
    currentPublishedDigest: current.provenance.publishedDigest,
    availablePublishedDigest: candidate.provenance.publishedDigest,
    signer: candidate.provenance.signer
  };
}

function sameProvenanceComparison(current) {
  return {
    status: "same",
    currentSourceDigest: current.provenance.sourceDigest,
    availableSourceDigest: current.provenance.sourceDigest,
    currentPublishedDigest: current.provenance.publishedDigest,
    availablePublishedDigest: current.provenance.publishedDigest,
    signer: current.provenance.signer
  };
}

function preview(decision, allowed) {
  return {
    decision,
    allowed,
    reviewOnly: true,
    installAutomatically: false,
    executesCode: false,
    requiresCloudSession: false,
    localOnly: true
  };
}

function rollback(available, current) {
  return {
    available,
    targetVersion: current.version,
    targetDigest: current.digest,
    receipt: {
      kind: "library-rollback",
      id: `library-rollback-${current.resourceId}-${current.version}`,
      path: "receipts/library/rollback.json"
    }
  };
}

function cleanup(required, staleVersions) {
  return {
    required,
    staleVersions,
    receipt: {
      kind: "library-cleanup",
      id: "library-cleanup-local-receipt",
      path: "receipts/library/cleanup.json"
    }
  };
}

function offline(noCloudSessionRequired, cachedMetadataUsable, reason = "local-metadata") {
  return {
    noCloudSessionRequired,
    cachedMetadataUsable,
    cloudSessionState: "not-required",
    reason
  };
}

function interactionEvidence(current) {
  return ["desktop", "narrow"].map((viewport) => ({
    viewport,
    resourceId: current.resourceId,
    stateTransition: "library-row-to-update-preview",
    covered: true,
    visibleSummary: ["states", "preview", "rollback", "cleanup", "offline-no-cloud"]
  }));
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) {
    return left === right ? 0 : 1;
  }
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function parseVersion(value) {
  if (typeof value !== "string" || !/^\d+(?:\.\d+){0,3}$/u.test(value)) return null;
  return value.split(".").map((part) => Number.parseInt(part, 10));
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw issue("invalid-field", `${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function requireDigest(value, fieldName) {
  const text = requireText(value, fieldName).toLowerCase();
  if (!isDigest(text)) {
    throw issue("invalid-digest", `${fieldName} must be a SHA-256 digest.`);
  }
  return text;
}

function requireIsoDate(value, fieldName) {
  const text = requireText(value, fieldName);
  if (Number.isNaN(new Date(text).getTime())) {
    throw issue("invalid-date", `${fieldName} must be an ISO date.`);
  }
  return new Date(text).toISOString();
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw issue("invalid-field", `${fieldName} must be an object.`);
  }
}

function assertNoInlinePrivateMaterial(value, path = "value") {
  if (value == null) return;
  if (typeof value === "string") {
    if (secretValuePattern.test(value)) {
      throw issue("inline-private-field", `${path} contains inline sensitive material.`);
    }
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (secretKeyPattern.test(key)) {
      throw issue("inline-private-field", `${nestedPath} is not allowed in local library update metadata.`);
    }
    assertNoInlinePrivateMaterial(nested, nestedPath);
  }
}

function isDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value.toLowerCase());
}

function hasUnsafeReceiptPath(value) {
  if (typeof value !== "string") return false;
  const privatePlanningMarker = [".", "planning"].join("");
  const referenceMarker = ["refer", "ence/"].join("");
  return /(?:[A-Za-z]:\\|\/Users\/|\/home\/)/u.test(value) || value.includes(privatePlanningMarker) || value.includes(referenceMarker);
}

function issue(code, message) {
  /** @type {Error & { code?: string }} */
  const error = new Error(message);
  error.code = code;
  return error;
}

function errorCode(error, fallback) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : fallback;
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
