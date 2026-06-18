import { createCuratedAdapterExecutionLane } from "./curated-adapter-execution-lane.mjs";
import { createGraphRunPlan } from "./graph-run-plan.mjs";
import { createAllowedRunnerPermissionPreflight } from "./runner-permission-preflight.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";
import { createIdleWorkflowRunnerSession, runAcceptedWorkflowSession } from "./workflow-runner-session.mjs";
import { sampleSchedulableWorkflowIr } from "./workflow-scheduler.mjs";

export const runnerEventStreamSchemaVersion = "agentique.runnerEventStream.v1";

const fixedNow = "2026-06-13T00:00:00.000Z";
const unsafeEvidencePattern = /(?<![A-Za-z])[A-Za-z]:[\\/]|vault:[a-z][a-zA-Z0-9._-]{2,80}|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|cookie=/iu;

export function createRunnerEventStream({ session = createIdleWorkflowRunnerSession(), adapterLane = createCuratedAdapterExecutionLane(), now = fixedNow, maxLogEntries = 8 } = {}) {
  const normalizedSession = normalizeSession(session);
  const schedulerEvents = schedulerEventsFor(normalizedSession, now);
  const adapterEvents = adapterEventsFor(adapterLane, schedulerEvents.length, now);
  const events = resequence([...schedulerEvents, ...adapterEvents]);
  const nodeTimelines = nodeTimelinesFor(normalizedSession, schedulerEvents);
  const dependencyChains = dependencyChainsFor(normalizedSession);
  const cleanupEvent = events.find((entry) => entry.type === "cleanup") ?? null;
  const boundedLogs = boundedLogPreview(normalizedSession, events, maxLogEntries);
  const stream = {
    schemaVersion: runnerEventStreamSchemaVersion,
    generatedAt: now,
    runId: normalizedSession.runId,
    status: normalizedSession.status,
    terminalState: normalizedSession.status,
    activeSample: activeSampleFor(events, normalizedSession),
    events,
    schedulerEvents,
    adapterEvents,
    nodeTimelines,
    dependencyChains,
    cleanupEvent,
    boundedLogs,
    summary: summarize(events, nodeTimelines, dependencyChains, boundedLogs, adapterEvents),
    boundary: {
      descriptorOnly: true,
      liveTransport: false,
      redacted: true,
      maxLogEntries
    }
  };
  assertNoInlineSecrets(stream);
  if (unsafeEvidencePattern.test(JSON.stringify(stream))) {
    throw new Error("Runner event stream contains unsafe evidence.");
  }
  return freeze(stream);
}

export function reviewRunnerEventStreamGate() {
  const runPlan = createGraphRunPlan(sampleSchedulableWorkflowIr, { permissionsApproved: true });
  const permissionPreflight = createAllowedRunnerPermissionPreflight();
  const start = createRunnerEventStream({
    session: runAcceptedWorkflowSession({ action: "start", runPlan, permissionPreflight }),
    adapterLane: createCuratedAdapterExecutionLane({ selectedRuntime: "python" })
  });
  const retry = createRunnerEventStream({
    session: runAcceptedWorkflowSession({ action: "retry", runPlan, permissionPreflight }),
    adapterLane: createCuratedAdapterExecutionLane({ selectedRuntime: "node" })
  });
  const failure = createRunnerEventStream({
    session: runAcceptedWorkflowSession({ action: "failure", runPlan, permissionPreflight }),
    adapterLane: createCuratedAdapterExecutionLane({ selectedRuntime: "python" })
  });
  const canceled = createRunnerEventStream({
    session: runAcceptedWorkflowSession({ action: "cancel", runPlan, permissionPreflight }),
    adapterLane: createCuratedAdapterExecutionLane({ selectedRuntime: "node" })
  });

  const ok = start.schemaVersion === runnerEventStreamSchemaVersion &&
    isStrictlyOrdered(start.events) &&
    start.events.every((entry) => /^evt-\d{4}-[a-z0-9._:-]+-[a-z0-9._:-]+$/u.test(entry.id)) &&
    hasTypes(start.schedulerEvents, ["queued", "started", "succeeded", "cleanup"]) &&
    hasTypes(retry.schedulerEvents, ["retrying", "succeeded"]) &&
    hasTypes(failure.schedulerEvents, ["failed", "skipped", "cleanup"]) &&
    failure.dependencyChains.length >= 2 &&
    hasTypes(canceled.schedulerEvents, ["canceled", "cleanup"]) &&
    start.activeSample.status === "running" &&
    start.terminalState === "succeeded" &&
    start.boundedLogs.length <= start.boundary.maxLogEntries &&
    start.boundedLogs.every((entry) => entry.redacted === true) &&
    start.adapterEvents.some((entry) => entry.type === "adapter-succeeded") &&
    start.adapterEvents.some((entry) => entry.type === "cleanup") &&
    !unsafeEvidencePattern.test(JSON.stringify({ start, retry, failure, canceled }));

  return freeze({
    schemaVersion: "agentique.runnerEventStreamReview.v1",
    ok,
    checks: {
      stableIds: start.events.every((entry) => entry.id.startsWith("evt-")),
      orderedEvents: isStrictlyOrdered(start.events),
      retryingVisible: hasTypes(retry.schedulerEvents, ["retrying"]),
      dependencyChains: failure.dependencyChains.length,
      canceledVisible: hasTypes(canceled.schedulerEvents, ["canceled"]),
      adapterEvents: start.adapterEvents.length,
      boundedLogs: start.boundedLogs.length
    },
    errors: ok ? [] : [issue("runner-event-stream.review", "Runner event stream review failed.")]
  });
}

function normalizeSession(session) {
  return {
    runId: safeText(session?.runId ?? "run-ui-workflow-001"),
    status: safeText(session?.status ?? "idle"),
    action: safeText(session?.action ?? "idle"),
    nodeResults: Array.isArray(session?.nodeResults) ? session.nodeResults.map((node) => ({
      nodeId: safeText(node.nodeId),
      type: safeText(node.type),
      status: safeText(node.status),
      attempts: Math.max(0, Number(node.attempts ?? 0)),
      code: node.code ? safeText(node.code) : null,
      message: node.message ? safeText(node.message) : null
    })) : [],
    logs: Array.isArray(session?.logs) ? session.logs.map(safeText) : [],
    cleanup: {
      status: safeText(session?.cleanup?.status ?? "not-started"),
      terminalRunStatus: safeText(session?.cleanup?.terminalRunStatus ?? session?.status ?? "idle"),
      removed: Array.isArray(session?.cleanup?.removed) ? session.cleanup.removed.map(safeText) : []
    }
  };
}

function schedulerEventsFor(session, now) {
  let sequence = 0;
  const events = [];
  for (const node of session.nodeResults) {
    events.push(event(++sequence, node.nodeId, "queued", "queued", now, {
      nodeType: node.type,
      label: `${node.nodeId} queued for scheduler review.`
    }));
    if (node.attempts > 0 && node.status !== "skipped" && node.status !== "canceled") {
      events.push(event(++sequence, node.nodeId, "started", "running", now, {
        nodeType: node.type,
        attempt: 1,
        label: `${node.nodeId} started.`
      }));
      for (let attempt = 2; attempt <= node.attempts; attempt += 1) {
        events.push(event(++sequence, node.nodeId, "retrying", "running", now, {
          nodeType: node.type,
          attempt,
          label: `${node.nodeId} retry attempt ${attempt}.`
        }));
      }
    }
    events.push(event(++sequence, node.nodeId, node.status, terminalPhase(node.status), now, {
      nodeType: node.type,
      attempts: node.attempts,
      code: node.code,
      message: node.message,
      label: `${node.nodeId} ${node.status}.`
    }));
  }
  if (session.status !== "idle") {
    events.push(event(++sequence, "cleanup", "cleanup", "cleanup", now, {
      nodeType: "cleanup",
      label: `${session.cleanup.status} after ${session.cleanup.terminalRunStatus}.`,
      removed: session.cleanup.removed.length
    }));
  }
  return events;
}

function adapterEventsFor(adapterLane, offset, now) {
  const selected = adapterLane?.selected;
  if (!selected || typeof selected !== "object") return [];
  const baseNodeId = `adapter-${safeToken(selected.runtime)}`;
  const events = [
    event(offset + 1, baseNodeId, "queued", "queued", now, {
      nodeType: "adapter",
      label: `${selected.runtime} adapter lane queued.`
    }),
    event(offset + 2, baseNodeId, "adapter-started", "running", now, {
      nodeType: "adapter",
      label: `${selected.runtime} adapter lane started from validation evidence.`
    }),
    event(offset + 3, baseNodeId, `adapter-${safeToken(selected.status)}`, terminalPhase(selected.status), now, {
      nodeType: "adapter",
      label: `${selected.runtime} adapter lane ${selected.status}.`,
      artifactPath: safeText(selected.evidence?.artifact ?? "")
    })
  ];
  if (selected.cleanup?.receipt) {
    events.push(event(offset + 4, `${baseNodeId}-cleanup`, "cleanup", "cleanup", now, {
      nodeType: "adapter-cleanup",
      label: `${selected.cleanup.status} receipt available.`,
      artifactPath: safeText(selected.cleanup.receipt)
    }));
  }
  return events;
}

function nodeTimelinesFor(session, schedulerEvents) {
  return session.nodeResults.map((node) => ({
    nodeId: node.nodeId,
    type: node.type,
    status: node.status,
    attempts: node.attempts,
    failed: node.status === "failed",
    skipped: node.status === "skipped",
    canceled: node.status === "canceled",
    events: schedulerEvents.filter((entry) => entry.nodeId === node.nodeId).map((entry) => entry.id),
    lastEventType: schedulerEvents.filter((entry) => entry.nodeId === node.nodeId).slice(-1)[0]?.type ?? "none",
    message: node.message
  }));
}

function dependencyChainsFor(session) {
  const failed = new Set(session.nodeResults.filter((node) => ["failed", "canceled"].includes(node.status)).map((node) => node.nodeId));
  return session.nodeResults
    .filter((node) => ["failed", "skipped", "canceled"].includes(node.status))
    .map((node) => ({
      nodeId: node.nodeId,
      status: node.status,
      upstream: findUpstream(node.message, failed),
      code: node.code,
      message: node.message ?? `${node.nodeId} ended as ${node.status}.`
    }));
}

function boundedLogPreview(session, events, maxLogEntries) {
  const source = session.logs.length > 0
    ? session.logs
    : events.map((entry) => `${entry.sequence}:${entry.nodeId}:${entry.type}`);
  return source.slice(0, maxLogEntries).map((line, index) => ({
    index: index + 1,
    text: safeText(line),
    redacted: true
  }));
}

function activeSampleFor(events, session) {
  const running = events.find((entry) => entry.phase === "running") ?? null;
  return {
    status: running ? "running" : session.status,
    cursor: running?.id ?? null,
    terminalState: session.status,
    canAdvanceToTerminal: session.status !== "idle"
  };
}

function summarize(events, nodeTimelines, dependencyChains, boundedLogs, adapterEvents) {
  return {
    events: events.length,
    schedulerEvents: events.length - adapterEvents.length,
    adapterEvents: adapterEvents.length,
    nodes: nodeTimelines.length,
    running: events.filter((entry) => entry.phase === "running").length,
    retrying: events.filter((entry) => entry.type === "retrying").length,
    succeeded: events.filter((entry) => entry.type === "succeeded" || entry.type === "adapter-succeeded").length,
    failed: events.filter((entry) => entry.type === "failed").length,
    skipped: events.filter((entry) => entry.type === "skipped").length,
    canceled: events.filter((entry) => entry.type === "canceled").length,
    cleanup: events.filter((entry) => entry.type === "cleanup").length,
    dependencyChains: dependencyChains.length,
    boundedLogs: boundedLogs.length
  };
}

function resequence(entries) {
  return entries.map((entry, index) => {
    const sequence = index + 1;
    return {
      ...entry,
      sequence,
      id: eventId(sequence, entry.nodeId, entry.type)
    };
  });
}

function event(sequence, nodeId, type, phase, now, details = {}) {
  return {
    id: eventId(sequence, nodeId, type),
    sequence,
    nodeId: safeText(nodeId),
    type: safeText(type),
    phase: safeText(phase),
    createdAt: now,
    ...sanitizeDetails(details)
  };
}

function sanitizeDetails(details) {
  return Object.fromEntries(Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, typeof value === "number" || typeof value === "boolean" || value == null ? value : safeText(value)]));
}

function terminalPhase(status) {
  if (["succeeded", "failed", "skipped", "canceled", "timed-out", "adapter-succeeded"].includes(status)) {
    return "terminal";
  }
  return status === "cleanup" ? "cleanup" : "running";
}

function eventId(sequence, nodeId, type) {
  return `evt-${String(sequence).padStart(4, "0")}-${safeToken(nodeId)}-${safeToken(type)}`;
}

function safeToken(value) {
  return String(value ?? "event").toLowerCase().replace(/[^a-z0-9._:-]/gu, "-").replace(/-+/gu, "-").slice(0, 80) || "event";
}

function findUpstream(message, failed) {
  const match = /Dependency ([A-Za-z0-9._:-]+) did not succeed/u.exec(String(message ?? ""));
  if (match) return safeText(match[1]);
  return failed.values().next().value ?? "upstream";
}

function hasTypes(events, types) {
  const seen = new Set(events.map((entry) => entry.type));
  return types.every((type) => seen.has(type));
}

function isStrictlyOrdered(events) {
  return events.every((entry, index) => entry.sequence === index + 1);
}

function safeText(value) {
  return redactText(String(value ?? "").replace(/\s+/gu, " ").trim())
    .replace(unsafeEvidencePattern, "redacted:sensitive-evidence")
    .slice(0, 180);
}

function issue(code, message) {
  return { code, message: safeText(message) };
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
