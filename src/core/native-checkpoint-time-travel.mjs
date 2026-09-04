const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const modes = new Set(["retry", "resume", "replay"]);
const prepareInputKeys = Object.freeze(["sourceAddress", "targetAddress", "generationDigest", "mode"]);

/**
 * @param {{ requestNative?: (command: string, request: Record<string, unknown>) => Promise<unknown> }} [options]
 */
export function createNativeCheckpointTimeTravelClient({ requestNative } = {}) {
  if (typeof requestNative !== "function") throw issue("checkpoint-time-travel.invoke-required", "A native request function is required.");
  return Object.freeze({
    async history(address) {
      const source = normalizeAddress(address, "source");
      return reviewCheckpointHistory(await requestNative("agentique_runner_checkpoint_history", source));
    },
    async prepare(input) {
      if (!input || typeof input !== "object" || !hasExactKeys(input, prepareInputKeys)) {
        throw issue("checkpoint-time-travel.input-shape", "Time-travel prepare accepts only source, target, generation, and mode fields.");
      }
      const source = normalizeAddress(input.sourceAddress, "source");
      const target = normalizeAddress(input.targetAddress, "target");
      if (source.resourceId !== target.resourceId || source.sessionId !== target.sessionId || source.runId === target.runId) {
        throw issue("checkpoint-time-travel.address-scope", "Time-travel target must be a distinct run in the same resource and session.");
      }
      const generationDigest = digest(input.generationDigest, "selected generation");
      const mode = String(input.mode ?? "");
      if (!modes.has(mode)) throw issue("checkpoint-time-travel.mode", "Time-travel mode must be retry, resume, or replay.");
      const request = {
        schemaVersion: "agentique.nativeTimeTravelPrepareRequest.v1",
        sourceResourceId: source.resourceId,
        sourceSessionId: source.sessionId,
        sourceRunId: source.runId,
        targetResourceId: target.resourceId,
        targetSessionId: target.sessionId,
        targetRunId: target.runId,
        generationDigest,
        mode
      };
      return reviewTimeTravelPrepareReceipt(await requestNative("agentique_runner_time_travel_prepare", request));
    }
  });
}

export function reviewCheckpointHistory(input) {
  if (!input || typeof input !== "object" || input.schemaVersion !== "agentique.nativeCheckpointHistory.v1") {
    throw issue("checkpoint-time-travel.history-schema", "Checkpoint history schema is unsupported.");
  }
  const address = normalizeAddress(input, "history");
  if (input.redacted !== true || input.includesContent !== false || input.encryptedAtRest !== false) {
    throw issue("checkpoint-time-travel.history-boundary", "Checkpoint history boundary flags are invalid.");
  }
  const generations = Array.isArray(input.generations) ? input.generations.map((entry) => normalizeGeneration(entry, address.runId)) : [];
  if (generations.length < 1 || generations.length > 8 || input.generationCount !== generations.length) {
    throw issue("checkpoint-time-travel.history-count", "Checkpoint history count is outside its bounded contract.");
  }
  const unique = new Set(generations.map((entry) => entry.generationDigest));
  if (unique.size !== generations.length || generations.filter((entry) => entry.current).length !== 1) {
    throw issue("checkpoint-time-travel.history-authority", "Checkpoint history must contain unique generations and one current authority.");
  }
  for (let index = 1; index < generations.length; index += 1) {
    if (generations[index - 1].generationDigest.localeCompare(generations[index].generationDigest, "en") >= 0) {
      throw issue("checkpoint-time-travel.history-order", "Checkpoint history must use deterministic digest order.");
    }
  }
  return Object.freeze({ ...input, ...address, generations: Object.freeze(generations) });
}

export function reviewTimeTravelPrepareReceipt(input) {
  if (!input || typeof input !== "object" || input.schemaVersion !== "agentique.nativeTimeTravelPrepareReceipt.v1") {
    throw issue("checkpoint-time-travel.prepare-schema", "Time-travel prepare receipt schema is unsupported.");
  }
  const source = normalizeAddress({ resourceId: input.resourceId, sessionId: input.sessionId, runId: input.sourceRunId }, "source");
  const targetRunId = opaqueId(input.targetRunId, "targetRunId");
  if (targetRunId === source.runId || !modes.has(input.mode)) {
    throw issue("checkpoint-time-travel.prepare-scope", "Time-travel receipt has invalid lineage scope or mode.");
  }
  const selectedGenerationDigest = digest(input.selectedGenerationDigest, "selected generation");
  const sourceGenerationDigest = digest(input.sourceGenerationDigest, "source generation");
  if (selectedGenerationDigest !== sourceGenerationDigest) {
    throw issue("checkpoint-time-travel.prepare-generation", "Prepared source generation does not match the selected generation.");
  }
  if (
    input.state !== "branch-ready" ||
    input.prepared !== true ||
    input.sourceImmutable !== true ||
    input.requiresFreshApproval !== true ||
    input.willSpawnProcess !== false ||
    input.replaysExternalEffects !== false ||
    input.redacted !== true
  ) {
    throw issue("checkpoint-time-travel.prepare-boundary", "Time-travel preparation boundary flags are invalid.");
  }
  for (const reference of [input.sourceGenerationRef, input.targetRootRef, input.lineageRef]) safeReference(reference, source.runId, targetRunId);
  const fileCount = boundedInteger(input.fileCount, 0, 64, "file count");
  const totalBytes = boundedInteger(input.totalBytes, 0, 2_097_152, "total bytes");
  return Object.freeze({ ...input, selectedGenerationDigest, sourceGenerationDigest, fileCount, totalBytes });
}

export function sampleCheckpointHistory(address = { resourceId: "resource.sample", sessionId: "session.sample", runId: "run.sample-source" }) {
  const normalized = normalizeAddress(address, "sample");
  const generations = [sampleGeneration(normalized.runId, "a".repeat(64), false, 1, 18), sampleGeneration(normalized.runId, "b".repeat(64), true, 2, 42)];
  return Object.freeze({
    schemaVersion: "agentique.nativeCheckpointHistory.v1",
    ...normalized,
    generationCount: generations.length,
    generations: Object.freeze(generations),
    includesContent: false,
    encryptedAtRest: false,
    redacted: true
  });
}

export function sampleTimeTravelPrepareReceipt({
  sourceAddress = { resourceId: "resource.sample", sessionId: "session.sample", runId: "run.sample-source" },
  targetAddress = { resourceId: sourceAddress.resourceId, sessionId: sourceAddress.sessionId, runId: "run.sample-target" },
  mode = "replay",
  generationDigest = "a".repeat(64)
} = {}) {
  const source = normalizeAddress(sourceAddress, "source");
  const target = normalizeAddress(targetAddress, "target");
  return Object.freeze({
    schemaVersion: "agentique.nativeTimeTravelPrepareReceipt.v1",
    resourceId: source.resourceId,
    sessionId: source.sessionId,
    sourceRunId: source.runId,
    targetRunId: target.runId,
    mode,
    selectedGenerationDigest: generationDigest,
    sourceGenerationDigest: generationDigest,
    sourceGenerationRef: `working-sets/${source.runId}/checkpoints/generations/${generationDigest}`,
    targetRootRef: `working-sets/${target.runId}/active`,
    lineageRef: `working-sets/${target.runId}/time-travel-lineage.json`,
    state: "branch-ready",
    prepared: true,
    sourceImmutable: true,
    requiresFreshApproval: true,
    willSpawnProcess: false,
    replaysExternalEffects: false,
    fileCount: 1,
    totalBytes: 18,
    redacted: true
  });
}

export function checkpointTimeTravelBoundary() {
  return Object.freeze({
    commands: Object.freeze(["agentique_runner_checkpoint_history", "agentique_runner_time_travel_prepare"]),
    sourceImmutable: true,
    targetAuthority: "new-native-owned-run-scope",
    freshApprovalRequired: true,
    externalEffectReplay: false,
    rendererPathSelection: false,
    includesCheckpointContent: false,
    encryptedAtRest: false
  });
}

function sampleGeneration(runId, generationDigest, current, fileCount, totalBytes) {
  return Object.freeze({
    generationDigest,
    current,
    fileCount,
    totalBytes,
    generationRef: `working-sets/${runId}/checkpoints/generations/${generationDigest}`,
    valid: true,
    eligible: true,
    redacted: true
  });
}

function normalizeGeneration(entry, runId) {
  if (!entry || typeof entry !== "object") throw issue("checkpoint-time-travel.generation", "Checkpoint generation summary is invalid.");
  const generationDigest = digest(entry.generationDigest, "generation");
  if (typeof entry.current !== "boolean" || entry.valid !== true || entry.eligible !== true || entry.redacted !== true) {
    throw issue("checkpoint-time-travel.generation-flags", "Checkpoint generation flags are invalid.");
  }
  const fileCount = boundedInteger(entry.fileCount, 0, 64, "file count");
  const totalBytes = boundedInteger(entry.totalBytes, 0, 2_097_152, "total bytes");
  safeReference(entry.generationRef, runId, null);
  return Object.freeze({ ...entry, generationDigest, fileCount, totalBytes });
}

function normalizeAddress(input, label) {
  if (!input || typeof input !== "object") throw issue("checkpoint-time-travel.address", `${label} address is required.`);
  return Object.freeze({
    resourceId: opaqueId(input.resourceId, "resourceId"),
    sessionId: opaqueId(input.sessionId, "sessionId"),
    runId: opaqueId(input.runId, "runId")
  });
}

function safeReference(value, sourceRunId, targetRunId) {
  const text = String(value ?? "");
  if (!text || text.length > 320 || text.includes("\\") || text.startsWith("/") || /^[A-Za-z]:/u.test(text) || text.includes("..")) {
    throw issue("checkpoint-time-travel.reference", "Checkpoint references must remain bounded and relative.");
  }
  if (!text.includes(sourceRunId) && (!targetRunId || !text.includes(targetRunId))) {
    throw issue("checkpoint-time-travel.reference-scope", "Checkpoint reference does not match the source or target run.");
  }
}

function opaqueId(value, label) {
  const text = String(value ?? "");
  if (!opaqueIdPattern.test(text) || text.includes("..") || text.includes(":")) throw issue("checkpoint-time-travel.opaque-id", `${label} must be a bounded opaque id.`);
  return text;
}

function digest(value, label) {
  const text = String(value ?? "").toLowerCase();
  if (!digestPattern.test(text)) throw issue("checkpoint-time-travel.digest", `${label} digest is invalid.`);
  return text;
}

function boundedInteger(value, min, max, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw issue("checkpoint-time-travel.limit", `${label} is outside policy.`);
  return parsed;
}

function hasExactKeys(input, expected) {
  const actual = Object.keys(input).sort();
  return actual.length === expected.length && [...expected].sort().every((key, index) => key === actual[index]);
}

function issue(code, message) {
  return Object.assign(new Error(message), { code });
}
