import assert from "node:assert/strict";
import test from "node:test";
import { adaptNativeRunnerEvent, adaptNativeRunnerReplay, createRunProtocolConformanceFixture, reviewRunProtocolConformance } from "../src/core/run-protocol-conformance.mjs";

test("native replay maps explicitly into the canonical producer contract", () => {
  const fixture = createRunProtocolConformanceFixture();
  const replay = adaptNativeRunnerReplay(
    { schemaVersion: "agentique.nativeRunnerEventReplay.v1", events: fixture.nativeEvents },
    { address: fixture.address, occurredAtForSequence: (sequence) => `2026-09-04T00:00:0${sequence}.000Z` }
  );

  assert.deepEqual(
    replay.events.map((event) => event.kind),
    ["activity", "activity", "activity", "result"]
  );
  assert.deepEqual(
    replay.events.map((event) => event.sequence),
    [1, 2, 3, 4]
  );
  assert.equal(
    replay.events.every((event) => event.address.sessionId === "session.conformance"),
    true
  );
});

test("native adapter rejects scope mismatch, fabricated time, diagnostic events, and unknown terminals", () => {
  const fixture = createRunProtocolConformanceFixture();
  const base = fixture.nativeEvents[0];
  assert.throws(
    () => adaptNativeRunnerEvent({ ...base, runId: "run.other" }, { address: fixture.address, occurredAt: "2026-09-04T00:00:01.000Z" }),
    hasCode("run-protocol-adapter.run-id")
  );
  assert.throws(() => adaptNativeRunnerEvent(base, { address: fixture.address }), hasCode("run-protocol-adapter.timestamp"));
  assert.throws(
    () => adaptNativeRunnerEvent({ ...base, sequence: 5, eventType: "cleanup.completed", phase: "cleanup" }, { address: fixture.address, occurredAt: "2026-09-04T00:00:05.000Z" }),
    hasCode("run-protocol-adapter.diagnostic-only")
  );
  assert.throws(
    () => adaptNativeRunnerEvent({ ...base, sequence: 5, eventType: "run.unknown", phase: "terminal" }, { address: fixture.address, occurredAt: "2026-09-04T00:00:05.000Z" }),
    hasCode("run-protocol-adapter.unknown-terminal")
  );
});

test("reference producer and consumer conformance gate passes without capability widening", () => {
  const review = reviewRunProtocolConformance();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(Object.values(review.checks).every(Boolean), true);
  assert.equal(
    Object.values(review.boundary).every((value) => value === false),
    true
  );
  assert.equal(review.summary.terminalKind, "result");
  assert.equal(review.summary.replayStatus, "resync-required");
});

function hasCode(code) {
  return (error) => error?.code === code;
}
