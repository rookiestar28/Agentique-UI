const currentSchemaVersion = "agentique.localLibrary.v1";
const recordSchemaVersion = "agentique.localLibraryRecord.v1";
const supportModes = new Set(["catalog-only", "visualizable", "editable", "dry-runnable", "locally-runnable", "external-handoff"]);
const secretKeyPattern = /(secret|token|password|credential|privatekey|api[_-]?key|authorization)/iu;
const secretValuePattern = /(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|ya29\.[A-Za-z0-9._-]+|bearer\s+[A-Za-z0-9._-]{12,}|secret-ref:|-----BEGIN [A-Z ]*PRIVATE KEY-----)/iu;

export const librarySchemaVersion = currentSchemaVersion;

export const defaultPermissionState = Object.freeze({
  files: "denied",
  network: "denied",
  shell: "denied",
  environment: "denied"
});

export const sampleLibraryState = upsertLibraryRecord(emptyLibraryState(), createLibraryRecord({
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
  },
  compatibility: {
    agentiqueUi: ">=0.1.0",
    platforms: ["windows", "macos", "linux"]
  },
  permissionState: defaultPermissionState,
  installState: {
    status: "verified-only",
    installedAt: null
  },
  cleanupState: {
    status: "not-required",
    lastAction: null
  },
  verifiedAt: "2026-06-11T00:05:00.000Z"
}));

export function emptyLibraryState() {
  return {
    schemaVersion: currentSchemaVersion,
    resources: []
  };
}

export function createLibraryRecord(input) {
  assertNoInlineSecrets(input);
  const verificationRecord = input.verificationRecord ?? {};
  const resourceId = requireText(input.resourceId ?? verificationRecord.resourceId, "resourceId");
  const version = requireSemver(input.version ?? verificationRecord.version, "version");
  const digest = requireDigest(input.digest ?? verificationRecord.digest, "digest");
  const supportMode = requireSupportMode(input.supportMode ?? verificationRecord.supportMode);

  const record = {
    schemaVersion: recordSchemaVersion,
    key: `${resourceId}@${version}`,
    resourceId,
    title: requireText(input.title ?? resourceId, "title"),
    version,
    digest,
    supportMode,
    provenance: sanitizeProvenance(input.provenance),
    compatibility: sanitizeCompatibility(input.compatibility),
    permissionState: sanitizeState(input.permissionState ?? defaultPermissionState, "permissionState"),
    installState: sanitizeState(input.installState ?? { status: "verified-only", installedAt: null }, "installState"),
    cleanupState: sanitizeState(input.cleanupState ?? { status: "not-required", lastAction: null }, "cleanupState"),
    verifiedAt: requireIsoDate(input.verifiedAt ?? verificationRecord.verifiedAt ?? new Date().toISOString(), "verifiedAt")
  };
  assertNoInlineSecrets(record);
  return clone(record);
}

export function migrateLibraryState(input) {
  const previousState = clone(input ?? emptyLibraryState());
  try {
    if (!input || typeof input !== "object") {
      throw issue("library.invalid-state", "Library state must be an object.");
    }

    if (input.schemaVersion === currentSchemaVersion) {
      return {
        ok: true,
        state: normalizeLibraryState(input),
        rollback: { available: false, previousSchemaVersion: currentSchemaVersion }
      };
    }

    const legacyResources = Array.isArray(input.resources) ? input.resources : [];
    const resources = legacyResources.map((resource) => createLibraryRecord({
      resourceId: resource.resourceId ?? resource.id,
      title: resource.title ?? resource.name ?? resource.id,
      version: resource.version,
      digest: resource.digest ?? resource.checksum,
      supportMode: resource.supportMode ?? resource.mode,
      provenance: resource.provenance ?? {
        sourceDigest: resource.sourceDigest ?? resource.checksum,
        publishedDigest: resource.publishedDigest ?? resource.checksum,
        verificationStatus: resource.verificationStatus ?? "verified",
        signer: resource.signer ?? "legacy-import"
      },
      compatibility: resource.compatibility ?? {
        agentiqueUi: ">=0.1.0",
        platforms: resource.platforms ?? []
      },
      permissionState: resource.permissionState ?? defaultPermissionState,
      installState: resource.installState ?? { status: "verified-only", installedAt: null },
      cleanupState: resource.cleanupState ?? { status: "not-required", lastAction: null },
      verifiedAt: resource.verifiedAt ?? "2026-06-11T00:00:00.000Z"
    }));

    return {
      ok: true,
      state: sortLibraryState({ schemaVersion: currentSchemaVersion, resources }),
      rollback: {
        available: true,
        previousSchemaVersion: String(input.schemaVersion ?? "legacy"),
        previousState
      }
    };
  } catch (error) {
    return {
      ok: false,
      state: null,
      errors: [toIssue(error)],
      rollback: {
        available: true,
        previousSchemaVersion: String(input?.schemaVersion ?? "unknown"),
        previousState
      }
    };
  }
}

export function upsertLibraryRecord(state, record) {
  const normalized = normalizeLibraryState(state);
  const nextRecord = createLibraryRecord(record);
  const resources = normalized.resources.filter((item) => item.key !== nextRecord.key);
  resources.push(nextRecord);
  return sortLibraryState({ schemaVersion: currentSchemaVersion, resources });
}

export function exportLibraryState(state, options = {}) {
  const normalized = normalizeLibraryState(state);
  const exported = {
    schemaVersion: normalized.schemaVersion,
    exportedAt: requireIsoDate(options.exportedAt ?? new Date().toISOString(), "exportedAt"),
    resources: normalized.resources.map((resource) => clone(resource))
  };
  assertNoInlineSecrets(exported);
  return exported;
}

export function createWebStorageLibraryAdapter(storage, key = "agentique.ui.library.v1") {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw issue("storage.invalid-adapter", "Storage adapter must provide getItem and setItem.");
  }

  return {
    load() {
      const raw = storage.getItem(key);
      if (!raw) return emptyLibraryState();
      const result = migrateLibraryState(JSON.parse(raw));
      if (!result.ok) throw issue("storage.invalid-state", result.errors[0].message);
      return result.state;
    },
    save(nextState) {
      const normalized = normalizeLibraryState(nextState);
      storage.setItem(key, JSON.stringify(normalized));
      return clone(normalized);
    },
    clear() {
      if (typeof storage.removeItem === "function") storage.removeItem(key);
      else storage.setItem(key, "");
    }
  };
}

function normalizeLibraryState(state) {
  if (!state || typeof state !== "object") {
    throw issue("library.invalid-state", "Library state must be an object.");
  }
  if (state.schemaVersion !== currentSchemaVersion) {
    const result = migrateLibraryState(state);
    if (!result.ok) throw issue(result.errors[0].code, result.errors[0].message);
    return result.state;
  }
  if (!Array.isArray(state.resources)) {
    throw issue("library.invalid-resources", "Library resources must be an array.");
  }
  return sortLibraryState({
    schemaVersion: currentSchemaVersion,
    resources: state.resources.map((resource) => createLibraryRecord(resource))
  });
}

function sortLibraryState(state) {
  return {
    schemaVersion: currentSchemaVersion,
    resources: [...state.resources].sort((left, right) => left.key.localeCompare(right.key))
  };
}

function sanitizeProvenance(value = {}) {
  assertPlainObject(value, "provenance");
  return {
    sourceDigest: requireDigest(value.sourceDigest, "provenance.sourceDigest"),
    publishedDigest: requireDigest(value.publishedDigest, "provenance.publishedDigest"),
    verificationStatus: requireText(value.verificationStatus, "provenance.verificationStatus"),
    signer: requireText(value.signer, "provenance.signer")
  };
}

function sanitizeCompatibility(value = {}) {
  assertPlainObject(value, "compatibility");
  return {
    agentiqueUi: requireText(value.agentiqueUi, "compatibility.agentiqueUi"),
    platforms: requireTextArray(value.platforms, "compatibility.platforms")
  };
}

function sanitizeState(value, fieldName) {
  assertPlainObject(value, fieldName);
  return clone(value);
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw issue("library.invalid-field", `${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function requireSemver(value, fieldName) {
  const text = requireText(value, fieldName);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9]|[._+-](?=[A-Za-z0-9])){0,95}$/u.test(text)) {
    throw issue("library.invalid-version", `${fieldName} must be public resource version text.`);
  }
  return text;
}

function requireDigest(value, fieldName) {
  const text = requireText(value, fieldName).toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(text)) {
    throw issue("library.invalid-digest", `${fieldName} must be a SHA-256 digest.`);
  }
  return text;
}

function requireSupportMode(value) {
  const text = requireText(value, "supportMode");
  if (!supportModes.has(text)) {
    throw issue("library.invalid-support-mode", "supportMode is not supported.");
  }
  return text;
}

function requireIsoDate(value, fieldName) {
  const text = requireText(value, fieldName);
  if (Number.isNaN(new Date(text).getTime())) {
    throw issue("library.invalid-date", `${fieldName} must be an ISO date.`);
  }
  return new Date(text).toISOString();
}

function requireTextArray(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw issue("library.invalid-field", `${fieldName} must be a non-empty string array.`);
  }
  return value.map((item) => item.trim());
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw issue("library.invalid-field", `${fieldName} must be an object.`);
  }
}

function assertNoInlineSecrets(value, path = "value") {
  if (value == null) return;
  if (typeof value === "string") {
    if (secretValuePattern.test(value)) {
      throw issue("library.inline-secret", `${path} contains inline sensitive material.`);
    }
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (secretKeyPattern.test(key)) {
      throw issue("library.inline-secret", `${nestedPath} is not allowed in the local library.`);
    }
    assertNoInlineSecrets(nested, nestedPath);
  }
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(message));
  error.code = code;
  return error;
}

function toIssue(error) {
  return {
    code: error.code ?? "library.error",
    message: error.message ?? "Library error."
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
