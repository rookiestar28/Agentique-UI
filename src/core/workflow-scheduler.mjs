import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";
import { sampleWorkflowIr } from "./workflow-ir.mjs";

const allowedNodeTypes = new Set(["input", "transform", "viewer", "handoff"]);
const executionRiskTypes = new Set(["external-action", "shell", "browser-automation", "network", "provider-sync"]);
const fixedNow = "2026-06-12T00:00:00.000Z";

/**
 * @typedef {Readonly<{
 *   schemaVersion: string,
 *   workflowId: string,
 *   nodes: Array<Record<string, any>>,
 *   edges: Array<Record<string, any>>,
 *   sourceLinks?: Array<Record<string, any>>
 * }>} WorkflowScheduleIr
 */

export const sampleSchedulableWorkflowIr = Object.freeze({
  schemaVersion: "agentique.workflowIr.v1",
  workflowId: "scheduler-branch-merge-flow",
  nodes: [
    { id: "source", type: "input", label: "Source input", inputs: [], outputs: ["resource"], risk: "low", credentials: [] },
    { id: "normalize", type: "transform", label: "Normalize", inputs: ["resource"], outputs: ["normalized"], risk: "low", credentials: [] },
    { id: "classify", type: "transform", label: "Classify", inputs: ["resource"], outputs: ["classification"], risk: "low", credentials: [] },
    { id: "merge", type: "viewer", label: "Merge preview", inputs: ["normalized", "classification"], outputs: ["previewArtifact"], risk: "low", credentials: [] },
    { id: "handoff", type: "handoff", label: "Handoff descriptor", inputs: ["previewArtifact"], outputs: ["handoffDescriptor"], risk: "low", credentials: [] }
  ],
  edges: [
    { from: "source", to: "normalize", label: "resource" },
    { from: "source", to: "classify", label: "resource" },
    { from: "normalize", to: "merge", label: "normalized" },
    { from: "classify", to: "merge", label: "classification" },
    { from: "merge", to: "handoff", label: "previewArtifact" }
  ],
  sourceLinks: []
});

/**
 * @param {WorkflowScheduleIr} [ir]
 * @param {Record<string, any>} [options]
 */
export function createWorkflowSchedule(ir = sampleSchedulableWorkflowIr, options = {}) {
  const mode = options.mode ?? "strict";
  const normalized = normalizeWorkflow(ir);
  if (!normalized.ok) {
    return blockedSchedule(normalized.workflow, normalized.errors);
  }

  const graph = buildGraph(normalized.workflow);
  if (!graph.ok) {
    return blockedSchedule(normalized.workflow, graph.errors);
  }

  const riskReasons = findRiskReasons(normalized.workflow);
  const blockedIds = new Set(riskReasons.map((reason) => reason.nodeId));
  const dependencyReasons = findBlockedDependencyReasons(normalized.workflow, graph, blockedIds);
  const blockers = [...riskReasons, ...dependencyReasons];

  if (blockers.length > 0 && mode === "strict") {
    return {
      schemaVersion: "agentique.workflowSchedule.v1",
      ok: false,
      status: "blocked",
      mode,
      workflowId: normalized.workflow.workflowId,
      order: [],
      executableNodes: [],
      handoffReasons: [],
      blockers,
      edges: normalized.workflow.edges,
      summary: {
        nodes: normalized.workflow.nodes.length,
        executable: 0,
        blocked: blockers.length,
        handoff: 0
      },
      errors: blockers.map((reason) => issue(reason.code, reason.reason))
    };
  }

  const executableNodeIds = new Set(normalized.workflow.nodes
    .filter((node) => !blockers.some((reason) => reason.nodeId === node.id))
    .map((node) => node.id));
  const order = topologicalOrder(normalized.workflow, graph, executableNodeIds);
  if (!order.ok) {
    return blockedSchedule(normalized.workflow, order.errors);
  }

  const handoffReasons = mode === "handoff" ? blockers.map((reason) => ({
    ...reason,
    route: "external-handoff"
  })) : [];

  return {
    schemaVersion: "agentique.workflowSchedule.v1",
    ok: true,
    status: handoffReasons.length > 0 ? "handoff-required" : "ready",
    mode,
    workflowId: normalized.workflow.workflowId,
    order: order.order,
    executableNodes: order.order.map((nodeId) => normalized.workflow.nodes.find((node) => node.id === nodeId)),
    handoffReasons,
    blockers: mode === "handoff" ? [] : blockers,
    edges: normalized.workflow.edges,
    summary: {
      nodes: normalized.workflow.nodes.length,
      executable: order.order.length,
      blocked: mode === "handoff" ? 0 : blockers.length,
      handoff: handoffReasons.length
    },
    errors: []
  };
}

/**
 * @param {WorkflowScheduleIr} [ir]
 * @param {Record<string, any>} [options]
 */
export function runWorkflowSchedule(ir = sampleSchedulableWorkflowIr, options = {}) {
  const schedule = createWorkflowSchedule(ir, { mode: options.mode ?? "strict" });
  if (!schedule.ok) {
    return {
      schemaVersion: "agentique.workflowScheduleRun.v1",
      ok: false,
      status: "blocked",
      schedule,
      events: [],
      nodeResults: [],
      outputs: [],
      artifacts: [],
      cleanup: cleanupReceipt("blocked", options),
      errors: schedule.errors
    };
  }

  const events = [];
  const nodeResults = [];
  const resultByNode = new Map();
  let canceled = false;
  let failed = false;
  let sequence = 0;

  for (const nodeId of schedule.order) {
    const node = schedule.executableNodes.find((entry) => entry.id === nodeId);
    if (canceled) {
      const canceledResult = nodeResult(node, "canceled", 0, "workflow-scheduler.canceled", "Workflow was canceled before this node.");
      nodeResults.push(canceledResult);
      resultByNode.set(node.id, canceledResult);
      events.push(event(++sequence, node.id, "canceled"));
      continue;
    }

    if (options.cancelBeforeNodeId === node.id) {
      canceled = true;
      const canceledResult = nodeResult(node, "canceled", 0, "workflow-scheduler.canceled", "Cancellation requested before node execution.");
      nodeResults.push(canceledResult);
      resultByNode.set(node.id, canceledResult);
      events.push(event(++sequence, node.id, "canceled"));
      continue;
    }

    const blockedDependency = inbound(schedule.edges, node.id).find((parentId) => {
      const parent = resultByNode.get(parentId);
      return parent && parent.status !== "succeeded";
    });
    if (blockedDependency) {
      const skipped = nodeResult(node, "skipped", 0, "workflow-scheduler.dependency-failed", `Dependency ${blockedDependency} did not succeed.`);
      nodeResults.push(skipped);
      resultByNode.set(node.id, skipped);
      events.push(event(++sequence, node.id, "skipped"));
      continue;
    }

    events.push(event(++sequence, node.id, "started"));
    const execution = executeNode(node, options);
    for (const retryEvent of execution.retryEvents) {
      events.push(event(++sequence, node.id, retryEvent));
    }
    nodeResults.push(execution.result);
    resultByNode.set(node.id, execution.result);
    events.push(event(++sequence, node.id, execution.result.status));
    if (execution.result.status === "failed") {
      failed = true;
    }
  }

  const outputs = nodeResults.flatMap((result) => result.outputs);
  const artifacts = nodeResults.flatMap((result) => result.artifacts);
  const status = canceled ? "canceled" : failed ? "failed" : schedule.handoffReasons.length > 0 ? "handoff-required" : "succeeded";

  return {
    schemaVersion: "agentique.workflowScheduleRun.v1",
    ok: status === "succeeded" || status === "handoff-required",
    status,
    schedule,
    events,
    nodeResults,
    outputs,
    artifacts,
    cleanup: cleanupReceipt(status, options),
    errors: nodeResults
      .filter((result) => ["failed", "skipped", "canceled"].includes(result.status))
      .map((result) => issue(result.code, result.message))
  };
}

export function reviewWorkflowScheduler(options = {}) {
  const success = runWorkflowSchedule(sampleSchedulableWorkflowIr, options);
  const blocked = createWorkflowSchedule(sampleWorkflowIr, { mode: "strict" });
  const handoff = createWorkflowSchedule(sampleWorkflowIr, { mode: "handoff" });
  const retry = runWorkflowSchedule(sampleSchedulableWorkflowIr, {
    ...options,
    retryPolicy: { normalize: 2 },
    failAttempts: { normalize: 1 }
  });
  const failure = runWorkflowSchedule(sampleSchedulableWorkflowIr, {
    ...options,
    retryPolicy: { normalize: 1 },
    failAttempts: { normalize: 3 }
  });
  const canceled = runWorkflowSchedule(sampleSchedulableWorkflowIr, {
    ...options,
    cancelBeforeNodeId: "merge"
  });

  const ok = success.ok &&
    success.schedule.order.join(">") === "source>normalize>classify>merge>handoff" &&
    blocked.ok === false &&
    handoff.status === "handoff-required" &&
    retry.ok === true &&
    retry.nodeResults.find((result) => result.nodeId === "normalize")?.attempts === 2 &&
    failure.status === "failed" &&
    canceled.status === "canceled" &&
    canceled.cleanup.ok === true;

  return {
    schemaVersion: "agentique.workflowSchedulerReview.v1",
    ok,
    checks: {
      success: success.ok,
      deterministicOrder: success.schedule.order,
      blockedUnsupported: blocked.ok === false,
      handoffUnsupported: handoff.status === "handoff-required",
      retrySucceeded: retry.ok === true,
      failurePropagated: failure.status === "failed",
      cancellationCleanup: canceled.cleanup.ok === true
    },
    summary: {
      events: success.events.length,
      outputs: success.outputs.length,
      artifacts: success.artifacts.length,
      blockedReasons: blocked.blockers?.length ?? 0,
      handoffReasons: handoff.handoffReasons?.length ?? 0
    },
    errors: ok ? [] : [issue("workflow-scheduler.review", "Workflow scheduler review failed.")]
  };
}

function normalizeWorkflow(ir) {
  const errors = [];
  if (!ir || typeof ir !== "object") {
    return { ok: false, workflow: emptyWorkflow(), errors: [issue("workflow-scheduler.invalid", "Workflow IR must be an object.")] };
  }
  const workflow = {
    schemaVersion: String(ir.schemaVersion ?? ""),
    workflowId: safeId(ir.workflowId ?? "workflow-scheduler", errors),
    nodes: Array.isArray(ir.nodes) ? ir.nodes.map((node, index) => normalizeNode(node, index, errors)) : [],
    edges: Array.isArray(ir.edges) ? ir.edges.map((edge) => normalizeEdge(edge, errors)) : [],
    sourceLinks: Array.isArray(ir.sourceLinks) ? ir.sourceLinks : []
  };
  if (workflow.schemaVersion !== "agentique.workflowIr.v1") {
    errors.push(issue("workflow-scheduler.schema", "Workflow IR schema is unsupported."));
  }
  if (workflow.nodes.length === 0) {
    errors.push(issue("workflow-scheduler.nodes", "Workflow scheduler requires at least one node."));
  }
  return { ok: errors.length === 0, workflow, errors };
}

function normalizeNode(node, index, errors) {
  const normalized = {
    id: safeId(node?.id ?? `node-${index}`, errors),
    type: String(node?.type ?? ""),
    label: redactText(String(node?.label ?? "")),
    inputs: normalizeStringArray(node?.inputs),
    outputs: normalizeStringArray(node?.outputs),
    risk: String(node?.risk ?? "low"),
    credentials: normalizeStringArray(node?.credentials),
    index
  };
  try {
    assertNoInlineSecrets(normalized);
  } catch (error) {
    errors.push(issue(error.code ?? "workflow-scheduler.inline-secret", error.message));
  }
  return normalized;
}

function normalizeEdge(edge, errors) {
  return {
    from: safeId(edge?.from ?? "", errors),
    to: safeId(edge?.to ?? "", errors),
    label: redactText(String(edge?.label ?? "edge"))
  };
}

function buildGraph(workflow) {
  const errors = [];
  const ids = new Set();
  for (const node of workflow.nodes) {
    if (ids.has(node.id)) {
      errors.push(issue("workflow-scheduler.duplicate-node", `Duplicate node ${node.id}.`));
    }
    ids.add(node.id);
  }
  for (const edge of workflow.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      errors.push(issue("workflow-scheduler.invalid-edge", "Workflow edge references an unknown node."));
    }
  }
  const graph = {
    inbound: new Map(workflow.nodes.map((node) => [node.id, []])),
    outbound: new Map(workflow.nodes.map((node) => [node.id, []]))
  };
  for (const edge of workflow.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    graph.inbound.get(edge.to).push(edge.from);
    graph.outbound.get(edge.from).push(edge.to);
  }
  return { ok: errors.length === 0, errors, ...graph };
}

function findRiskReasons(workflow) {
  const reasons = [];
  for (const node of workflow.nodes) {
    if (!allowedNodeTypes.has(node.type) || executionRiskTypes.has(node.type)) {
      reasons.push(reason(node, "workflow-scheduler.unsupported-node", `Node type ${node.type} is not executable by the allowlist scheduler.`));
    }
    if (node.risk === "high") {
      reasons.push(reason(node, "workflow-scheduler.high-risk", "High-risk nodes require handoff and are not executed by the scheduler."));
    }
    if ((node.credentials ?? []).length > 0) {
      reasons.push(reason(node, "workflow-scheduler.credentials", "Credentialed nodes require external handoff or explicit runtime grants."));
    }
  }
  return reasons;
}

function findBlockedDependencyReasons(workflow, graph, blockedIds) {
  const reasons = [];
  for (const node of workflow.nodes) {
    if (blockedIds.has(node.id)) continue;
    const parents = graph.inbound.get(node.id) ?? [];
    if (parents.some((parentId) => blockedIds.has(parentId))) {
      reasons.push(reason(node, "workflow-scheduler.blocked-dependency", "Node depends on a blocked or handoff-only node."));
      blockedIds.add(node.id);
    }
  }
  return reasons;
}

function topologicalOrder(workflow, graph, executableNodeIds) {
  const indegree = new Map();
  for (const node of workflow.nodes) {
    if (!executableNodeIds.has(node.id)) continue;
    indegree.set(node.id, (graph.inbound.get(node.id) ?? []).filter((parent) => executableNodeIds.has(parent)).length);
  }
  const order = [];
  const ready = workflow.nodes.filter((node) => executableNodeIds.has(node.id) && indegree.get(node.id) === 0).map((node) => node.id);
  while (ready.length > 0) {
    const nodeId = ready.shift();
    order.push(nodeId);
    for (const childId of graph.outbound.get(nodeId) ?? []) {
      if (!executableNodeIds.has(childId)) continue;
      indegree.set(childId, indegree.get(childId) - 1);
      if (indegree.get(childId) === 0) {
        ready.push(childId);
      }
    }
  }
  if (order.length !== executableNodeIds.size) {
    return { ok: false, order: [], errors: [issue("workflow-scheduler.cycle", "Workflow graph contains a cycle or unresolved dependency.")] };
  }
  return { ok: true, order, errors: [] };
}

function executeNode(node, options) {
  const maxRetries = Math.min(Number(options.retryPolicy?.[node.id] ?? options.maxRetries ?? 0), 3);
  const failAttempts = Number(options.failAttempts?.[node.id] ?? 0);
  const retryEvents = [];
  let attempts = 0;
  while (attempts <= maxRetries) {
    attempts += 1;
    if (attempts > failAttempts) {
      return {
        retryEvents,
        result: nodeResult(node, "succeeded", attempts, null, null, outputDescriptors(node), artifactDescriptors(node))
      };
    }
    if (attempts <= maxRetries) {
      retryEvents.push("retry");
    }
  }
  return {
    retryEvents,
    result: nodeResult(node, "failed", attempts, "workflow-scheduler.node-failed", `Node ${node.id} failed after ${attempts} attempt(s).`)
  };
}

function nodeResult(node, status, attempts, code = null, message = null, outputs = [], artifacts = []) {
  return {
    nodeId: node.id,
    type: node.type,
    status,
    attempts,
    code,
    message: message ? redactText(message) : null,
    outputs,
    artifacts
  };
}

function outputDescriptors(node) {
  return node.outputs.map((name) => ({
    nodeId: node.id,
    name,
    path: `outputs/${safePathPart(node.id)}-${safePathPart(name)}.json`,
    mediaType: "application/json",
    bytes: utf8ByteLength(`${node.id}:${name}`)
  }));
}

function artifactDescriptors(node) {
  return node.outputs.map((name) => ({
    id: `artifact-${safePathPart(node.id)}-${safePathPart(name)}`,
    nodeId: node.id,
    path: `artifacts/${safePathPart(node.id)}-${safePathPart(name)}.json`,
    viewer: node.type === "viewer" ? "preview" : "json",
    redacted: true
  }));
}

function cleanupReceipt(status, options = {}) {
  return {
    schemaVersion: "agentique.workflowSchedulerCleanupReceipt.v1",
    ok: true,
    cleanedAt: options.now ?? fixedNow,
    status: "cleaned",
    idempotent: true,
    terminalRunStatus: status,
    removed: ["scheduler:events", "scheduler:transient-node-state"]
  };
}

function event(sequence, nodeId, type) {
  return {
    sequence,
    nodeId,
    type,
    createdAt: fixedNow
  };
}

function inbound(edges, nodeId) {
  return edges.filter((edge) => edge.to === nodeId).map((edge) => edge.from);
}

function reason(node, code, message) {
  return {
    nodeId: node.id,
    nodeType: node.type,
    code,
    reason: redactText(message)
  };
}

function blockedSchedule(workflow, errors) {
  return {
    schemaVersion: "agentique.workflowSchedule.v1",
    ok: false,
    status: "blocked",
    mode: "strict",
    workflowId: workflow.workflowId,
    order: [],
    executableNodes: [],
    handoffReasons: [],
    blockers: errors.map((error) => ({ nodeId: "", nodeType: "", code: error.code, reason: error.message })),
    edges: workflow.edges,
    summary: { nodes: workflow.nodes.length, executable: 0, blocked: errors.length, handoff: 0 },
    errors
  };
}

function emptyWorkflow() {
  return { schemaVersion: "agentique.workflowIr.v1", workflowId: "workflow-scheduler", nodes: [], edges: [], sourceLinks: [] };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => redactText(String(entry ?? "")));
}

function safeId(value, errors) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,95}$/u.test(text) || text.includes("..") || text.includes("/") || text.includes("\\")) {
    errors.push(issue("workflow-scheduler.invalid-id", "Workflow ids must be stable opaque identifiers."));
    return "invalid-id";
  }
  return text;
}

function safePathPart(value) {
  return String(value ?? "value").replace(/[^A-Za-z0-9._-]/gu, "-").slice(0, 80);
}

function utf8ByteLength(value) {
  // IMPORTANT: scheduler is imported by the browser UI; do not replace this with Node Buffer.
  const text = String(value);
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }

  let bytes = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
}

function issue(code, message) {
  return { code, message: redactText(message) };
}
