import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const productResultProjectionSchemaVersion = "agentique.productResultProjection.v1";

const terminalStates = new Set(["succeeded", "failed", "canceled", "timed-out"]);
const safeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const unsafeTextPattern =
  /(?<![A-Za-z])[A-Za-z]:[\\/]|(^|[\\/])\.\.([\\/]|$)|bearer\s+[A-Za-z0-9._-]{8,}|sk-[A-Za-z0-9_-]{8,}|cookie=|[.]plan(?:ning)|(^|[\\/])reference([\\/]|$)/iu;

export function createMemoryAtomicProductResultRepository({ maxRuns = 8, onStage = () => {} } = {}) {
  const limit = normalizeLimit(maxRuns);
  const records = new Map();

  const repository = {
    kind: "memory-atomic-reference",
    async commit(input, { faultAt = null } = {}) {
      const normalized = normalizeCandidate(input);
      const key = addressKey(normalized.address);
      const record = records.get(key) ?? emptyRecord(normalized.address);
      if (record.current) {
        if (record.current.candidateDigest !== normalized.candidateDigest) {
          throw issue("product-projection.digest-conflict", "A different terminal candidate is already authoritative for this run.");
        }
        return freeze({ ...record.current.receipt, idempotent: true });
      }
      if (faultAt === "before-content") throw issue("product-projection.injected-fault", "Projection stopped before content commit.");

      const generation = {
        schemaVersion: productResultProjectionSchemaVersion,
        address: normalized.address,
        candidateDigest: normalized.candidateDigest,
        state: normalized.state,
        terminalMetadata: normalized.terminalMetadata,
        artifacts: normalized.artifacts,
        contentCommitted: true,
        manifestCommitted: false
      };
      record.staging.push(generation);
      records.set(key, record);
      onStage("content");
      if (faultAt === "after-content") throw issue("product-projection.injected-fault", "Projection stopped after content commit.");

      generation.manifestCommitted = true;
      onStage("manifest");
      if (faultAt === "after-manifest") throw issue("product-projection.injected-fault", "Projection stopped after manifest commit.");

      const receipt = freeze({
        schemaVersion: "agentique.productResultProjectionReceipt.v1",
        address: normalized.address,
        candidateDigest: normalized.candidateDigest,
        state: normalized.state,
        committed: true,
        idempotent: false,
        generationRef: `projections/${normalized.address.runId}/generations/${normalized.candidateDigest}`,
        pointerRef: `projections/${normalized.address.runId}/current.json`,
        artifacts: normalized.artifacts.map(({ id, path, digest, bytes, mediaType }) => ({ id, path, digest, bytes, mediaType })),
        redacted: true
      });
      record.generations.set(normalized.candidateDigest, freeze(generation));
      record.current = { candidateDigest: normalized.candidateDigest, receipt };
      record.staging = [];
      record.active = false;
      onStage("pointer");
      retainRecords(records, limit);
      if (faultAt === "after-pointer") throw issue("product-projection.injected-fault", "Projection stopped after authoritative pointer commit.");
      return receipt;
    },
    markActive(address) {
      const normalized = normalizeAddress(address);
      const key = addressKey(normalized);
      const record = records.get(key) ?? emptyRecord(normalized);
      record.active = true;
      records.set(key, record);
      retainRecords(records, limit);
      return true;
    },
    reconcile(address) {
      const normalized = normalizeAddress(address);
      const record = records.get(addressKey(normalized));
      if (!record) return recovery("missing");
      if (record.seededClassification) return recovery(record.seededClassification);
      if (record.current) return recovery("completed", record.current.receipt);
      if (record.staging.length > 0) return recovery("partial");
      if (record.active) return recovery("cleanup-required");
      return recovery("orphaned");
    },
    seedRecoveryState(address, classification) {
      const normalized = normalizeAddress(address);
      const allowed = new Set(["corrupt", "unsupported", "orphaned"]);
      if (!allowed.has(classification)) throw issue("product-projection.invalid-seed", "Recovery seed classification is not supported.");
      const record = emptyRecord(normalized);
      record.seededClassification = classification;
      records.set(addressKey(normalized), record);
    },
    snapshot() {
      return freeze(
        [...records.values()].map((record) => ({
          address: record.address,
          active: record.active,
          staging: record.staging.length,
          generations: record.generations.size,
          currentDigest: record.current?.candidateDigest ?? null,
          classification: repository.reconcile(record.address).classification
        }))
      );
    }
  };
  return Object.freeze(repository);
}

export function createProductResultProjector({ repository, publishTerminal }) {
  if (!repository || typeof repository.commit !== "function") {
    throw issue("product-projection.repository-required", "A product result repository is required.");
  }
  if (typeof publishTerminal !== "function") {
    throw issue("product-projection.publisher-required", "A terminal publisher is required.");
  }
  return Object.freeze({
    async project(candidate, options = {}) {
      let receipt;
      try {
        receipt = await repository.commit(candidate, options);
      } catch {
        const terminal = safeProjectionFailure();
        try {
          await publishTerminal(terminal);
        } catch {
          // Durable projection did not commit; publication failure cannot make unsafe output visible.
        }
        return freeze({ ok: false, committed: false, published: true, quarantined: true, terminal, errors: [terminal] });
      }

      try {
        await publishTerminal({ state: receipt.state, code: `run.${receipt.state}`, message: safeTerminalMessage(receipt.state) });
        return freeze({ ok: true, committed: true, published: true, quarantined: false, receipt, errors: [] });
      } catch {
        return freeze({
          ok: true,
          committed: true,
          published: false,
          quarantined: false,
          receipt,
          errors: [{ code: "product-projection.delivery-pending", message: "Durable terminal is available for bounded resync." }]
        });
      }
    }
  });
}

export function migrateLegacyProjectionExport(input) {
  const schemaVersion = String(input?.schemaVersion ?? "");
  if (!["agentique.durableRunLedger.v0", "agentique.durableRunLedger.v1"].includes(schemaVersion)) {
    throw issue("product-projection.unsupported-migration", "Projection migration source schema is unsupported.");
  }
  const runs = Array.isArray(input?.runs) ? input.runs.slice(-8) : [];
  const migrated = {
    schemaVersion: "agentique.productResultProjectionMigration.v1",
    runs: runs.map((run, index) => ({
      runId: safeId(run?.runId ?? run?.id ?? `run.legacy-${index}`),
      state: terminalStates.has(run?.state ?? run?.status) ? (run.state ?? run.status) : "failed",
      summary: safeText(run?.summary ?? run?.log ?? "Legacy terminal summary."),
      artifacts: []
    })),
    rollback: { from: schemaVersion, retainedOriginal: true },
    boundary: {
      importsRendererStorageAutomatically: false,
      replaysUnknownEffects: false,
      nativeCommitRequiredBeforeAuthority: true
    }
  };
  assertSafe(migrated);
  return freeze(migrated);
}

export function productResultDurabilityMatrix() {
  return freeze({
    schemaVersion: "agentique.productResultDurabilityMatrix.v1",
    survivesProcessDeath: ["authoritative-current-pointer", "committed-terminal-metadata", "validated-product-artifacts"],
    doesNotSurviveProcessDeath: ["process-handle", "listener", "in-memory-event-buffer", "uncommitted-staging-authority"],
    neverReplayedAutomatically: ["model-call", "tool-call", "process-effect", "provider-mutation"],
    recoveryStates: ["completed", "cleanup-required", "partial", "corrupt", "unsupported", "orphaned", "missing"]
  });
}

function normalizeCandidate(input) {
  const address = normalizeAddress(input?.address);
  const candidateDigest = String(input?.candidateDigest ?? "").toLowerCase();
  if (!digestPattern.test(candidateDigest)) throw issue("product-projection.invalid-digest", "Terminal candidate digest must be a SHA-256 value.");
  const state = String(input?.state ?? "");
  if (!terminalStates.has(state)) throw issue("product-projection.invalid-state", "Projection state must be terminal.");
  const artifacts = (Array.isArray(input?.artifacts) ? input.artifacts : []).slice(0, 8).map(normalizeArtifact);
  const terminalMetadata = {
    code: safeId(input?.terminalMetadata?.code ?? `run.${state}`),
    message: safeText(input?.terminalMetadata?.message ?? safeTerminalMessage(state))
  };
  const normalized = { address, candidateDigest, state, terminalMetadata, artifacts };
  assertSafe(normalized);
  return normalized;
}

function normalizeArtifact(artifact, index) {
  const path = String(artifact?.path ?? "");
  if (!/^(artifacts|outputs)\/[A-Za-z0-9][A-Za-z0-9._/-]{1,150}$/u.test(path) || path.includes("..") || path.includes("\\") || path.includes(":")) {
    throw issue("product-projection.unsafe-artifact", "Product artifact path is not a confined relative reference.");
  }
  if (artifact?.redacted !== true) throw issue("product-projection.unredacted-artifact", "Product artifacts must be redacted before projection.");
  const digest = String(artifact?.digest ?? "")
    .replace(/^sha256:/u, "")
    .toLowerCase();
  if (!digestPattern.test(digest)) throw issue("product-projection.invalid-artifact-digest", "Product artifact digest must be a SHA-256 value.");
  const bytes = Number(artifact?.bytes ?? 0);
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 2_097_152) throw issue("product-projection.artifact-size", "Product artifact exceeds the bounded byte limit.");
  return {
    id: safeId(artifact?.id ?? `artifact.${index}`),
    path,
    digest,
    bytes,
    mediaType: safeMediaType(artifact?.mediaType ?? "application/octet-stream"),
    redacted: true
  };
}

function normalizeAddress(input) {
  return freeze({
    resourceId: safeId(input?.resourceId),
    sessionId: safeId(input?.sessionId),
    runId: safeId(input?.runId)
  });
}

function emptyRecord(address) {
  return { address, active: false, staging: [], generations: new Map(), current: null, seededClassification: null };
}

function recovery(classification, receipt = null) {
  return freeze({ classification, receipt, replayUnknownEffect: false, authoritative: classification === "completed" });
}

function addressKey(address) {
  return `${address.resourceId}::${address.sessionId}::${address.runId}`;
}

function retainRecords(records, maxRuns) {
  while (records.size > maxRuns) records.delete(records.keys().next().value);
}

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 25) throw issue("product-projection.max-runs", "Projection retention must be between 1 and 25 runs.");
  return number;
}

function safeId(value) {
  const text = String(value ?? "");
  if (!safeIdPattern.test(text) || text.includes("..") || text.includes(":")) throw issue("product-projection.invalid-id", "Projection identifiers must be opaque and bounded.");
  return text;
}

function safeMediaType(value) {
  const text = String(value ?? "");
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/u.test(text)) throw issue("product-projection.invalid-media-type", "Product artifact media type is invalid.");
  return text;
}

function safeText(value) {
  const text = redactText(String(value ?? "")).slice(0, 240);
  if (unsafeTextPattern.test(text)) throw issue("product-projection.unsafe-text", "Projection text contains forbidden private material.");
  return text;
}

function assertSafe(value) {
  assertNoInlineSecrets(value);
  if (unsafeTextPattern.test(JSON.stringify(value))) throw issue("product-projection.unsafe-material", "Projection material contains forbidden private content.");
}

function safeProjectionFailure() {
  return { state: "failed", code: "product-projection.failed", message: "Product result could not be committed safely." };
}

function safeTerminalMessage(state) {
  return state === "succeeded" ? "Run completed." : state === "canceled" ? "Run canceled." : state === "timed-out" ? "Run timed out." : "Run failed.";
}

function issue(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
