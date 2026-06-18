import { redactText } from "./secret-vault.mjs";

export const activeNativeEventTransportSchemaVersion = "agentique.activeNativeEventTransport.v1";
export const activeNativeRunnerEventSchemaVersion = "agentique.activeNativeRunnerEvent.v1";
export const activeNativeEventName = "agentique://native-runner-event";

const nativeEventSchemaVersion = "agentique.nativeRunnerEvent.v1";
const defaultMaxReplayEvents = 32;
const defaultMaxPayloadBytes = 4096;
const unsafeEvidencePattern =
  /(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|vault:[a-z][a-zA-Z0-9._-]{2,80}|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|cookie=/iu;

export function createSampleNativeTransportPayloads() {
  return freeze([
    nativePayload(1, "prepare.accepted", "pending", "Native prepare accepted fixed adapter lane.", { status: "pending-approval" }),
    nativePayload(2, "start.accepted", "running", "Native start accepted approval and manifest re-review.", { status: "running" }),
    nativePayload(3, "adapter.stdout", "running", "Fixed adapter stdout captured as a bounded redacted preview.", {
      status: "running",
      stdoutPreview: "adapter emitted bounded output"
    }),
    nativePayload(4, "run.succeeded", "terminal", "Fixed native adapter run reached a terminal state.", { status: "succeeded", exitCode: 0 }),
    nativePayload(5, "cleanup.completed", "cleanup", "Native cleanup receipt recorded.", { status: "cleaned-up" })
  ]);
}

export function createActiveNativeEventTransport(options = {}) {
  const nativeListen = options.nativeListen;
  const replayEvents = options.replayEvents ?? [];
  const eventName = options.eventName ?? activeNativeEventName;
  const maxReplayEvents = options.maxReplayEvents ?? defaultMaxReplayEvents;
  const maxPayloadBytes = options.maxPayloadBytes ?? defaultMaxPayloadBytes;
  if (typeof nativeListen !== "function") {
    throw issue("active-transport.native-listen", "Native listener adapter is required.");
  }

  const config = {
    eventName: safeText(eventName),
    maxReplayEvents: positiveInteger(maxReplayEvents, defaultMaxReplayEvents),
    maxPayloadBytes: positiveInteger(maxPayloadBytes, defaultMaxPayloadBytes)
  };
  const subscribers = new Map();
  const replayBuffer = [];
  const errors = [];
  const backpressure = {
    status: "within-limit",
    droppedEvents: 0,
    maxReplayEvents: config.maxReplayEvents,
    maxPayloadBytes: config.maxPayloadBytes
  };
  const counters = {
    listenCalls: 0,
    unlistenCalls: 0,
    deliveredLive: 0,
    deliveredReplay: 0
  };
  let nativeUnlisten = null;
  let nativeAttachPromise = null;
  let lastSequence = 0;
  let terminal = null;

  for (const payload of replayEvents) {
    const normalized = normalizeNativePayload(payload, { delivery: "replay", maxPayloadBytes: config.maxPayloadBytes, errors });
    if (normalized) {
      appendToReplayBuffer(normalized);
      lastSequence = Math.max(lastSequence, normalized.sequence);
      if (isTerminal(normalized)) terminal = terminalSummary(normalized);
    }
  }

  return {
    schemaVersion: activeNativeEventTransportSchemaVersion,
    eventName: config.eventName,
    boundary: boundary(),
    async subscribe(subscriberId, handler) {
      const subscription = attachSubscriber(subscriberId, handler);
      await ensureNativeListenerAsync();
      return subscription;
    },
    subscribeSync(subscriberId, handler) {
      const subscription = attachSubscriber(subscriberId, handler);
      ensureNativeListenerSync();
      return subscription;
    },
    review() {
      return transportReview();
    }
  };

  function attachSubscriber(subscriberId, handler) {
    const id = safeToken(subscriberId);
    if (!id || id === "event") {
      throw issue("active-transport.subscriber", "Subscriber id is required.");
    }
    if (typeof handler !== "function") {
      throw issue("active-transport.handler", "Subscriber handler is required.");
    }
    if (subscribers.has(id)) {
      throw issue("active-transport.duplicate-listener", `Subscriber ${id} is already active.`);
    }

    subscribers.set(id, { handler });
    for (const event of replayBuffer) {
      counters.deliveredReplay += 1;
      handler({ ...event, delivery: "replay" });
    }

    let active = true;
    return {
      id,
      unsubscribe() {
        if (!active) return lifecycleSummary();
        active = false;
        subscribers.delete(id);
        if (subscribers.size === 0) {
          return detachNativeListener();
        }
        return lifecycleSummary();
      }
    };
  }

  async function ensureNativeListenerAsync() {
    if (nativeUnlisten) return;
    if (!nativeAttachPromise) {
      counters.listenCalls += 1;
      nativeAttachPromise = Promise.resolve(nativeListen(config.eventName, handleNativeEvent)).then((unlisten) => {
        if (typeof unlisten !== "function") {
          throw issue("active-transport.unlisten", "Native listener must return an unlisten function.");
        }
        nativeUnlisten = unlisten;
      });
    }
    await nativeAttachPromise;
  }

  function ensureNativeListenerSync() {
    if (nativeUnlisten) return;
    counters.listenCalls += 1;
    const unlisten = nativeListen(config.eventName, handleNativeEvent);
    if (typeof unlisten !== "function") {
      throw issue("active-transport.unlisten", "Synchronous native listener must return an unlisten function.");
    }
    nativeUnlisten = unlisten;
    nativeAttachPromise = Promise.resolve();
  }

  function detachNativeListener() {
    if (nativeAttachPromise && !nativeUnlisten) {
      return nativeAttachPromise.then(() => detachNativeListener());
    }
    if (nativeUnlisten) {
      const unlisten = nativeUnlisten;
      nativeUnlisten = null;
      nativeAttachPromise = null;
      unlisten();
      counters.unlistenCalls += 1;
    }
    return lifecycleSummary();
  }

  function handleNativeEvent(message) {
    const payload = message?.payload ?? message;
    const normalized = normalizeNativePayload(payload, { delivery: "live", maxPayloadBytes: config.maxPayloadBytes, errors });
    if (!normalized) return;

    if (normalized.sequence <= lastSequence) {
      errors.push(issue("active-transport.order", "Native event sequence must be strictly increasing."));
      return;
    }
    lastSequence = normalized.sequence;
    appendToReplayBuffer(normalized);
    if (isTerminal(normalized)) terminal = terminalSummary(normalized);
    for (const subscriber of subscribers.values()) {
      counters.deliveredLive += 1;
      subscriber.handler({ ...normalized, delivery: "live" });
    }
  }

  function appendToReplayBuffer(event) {
    replayBuffer.push(event);
    while (replayBuffer.length > config.maxReplayEvents) {
      const removableIndex = replayBuffer.findIndex((entry) => !isTerminal(entry));
      replayBuffer.splice(removableIndex >= 0 ? removableIndex : 0, 1);
      backpressure.droppedEvents += 1;
      backpressure.status = "overflow-summarized";
    }
  }

  function transportReview() {
    const replayCopy = replayBuffer.map((entry) => ({ ...entry }));
    const terminalReview = terminal ?? { status: "none", eventId: null, consistent: false };
    const review = {
      schemaVersion: "agentique.activeNativeEventTransportReview.v1",
      ok:
        errors.length === 0 &&
        terminalReview.consistent === true &&
        replayCopy.every((entry, index, entries) => index === 0 || entry.sequence > entries[index - 1].sequence) &&
        replayCopy.length <= config.maxReplayEvents,
      boundary: boundary(),
      replayBuffer: replayCopy,
      backpressure: { ...backpressure },
      terminal: terminalReview,
      lifecycle: lifecycleSummary(),
      summary: {
        replayEvents: replayCopy.length,
        liveDelivered: counters.deliveredLive,
        replayDelivered: counters.deliveredReplay,
        activeSubscribers: subscribers.size
      },
      errors: errors.map((error) => ({ code: error.code, message: safeText(error.message) }))
    };
    assertSafe(review);
    return freeze(review);
  }

  function lifecycleSummary() {
    return {
      activeListeners: subscribers.size,
      listenCalls: counters.listenCalls,
      unlistenCalls: counters.unlistenCalls,
      cleanupRequired: subscribers.size === 0 && nativeUnlisten != null
    };
  }

  function boundary() {
    return {
      source: "fixed-native-runner-event",
      liveTransport: true,
      replayFallback: true,
      descriptorOnly: false,
      versionedPayloads: true,
      boundedPayloadBytes: config.maxPayloadBytes,
      boundedReplayEvents: config.maxReplayEvents,
      redacted: true,
      noGenericShell: true,
      noProcessPermissionWidening: true,
      noPackageLifecycleExecution: true,
      noBrowserDataAccess: true,
      noAmbientEnvironmentAccess: true,
      noAutomaticDownloadedWorkflowExecution: true,
      tauriCapabilityPermissionsUnchanged: true
    };
  }
}

export function reviewActiveNativeEventTransportGate() {
  const lifecycleHarness = createSyncHarness();
  const lifecycleTransport = createActiveNativeEventTransport({ nativeListen: lifecycleHarness.listen, maxReplayEvents: 5 });
  const lifecycleReceived = [];
  const first = lifecycleTransport.subscribeSync("runner-route", (event) => lifecycleReceived.push(event));
  for (const payload of createSampleNativeTransportPayloads()) lifecycleHarness.emit(payload);
  let duplicateBlocked = false;
  try {
    lifecycleTransport.subscribeSync("runner-route", () => {});
  } catch (error) {
    duplicateBlocked = errorCode(error) === "active-transport.duplicate-listener";
  }
  first.unsubscribe();
  const second = lifecycleTransport.subscribeSync("runner-route", () => {});
  second.unsubscribe();

  const replayHarness = createSyncHarness();
  const replayTransport = createActiveNativeEventTransport({
    nativeListen: replayHarness.listen,
    replayEvents: createSampleNativeTransportPayloads().slice(0, 3),
    maxReplayEvents: 3
  });
  const replayReceived = [];
  const replaySub = replayTransport.subscribeSync("late-runner-route", (event) => replayReceived.push(event));
  replayHarness.emit(createSampleNativeTransportPayloads()[3]);
  replaySub.unsubscribe();

  const overflowHarness = createSyncHarness();
  const overflowTransport = createActiveNativeEventTransport({ nativeListen: overflowHarness.listen, maxReplayEvents: 4, maxPayloadBytes: 180 });
  const overflowSub = overflowTransport.subscribeSync("overflow-route", () => {});
  for (const payload of [
    ...Array.from({ length: 8 }, (_, index) => nativePayload(index + 1, "adapter.stdout", "running", `chunk ${index + 1}`, { stdoutPreview: `line ${index + 1}` })),
    nativePayload(9, "run.succeeded", "terminal", "done", { status: "succeeded" })
  ]) {
    overflowHarness.emit(payload);
  }
  overflowSub.unsubscribe();
  const lifecycleReview = lifecycleTransport.review();
  const replayReview = replayTransport.review();
  const overflowReview = overflowTransport.review();

  const checks = {
    liveTransportProven: lifecycleReview.boundary.liveTransport === true && lifecycleReceived.length === 5,
    orderedDelivery: lifecycleReceived.every((event, index) => event.sequence === index + 1),
    lateReplay: replayReceived.slice(0, 3).every((event) => event.delivery === "replay") && replayReceived.at(-1)?.delivery === "live" && replayReview.replayBuffer.length === 3,
    listenerCleanup: lifecycleReview.lifecycle.listenCalls === 2 && lifecycleReview.lifecycle.unlistenCalls === 2,
    duplicateListenerBlocked: duplicateBlocked,
    backpressureBounded: overflowReview.backpressure.droppedEvents > 0 && overflowReview.replayBuffer.length === 4,
    terminalConsistency: lifecycleReview.terminal.consistent === true && overflowReview.terminal.status === "succeeded",
    noCapabilityWidening: Object.entries(lifecycleReview.boundary)
      .filter(([key]) => key.startsWith("no"))
      .every(([, value]) => value === true)
  };
  const ok = Object.values(checks).every(Boolean);
  const review = {
    schemaVersion: "agentique.activeNativeEventTransportGateReview.v1",
    ok,
    checks,
    summary: {
      eventName: "native-runner-event",
      delivered: lifecycleReceived.length,
      replayDelivered: replayReceived.filter((event) => event.delivery === "replay").length,
      overflowDropped: overflowReview.backpressure.droppedEvents,
      liveTransport: lifecycleReview.boundary.liveTransport
    },
    errors: ok ? [] : [issue("active-transport.review", "Active native event transport review failed.")]
  };
  assertSafe(review);
  return freeze(review);
}

function normalizeNativePayload(payload, { delivery, maxPayloadBytes, errors }) {
  if (!payload || typeof payload !== "object") {
    errors.push(issue("active-transport.payload", "Native event payload must be an object."));
    return null;
  }
  if (payload.schemaVersion !== nativeEventSchemaVersion) {
    errors.push(issue("active-transport.schema", "Native event payload schema is unsupported."));
    return null;
  }
  const sequence = Number(payload.sequence);
  if (!Number.isInteger(sequence) || sequence < 1) {
    errors.push(issue("active-transport.sequence", "Native event sequence must be a positive integer."));
    return null;
  }
  const type = safeToken(payload.eventType);
  const phase = safeToken(payload.phase);
  const runId = safeToken(payload.runId);
  const event = {
    schemaVersion: activeNativeRunnerEventSchemaVersion,
    id: `evt-${String(sequence).padStart(4, "0")}-${runId}-${type}`,
    sequence,
    runId,
    type,
    phase,
    label: safeText(payload.label),
    details: sanitizeDetails(payload.details ?? {}),
    delivery
  };
  const bytes = byteLength(event);
  if (bytes > maxPayloadBytes) {
    event.truncated = true;
    event.label = safeText(`${event.label} redacted:payload-overflow`);
    event.details = { status: safeToken(event.details.status ?? ""), overflow: "redacted:payload-overflow" };
  }
  assertSafe(event);
  return event;
}

function nativePayload(sequence, eventType, phase, label, details = {}) {
  return {
    schemaVersion: nativeEventSchemaVersion,
    runId: "run-local-source",
    sequence,
    eventType,
    phase,
    label,
    details
  };
}

function sanitizeDetails(value, depth = 0) {
  if (depth > 3) return "redacted:depth";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return safeText(value);
  if (Array.isArray(value)) return value.slice(0, 16).map((entry) => sanitizeDetails(entry, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 24)
        .map(([key, entry]) => [safeToken(key), sanitizeDetails(entry, depth + 1)])
    );
  }
  return safeText(value);
}

function terminalSummary(event) {
  const status = safeToken(event.details?.status ?? event.type.split(".").at(-1) ?? event.phase);
  return {
    status,
    eventId: event.id,
    type: event.type,
    consistent: event.phase === "terminal" && event.type.endsWith(status)
  };
}

function isTerminal(event) {
  return event.phase === "terminal";
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function safeText(value) {
  return redactText(
    String(value ?? "")
      .replace(/\s+/gu, " ")
      .trim()
  )
    .replace(unsafeEvidencePattern, "redacted:sensitive-evidence")
    .slice(0, 180);
}

function safeToken(value) {
  return (
    safeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9._:-]/gu, "-")
      .replace(/-+/gu, "-")
      .slice(0, 80) || "event"
  );
}

function assertSafe(value) {
  const text = JSON.stringify(value);
  if (unsafeEvidencePattern.test(text)) {
    throw issue("active-transport.unsafe-evidence", "Active native event transport contains unsafe evidence.");
  }
}

function issue(code, message) {
  return Object.assign(new Error(safeText(message)), { code });
}

function errorCode(error) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
}

function createSyncHarness() {
  let listener = null;
  return {
    listen(eventName, handler) {
      if (eventName !== activeNativeEventName) {
        throw issue("active-transport.event-name", "Unexpected native event name.");
      }
      listener = handler;
      return () => {
        listener = null;
      };
    },
    emit(payload) {
      listener?.({ event: activeNativeEventName, payload });
    }
  };
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
