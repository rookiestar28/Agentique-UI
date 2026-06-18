import assert from "node:assert/strict";
import test from "node:test";
import {
  activeNativeEventTransportSchemaVersion,
  createActiveNativeEventTransport,
  createSampleNativeTransportPayloads,
  reviewActiveNativeEventTransportGate
} from "../src/core/active-native-event-transport.mjs";

test("active native event transport delivers ordered versioned payloads", async () => {
  const native = createNativeListenerHarness();
  const transport = createActiveNativeEventTransport({ nativeListen: native.listen });
  const received = [];
  const subscription = await transport.subscribe("run-panel", (event) => received.push(event));

  for (const payload of createSampleNativeTransportPayloads()) {
    native.emit(payload);
  }

  assert.equal(transport.schemaVersion, activeNativeEventTransportSchemaVersion);
  assert.equal(transport.boundary.liveTransport, true);
  assert.deepEqual(
    received.map((event) => event.sequence),
    [1, 2, 3, 4, 5]
  );
  assert.equal(
    received.every((event) => event.schemaVersion === "agentique.activeNativeRunnerEvent.v1"),
    true
  );
  assert.equal(
    received.every((event, index) => event.id === `evt-${String(index + 1).padStart(4, "0")}-run-local-source-${event.type}`),
    true
  );

  await subscription.unsubscribe();
  assert.equal(native.unlistenCalls, 1);
});

test("late subscribers receive bounded replay before live messages", async () => {
  const native = createNativeListenerHarness();
  const replayEvents = createSampleNativeTransportPayloads().slice(0, 3);
  const transport = createActiveNativeEventTransport({ nativeListen: native.listen, replayEvents, maxReplayEvents: 3 });
  const received = [];
  const subscription = await transport.subscribe("late-run-panel", (event) => received.push(event));

  native.emit(createSampleNativeTransportPayloads()[3]);

  assert.deepEqual(
    received.map((event) => event.type),
    ["prepare.accepted", "start.accepted", "adapter.stdout", "run.succeeded"]
  );
  assert.equal(
    received.slice(0, 3).every((event) => event.delivery === "replay"),
    true
  );
  assert.equal(received[3].delivery, "live");

  await subscription.unsubscribe();
});

test("listener lifecycle cleanup prevents duplicate listeners across remount", async () => {
  const native = createNativeListenerHarness();
  const transport = createActiveNativeEventTransport({ nativeListen: native.listen });
  const first = await transport.subscribe("runner-route", () => {});

  await assert.rejects(() => transport.subscribe("runner-route", () => {}), /already active/u);
  assert.equal(native.listenCalls, 1);

  await first.unsubscribe();
  const second = await transport.subscribe("runner-route", () => {});

  assert.equal(native.listenCalls, 2);
  assert.equal(native.unlistenCalls, 1);

  await second.unsubscribe();
  assert.equal(native.unlistenCalls, 2);
});

test("overflow and backpressure stay bounded while preserving terminal event", async () => {
  const native = createNativeListenerHarness();
  const payloads = [
    ...Array.from({ length: 8 }, (_, index) => ({
      schemaVersion: "agentique.nativeRunnerEvent.v1",
      runId: "run-local-source",
      sequence: index + 1,
      eventType: "adapter.stdout",
      phase: "running",
      label: `chunk ${index + 1}`,
      details: { stdoutPreview: `line ${index + 1}` }
    })),
    {
      schemaVersion: "agentique.nativeRunnerEvent.v1",
      runId: "run-local-source",
      sequence: 9,
      eventType: "run.succeeded",
      phase: "terminal",
      label: "done",
      details: { status: "succeeded" }
    }
  ];
  const transport = createActiveNativeEventTransport({ nativeListen: native.listen, maxReplayEvents: 4, maxPayloadBytes: 180 });
  const subscription = await transport.subscribe("overflow-panel", () => {});

  for (const payload of payloads) {
    native.emit(payload);
  }

  const review = transport.review();
  assert.equal(review.backpressure.status, "overflow-summarized");
  assert.equal(review.backpressure.droppedEvents > 0, true);
  assert.equal(review.replayBuffer.length, 4);
  assert.equal(review.replayBuffer.at(-1).type, "run.succeeded");
  assert.equal(review.terminal.consistent, true);
  assert.equal(JSON.stringify(review).length < 12000, true);

  await subscription.unsubscribe();
});

test("unsafe payloads are redacted and terminal consistency is enforced", async () => {
  const native = createNativeListenerHarness();
  const transport = createActiveNativeEventTransport({ nativeListen: native.listen });
  const received = [];
  const subscription = await transport.subscribe("redaction-panel", (event) => received.push(event));

  native.emit({
    schemaVersion: "agentique.nativeRunnerEvent.v1",
    runId: "run-local-source",
    sequence: 1,
    eventType: "run.succeeded",
    phase: "terminal",
    label: ["C", ":/Users/example/output ", "sk-", "12345678901234567890"].join(""),
    details: {
      status: "succeeded",
      stdoutPreview: ["bearer", " abcdefghijklmnop"].join("")
    }
  });

  const review = transport.review();
  const text = JSON.stringify({ received, review });
  assert.equal(review.terminal.status, "succeeded");
  assert.equal(review.terminal.consistent, true);
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]/u);
  assert.doesNotMatch(text, /sk-[A-Za-z0-9]{20,}/u);
  assert.doesNotMatch(text, /bearer\s+[A-Za-z0-9._-]+/iu);

  await subscription.unsubscribe();
});

test("active native event transport gate proves no capability widening", () => {
  const review = reviewActiveNativeEventTransportGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.liveTransportProven, true);
  assert.equal(review.checks.orderedDelivery, true);
  assert.equal(review.checks.lateReplay, true);
  assert.equal(review.checks.listenerCleanup, true);
  assert.equal(review.checks.duplicateListenerBlocked, true);
  assert.equal(review.checks.backpressureBounded, true);
  assert.equal(review.checks.terminalConsistency, true);
  assert.equal(review.checks.noCapabilityWidening, true);
});

function createNativeListenerHarness() {
  let listener = null;
  let listenCalls = 0;
  let unlistenCalls = 0;
  return {
    get listenCalls() {
      return listenCalls;
    },
    get unlistenCalls() {
      return unlistenCalls;
    },
    async listen(eventName, handler) {
      assert.equal(eventName, "agentique://native-runner-event");
      listenCalls += 1;
      listener = handler;
      return () => {
        unlistenCalls += 1;
        listener = null;
      };
    },
    emit(payload) {
      listener?.({ event: "agentique://native-runner-event", payload });
    }
  };
}
