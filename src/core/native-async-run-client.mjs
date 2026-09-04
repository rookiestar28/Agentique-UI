import { adaptNativeRunnerEvent } from "./run-protocol-conformance.mjs";
import { createRunAddress, createRunProtocolConsumer } from "./run-protocol.mjs";
import { createNativeCheckpointTimeTravelClient } from "./native-checkpoint-time-travel.mjs";

export const nativeAsyncRunClientSchemaVersion = "agentique.nativeAsyncRunClient.v1";
export const nativeAsyncRunEventName = "agentique://native-runner-event";

export const fixedNativeAdapterProfiles = Object.freeze({
  "adapter.local-python": "permission.local-python.minimal",
  "adapter.local-node": "permission.local-node.minimal",
  "adapter.local-wasm": "permission.local-wasm.sandboxed",
  "adapter.local-container": "permission.local-container.rootless"
});
const canonicalPhases = new Set(["pending", "running", "terminal"]);
const projectionStates = new Set(["succeeded", "failed", "canceled", "timed-out", "cleanup-required", "cleaned-up"]);
const projectionRecoveryClassifications = new Set(["completed", "cleanup-required", "partial", "corrupt", "unsupported", "orphaned", "missing"]);

export function createNativeAsyncRunClient({ address, adapterId = "adapter.local-python", invokeNative, listenNative, onEvent = () => {}, onError = () => {} } = {}) {
  const runAddress = createRunAddress(address);
  const permissionProfileId = fixedNativeAdapterProfiles[adapterId];
  if (permissionProfileId == null) {
    throw issue("native-async-client.adapter", "Native lifecycle adapter is not in the fixed allowlist.");
  }
  if (typeof invokeNative !== "function") throw issue("native-async-client.invoke", "Tauri invoke adapter is required.");
  if (typeof listenNative !== "function") throw issue("native-async-client.listen", "Tauri listen adapter is required.");
  if (typeof onEvent !== "function" || typeof onError !== "function") {
    throw issue("native-async-client.callback", "Lifecycle callbacks must be functions.");
  }

  const consumer = createRunProtocolConsumer({ expectedAddress: runAddress });
  const checkpointTimeTravel = createNativeCheckpointTimeTravelClient({
    requestNative: (command, request) => invokeNative(command, { request })
  });
  const errors = [];
  let acceptedEvents = 0;
  let diagnosticEventsSkipped = 0;
  let ignoredOtherRuns = 0;
  let listenPromise = null;
  let unlisten = null;
  let productProjection = null;
  let workingSetCheckpoint = null;
  let lastNativeSequence = 0;
  let nativeStreamFailure = null;
  const nativeEventFingerprints = new Map();
  const canonicalSequenceByNative = new Map();

  return Object.freeze({
    schemaVersion: nativeAsyncRunClientSchemaVersion,
    address: runAddress,
    async connect() {
      if (!listenPromise) {
        listenPromise = Promise.resolve(listenNative(nativeAsyncRunEventName, receiveNativeMessage)).then((detach) => {
          if (typeof detach !== "function") throw issue("native-async-client.unlisten", "Tauri listen must return an unlisten function.");
          unlisten = detach;
        });
      }
      await listenPromise;
      return snapshot();
    },
    async disconnect() {
      if (listenPromise && !unlisten) await listenPromise;
      if (unlisten) {
        const detach = unlisten;
        unlisten = null;
        listenPromise = null;
        await detach();
      }
      return snapshot();
    },
    prepare() {
      return invokeCommand("agentique_runner_prepare", requestFor("prepare"));
    },
    approvalProposal({ approvalId } = {}) {
      return invokeCommand("agentique_runner_approval_proposal", requestFor("approval-proposal", { approvalId: requiredToken(approvalId, "approvalId") }));
    },
    decideApproval({ proposalId, proposalDigest, decision, actorId = "actor.local-user" } = {}) {
      return invokeNative("agentique_runner_decide_approval", {
        request: {
          resourceId: runAddress.resourceId,
          sessionId: runAddress.sessionId,
          runId: runAddress.runId,
          proposalId: requiredToken(proposalId, "proposalId"),
          proposalDigest: requiredDigest(proposalDigest),
          decision: requiredDecision(decision),
          actorId: requiredToken(actorId, "actorId")
        }
      });
    },
    start({ approvalId, permissionGrantId } = {}) {
      return invokeCommand(
        "agentique_runner_start",
        requestFor("start", {
          approvalId: requiredToken(approvalId, "approvalId"),
          permissionGrantId: requiredToken(permissionGrantId, "permissionGrantId")
        })
      );
    },
    cancel() {
      return invokeCommand("agentique_runner_cancel", requestFor("cancel"));
    },
    revoke({ permissionGrantId } = {}) {
      return invokeCommand("agentique_runner_revoke_permission", requestFor("revoke", { permissionGrantId: requiredToken(permissionGrantId, "permissionGrantId") }));
    },
    status() {
      return invokeCommand("agentique_runner_status", requestFor("status"));
    },
    logs() {
      return invokeCommand("agentique_runner_logs", requestFor("logs"));
    },
    artifacts() {
      return invokeCommand("agentique_runner_artifacts", requestFor("artifacts"));
    },
    cleanup() {
      return invokeCommand("agentique_runner_cleanup", requestFor("cleanup"));
    },
    checkpointHistory() {
      return checkpointTimeTravel.history(runAddress);
    },
    prepareTimeTravel({ targetRunId, generationDigest, mode } = {}) {
      return checkpointTimeTravel.prepare({
        sourceAddress: runAddress,
        targetAddress: { resourceId: runAddress.resourceId, sessionId: runAddress.sessionId, runId: targetRunId },
        generationDigest,
        mode
      });
    },
    async resync() {
      const receipt = await invokeCommand("agentique_runner_status", requestFor("status"));
      receiveNativeReplay(receipt?.eventReplay?.events ?? []);
      return receipt;
    },
    snapshot
  });

  function requestFor(action, overrides = {}) {
    return {
      resourceId: runAddress.resourceId,
      sessionId: runAddress.sessionId,
      runId: runAddress.runId,
      commandId: `command.${action}-${runAddress.runId}`,
      adapterId,
      approvalId: null,
      permissionProfileId,
      permissionGrantId: null,
      ...overrides
    };
  }

  async function invokeCommand(command, request) {
    const receipt = await invokeNative(command, { request });
    if (receipt?.productProjection != null) productProjection = normalizeProductProjection(receipt.productProjection, runAddress);
    if (receipt?.workingSetCheckpoint != null) workingSetCheckpoint = normalizeWorkingSetCheckpoint(receipt.workingSetCheckpoint, runAddress);
    return receipt;
  }

  function receiveNativeMessage(message) {
    receiveNativePayload(message?.payload ?? message, "live");
  }

  function receiveNativePayload(payload, delivery) {
    if (nativeStreamFailure != null) return;
    if (!payload || typeof payload !== "object") return fail("native-async-client.payload", "Native lifecycle payload must be an object.");
    if (payload.runId !== runAddress.runId || payload.resourceId !== runAddress.resourceId || payload.sessionId !== runAddress.sessionId) {
      ignoredOtherRuns += 1;
      return;
    }
    const nativeSequence = Number(payload.sequence);
    if (!Number.isSafeInteger(nativeSequence) || nativeSequence < 1) return fail("run-protocol.sequence", "Native lifecycle sequence must be a positive safe integer.");
    const fingerprint = JSON.stringify(payload);
    const priorFingerprint = nativeEventFingerprints.get(nativeSequence);
    if (priorFingerprint != null) {
      if (priorFingerprint !== fingerprint) return fail("run-protocol.sequence-conflict", "Native lifecycle replay conflicts with an observed sequence.");
    } else {
      // IMPORTANT: live publication intentionally omits diagnostic phases while retaining their
      // durable sequence numbers. Only the complete replay may prove contiguity; live events must
      // remain monotonic but can contain holes that replay later fills with diagnostic evidence.
      if (delivery !== "replay" && nativeSequence <= lastNativeSequence) {
        return fail("run-protocol.sequence-reorder", "Native lifecycle live sequence moved backward.");
      }
      nativeEventFingerprints.set(nativeSequence, fingerprint);
      lastNativeSequence = Math.max(lastNativeSequence, nativeSequence);
    }
    if (!canonicalPhases.has(payload.phase)) {
      if (priorFingerprint == null) diagnosticEventsSkipped += 1;
      return;
    }
    try {
      const occurredAt = epochMillisecondsToIso(payload.occurredAtEpochMs);
      const canonicalSequence = canonicalSequenceByNative.get(nativeSequence) ?? canonicalSequenceByNative.size + 1;
      const event = adaptNativeRunnerEvent({ ...payload, sequence: canonicalSequence }, { address: runAddress, occurredAt });
      const result = consumer.accept(event);
      if (!result.ok) return fail(result.code, "Canonical run protocol rejected the native lifecycle event.");
      if (result.status !== "duplicate") {
        canonicalSequenceByNative.set(nativeSequence, canonicalSequence);
        acceptedEvents += 1;
        onEvent(Object.freeze({ ...event, delivery }));
      }
    } catch (error) {
      fail(errorCode(error), errorMessage(error));
    }
  }

  function receiveNativeReplay(events) {
    if (!Array.isArray(events)) return fail("run-protocol.replay", "Native lifecycle replay must contain an event array.");
    for (let index = 0; index < events.length; index += 1) {
      if (Number(events[index]?.sequence) !== index + 1) return fail("run-protocol.sequence-gap", "Native lifecycle replay sequence has a gap.");
    }
    for (const event of events) receiveNativePayload(event, "replay");
  }

  function fail(code, message) {
    const error = { code: safeToken(code), message: safeText(message) };
    nativeStreamFailure ??= error;
    errors.push(error);
    onError(Object.freeze({ ...error }));
  }

  function snapshot() {
    const canonicalProtocol = consumer.snapshot();
    const protocol =
      nativeStreamFailure == null || canonicalProtocol.status === "failed"
        ? canonicalProtocol
        : Object.freeze({ ...canonicalProtocol, status: "failed", failure: Object.freeze({ ...nativeStreamFailure }) });
    return Object.freeze({
      schemaVersion: "agentique.nativeAsyncRunClientSnapshot.v1",
      address: runAddress,
      connected: unlisten != null,
      acceptedEvents,
      diagnosticEventsSkipped,
      ignoredOtherRuns,
      lastNativeSequence,
      protocol,
      productProjection: productProjection == null ? null : Object.freeze(JSON.parse(JSON.stringify(productProjection))),
      workingSetCheckpoint: workingSetCheckpoint == null ? null : Object.freeze(JSON.parse(JSON.stringify(workingSetCheckpoint))),
      errors: errors.map((error) => ({ ...error }))
    });
  }
}

function normalizeWorkingSetCheckpoint(input, address) {
  if (!input || typeof input !== "object" || input.schemaVersion !== "agentique.nativeWorkingSetCheckpointReceipt.v1" || input.scopeId !== address.runId) {
    throw issue("native-async-client.checkpoint-address", "Working-set checkpoint does not match the native run scope.");
  }
  const generationDigest = String(input.generationDigest ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(generationDigest)) throw issue("native-async-client.checkpoint-digest", "Working-set checkpoint digest is invalid.");
  for (const flag of ["committed", "idempotent", "restored"]) {
    if (typeof input[flag] !== "boolean") throw issue("native-async-client.checkpoint-flags", "Working-set checkpoint flags are invalid.");
  }
  if (input.encryptedAtRest !== false || input.replaysExternalEffects !== false || input.redacted !== true) {
    throw issue("native-async-client.checkpoint-boundary", "Working-set checkpoint boundary flags are invalid.");
  }
  const fileCount = Number(input.fileCount);
  const totalBytes = Number(input.totalBytes);
  if (!Number.isInteger(fileCount) || fileCount < 0 || fileCount > 64 || !Number.isInteger(totalBytes) || totalBytes < 0 || totalBytes > 2_097_152) {
    throw issue("native-async-client.checkpoint-limits", "Working-set checkpoint bounds are invalid.");
  }
  const prefix = `working-sets/${address.runId}`;
  for (const value of [input.generationRef, input.pointerRef, input.rootRef]) {
    if (typeof value !== "string" || !value.startsWith(`${prefix}/`) || value.includes("..") || value.includes("\\") || value.includes(":")) {
      throw issue("native-async-client.checkpoint-ref", "Working-set checkpoint references must remain relative and scoped.");
    }
  }
  return Object.freeze({ ...input, generationDigest, fileCount, totalBytes });
}

function normalizeProductProjection(input, address) {
  if (!input || typeof input !== "object") throw issue("native-async-client.projection", "Product projection receipt must be an object.");
  if (
    input.schemaVersion !== "agentique.nativeProductResultProjectionReceipt.v1" ||
    input.resourceId !== address.resourceId ||
    input.sessionId !== address.sessionId ||
    input.runId !== address.runId
  ) {
    throw issue("native-async-client.projection-address", "Product projection receipt does not match the exact run address.");
  }
  const candidateDigest = String(input.candidateDigest ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(candidateDigest)) throw issue("native-async-client.projection-digest", "Product projection digest is invalid.");
  const state = String(input.state ?? "");
  const recoveryClassification = String(input.recoveryClassification ?? "");
  if (!projectionStates.has(state) || !projectionRecoveryClassifications.has(recoveryClassification)) {
    throw issue("native-async-client.projection-state", "Product projection recovery state is invalid.");
  }
  if (typeof input.committed !== "boolean" || typeof input.idempotent !== "boolean" || input.redacted !== true) {
    throw issue("native-async-client.projection-flags", "Product projection receipt flags are invalid.");
  }
  const generationRef = requiredProjectionRef(input.generationRef, address.runId, input.committed === true);
  const pointerRef = requiredProjectionRef(input.pointerRef, address.runId, true);
  const artifactRefs = Array.isArray(input.artifactRefs) ? input.artifactRefs.map((value) => requiredProjectionRef(value, address.runId, true)) : null;
  if (artifactRefs == null || artifactRefs.length > 8) throw issue("native-async-client.projection-artifacts", "Product projection artifact references are invalid.");
  return Object.freeze({
    schemaVersion: input.schemaVersion,
    resourceId: input.resourceId,
    sessionId: input.sessionId,
    runId: input.runId,
    candidateDigest,
    state,
    committed: input.committed,
    idempotent: input.idempotent,
    generationRef,
    pointerRef,
    artifactRefs,
    recoveryClassification,
    redacted: true
  });
}

function requiredProjectionRef(value, runId, committed) {
  const reference = String(value ?? "");
  if (!committed && reference === "uncommitted-generation") return reference;
  const prefix = `projections/${runId}/`;
  if (!reference.startsWith(prefix) || reference.includes("..") || reference.includes("\\") || reference.includes(":")) {
    throw issue("native-async-client.projection-ref", "Product projection reference is not confined to the exact run.");
  }
  return reference;
}

function epochMillisecondsToIso(value) {
  const epoch = Number(value);
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw issue("native-async-client.timestamp", "Native lifecycle timestamp is invalid.");
  return new Date(epoch).toISOString();
}

function requiredToken(value, field) {
  const token = String(value ?? "");
  if (!/^[a-z0-9][a-z0-9._-]{2,95}$/u.test(token)) throw issue(`native-async-client.${field}`, `${field} is invalid.`);
  return token;
}

function requiredDigest(value) {
  const digest = String(value ?? "");
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw issue("native-async-client.proposal-digest", "proposalDigest must be SHA-256 hex.");
  return digest;
}

function requiredDecision(value) {
  if (!new Set(["approved", "denied"]).has(value)) throw issue("native-async-client.decision", "Approval decision is invalid.");
  return value;
}

function safeToken(value) {
  return String(value ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/gu, "-")
    .slice(0, 96);
}

function safeText(value) {
  return String(value ?? "Native lifecycle operation failed.")
    .replace(/(?<![A-Za-z])[A-Za-z]:[\\/]|bearer\s+\S+|sk-[A-Za-z0-9]{20,}/giu, "redacted:sensitive")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 240);
}

function errorCode(error) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "native-async-client.event";
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "Native lifecycle event was rejected.";
}

function issue(code, message) {
  return Object.assign(new Error(safeText(message)), { code });
}
