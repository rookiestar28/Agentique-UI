import { createHash } from "node:crypto";

import { assertNoInlineSecrets } from "./secret-vault.mjs";

export const workingSetCheckpointSchemaVersion = "agentique.workingSetCheckpoint.v1";
export const workingSetCheckpointPolicy = Object.freeze({
  maxFiles: 64,
  maxFileBytes: 262_144,
  maxTotalBytes: 2_097_152,
  maxDepth: 8,
  maxPathChars: 180,
  maxManifestBytes: 65_536,
  maxGenerations: 8
});

const safeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const privateSegments = new Set([".env", ".ssh", ".aws", ".azure", ".config", "cookies", "browser", "vault", "reference"]);
const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:[.]|$)/iu;
const unsafeContent = /bearer\s+[A-Za-z0-9._-]{8,}|sk-[A-Za-z0-9_-]{8,}|cookie=|[.]plan(?:ning)|(?:^|[\\/])reference(?:[\\/]|$)|[A-Za-z]:[\\/]/iu;

export function createMemoryWorkingSetCheckpointStore({ maxGenerations = workingSetCheckpointPolicy.maxGenerations, onStage = () => {} } = {}) {
  const limit = integerLimit(maxGenerations, 1, workingSetCheckpointPolicy.maxGenerations, "working-set.retention-limit");
  const scopes = new Map();
  return Object.freeze({
    async commit(candidate, { expectedPointerDigest, faultAt = null } = {}) {
      const record = scopes.get(candidate.scopeId) ?? { generations: new Map(), pointer: null, partial: [] };
      if (record.pointer) {
        if (record.pointer === candidate.generationDigest) return receipt(candidate, true);
        if (expectedPointerDigest !== record.pointer) throw issue("working-set.cas-conflict", "Checkpoint authority changed before compare-and-swap.");
      } else if (expectedPointerDigest !== undefined && expectedPointerDigest !== null) {
        throw issue("working-set.cas-conflict", "Checkpoint authority did not match the expected empty pointer.");
      }
      record.partial.push(clone(candidate));
      scopes.set(candidate.scopeId, record);
      onStage("content");
      if (faultAt === "after-content") throw issue("working-set.injected-fault", "Checkpoint stopped after immutable content staging.");
      const manifestBytes = Buffer.byteLength(JSON.stringify(candidate.manifest), "utf8");
      if (manifestBytes > workingSetCheckpointPolicy.maxManifestBytes) throw issue("working-set.manifest-limit", "Checkpoint manifest exceeds its byte limit.");
      onStage("manifest");
      if (faultAt === "after-manifest") throw issue("working-set.injected-fault", "Checkpoint stopped before pointer authority.");
      record.generations.set(candidate.generationDigest, clone(candidate));
      record.pointer = candidate.generationDigest;
      record.partial = [];
      while (record.generations.size > limit) record.generations.delete(record.generations.keys().next().value);
      onStage("pointer");
      return receipt(candidate, false);
    },
    current(scopeId) {
      const id = safeId(scopeId);
      const record = scopes.get(id);
      return record?.pointer ? clone(record.generations.get(record.pointer)) : null;
    },
    tamper(scopeId, relativePath, content) {
      const record = scopes.get(safeId(scopeId));
      const generation = record?.pointer ? record.generations.get(record.pointer) : null;
      const entry = generation?.files.find((file) => file.path === relativePath);
      if (!entry) throw issue("working-set.missing-entry", "Checkpoint entry was not found.");
      entry.content = String(content);
    },
    snapshot(scopeId) {
      const record = scopes.get(safeId(scopeId));
      return Object.freeze({
        schemaVersion: "agentique.workingSetCheckpointStoreSnapshot.v1",
        scopeId,
        generations: record?.generations.size ?? 0,
        partial: record?.partial.length ?? 0,
        currentDigest: record?.pointer ?? null,
        relativeRootRef: `working-sets/${scopeId}/checkpoints`,
        encryptedAtRest: false
      });
    }
  });
}

export async function captureWorkingSetCheckpoint(source, store, options = {}) {
  if (source?.nativeOwned !== true || source?.dedicated !== true) throw issue("working-set.root-not-native", "Only a native-owned dedicated working root may be captured.");
  if (!store || typeof store.commit !== "function") throw issue("working-set.store-required", "A checkpoint store is required.");
  const scopeId = safeId(source.scopeId);
  const entries = Array.isArray(source.entries) ? source.entries : [];
  if (entries.length > workingSetCheckpointPolicy.maxFiles) throw issue("working-set.file-count", "Checkpoint file count exceeds policy.");
  const collisionKeys = new Set();
  let totalBytes = 0;
  const files = entries
    .map((entry, index) => {
      if ((entry.kind ?? "regular") !== "regular") throw issue("working-set.non-regular", "Checkpoint capture accepts regular files only.");
      if (entry.reparsePoint === true) throw issue("working-set.reparse-point", "Checkpoint capture rejects reparse points before traversal.");
      if (Number(entry.linkCount ?? 1) > 1) throw issue("working-set.hard-link", "Checkpoint capture rejects multiply-linked files.");
      const path = canonicalPath(entry.path, collisionKeys);
      const before = String(entry.identityBefore ?? `entry-${index}`);
      const after = String(entry.identityAfter ?? before);
      if (before !== after) throw issue("working-set.identity-changed", "Checkpoint file identity changed during capture.");
      const content = typeof entry.content === "string" ? entry.content : String(entry.content ?? "");
      assertSafeContent(content);
      const bytes = Buffer.byteLength(content, "utf8");
      if (bytes > workingSetCheckpointPolicy.maxFileBytes) throw issue("working-set.file-limit", "Checkpoint file exceeds policy.");
      totalBytes += bytes;
      if (totalBytes > workingSetCheckpointPolicy.maxTotalBytes) throw issue("working-set.total-limit", "Checkpoint total bytes exceed policy.");
      return { path, bytes, digest: sha256(content), content };
    })
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  const manifest = {
    schemaVersion: workingSetCheckpointSchemaVersion,
    scopeId,
    files: files.length,
    totalBytes,
    entries: files.map(({ path, bytes, digest }) => ({ path, bytes, digest })),
    encryptedAtRest: false,
    externalEffectReplay: false
  };
  const generationDigest = sha256(JSON.stringify(manifest));
  const candidate = { scopeId, generationDigest, manifest, files };
  return store.commit(candidate, options);
}

export async function restoreWorkingSetCheckpoint(scopeIdInput, store, target) {
  const scopeId = safeId(scopeIdInput);
  const generation = store?.current?.(scopeId);
  if (!generation) throw issue("working-set.missing-generation", "No authoritative checkpoint is available.");
  validateGeneration(generation, scopeId);
  if (!target || typeof target.inspect !== "function" || typeof target.reset !== "function" || typeof target.stage !== "function" || typeof target.activate !== "function") {
    throw issue("working-set.target-required", "A privileged native working target is required.");
  }
  const initial = await target.inspect("initial");
  if (initial.nativeOwned !== true || initial.dedicated !== true || initial.scopeId !== scopeId)
    throw issue("working-set.root-not-native", "Restore target is not the exact native-owned dedicated root.");
  try {
    await target.reset();
    const empty = await target.inspect("empty");
    if (!new Set(["absent", "empty"]).has(empty.state)) throw issue("working-set.target-not-empty", "Restore target did not become absent or empty.");
    await target.stage(generation.files.map((file) => ({ path: file.path, content: file.content })));
    await target.activate();
  } catch (error) {
    throw issue("working-set.cleanup-required", "Restore failed after privileged reset; retry from the validated immutable generation.", error);
  }
  return Object.freeze({
    schemaVersion: "agentique.workingSetRestoreReceipt.v1",
    scopeId,
    generationDigest: generation.generationDigest,
    restored: true,
    fileCount: generation.files.length,
    totalBytes: generation.manifest.totalBytes,
    rootRef: `working-sets/${scopeId}/active`,
    replaysExternalEffects: false,
    redacted: true
  });
}

export function createMemoryWorkingTarget({ scopeId, initialState = "empty", faultAt = null } = {}) {
  const actions = [];
  let state = initialState;
  let staged = [];
  let active = new Map();
  return Object.freeze({
    async inspect(phase) {
      actions.push(phase === "empty" ? "inspect-empty" : "inspect");
      return { nativeOwned: true, dedicated: true, scopeId, state };
    },
    async reset() {
      actions.push("reset");
      state = "empty";
      if (faultAt === "reset") throw new Error("reset fault");
    },
    async stage(files) {
      actions.push("stage");
      if (faultAt === "stage") throw new Error("stage fault");
      staged = clone(files);
    },
    async activate() {
      actions.push("activate");
      if (faultAt === "activate") throw new Error("activation fault");
      active = new Map(staged.map((file) => [file.path, file.content]));
      state = "populated";
    },
    actions: () => [...actions],
    read: (path) => active.get(path)
  });
}

export function workingSetCheckpointBoundary() {
  return Object.freeze({
    rootAuthority: "native-owned-dedicated-disposable",
    pointerAuthority: "content-first-compare-and-swap",
    encryptedAtRest: false,
    generalBackup: false,
    repositorySnapshot: false,
    timeTravel: false,
    externalEffectReplay: false,
    rendererPathSelection: false
  });
}

function validateGeneration(generation, scopeId) {
  if (generation.manifest?.schemaVersion !== workingSetCheckpointSchemaVersion || generation.manifest?.scopeId !== scopeId) {
    throw issue("working-set.unsupported-manifest", "Checkpoint manifest version or scope is invalid.");
  }
  if (!digestPattern.test(generation.generationDigest) || sha256(JSON.stringify(generation.manifest)) !== generation.generationDigest) {
    throw issue("working-set.manifest-integrity", "Checkpoint manifest integrity failed.");
  }
  if (generation.files.length !== generation.manifest.entries.length) throw issue("working-set.integrity-failed", "Checkpoint bundle is incomplete.");
  const expected = new Map(generation.manifest.entries.map((entry) => [entry.path, entry]));
  for (const file of generation.files) {
    const entry = expected.get(file.path);
    if (!entry || Buffer.byteLength(file.content, "utf8") !== entry.bytes || sha256(file.content) !== entry.digest) {
      throw issue("working-set.integrity-failed", "Checkpoint content integrity failed before reset.");
    }
    assertSafeContent(file.content);
  }
}

function canonicalPath(input, collisionKeys) {
  const raw = String(input ?? "");
  if (!raw || raw.includes("\\") || raw.includes(":") || raw.startsWith("/") || raw.includes("\0"))
    throw issue("working-set.unsafe-path", "Checkpoint path must be a portable relative path.");
  const segments = raw.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".."))
    throw issue("working-set.unsafe-path", "Checkpoint path contains traversal or an empty segment.");
  if (segments.length > workingSetCheckpointPolicy.maxDepth) throw issue("working-set.depth-limit", "Checkpoint path exceeds depth policy.");
  const canonical = segments.map((segment) => segment.normalize("NFC")).join("/");
  if ([...canonical].length > workingSetCheckpointPolicy.maxPathChars) throw issue("working-set.path-limit", "Checkpoint path exceeds length policy.");
  for (const segment of segments) {
    const lower = segment.normalize("NFC").toLocaleLowerCase("en-US");
    if (reservedNames.test(lower)) throw issue("working-set.reserved-name", "Checkpoint path uses a reserved device name.");
    if (privateSegments.has(lower) || lower === [".", "planning"].join("")) throw issue("working-set.private-path", "Checkpoint path targets private or credential material.");
  }
  const key = canonical.toLocaleLowerCase("en-US");
  if (collisionKeys.has(key)) throw issue("working-set.path-collision", "Checkpoint paths collide after portable normalization.");
  collisionKeys.add(key);
  return canonical;
}

function assertSafeContent(content) {
  assertNoInlineSecrets({ content });
  if (unsafeContent.test(content)) throw issue("working-set.unsafe-content", "Checkpoint content contains private or sensitive material.");
}

function receipt(candidate, idempotent) {
  return Object.freeze({
    schemaVersion: "agentique.workingSetCheckpointReceipt.v1",
    scopeId: candidate.scopeId,
    generationDigest: candidate.generationDigest,
    committed: true,
    idempotent,
    fileCount: candidate.files.length,
    totalBytes: candidate.manifest.totalBytes,
    generationRef: `working-sets/${candidate.scopeId}/checkpoints/generations/${candidate.generationDigest}`,
    pointerRef: `working-sets/${candidate.scopeId}/checkpoints/current.json`,
    encryptedAtRest: false,
    redacted: true,
    boundary: workingSetCheckpointBoundary()
  });
}

function safeId(value) {
  const text = String(value ?? "");
  if (!safeIdPattern.test(text) || text.includes("..") || text.includes(":")) throw issue("working-set.invalid-scope", "Working-set scope id is invalid.");
  return text;
}

function integerLimit(value, min, max, code) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw issue(code, "Checkpoint policy limit is invalid.");
  return parsed;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}

function issue(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}
