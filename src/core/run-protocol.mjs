import { sha256HexSync } from "./sha256-sync.mjs";

export const runProtocolEventSchemaVersion = "agentique.runProtocolEvent.v1";
export const runProtocolAddressSchemaVersion = "agentique.runAddress.v1";
export const runDiagnosticTraceSchemaVersion = "agentique.runDiagnosticTrace.v1";

const terminalKinds = new Set(["result", "cancelled", "error"]);
const publicErrorCodes = new Set(["adapter-failed", "internal-error", "permission-denied", "timeout", "unavailable"]);
const cancellationReasonCodes = new Set(["host-shutdown", "policy-revoked", "timeout", "user-requested"]);
const tokenPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|[._:-](?=[A-Za-z0-9])){0,127}$/u;
const privateWorkingDirectoryName = `.${["plan", "ning"].join("")}`;
const unsafePayloadPattern = new RegExp(
  String.raw`(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|(?:^|[\\/])${escapeRegExp(privateWorkingDirectoryName)}(?:[\\/]|$)|(?:^|[\\/])reference(?:[\\/]|$)|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|cookie\s*=`,
  "iu"
);
const maxTextLength = 512;
const maxArtifactIds = 32;
const maxEventBytes = 8192;
const maxSequence = Number.MAX_SAFE_INTEGER;

export function createRunAddress(input) {
  const address = {
    schemaVersion: runProtocolAddressSchemaVersion,
    productScopeId: requiredToken(input?.productScopeId, "productScopeId"),
    sessionId: requiredToken(input?.sessionId, "sessionId"),
    resourceId: requiredToken(input?.resourceId, "resourceId"),
    runId: requiredToken(input?.runId, "runId")
  };
  return freeze(address);
}

/** @param {{ address?: any, now?: () => string }} [options] */
export function createRunProtocolProducer({ address, now = () => new Date().toISOString() } = {}) {
  const normalizedAddress = normalizeAddress(address);
  if (typeof now !== "function") throw issue("run-protocol.clock", "Run protocol clock must be a function.");
  let nextSequence = 1;
  let terminal = null;

  return Object.freeze({
    address: normalizedAddress,
    activity(payload) {
      return emit("activity", payload);
    },
    result(payload) {
      return emit("result", payload);
    },
    cancelled(payload) {
      return emit("cancelled", payload);
    },
    error(payload) {
      return emit("error", payload);
    },
    snapshot() {
      return freeze({ nextSequence, terminal });
    }
  });

  function emit(kind, payload) {
    if (terminal) {
      throw issue("run-protocol.producer-terminal", "A producer cannot emit after its terminal event.");
    }
    const event = {
      schemaVersion: runProtocolEventSchemaVersion,
      address: normalizedAddress,
      sequence: nextSequence,
      occurredAt: String(now()),
      kind,
      payload: clone(payload)
    };
    const validation = validateRunProtocolEvent(event);
    if (!validation.ok) throw issue(validation.errors[0].code, validation.errors[0].message);
    nextSequence += 1;
    if (terminalKinds.has(kind)) terminal = { kind, sequence: event.sequence };
    return freeze(event);
  }
}

/** @param {{ expectedAddress?: any }} [options] */
export function createRunProtocolConsumer({ expectedAddress } = {}) {
  const address = normalizeAddress(expectedAddress);
  const digests = new Map();
  let cursor = 0;
  let terminal = null;
  let failure = null;

  return Object.freeze({
    accept(event) {
      if (failure) return freeze({ ok: false, status: "failed", code: failure.code, cursor });
      const validation = validateRunProtocolEvent(event);
      if (!validation.ok) return fail("run-protocol.invalid-event", validation.errors[0].message);
      if (!sameAddress(address, event.address)) return fail("run-protocol.address-mismatch", "The complete run address does not match the consumer scope.");

      const digest = canonicalEventDigest(event);
      if (event.sequence <= cursor) {
        const priorDigest = digests.get(event.sequence);
        if (priorDigest === digest) return freeze({ ok: true, status: "duplicate", cursor });
        return fail("run-protocol.conflicting-duplicate", "A repeated sequence has different canonical content.");
      }
      if (terminal) return fail("run-protocol.event-after-terminal", "No event may follow the first terminal event.");
      if (event.sequence !== cursor + 1) return fail("run-protocol.sequence-gap", "The next sequence must be exactly cursor plus one.");

      cursor = event.sequence;
      digests.set(cursor, digest);
      if (terminalKinds.has(event.kind)) terminal = { kind: event.kind, sequence: event.sequence };
      return freeze({ ok: true, status: terminal ? "accepted-terminal" : "accepted", cursor });
    },
    snapshot() {
      return freeze({ status: failure ? "failed" : terminal ? "terminal" : "active", cursor, terminal, failure });
    }
  });

  function fail(code, message) {
    failure = { code, message: safeIssueMessage(message) };
    return freeze({ ok: false, status: "failed", code, cursor });
  }
}

/** @param {{ address?: any, maxEvents?: number }} [options] */
export function createRunProtocolJournal({ address, maxEvents = 64 } = {}) {
  const normalizedAddress = normalizeAddress(address);
  const bound = boundedInteger(maxEvents, 1, 256, "run-protocol.replay-limit");
  const consumer = createRunProtocolConsumer({ expectedAddress: normalizedAddress });
  const events = [];
  let droppedEvents = 0;

  return Object.freeze({
    append(event) {
      const result = consumer.accept(event);
      if (!result.ok) throw issue(result.code, "Journal rejected a non-conforming event.");
      if (result.status === "duplicate") return result;
      events.push(freeze(event));
      while (events.length > bound) {
        events.shift();
        droppedEvents += 1;
      }
      return result;
    },
    /** @param {{ address?: any, afterSequence?: number }} [options] */
    replay({ address: replayAddress, afterSequence = 0 } = {}) {
      const checkedAddress = normalizeAddress(replayAddress);
      if (!sameAddress(normalizedAddress, checkedAddress)) {
        throw issue("run-protocol.address-mismatch", "The complete run address does not match the journal scope.");
      }
      const cursor = boundedInteger(afterSequence, 0, maxSequence, "run-protocol.cursor");
      const latestSequence = consumer.snapshot().cursor;
      const availableFromSequence = events[0]?.sequence ?? latestSequence + 1;
      const backpressure = freeze({
        status: droppedEvents > 0 ? "truncated" : "within-limit",
        maxEvents: bound,
        droppedEvents
      });
      if (cursor < availableFromSequence - 1) {
        return freeze({
          schemaVersion: "agentique.runReplay.v1",
          status: "resync-required",
          truncated: true,
          availableFromSequence,
          latestSequence,
          events: [],
          backpressure
        });
      }
      return freeze({
        schemaVersion: "agentique.runReplay.v1",
        status: "replay",
        truncated: droppedEvents > 0,
        availableFromSequence,
        latestSequence,
        events: events.filter((event) => event.sequence > cursor),
        backpressure
      });
    },
    snapshot() {
      const state = consumer.snapshot();
      return freeze({
        schemaVersion: "agentique.runJournalSnapshot.v1",
        cursor: state.cursor,
        terminal: state.terminal,
        retainedEvents: events.length,
        availableFromSequence: events[0]?.sequence ?? state.cursor + 1,
        backpressure: {
          status: droppedEvents > 0 ? "truncated" : "within-limit",
          maxEvents: bound,
          droppedEvents
        }
      });
    }
  });
}

/** @param {{ address?: any, traceType?: string, message?: string, occurredAt?: string }} [options] */
export function createDiagnosticTraceEntry({ address, traceType, message, occurredAt } = {}) {
  const trace = {
    schemaVersion: runDiagnosticTraceSchemaVersion,
    address: normalizeAddress(address),
    traceType: requiredToken(traceType, "traceType"),
    message: requiredSafeText(message, "message"),
    occurredAt: requiredTimestamp(occurredAt)
  };
  assertByteLimit(trace, maxEventBytes, "run-protocol.trace-size");
  return freeze(trace);
}

export function validateRunProtocolEvent(event) {
  const errors = [];
  if (!isPlainObject(event)) return validationFailure("run-protocol.event-object", "Run protocol event must be an object.");
  requireExactKeys(event, ["schemaVersion", "address", "sequence", "occurredAt", "kind", "payload"], errors, "event");
  if (event.schemaVersion !== runProtocolEventSchemaVersion) addError(errors, "run-protocol.schema-version", "Run protocol event schema version is unsupported.");
  validateAddress(event.address, errors);
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) addError(errors, "run-protocol.sequence", "Sequence must be a positive safe integer.");
  if (!isTimestamp(event.occurredAt)) addError(errors, "run-protocol.timestamp", "Event timestamp must be an ISO UTC timestamp.");
  if (!["activity", "result", "cancelled", "error"].includes(event.kind)) addError(errors, "run-protocol.kind", "Event kind is unsupported.");
  validatePayload(event.kind, event.payload, errors);
  if (new TextEncoder().encode(JSON.stringify(event)).byteLength > maxEventBytes) addError(errors, "run-protocol.event-size", "Event exceeds the byte limit.");
  if (unsafePayloadPattern.test(JSON.stringify(event.payload ?? null))) addError(errors, "run-protocol.unsafe-payload", "Event payload contains unsafe local or secret material.");
  return freeze({ ok: errors.length === 0, errors });
}

export function canonicalEventDigest(event) {
  const validation = validateRunProtocolEvent(event);
  if (!validation.ok) throw issue("run-protocol.invalid-event", validation.errors[0].message);
  return sha256HexSync(stableStringify(event));
}

function validatePayload(kind, payload, errors) {
  if (!isPlainObject(payload)) {
    addError(errors, "run-protocol.payload-object", "Event payload must be an object.");
    return;
  }
  if (kind === "activity") {
    requireExactKeys(payload, ["activityType", "message", "progress"], errors, "activity payload", ["progress"]);
    validateToken(payload.activityType, "activityType", errors);
    validateText(payload.message, "message", errors);
    if (payload.progress !== undefined && (typeof payload.progress !== "number" || payload.progress < 0 || payload.progress > 1)) {
      addError(errors, "run-protocol.progress", "Activity progress must be between zero and one.");
    }
  } else if (kind === "result") {
    requireExactKeys(payload, ["summary", "artifactIds"], errors, "result payload");
    validateText(payload.summary, "summary", errors);
    validateTokenArray(payload.artifactIds, "artifactIds", errors);
  } else if (kind === "cancelled") {
    requireExactKeys(payload, ["reasonCode", "message"], errors, "cancelled payload");
    if (!cancellationReasonCodes.has(payload.reasonCode)) addError(errors, "run-protocol.cancel-reason", "Cancellation reason is not allowlisted.");
    validateText(payload.message, "message", errors);
  } else if (kind === "error") {
    requireExactKeys(payload, ["code", "message", "retryable"], errors, "error payload");
    if (!publicErrorCodes.has(payload.code)) addError(errors, "run-protocol.error-code", "Public error code is not allowlisted.");
    validateText(payload.message, "message", errors);
    if (typeof payload.retryable !== "boolean") addError(errors, "run-protocol.retryable", "Error retryable must be boolean.");
  }
}

function validateAddress(address, errors) {
  if (!isPlainObject(address)) {
    addError(errors, "run-protocol.address-object", "Run address must be an object.");
    return;
  }
  requireExactKeys(address, ["schemaVersion", "productScopeId", "sessionId", "resourceId", "runId"], errors, "address");
  if (address.schemaVersion !== runProtocolAddressSchemaVersion) addError(errors, "run-protocol.address-schema", "Run address schema version is unsupported.");
  for (const field of ["productScopeId", "sessionId", "resourceId", "runId"]) validateToken(address[field], field, errors);
}

function normalizeAddress(value) {
  const errors = [];
  validateAddress(value, errors);
  if (errors.length > 0) throw issue(errors[0].code, errors[0].message);
  return freeze(value);
}

function sameAddress(left, right) {
  return ["schemaVersion", "productScopeId", "sessionId", "resourceId", "runId"].every((field) => left[field] === right[field]);
}

function validateTokenArray(value, field, errors) {
  if (!Array.isArray(value) || value.length > maxArtifactIds) {
    addError(errors, "run-protocol.array-limit", `${field} must be an array within its item limit.`);
    return;
  }
  for (const item of value) validateToken(item, field, errors);
  if (new Set(value).size !== value.length) addError(errors, "run-protocol.array-unique", `${field} must contain unique values.`);
}

function validateToken(value, field, errors) {
  if (typeof value !== "string" || !tokenPattern.test(value)) addError(errors, "run-protocol.token", `${field} must be a bounded opaque token.`);
}

function validateText(value, field, errors) {
  if (typeof value !== "string" || value.length < 1) addError(errors, "run-protocol.text", `${field} must be non-empty text.`);
  else if (value.length > maxTextLength) addError(errors, "run-protocol.text-limit", `${field} exceeds the text limit.`);
  else if (unsafePayloadPattern.test(value)) addError(errors, "run-protocol.unsafe-payload", `${field} contains unsafe local or secret material.`);
}

function requiredToken(value, field) {
  const errors = [];
  validateToken(value, field, errors);
  if (errors.length > 0) throw issue(errors[0].code, errors[0].message);
  return value;
}

function requiredSafeText(value, field) {
  const errors = [];
  validateText(value, field, errors);
  if (errors.length > 0) throw issue(errors[0].code, errors[0].message);
  return value;
}

function requiredTimestamp(value) {
  if (!isTimestamp(value)) throw issue("run-protocol.timestamp", "Timestamp must be an ISO UTC timestamp.");
  return value;
}

function isTimestamp(value) {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function requireExactKeys(value, allowed, errors, label, optional = []) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) addError(errors, "run-protocol.unexpected-field", `${label} contains an unexpected field.`);
  }
  for (const key of allowed) {
    if (!optional.includes(key) && !Object.hasOwn(value, key)) addError(errors, "run-protocol.required-field", `${label} is missing a required field.`);
  }
}

function boundedInteger(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw issue(code, "Integer value is outside the allowed range.");
  return value;
}

function assertByteLimit(value, limit, code) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > limit) throw issue(code, "Value exceeds the byte limit.");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function validationFailure(code, message) {
  return freeze({ ok: false, errors: [{ code, message }] });
}

function addError(errors, code, message) {
  errors.push({ code, message });
}

function issue(code, message) {
  return Object.assign(new Error(safeIssueMessage(message)), { code });
}

function safeIssueMessage(message) {
  return String(message ?? "Run protocol validation failed.")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 256);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function freeze(value) {
  return Object.freeze(structuredClone(value));
}
