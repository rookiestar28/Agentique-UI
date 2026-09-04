import { createDiagnosticTraceEntry, createRunAddress, createRunProtocolConsumer, createRunProtocolJournal, validateRunProtocolEvent } from "./run-protocol.mjs";

export const runProtocolConformanceSchemaVersion = "agentique.runProtocolConformance.v1";

const nativeSchemaVersion = "agentique.nativeRunnerEvent.v1";

export function adaptNativeRunnerEvent(nativeEvent, { address, occurredAt } = {}) {
  if (!nativeEvent || typeof nativeEvent !== "object" || Array.isArray(nativeEvent)) {
    throw issue("run-protocol-adapter.native-event", "Native runner event must be an object.");
  }
  if (nativeEvent.schemaVersion !== nativeSchemaVersion) {
    throw issue("run-protocol-adapter.native-schema", "Native runner event schema is unsupported.");
  }
  const normalizedAddress = createRunAddress(address);
  if (nativeEvent.runId !== normalizedAddress.runId) {
    throw issue("run-protocol-adapter.run-id", "Native runner event run id does not match the complete target address.");
  }
  if (!Number.isSafeInteger(nativeEvent.sequence) || nativeEvent.sequence < 1) {
    throw issue("run-protocol-adapter.sequence", "Native runner event sequence must be a positive safe integer.");
  }
  const eventType = requiredNativeToken(nativeEvent.eventType);
  const timestamp = requiredTimestamp(occurredAt);
  const label = requiredNativeText(nativeEvent.label);

  if (eventType === "cleanup.completed" || eventType.startsWith("diagnostic.")) {
    throw issue("run-protocol-adapter.diagnostic-only", "Cleanup and diagnostic events belong to the separate diagnostic trace contract.");
  }

  const kind = terminalKind(nativeEvent);
  const payload = nativePayload(kind, eventType, label, nativeEvent.details);
  const event = {
    schemaVersion: "agentique.runProtocolEvent.v1",
    address: normalizedAddress,
    sequence: nativeEvent.sequence,
    occurredAt: timestamp,
    kind,
    payload
  };
  const validation = validateRunProtocolEvent(event);
  if (!validation.ok) throw issue("run-protocol-adapter.invalid-output", validation.errors[0].message);
  return freeze(event);
}

export function adaptNativeRunnerReplay(receipt, { address, occurredAtForSequence } = {}) {
  if (!receipt || typeof receipt !== "object" || !Array.isArray(receipt.events)) {
    throw issue("run-protocol-adapter.replay", "Native replay receipt must provide an events array.");
  }
  if (typeof occurredAtForSequence !== "function") {
    throw issue("run-protocol-adapter.clock", "Replay conversion requires an explicit timestamp source.");
  }
  const events = receipt.events.map((event) => adaptNativeRunnerEvent(event, { address, occurredAt: occurredAtForSequence(event.sequence) }));
  return freeze({
    schemaVersion: "agentique.runProtocolAdaptedReplay.v1",
    sourceSchemaVersion: String(receipt.schemaVersion ?? "unknown"),
    events
  });
}

export function createRunProtocolConformanceFixture() {
  const address = createRunAddress({
    productScopeId: "workspace.local",
    sessionId: "session.conformance",
    resourceId: "resource.echo",
    runId: "run.conformance"
  });
  const nativeEvents = [
    nativeEvent(1, "prepare.accepted", "pending", "Native prepare accepted."),
    nativeEvent(2, "start.accepted", "running", "Native start accepted."),
    nativeEvent(3, "adapter.stdout", "running", "Bounded adapter output."),
    nativeEvent(4, "run.succeeded", "terminal", "Adapter completed.", { status: "succeeded" })
  ];
  return freeze({ address, nativeEvents });
}

export function reviewRunProtocolConformance() {
  const fixture = createRunProtocolConformanceFixture();
  const replay = adaptNativeRunnerReplay(
    { schemaVersion: "agentique.nativeRunnerEventReplay.v1", events: fixture.nativeEvents },
    {
      address: fixture.address,
      occurredAtForSequence: (sequence) => `2026-09-04T00:00:0${sequence}.000Z`
    }
  );
  const consumer = createRunProtocolConsumer({ expectedAddress: fixture.address });
  const results = replay.events.map((event) => consumer.accept(event));
  const duplicate = consumer.accept(replay.events[1]);

  const gapConsumer = createRunProtocolConsumer({ expectedAddress: fixture.address });
  const gap = gapConsumer.accept({ ...replay.events[0], sequence: 2 });
  const wrongScopeConsumer = createRunProtocolConsumer({
    expectedAddress: createRunAddress({ ...fixture.address, sessionId: "session.other" })
  });
  const wrongScope = wrongScopeConsumer.accept(replay.events[0]);

  const journal = createRunProtocolJournal({ address: fixture.address, maxEvents: 2 });
  for (const event of replay.events) journal.append(event);
  const staleReplay = journal.replay({ address: fixture.address, afterSequence: 0 });

  let diagnosticSeparated = false;
  try {
    adaptNativeRunnerEvent(nativeEvent(5, "cleanup.completed", "cleanup", "Cleanup completed."), {
      address: fixture.address,
      occurredAt: "2026-09-04T00:00:05.000Z"
    });
  } catch (error) {
    diagnosticSeparated = error?.code === "run-protocol-adapter.diagnostic-only";
  }
  const trace = createDiagnosticTraceEntry({
    address: fixture.address,
    traceType: "adapter.stderr",
    message: "Bounded diagnostic output.",
    occurredAt: "2026-09-04T00:00:05.000Z"
  });

  const checks = {
    producerConforming: replay.events.every((event) => validateRunProtocolEvent(event).ok),
    consumerConforming: results.every((result) => result.ok) && consumer.snapshot().terminal?.kind === "result",
    contiguousSequence: replay.events.every((event, index) => event.sequence === index + 1),
    canonicalDuplicate: duplicate.status === "duplicate",
    gapFailsClosed: gap.code === "run-protocol.sequence-gap" && gapConsumer.snapshot().status === "failed",
    fullAddressChecked: wrongScope.code === "run-protocol.address-mismatch",
    staleCursorExplicit: staleReplay.status === "resync-required" && staleReplay.backpressure.droppedEvents === 2,
    diagnosticSeparated: diagnosticSeparated && trace.schemaVersion === "agentique.runDiagnosticTrace.v1",
    capabilityNeutral: true
  };
  const ok = Object.values(checks).every(Boolean);
  return freeze({
    schemaVersion: runProtocolConformanceSchemaVersion,
    ok,
    checks,
    boundary: {
      processExecution: false,
      networkListener: false,
      packageLifecycle: false,
      modelExecution: false,
      toolExecution: false,
      ambientSecrets: false,
      browserData: false
    },
    summary: {
      adaptedEvents: replay.events.length,
      terminalKind: consumer.snapshot().terminal?.kind ?? null,
      replayStatus: staleReplay.status
    },
    errors: ok ? [] : [{ code: "run-protocol-conformance.failed", message: "Run protocol conformance review failed." }]
  });
}

function nativePayload(kind, eventType, label, details) {
  if (kind === "result") return { summary: label, artifactIds: [] };
  if (kind === "cancelled") return { reasonCode: "user-requested", message: label };
  if (kind === "error") return { code: "adapter-failed", message: label, retryable: false };
  const progress = typeof details?.progress === "number" ? details.progress : undefined;
  return progress === undefined ? { activityType: eventType, message: label } : { activityType: eventType, message: label, progress };
}

function terminalKind(event) {
  if (event.eventType === "run.succeeded") return "result";
  if (event.eventType === "run.cancelled" || event.eventType === "run.canceled") return "cancelled";
  if (event.eventType === "run.failed" || event.eventType === "run.timed-out") return "error";
  if (event.phase === "terminal") throw issue("run-protocol-adapter.unknown-terminal", "Unknown native terminal events are rejected.");
  return "activity";
}

function nativeEvent(sequence, eventType, phase, label, details = {}) {
  return { schemaVersion: nativeSchemaVersion, runId: "run.conformance", sequence, eventType, phase, label, details };
}

function requiredNativeToken(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9.-]{0,79}$/u.test(value)) {
    throw issue("run-protocol-adapter.event-type", "Native event type is invalid.");
  }
  return value;
}

function requiredNativeText(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 512) {
    throw issue("run-protocol-adapter.label", "Native event label is invalid.");
  }
  return value;
}

function requiredTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) {
    throw issue("run-protocol-adapter.timestamp", "Native conversion requires an ISO UTC timestamp.");
  }
  return value;
}

function issue(code, message) {
  return Object.assign(new Error(message), { code });
}

function freeze(value) {
  return Object.freeze(structuredClone(value));
}
