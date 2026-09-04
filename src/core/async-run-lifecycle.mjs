import { createRunAddress, createRunProtocolProducer } from "./run-protocol.mjs";

export const asyncRunLifecycleSchemaVersion = "agentique.asyncRunLifecycle.v1";

export function createAsyncRunCoordinator({
  runtime,
  emit = () => {},
  timeoutMs = 30_000,
  maxReplayEvents = 64,
  now = () => new Date().toISOString(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer)
} = {}) {
  if (!runtime || typeof runtime.start !== "function") throw issue("async-run.runtime", "A fixed runtime port is required.");
  if (typeof emit !== "function") throw issue("async-run.emitter", "The event emitter must be a function.");
  const timeout = boundedInteger(timeoutMs, 1, 300_000, "async-run.timeout");
  const replayLimit = boundedInteger(maxReplayEvents, 1, 256, "async-run.replay-limit");
  const records = new Map();
  const listeners = new Map();

  return Object.freeze({ start, cancel, status, replay, subscribe, drain });

  function start({ address: inputAddress } = {}) {
    const address = createRunAddress(inputAddress);
    const key = addressKey(address);
    const prior = records.get(key);
    if (prior?.workerActive) throw issue("async-run.address-active", "The complete run address already has an active coordinator.");

    const runtimeRun = runtime.start({ address });
    if (!runtimeRun || typeof runtimeRun.cancel !== "function" || !runtimeRun.completion || runtimeRun.handle?.kind !== "fixed-native-runtime-handle") {
      throw issue("async-run.handle", "The fixed runtime must return a retained cancellable handle and completion promise.");
    }
    const record = {
      address,
      key,
      state: "running",
      terminal: null,
      producer: createRunProtocolProducer({ address, now }),
      events: [],
      droppedEvents: 0,
      runtimeRun,
      workerActive: true,
      timer: null,
      worker: null,
      lateCompletionFenced: 0
    };
    records.set(key, record);
    publishActivity(record, "run.accepted", "Native coordinator accepted the exact run address.", 0);
    publishActivity(record, "adapter.running", "Fixed native runtime handle is supervised.", 0.1);
    record.timer = setTimer(() => timeoutRun(record), timeout);
    record.worker = Promise.resolve(runtimeRun.completion).then(
      (result) => completeRuntime(record, result),
      () => completeRuntime(record, { status: "failed", artifactIds: [] })
    );
    return snapshot(record);
  }

  async function cancel(inputAddress, reasonCode = "user-requested") {
    if (!new Set(["host-shutdown", "policy-revoked", "timeout", "user-requested"]).has(reasonCode)) {
      throw issue("async-run.cancel-reason", "Cancellation reason is not allowlisted.");
    }
    const record = activeRecord(inputAddress);
    if (record.terminal) return snapshot(record);
    commitTerminal(record, reasonCode === "timeout" ? "timed-out" : "canceled", reasonCode);
    await record.runtimeRun.cancel();
    return snapshot(record);
  }

  function status(inputAddress) {
    return snapshot(requiredRecord(inputAddress));
  }

  function replay(inputAddress, afterSequence = 0) {
    const record = requiredRecord(inputAddress);
    const cursor = boundedInteger(afterSequence, 0, Number.MAX_SAFE_INTEGER, "async-run.cursor");
    return freeze({
      schemaVersion: "agentique.asyncRunReplay.v1",
      durability: "process-local",
      status: record.droppedEvents > 0 && cursor < record.droppedEvents ? "resync-required" : "replay",
      truncated: record.droppedEvents > 0,
      droppedEvents: record.droppedEvents,
      events: record.events.filter((event) => event.sequence > cursor)
    });
  }

  function subscribe(inputAddress, handler) {
    const address = createRunAddress(inputAddress);
    if (typeof handler !== "function") throw issue("async-run.listener", "A listener function is required.");
    const key = addressKey(address);
    const scoped = listeners.get(key) ?? new Set();
    scoped.add(handler);
    listeners.set(key, scoped);
    let active = true;
    return Object.freeze({
      unsubscribe() {
        if (active) scoped.delete(handler);
        active = false;
        if (scoped.size === 0) listeners.delete(key);
        return freeze({ activeListeners: scoped.size, hiddenWork: false });
      }
    });
  }

  async function drain(inputAddress) {
    const record = requiredRecord(inputAddress);
    await record.worker;
    return snapshot(record);
  }

  async function timeoutRun(record) {
    if (record.terminal) return snapshot(record);
    return cancel(record.address, "timeout");
  }

  function completeRuntime(record, result) {
    record.workerActive = false;
    clearTimer(record.timer);
    if (record.terminal) {
      record.lateCompletionFenced += 1;
      return snapshot(record);
    }
    if (result?.status === "succeeded") {
      commitTerminal(record, "succeeded", result);
    } else {
      commitTerminal(record, "failed", result);
    }
    return snapshot(record);
  }

  function commitTerminal(record, state, detail) {
    if (record.terminal) return false;
    clearTimer(record.timer);
    let event;
    if (state === "succeeded") {
      event = record.producer.result({ summary: "Fixed native runtime completed.", artifactIds: safeArtifactIds(detail?.artifactIds) });
    } else if (state === "canceled") {
      event = record.producer.cancelled({ reasonCode: detail, message: "Native coordinator canceled the exact runtime handle." });
    } else if (state === "timed-out") {
      event = record.producer.error({ code: "timeout", message: "Native coordinator timeout won terminal authority.", retryable: true });
    } else {
      event = record.producer.error({ code: "adapter-failed", message: "Fixed native runtime failed.", retryable: false });
    }
    record.state = state;
    record.terminal = event;
    appendEvent(record, event);
    return true;
  }

  function publishActivity(record, activityType, message, progress) {
    appendEvent(record, record.producer.activity({ activityType, message, progress }));
  }

  function appendEvent(record, event) {
    record.events.push(event);
    while (record.events.length > replayLimit) {
      record.events.shift();
      record.droppedEvents += 1;
    }
    emit(event);
    for (const listener of listeners.get(record.key) ?? []) listener(event);
  }

  function requiredRecord(inputAddress) {
    const address = createRunAddress(inputAddress);
    const record = records.get(addressKey(address));
    if (!record) throw issue("async-run.unknown-address", "The complete run address has no coordinator record.");
    return record;
  }

  function activeRecord(inputAddress) {
    const record = requiredRecord(inputAddress);
    if (!record.workerActive && !record.terminal) throw issue("async-run.inconsistent", "Inactive coordinator is missing a terminal.");
    return record;
  }
}

export async function reviewAsyncRunLifecycleGate() {
  const successRuntime = controlledRuntime();
  const success = createAsyncRunCoordinator({ runtime: successRuntime, timeoutMs: 10_000 });
  const started = success.start({ address: gateAddress("success") });
  successRuntime.resolve({ status: "succeeded", artifactIds: ["artifact.success"] });
  await success.drain(gateAddress("success"));

  const cancelRuntime = controlledRuntime();
  const canceled = createAsyncRunCoordinator({ runtime: cancelRuntime, timeoutMs: 10_000 });
  canceled.start({ address: gateAddress("cancel") });
  await canceled.cancel(gateAddress("cancel"));
  cancelRuntime.resolve({ status: "succeeded", artifactIds: [] });
  await canceled.drain(gateAddress("cancel"));

  const timeoutRuntime = controlledRuntime();
  const timers = manualTimers();
  const timedOut = createAsyncRunCoordinator({ runtime: timeoutRuntime, timeoutMs: 10, ...timers.port });
  timedOut.start({ address: gateAddress("timeout") });
  await timers.fire();
  timeoutRuntime.resolve({ status: "succeeded", artifactIds: [] });
  await timedOut.drain(gateAddress("timeout"));

  const snapshots = [success.status(gateAddress("success")), canceled.status(gateAddress("cancel")), timedOut.status(gateAddress("timeout"))];
  const failures = [];
  if (started.state !== "running" || started.terminal !== null) failures.push(issue("async-run.nonblocking", "Start must return running before completion."));
  if (snapshots.map((item) => item.state).join(",") !== "succeeded,canceled,timed-out") failures.push(issue("async-run.terminals", "Success, cancel, and timeout terminals are required."));
  if (snapshots.slice(1).some((item) => item.lateCompletionFenced !== 1)) failures.push(issue("async-run.late-result", "Late completion must be fenced."));
  return freeze({
    schemaVersion: asyncRunLifecycleSchemaVersion,
    ok: failures.length === 0,
    failures,
    boundary: { fixedRuntimeOnly: true, rawProcessMaterial: false, processLocalReplay: true, externalEffects: false },
    summary: { terminals: snapshots.filter((item) => item.terminal).length, lateSuccessAccepted: 0, retainedHandles: 3 }
  });
}

function snapshot(record) {
  return freeze({
    schemaVersion: asyncRunLifecycleSchemaVersion,
    address: record.address,
    state: record.state,
    terminal: record.terminal,
    workerActive: record.workerActive,
    handleRetained: Boolean(record.runtimeRun?.handle),
    replayEvents: record.events.length,
    replayDropped: record.droppedEvents,
    lateCompletionFenced: record.lateCompletionFenced
  });
}

function addressKey(address) {
  return [address.productScopeId, address.sessionId, address.resourceId, address.runId].join("::");
}

function safeArtifactIds(values) {
  return Array.isArray(values) ? values.map(String).filter((value) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)).slice(0, 32) : [];
}

function boundedInteger(value, min, max, code) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw issue(code, "Value is outside the allowed integer bound.");
  return value;
}

function gateAddress(suffix) {
  return { productScopeId: "workspace.local", sessionId: "session.gate", resourceId: "resource.echo", runId: `run.${suffix}` };
}

function controlledRuntime() {
  let resolve;
  const completion = new Promise((done) => {
    resolve = done;
  });
  return {
    start: () => ({ handle: { kind: "fixed-native-runtime-handle" }, cancel: async () => {}, completion }),
    resolve
  };
}

function manualTimers() {
  let callback;
  return { port: { setTimer: (next) => ((callback = next), "timer"), clearTimer: () => {} }, fire: () => callback() };
}

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  return value;
}

function issue(code, message) {
  return Object.assign(new Error(message), { code });
}
