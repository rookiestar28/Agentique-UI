import assert from "node:assert/strict";
import test from "node:test";
import { readNativeRunnerEventReplayInputs, reviewNativeRunnerEventReplay } from "../src/core/native-runner-event-replay.mjs";

test("native runner event replay validation gate passes", () => {
  const review = reviewNativeRunnerEventReplay();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.replay.nativeBacked, true);
  assert.equal(review.replay.descriptorOnly, false);
  assert.equal(review.replay.statusCommandReplays, true);
  assert.equal(review.replay.logsCommandReplays, true);
  assert.equal(review.replay.restartDurable, true);
  assert.equal(review.replay.persistedBeforePublication, true);
  assert.equal(review.replay.redactedAndPathNeutral, true);
  assert.deepEqual(review.replay.requiredEvents, ["prepare.accepted", "approval.pending", "start.accepted", "adapter.launching", "run-folder.written", "run.succeeded"]);
});

test("native event replay rejects process-local-only or publish-before-persist implementations", () => {
  const input = readNativeRunnerEventReplayInputs();
  const publishBeforePersist = reviewNativeRunnerEventReplay({
    ...input,
    rustSource: input.rustSource.replace("persist_native_event_record(request, &event)?;", "")
  });
  const processLocalOnly = reviewNativeRunnerEventReplay({
    ...input,
    rustSource: input.rustSource.replace("fn read_durable_native_events(", "fn read_process_local_events(")
  });

  assert.equal(publishBeforePersist.ok, false);
  assert.ok(publishBeforePersist.errors.some((error) => error.code === "native-event.persisted-before-publication"));
  assert.equal(processLocalOnly.ok, false);
  assert.ok(processLocalOnly.errors.some((error) => error.code === "native-event.restart-durable"));
});

test("native event replay rejects descriptor-only live claims", () => {
  const input = readNativeRunnerEventReplayInputs();
  const weakened = reviewNativeRunnerEventReplay({
    ...input,
    runnerEventStreamSource: input.runnerEventStreamSource.replace("liveTransport: false", "liveTransport: true")
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-event.descriptor-live-claim"));
});

test("native event replay rejects unsafe event payload material", () => {
  const input = readNativeRunnerEventReplayInputs();
  const unsafePath = ["C", ":/Users/example/raw "].join("");
  const unsafeSecret = ["bearer", "abcdefghijklmnop"].join(" ");
  const unsafeRust = `${input.rustSource}\nconst BAD_EVENT_PAYLOAD: &str = "${unsafePath}${unsafeSecret}";`;
  const weakened = reviewNativeRunnerEventReplay({ ...input, rustSource: unsafeRust });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-event.unsafe-payload"));
});
