import assert from "node:assert/strict";
import test from "node:test";
import {
  createDiagnosticTraceEntry,
  createRunAddress,
  createRunProtocolConsumer,
  createRunProtocolJournal,
  createRunProtocolProducer,
  runProtocolEventSchemaVersion,
  validateRunProtocolEvent
} from "../src/core/run-protocol.mjs";

test("canonical run protocol accepts contiguous activity then one result terminal", () => {
  const address = sampleAddress();
  const producer = sampleProducer(address);
  const consumer = createRunProtocolConsumer({ expectedAddress: address });
  const activity = producer.activity({ activityType: "adapter.started", message: "Adapter started." });
  const result = producer.result({ summary: "Adapter completed.", artifactIds: ["artifact.output"] });

  assert.equal(activity.schemaVersion, runProtocolEventSchemaVersion);
  assert.equal(consumer.accept(activity).status, "accepted");
  assert.equal(consumer.accept(result).status, "accepted-terminal");
  assert.equal(consumer.snapshot().cursor, 2);
  assert.deepEqual(consumer.snapshot().terminal, { kind: "result", sequence: 2 });
});

test("producer supports the three terminal kinds and never emits after its first terminal", () => {
  for (const [method, payload, expectedKind] of [
    ["result", { summary: "Completed.", artifactIds: [] }, "result"],
    ["cancelled", { reasonCode: "user-requested", message: "Cancelled by user." }, "cancelled"],
    ["error", { code: "adapter-failed", message: "Adapter failed safely.", retryable: false }, "error"]
  ]) {
    const producer = sampleProducer(sampleAddress(`run.${method}`));
    const event = producer[method](payload);
    assert.equal(event.kind, expectedKind);
    assert.throws(() => producer.activity({ activityType: "late", message: "Too late." }), hasCode("run-protocol.producer-terminal"));
  }
});

test("consumer checks the complete address instead of trusting run id possession", () => {
  const address = sampleAddress();
  const producer = sampleProducer(address);
  const event = producer.activity({ activityType: "adapter.started", message: "Adapter started." });

  for (const field of ["productScopeId", "sessionId", "resourceId"]) {
    const mismatched = { ...address, [field]: `${address[field]}.other` };
    const consumer = createRunProtocolConsumer({ expectedAddress: mismatched });
    const result = consumer.accept(event);
    assert.equal(result.ok, false);
    assert.equal(result.code, "run-protocol.address-mismatch");
    assert.equal(consumer.snapshot().cursor, 0);
  }
});

test("canonical duplicates are ignored while conflicting duplicates fail closed", () => {
  const address = sampleAddress();
  const producer = sampleProducer(address);
  const event = producer.activity({ activityType: "adapter.started", message: "Adapter started." });
  const exactConsumer = createRunProtocolConsumer({ expectedAddress: address });

  assert.equal(exactConsumer.accept(event).status, "accepted");
  assert.equal(exactConsumer.accept(structuredClone(event)).status, "duplicate");
  assert.equal(exactConsumer.snapshot().cursor, 1);

  const conflictConsumer = createRunProtocolConsumer({ expectedAddress: address });
  assert.equal(conflictConsumer.accept(event).ok, true);
  const conflict = structuredClone(event);
  conflict.payload.message = "Different content.";
  const rejected = conflictConsumer.accept(conflict);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "run-protocol.conflicting-duplicate");
  assert.equal(conflictConsumer.snapshot().status, "failed");
});

test("gaps, reordering, post-terminal events, and every second terminal fail closed", () => {
  const address = sampleAddress();
  const producer = sampleProducer(address);
  const first = producer.activity({ activityType: "adapter.started", message: "Adapter started." });
  const second = producer.activity({ activityType: "adapter.running", message: "Adapter running." });
  const gapConsumer = createRunProtocolConsumer({ expectedAddress: address });
  assert.equal(gapConsumer.accept({ ...second, sequence: 3 }).code, "run-protocol.sequence-gap");

  const reorderConsumer = createRunProtocolConsumer({ expectedAddress: address });
  assert.equal(reorderConsumer.accept(first).ok, true);
  assert.equal(reorderConsumer.accept({ ...second, sequence: 1 }).code, "run-protocol.conflicting-duplicate");

  const terminalFactories = {
    result: () => ({ summary: "Completed.", artifactIds: [] }),
    cancelled: () => ({ reasonCode: "user-requested", message: "Cancelled." }),
    error: () => ({ code: "adapter-failed", message: "Failed safely.", retryable: false })
  };
  for (const firstKind of Object.keys(terminalFactories)) {
    for (const secondKind of Object.keys(terminalFactories)) {
      const pairProducer = sampleProducer(sampleAddress(`run.${firstKind}.${secondKind}`));
      const firstTerminal = pairProducer[firstKind](terminalFactories[firstKind]());
      const secondTerminal = structuredClone(firstTerminal);
      secondTerminal.sequence += 1;
      secondTerminal.kind = secondKind;
      secondTerminal.payload = terminalFactories[secondKind]();
      const consumer = createRunProtocolConsumer({ expectedAddress: firstTerminal.address });
      assert.equal(consumer.accept(firstTerminal).ok, true);
      assert.equal(consumer.accept(secondTerminal).code, "run-protocol.event-after-terminal");
      assert.deepEqual(consumer.snapshot().terminal, { kind: firstKind, sequence: 1 });
    }
  }
});

test("schema and codecs reject malformed, unbounded, path-bearing, or secret-bearing events", () => {
  const address = sampleAddress();
  const producer = sampleProducer(address);
  const event = producer.activity({ activityType: "adapter.started", message: "Adapter started." });
  const invalidEvents = [
    { ...event, schemaVersion: "agentique.runProtocolEvent.v0" },
    { ...event, sequence: 0 },
    { ...event, sequence: Number.MAX_SAFE_INTEGER + 1 },
    { ...event, occurredAt: "not-a-date" },
    { ...event, kind: "trace" },
    { ...event, payload: { ...event.payload, extra: { nested: { too: { deep: { value: true } } } } } }
  ];
  for (const invalid of invalidEvents) {
    assert.equal(validateRunProtocolEvent(invalid).ok, false);
  }

  for (const unsafe of [
    ["C", ":\\Users\\example\\secret.txt"].join(""),
    "../private/file",
    "bearer abcdefghijklmnop",
    ["sk", "-12345678901234567890"].join(""),
    "cookie=session-value"
  ]) {
    assert.throws(() => sampleProducer(address).activity({ activityType: "adapter.output", message: unsafe }), hasCode("run-protocol.unsafe-payload"));
  }
  assert.throws(() => sampleProducer(address).activity({ activityType: "adapter.output", message: "x".repeat(513) }), hasCode("run-protocol.text-limit"));
});

test("bounded journal makes replay truncation and stale cursor resync explicit", () => {
  const address = sampleAddress();
  const producer = sampleProducer(address);
  const journal = createRunProtocolJournal({ address, maxEvents: 3 });
  for (let index = 0; index < 4; index += 1) {
    journal.append(producer.activity({ activityType: "adapter.progress", message: `Step ${index + 1}.` }));
  }

  const stale = journal.replay({ address, afterSequence: 0 });
  assert.equal(stale.status, "resync-required");
  assert.equal(stale.truncated, true);
  assert.equal(stale.availableFromSequence, 2);
  assert.equal(stale.latestSequence, 4);
  assert.equal(stale.backpressure.droppedEvents, 1);

  const current = journal.replay({ address, afterSequence: 2 });
  assert.equal(current.status, "replay");
  assert.deepEqual(
    current.events.map((event) => event.sequence),
    [3, 4]
  );
  assert.equal(journal.snapshot().retainedEvents, 3);
  assert.throws(() => journal.replay({ address: { ...address, sessionId: "session.other" }, afterSequence: 2 }), hasCode("run-protocol.address-mismatch"));
});

test("diagnostic trace is a separate bounded contract and cannot enter the UI event consumer", () => {
  const address = sampleAddress();
  const trace = createDiagnosticTraceEntry({
    address,
    traceType: "adapter.stderr",
    message: "Bounded diagnostic detail.",
    occurredAt: "2026-09-04T00:00:00.000Z"
  });
  const consumer = createRunProtocolConsumer({ expectedAddress: address });

  assert.equal(trace.schemaVersion, "agentique.runDiagnosticTrace.v1");
  assert.equal(validateRunProtocolEvent(trace).ok, false);
  assert.equal(consumer.accept(trace).code, "run-protocol.invalid-event");
});

function sampleAddress(runId = "run.alpha") {
  return createRunAddress({
    productScopeId: "workspace.local",
    sessionId: "session.alpha",
    resourceId: "resource.echo",
    runId
  });
}

function sampleProducer(address) {
  return createRunProtocolProducer({
    address,
    now: sequenceClock("2026-09-04T00:00:00.000Z")
  });
}

function sequenceClock(start) {
  let tick = Date.parse(start);
  return () => {
    const value = new Date(tick).toISOString();
    tick += 1;
    return value;
  };
}

function hasCode(code) {
  return (error) => error?.code === code;
}
