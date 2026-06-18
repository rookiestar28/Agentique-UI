import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const durableRunLedgerSchemaVersion = "agentique.durableRunLedger.v1";

const fixedNow = "2026-06-16T11:00:00.000Z";
const storageKey = "agentique:source-first-run-ledger";
const supportedActions = new Set(["replay", "migrate", "corrupt", "export"]);
const safeRunState = new Set(["queued", "preparing", "running", "succeeded", "failed", "canceled", "cleanup-required", "cleaned", "recovered"]);
const unsafeExportPattern =
  /(?<![A-Za-z])[A-Za-z]:[\\/]|^\/|(^|[\\/])\.\.([\\/]|$)|vault:[a-z][a-zA-Z0-9._-]{2,80}|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9_-]+|ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|cookie=/iu;

export function createMemoryDurableRunLedgerStorage(initialText = null) {
  let storedText = initialText;
  return Object.freeze({
    kind: "memory-json",
    key: storageKey,
    readText() {
      return storedText;
    },
    writeText(value) {
      storedText = String(value);
      return true;
    },
    clear() {
      storedText = null;
      return true;
    },
    dump() {
      return storedText;
    }
  });
}

export function createDurableRunLedger({ storage = createMemoryDurableRunLedgerStorage(), maxRuns = 8, now = fixedNow } = {}) {
  const retentionMaxRuns = normalizeMaxRuns(maxRuns);

  return Object.freeze({
    appendRun(input) {
      const loaded = loadSnapshot(storage, { maxRuns: retentionMaxRuns, now });
      const snapshot = loaded.snapshot;
      const nextRuns = retainRuns([...snapshot.runs, normalizeRun(input, now)], retentionMaxRuns);
      const nextSnapshot = sanitizeSnapshot({
        ...snapshot,
        updatedAt: now,
        runs: nextRuns,
        retention: {
          maxRuns: retentionMaxRuns,
          retainedRuns: nextRuns.length,
          truncated: nextRuns.length < snapshot.runs.length + 1
        },
        recovery: { corruptFallback: false, reason: null }
      });
      writeSnapshot(storage, nextSnapshot);
      return freeze({
        ok: true,
        snapshot: nextSnapshot,
        run: nextRuns.at(-1),
        errors: []
      });
    },
    replayAfterRestart() {
      const loaded = loadSnapshot(storage, { maxRuns: retentionMaxRuns, now });
      return freeze({
        status: loaded.status,
        snapshot: loaded.snapshot,
        runs: loaded.snapshot.runs,
        errors: loaded.errors,
        boundary: loaded.snapshot.boundary
      });
    },
    exportLedger({ maxRuns: exportMaxRuns = retentionMaxRuns } = {}) {
      const loaded = loadSnapshot(storage, { maxRuns: retentionMaxRuns, now });
      const boundedRuns = loaded.snapshot.runs.slice(-normalizeMaxRuns(exportMaxRuns));
      const exported = {
        schemaVersion: "agentique.durableRunLedgerExport.v1",
        exportedAt: now,
        storageDecision: loaded.snapshot.storageDecision,
        summary: {
          retainedRuns: loaded.snapshot.runs.length,
          exportedRuns: boundedRuns.length,
          truncated: boundedRuns.length < loaded.snapshot.runs.length
        },
        runs: boundedRuns.map(exportRun),
        boundary: loaded.snapshot.boundary
      };
      assertSafeExport(exported);
      return freeze(exported);
    },
    readSnapshot() {
      return freeze(loadSnapshot(storage, { maxRuns: retentionMaxRuns, now }));
    }
  });
}

export function createDurableRunLedgerSurface({ action = "replay" } = {}) {
  const normalizedAction = supportedActions.has(action) ? action : "replay";

  if (normalizedAction === "migrate") {
    const storage = createMemoryDurableRunLedgerStorage(
      JSON.stringify({
        schemaVersion: "agentique.durableRunLedger.v0",
        runs: [{ id: "legacy-run-001", status: "succeeded", log: "legacy replay log" }]
      })
    );
    const ledger = createDurableRunLedger({ storage, maxRuns: 5 });
    return surface(normalizedAction, ledger.replayAfterRestart(), null);
  }

  if (normalizedAction === "corrupt") {
    const storage = createMemoryDurableRunLedgerStorage("{not-json");
    const ledger = createDurableRunLedger({ storage, maxRuns: 5 });
    return surface(normalizedAction, ledger.replayAfterRestart(), null);
  }

  if (normalizedAction === "export") {
    const storage = createMemoryDurableRunLedgerStorage();
    const ledger = createDurableRunLedger({ storage, maxRuns: 3 });
    for (let index = 0; index < 6; index += 1) {
      ledger.appendRun(sampleRun(index));
    }
    return surface(normalizedAction, ledger.replayAfterRestart(), ledger.exportLedger({ maxRuns: 2 }));
  }

  const storage = createMemoryDurableRunLedgerStorage();
  const ledger = createDurableRunLedger({ storage, maxRuns: 5 });
  ledger.appendRun(sampleRun(1));
  const reloaded = createDurableRunLedger({ storage, maxRuns: 5 });
  return surface(normalizedAction, reloaded.replayAfterRestart(), null);
}

export function reviewDurableRunLedgerGate() {
  const replay = createDurableRunLedgerSurface({ action: "replay" });
  const migrate = createDurableRunLedgerSurface({ action: "migrate" });
  const corrupt = createDurableRunLedgerSurface({ action: "corrupt" });
  const exported = createDurableRunLedgerSurface({ action: "export" });
  const checks = {
    restartReplay: replay.replay.status === "replayed" && replay.replay.runs.length > 0,
    migrationRollback:
      migrate.replay.status === "migrated" &&
      migrate.replay.snapshot.migration.from === "agentique.durableRunLedger.v0" &&
      migrate.replay.snapshot.rollback.previousSchemaVersion === "agentique.durableRunLedger.v0",
    corruptionFallback: corrupt.replay.status === "corrupt-fallback" && corrupt.replay.runs.length === 0 && corrupt.replay.snapshot.recovery.corruptFallback === true,
    boundedRetentionExport: exported.export.summary.retainedRuns === 3 && exported.export.summary.exportedRuns === 2 && exported.export.summary.truncated === true,
    redactedPathNeutralExport: !unsafeExportPattern.test(JSON.stringify(exported.export)) && exported.export.runs.every((run) => run.logs.every((log) => log.redacted === true)),
    noInstallerOrCloudDependency: [replay, migrate, corrupt, exported].every(
      (item) =>
        item.boundary.noSignedInstallerDependency === true &&
        item.boundary.noPackagedRuntimeDependency === true &&
        item.boundary.noCloudSessionDependency === true &&
        item.boundary.noBrowserDataAccess === true
    )
  };
  const ok = Object.values(checks).every(Boolean);

  return freeze({
    schemaVersion: "agentique.durableRunLedgerReview.v1",
    ok,
    checks,
    summary: {
      replayStatus: replay.replay.status,
      migrationStatus: migrate.replay.status,
      corruptionStatus: corrupt.replay.status,
      retainedRuns: exported.export.summary.retainedRuns,
      exportedRuns: exported.export.summary.exportedRuns
    },
    errors: ok ? [] : [issue("durable-run-ledger.review", "Durable run ledger review failed.")]
  });
}

function loadSnapshot(storage, { maxRuns, now }) {
  const raw = storage.readText();
  if (raw == null || raw === "") {
    const snapshot = createEmptySnapshot({ maxRuns, now, recovery: { corruptFallback: false, reason: null } });
    writeSnapshot(storage, snapshot);
    return { status: "empty", snapshot, errors: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const snapshot = createEmptySnapshot({
      maxRuns,
      now,
      recovery: { corruptFallback: true, reason: "storage-parse-failed" }
    });
    writeSnapshot(storage, snapshot);
    return {
      status: "corrupt-fallback",
      snapshot,
      errors: [issue("durable-run-ledger.corrupt-storage", "Stored run ledger could not be parsed; replay was blocked.")]
    };
  }

  if (parsed?.schemaVersion === durableRunLedgerSchemaVersion) {
    const snapshot = sanitizeSnapshot({
      ...parsed,
      updatedAt: parsed.updatedAt ?? now,
      runs: retainRuns(
        (parsed.runs ?? []).map((run) => normalizeRun(run, now)),
        maxRuns
      ),
      retention: {
        maxRuns,
        retainedRuns: Math.min((parsed.runs ?? []).length, maxRuns),
        truncated: (parsed.runs ?? []).length > maxRuns
      },
      boundary: boundary(),
      storageDecision: storageDecision()
    });
    writeSnapshot(storage, snapshot);
    return { status: snapshot.runs.length > 0 ? "replayed" : "empty", snapshot, errors: [] };
  }

  if (parsed?.schemaVersion === "agentique.durableRunLedger.v0") {
    const migratedRuns = (parsed.runs ?? []).map((run, index) =>
      normalizeRun(
        {
          runId: run.id ?? `legacy-run-${index}`,
          state: run.status ?? "failed",
          logs: [run.log ?? "legacy log"],
          artifacts: []
        },
        now
      )
    );
    const snapshot = sanitizeSnapshot({
      ...createEmptySnapshot({ maxRuns, now, recovery: { corruptFallback: false, reason: null } }),
      runs: retainRuns(migratedRuns, maxRuns),
      migration: {
        from: "agentique.durableRunLedger.v0",
        to: durableRunLedgerSchemaVersion,
        changed: true,
        migratedAt: now
      },
      rollback: {
        previousSchemaVersion: "agentique.durableRunLedger.v0",
        previousRunCount: Array.isArray(parsed.runs) ? parsed.runs.length : 0,
        rollbackDigest: hashText(raw)
      }
    });
    writeSnapshot(storage, snapshot);
    return { status: "migrated", snapshot, errors: [] };
  }

  const snapshot = createEmptySnapshot({
    maxRuns,
    now,
    recovery: { corruptFallback: true, reason: "unsupported-schema" }
  });
  writeSnapshot(storage, snapshot);
  return {
    status: "corrupt-fallback",
    snapshot,
    errors: [issue("durable-run-ledger.unsupported-schema", "Stored run ledger schema is unsupported; replay was blocked.")]
  };
}

function createEmptySnapshot({ maxRuns, now, recovery }) {
  return sanitizeSnapshot({
    schemaVersion: durableRunLedgerSchemaVersion,
    storageDecision: storageDecision(),
    createdAt: now,
    updatedAt: now,
    retention: {
      maxRuns,
      retainedRuns: 0,
      truncated: false
    },
    runs: [],
    migration: {
      from: durableRunLedgerSchemaVersion,
      to: durableRunLedgerSchemaVersion,
      changed: false,
      migratedAt: null
    },
    rollback: {
      previousSchemaVersion: null,
      previousRunCount: 0,
      rollbackDigest: null
    },
    recovery,
    boundary: boundary()
  });
}

function storageDecision() {
  return {
    kind: "source-first-json-ledger",
    browserLocalStorageCompatible: true,
    indexedDbDeferred: true,
    reason: "bounded run summaries only"
  };
}

function normalizeRun(input, now) {
  const runId = safeId(input?.runId ?? input?.id ?? "run-ledger-local-001", "runId");
  const state = safeRunState.has(input?.state) ? input.state : "failed";
  const logs = Array.isArray(input?.logs) ? input.logs : input?.log ? [input.log] : [];
  const artifacts = Array.isArray(input?.artifacts) ? input.artifacts : [];
  return {
    schemaVersion: "agentique.durableRunLedgerRun.v1",
    runId,
    state,
    recordedAt: isoNow(input?.recordedAt ?? now),
    logs: logs.slice(0, 6).map((line, index) => ({
      index,
      text: redactEvidenceText(line),
      redacted: true
    })),
    artifacts: artifacts.slice(0, 6).map((artifact, index) => ({
      id: safeId(artifact?.id ?? `artifact-${index}`, "artifactId"),
      path: safeRelativePath(artifact?.path ?? `artifacts/artifact-${index}.json`),
      digest: safeDigest(artifact?.digest ?? `sha256:${index}`),
      bytes: boundedBytes(artifact?.bytes)
    }))
  };
}

function exportRun(run) {
  return {
    runId: run.runId,
    state: run.state,
    recordedAt: run.recordedAt,
    logs: run.logs.map((line) => ({ index: line.index, text: line.text, redacted: true })),
    artifacts: run.artifacts.map((artifact) => ({
      id: artifact.id,
      path: artifact.path,
      digest: artifact.digest,
      bytes: artifact.bytes
    }))
  };
}

function sampleRun(index) {
  return {
    runId: `run-ledger-sample-${index}`,
    state: index % 2 === 0 ? "succeeded" : "failed",
    logs: [`sample ${index} bearer abcdefghijklmnop redacted`],
    artifacts: [{ id: `artifact-${index}`, path: `artifacts/sample-${index}.json`, digest: `sha256:${index}`, bytes: 64 + index }]
  };
}

function surface(action, replay, exported) {
  const value = {
    schemaVersion: "agentique.durableRunLedgerSurface.v1",
    action,
    replay,
    export: exported,
    controls: [
      { action: "replay", label: "Replay after reload" },
      { action: "migrate", label: "Migration rollback sample" },
      { action: "corrupt", label: "Corruption fallback sample" },
      { action: "export", label: "Bounded export sample" }
    ],
    boundary: boundary()
  };
  assertSafeExport(value);
  return freeze(value);
}

function retainRuns(runs, maxRuns) {
  return runs.slice(-maxRuns);
}

function writeSnapshot(storage, snapshot) {
  storage.writeText(`${JSON.stringify(sanitizeSnapshot(snapshot), null, 2)}\n`);
}

function sanitizeSnapshot(snapshot) {
  const sanitized = {
    ...snapshot,
    boundary: boundary(),
    storageDecision: storageDecision()
  };
  assertSafeExport(sanitized);
  return sanitized;
}

function assertSafeExport(value) {
  assertNoInlineSecrets(value);
  if (unsafeExportPattern.test(JSON.stringify(value))) {
    throw issue("durable-run-ledger.unsafe-export", "Durable run ledger export contains unsafe material.");
  }
  return true;
}

function boundary() {
  return {
    sourceFirstOnly: true,
    noSignedInstallerDependency: true,
    noPackagedRuntimeDependency: true,
    noCloudSessionDependency: true,
    noBrowserDataAccess: true,
    noGenericShell: true,
    noPackageLifecycleExecution: true,
    noAmbientEnvironmentAccess: true
  };
}

function normalizeMaxRuns(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 25) {
    throw issue("durable-run-ledger.max-runs", "Retention maxRuns must be between 1 and 25.");
  }
  return number;
}

function safeId(value, fieldName) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u.test(text) || text.includes("..") || text.includes("/") || text.includes("\\") || text.includes(":")) {
    throw issue("durable-run-ledger.invalid-id", `${fieldName} must be an opaque id.`);
  }
  return text;
}

function safeRelativePath(value) {
  const text = redactEvidenceText(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{2,160}$/u.test(text) || text.includes("..") || text.includes("\\") || text.includes(":") || text.startsWith("/")) {
    return "redacted-path";
  }
  return text;
}

function safeDigest(value) {
  return String(value ?? "sha256:0")
    .replace(/[^A-Za-z0-9:_-]/gu, "")
    .slice(0, 80);
}

function boundedBytes(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(104857600, Math.round(number));
}

function redactEvidenceText(value) {
  return redactText(String(value ?? ""))
    .replace(/(?<![A-Za-z])[A-Za-z]:[\\/][^\s"]*/giu, "redacted-local-path")
    .replace(/cookie=[^\s"]+/giu, "redacted-cookie")
    .replace(/vault:[a-z][a-zA-Z0-9._-]{2,80}/gu, "redacted-vault-reference")
    .slice(0, 240);
}

function isoNow(value) {
  const timestamp = Date.parse(value ?? fixedNow);
  if (!Number.isFinite(timestamp)) {
    throw issue("durable-run-ledger.invalid-time", "Timestamp must be a valid ISO date.");
  }
  return new Date(timestamp).toISOString();
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(redactText(message)));
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
