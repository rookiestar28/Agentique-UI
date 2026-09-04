import assert from "node:assert/strict";
import test from "node:test";
import { createAsyncRunCoordinator, reviewAsyncRunLifecycleGate } from "../src/core/async-run-lifecycle.mjs";

const address = Object.freeze({
  productScopeId: "workspace.local",
  sessionId: "session.async",
  resourceId: "resource.echo",
  runId: "run.async"
});

test("start returns running before the retained runtime completes", async () => {
  const runtime = createControlledRuntime();
  const coordinator = createAsyncRunCoordinator({ runtime, timeoutMs: 10_000 });

  const started = coordinator.start({ address });
  assert.equal(started.state, "running");
  assert.equal(started.terminal, null);
  assert.equal(runtime.started, 1);
  assert.equal(coordinator.status(address).handleRetained, true);

  runtime.resolve({ status: "succeeded", artifactIds: ["artifact.output"] });
  await coordinator.drain(address);
  assert.equal(coordinator.status(address).state, "succeeded");
});

test("duplicate full-address admission is blocked while distinct addresses run independently", async () => {
  const firstRuntime = createControlledRuntime();
  const secondRuntime = createControlledRuntime();
  const runtimes = [firstRuntime, secondRuntime];
  const coordinator = createAsyncRunCoordinator({ runtime: { start: (request) => runtimes.shift().start(request) }, timeoutMs: 10_000 });

  assert.equal(coordinator.start({ address }).state, "running");
  assert.throws(() => coordinator.start({ address }), (error) => error.code === "async-run.address-active");
  const otherAddress = { ...address, runId: "run.async.other" };
  assert.equal(coordinator.start({ address: otherAddress }).state, "running");

  firstRuntime.resolve({ status: "succeeded", artifactIds: [] });
  secondRuntime.resolve({ status: "succeeded", artifactIds: [] });
  await Promise.all([coordinator.drain(address), coordinator.drain(otherAddress)]);
});

test("cancel wins terminal authority and fences a late success", async () => {
  const runtime = createControlledRuntime();
  const delivered = [];
  const coordinator = createAsyncRunCoordinator({ runtime, emit: (event) => delivered.push(event), timeoutMs: 10_000 });
  coordinator.start({ address });

  const canceled = await coordinator.cancel(address, "user-requested");
  assert.equal(canceled.state, "canceled");
  assert.equal(runtime.canceled, 1);
  runtime.resolve({ status: "succeeded", artifactIds: ["artifact.late"] });
  await coordinator.drain(address);

  const snapshot = coordinator.status(address);
  assert.equal(snapshot.state, "canceled");
  assert.equal(snapshot.lateCompletionFenced, 1);
  assert.deepEqual(
    delivered.filter((event) => event.kind !== "activity").map((event) => event.kind),
    ["cancelled"]
  );
});

test("timeout cancels the exact handle and remains the only terminal", async () => {
  const runtime = createControlledRuntime();
  const timers = createManualTimers();
  const coordinator = createAsyncRunCoordinator({ runtime, timeoutMs: 25, ...timers.port });
  coordinator.start({ address });

  await timers.fire();
  runtime.resolve({ status: "succeeded", artifactIds: [] });
  await coordinator.drain(address);
  const snapshot = coordinator.status(address);
  assert.equal(snapshot.state, "timed-out");
  assert.equal(snapshot.terminal.kind, "error");
  assert.equal(snapshot.terminal.payload.code, "timeout");
  assert.equal(runtime.canceled, 1);
  assert.equal(snapshot.lateCompletionFenced, 1);
});

test("replay is bounded process-local and listener teardown is explicit", async () => {
  const runtime = createControlledRuntime();
  const delivered = [];
  const coordinator = createAsyncRunCoordinator({ runtime, maxReplayEvents: 2, timeoutMs: 10_000 });
  const subscription = coordinator.subscribe(address, (event) => delivered.push(event));
  coordinator.start({ address });
  runtime.resolve({ status: "succeeded", artifactIds: [] });
  await coordinator.drain(address);

  const replay = coordinator.replay(address, 0);
  assert.equal(replay.durability, "process-local");
  assert.equal(replay.truncated, true);
  assert.equal(replay.events.length, 2);
  assert.equal(subscription.unsubscribe().activeListeners, 0);
  assert.equal(delivered.at(-1).kind, "result");
});

test("lifecycle gate covers asynchronous success cancel timeout replay and no-widening", async () => {
  const review = await reviewAsyncRunLifecycleGate();
  assert.equal(review.ok, true, JSON.stringify(review.failures));
  assert.equal(review.summary.terminals, 3);
  assert.equal(review.summary.lateSuccessAccepted, 0);
  assert.equal(review.boundary.rawProcessMaterial, false);
});

function createControlledRuntime() {
  let resolveCompletion;
  const completion = new Promise((resolve) => {
    resolveCompletion = resolve;
  });
  return {
    started: 0,
    canceled: 0,
    start() {
      this.started += 1;
      return {
        handle: { kind: "fixed-native-runtime-handle" },
        completion,
        cancel: async () => {
          this.canceled += 1;
        }
      };
    },
    resolve(value) {
      resolveCompletion(value);
    }
  };
}

function createManualTimers() {
  let callback;
  return {
    port: {
      setTimer(next) {
        callback = next;
        return "timer.manual";
      },
      clearTimer() {}
    },
    async fire() {
      await callback();
    }
  };
}
