import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";
import { sampleWorkflowIr } from "./workflow-ir.mjs";
import { sampleSchedulableWorkflowIr } from "./workflow-scheduler.mjs";

const supportedNodeTypes = new Set(["input", "transform", "viewer", "handoff"]);
const classificationOrder = Object.freeze(["executable", "permission-required", "blocked", "handoff-only"]);
const primaryClassifications = new Set(classificationOrder);
const riskLevels = new Set(["low", "medium", "high"]);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,95}$/u;

export const sampleAcceptedGraphRunPlan = Object.freeze(createGraphRunPlan(sampleSchedulableWorkflowIr, {
  permissionsApproved: true
}));

export function createGraphRunPlan(ir, options = {}) {
  const normalized = normalizeWorkflow(ir === undefined ? sampleSchedulableWorkflowIr : ir);
  if (!normalized.ok) {
    return buildPlan(emptyWorkflow(), [], [], normalized.errors);
  }

  const graph = buildGraph(normalized.workflow);
  if (!graph.ok) {
    return buildPlan(normalized.workflow, [], [], graph.errors);
  }

  const topo = topologicalOrder(normalized.workflow, graph);
  if (!topo.ok) {
    return buildPlan(normalized.workflow, [], [], topo.errors);
  }

  const classifications = new Map();
  for (const node of normalized.workflow.nodes) {
    classifications.set(node.id, classifyNode(node, options));
  }

  for (const nodeId of topo.order) {
    const current = classifications.get(nodeId);
    if (!current || current.classification === "blocked") continue;
    const blockedParent = (graph.inbound.get(nodeId) ?? []).find((parentId) => classifications.get(parentId)?.classification === "blocked");
    if (blockedParent) {
      classifications.set(nodeId, {
        ...current,
        classification: "blocked",
        reasons: [
          ...current.reasons,
          reason("graph-run-plan.dependency-blocked", `Depends on blocked node ${blockedParent}.`)
        ]
      });
    }
  }

  const nodePlans = normalized.workflow.nodes.map((node, index) => {
    const plan = classifications.get(node.id);
    return {
      id: node.id,
      index,
      label: node.label,
      type: node.type,
      risk: node.risk,
      classification: plan.classification,
      permissionFamilies: plan.permissionFamilies,
      sourcePlatform: plan.sourcePlatform,
      sourceFamily: plan.sourceFamily,
      executionLane: plan.executionLane,
      handoffDescriptor: plan.handoffDescriptor,
      credentialRefs: node.credentialCount,
      reasons: plan.reasons
    };
  });
  const edgePlans = normalized.workflow.edges.map((edge) => classifyEdge(edge, classifications));
  return buildPlan(normalized.workflow, nodePlans, edgePlans, []);
}

export function reviewGraphRunPlanGate() {
  const accepted = createGraphRunPlan(sampleSchedulableWorkflowIr, { permissionsApproved: true });
  const blocked = createGraphRunPlan(sampleWorkflowIr);
  const permissionRequired = createGraphRunPlan(withCredentialedTransform(sampleSchedulableWorkflowIr));
  const handoff = createGraphRunPlan(sampleSchedulableWorkflowIr);
  const dangling = createGraphRunPlan({
    ...sampleSchedulableWorkflowIr,
    edges: [...sampleSchedulableWorkflowIr.edges, { from: "missing", to: "merge", label: "missing" }]
  });
  const cyclic = createGraphRunPlan({
    ...sampleSchedulableWorkflowIr,
    edges: [...sampleSchedulableWorkflowIr.edges, { from: "handoff", to: "source", label: "cycle" }]
  });
  const dependencyBlocked = createGraphRunPlan({
    ...sampleSchedulableWorkflowIr,
    nodes: sampleSchedulableWorkflowIr.nodes.map((node) => (
      node.id === "normalize" ? { ...node, type: "external-action", risk: "high" } : node
    ))
  });
  const unsafe = createGraphRunPlan({
    ...sampleSchedulableWorkflowIr,
    nodes: sampleSchedulableWorkflowIr.nodes.map((node) => (
      node.id === "source" ? { ...node, label: "bearer abcdefghijklmnop" } : node
    ))
  });

  const ok = accepted.status === "accepted" &&
    accepted.summary.executable > 0 &&
    blocked.status === "blocked" &&
    blocked.nodePlans.some((node) => node.classification === "blocked") &&
    permissionRequired.status === "permission-required" &&
    permissionRequired.nodePlans.some((node) => node.classification === "permission-required") &&
    handoff.nodePlans.some((node) => node.classification === "handoff-only") &&
    dangling.status === "blocked" &&
    cyclic.status === "blocked" &&
    dependencyBlocked.nodePlans.some((node) => node.reasons.some((entry) => entry.code === "graph-run-plan.dependency-blocked")) &&
    unsafe.status === "blocked" &&
    !/[A-Za-z]:[\\/]|vault:[a-z]|bearer\s+/iu.test(JSON.stringify(accepted));

  return {
    schemaVersion: "agentique.graphRunPlanGateReview.v1",
    ok,
    checks: {
      accepted: accepted.status,
      blocked: blocked.status,
      permissionRequired: permissionRequired.status,
      dangling: dangling.status,
      cyclic: cyclic.status,
      dependencyBlocked: dependencyBlocked.status,
      unsafe: unsafe.status
    },
    summary: {
      acceptedNodes: accepted.summary.nodes,
      blockedReasons: blocked.summary.blocked,
      permissionRequired: permissionRequired.summary.permissionRequired,
      handoffOnly: handoff.summary.handoffOnly
    },
    errors: ok ? [] : [issue("graph-run-plan.review", "Graph run-plan gate review failed.")]
  };
}

function buildPlan(workflow, nodePlans, edgePlans, errors) {
  const summary = summarize(nodePlans, edgePlans);
  const status = errors.length > 0 || summary.blocked > 0
    ? "blocked"
    : summary.permissionRequired > 0
      ? "permission-required"
      : "accepted";
  return clone({
    schemaVersion: "agentique.graphRunPlan.v1",
    ok: status !== "blocked",
    status,
    startDecision: status === "accepted" ? "reviewable" : status === "permission-required" ? "requires-permission-review" : "blocked",
    workflowId: workflow.workflowId,
    nodePlans,
    edgePlans,
    summary,
    errors
  });
}

function classifyNode(node, options) {
  const capability = node.capability;
  if (capability && capability.primaryClassification !== "executable") {
    return withCapabilityMetadata({
      classification: capability.primaryClassification,
      permissionFamilies: capability.permissionFamilies,
      reasons: capability.reasons.length > 0
        ? capability.reasons
        : [reason("graph-run-plan.platform-capability", "Source platform capability metadata controls this run-plan decision.")]
    }, capability);
  }

  const reasons = [];
  if (!supportedNodeTypes.has(node.type)) {
    reasons.push(reason("graph-run-plan.unsupported-node", `Node type ${node.type} is not supported by local run-plan review.`));
  }
  if (!riskLevels.has(node.risk)) {
    reasons.push(reason("graph-run-plan.invalid-risk", `Node ${node.id} has invalid risk.`));
  }
  if (node.risk === "high") {
    reasons.push(reason("graph-run-plan.high-risk", "High-risk node requires blocked or external handoff review."));
  }
  if (reasons.length > 0) {
    return withCapabilityMetadata({ classification: "blocked", permissionFamilies: [], reasons }, capability);
  }
  if (node.credentialCount > 0 && options.permissionsApproved !== true) {
    return withCapabilityMetadata({
      classification: "permission-required",
      permissionFamilies: ["secrets", "externalProviders"],
      reasons: [reason("graph-run-plan.permission-required", "Credentialed node requires explicit scoped permission review.")]
    }, capability);
  }
  if (node.type === "handoff") {
    return withCapabilityMetadata({
      classification: "handoff-only",
      permissionFamilies: [],
      reasons: [reason("graph-run-plan.handoff-only", "Node produces an external handoff descriptor and is not a local execution target.")]
    }, capability);
  }
  return withCapabilityMetadata({
    classification: "executable",
    permissionFamilies: [],
    reasons: [reason("graph-run-plan.executable", "Node is eligible for the allowlisted local scheduler path.")]
  }, capability);
}

function classifyEdge(edge, classifications) {
  const from = classifications.get(edge.from);
  const to = classifications.get(edge.to);
  let classification = "executable";
  const reasons = [];
  if (!from || !to) {
    classification = "blocked";
    reasons.push(reason("graph-run-plan.edge-missing-node", "Edge references a missing node."));
  } else if (from.classification === "blocked" || to.classification === "blocked") {
    classification = "blocked";
    reasons.push(reason("graph-run-plan.edge-blocked", "Edge touches a blocked node."));
  } else if (from.classification === "permission-required" || to.classification === "permission-required") {
    classification = "permission-required";
    reasons.push(reason("graph-run-plan.edge-permission-required", "Edge depends on a permission-required node."));
  } else if (from.classification === "handoff-only" || to.classification === "handoff-only") {
    classification = "handoff-only";
    reasons.push(reason("graph-run-plan.edge-handoff-only", "Edge crosses a handoff-only boundary."));
  }
  return {
    from: edge.from,
    to: edge.to,
    label: edge.label,
    classification,
    reasons: reasons.length > 0 ? reasons : [reason("graph-run-plan.edge-executable", "Edge is available to the reviewed local plan.")]
  };
}

function normalizeWorkflow(ir) {
  const errors = [];
  if (!ir || typeof ir !== "object") {
    return { ok: false, workflow: emptyWorkflow(), errors: [issue("graph-run-plan.invalid", "Workflow IR must be an object.")] };
  }
  const workflow = {
    schemaVersion: String(ir.schemaVersion ?? ""),
    workflowId: safeId(ir.workflowId ?? "graph-run-plan", "workflowId", errors),
    nodes: Array.isArray(ir.nodes) ? ir.nodes.map((node, index) => normalizeNode(node, index, errors)) : [],
    edges: Array.isArray(ir.edges) ? ir.edges.map((edge) => normalizeEdge(edge, errors)) : [],
    sourceLinks: Array.isArray(ir.sourceLinks) ? ir.sourceLinks : []
  };
  if (workflow.schemaVersion !== "agentique.workflowIr.v1") {
    errors.push(issue("graph-run-plan.schema", "Workflow IR schema is unsupported."));
  }
  if (workflow.nodes.length === 0) {
    errors.push(issue("graph-run-plan.nodes", "Workflow IR requires at least one node."));
  }
  if (!Array.isArray(ir.edges)) {
    errors.push(issue("graph-run-plan.edges", "Workflow IR edges must be an array."));
  }
  return { ok: errors.length === 0, workflow, errors };
}

function normalizeNode(node, index, errors) {
  if (!node || typeof node !== "object") {
    errors.push(issue("graph-run-plan.node", "Workflow node must be an object."));
    return { id: `invalid-${index}`, label: "Invalid node", type: "invalid", risk: "high", credentialCount: 0 };
  }
  const normalized = {
    id: safeId(node.id ?? `node-${index}`, "nodeId", errors),
    label: redactText(String(node.label ?? "")),
    type: String(node.type ?? ""),
    risk: String(node.risk ?? "low"),
    credentialCount: Array.isArray(node.credentials) ? node.credentials.length : 0,
    capability: normalizeCapability(node.capability, errors)
  };
  try {
    assertNoInlineSecrets(node);
  } catch (error) {
    errors.push(issue(error.code ?? "graph-run-plan.inline-secret", error.message));
  }
  return normalized;
}

function normalizeEdge(edge, errors) {
  return {
    from: safeId(edge?.from ?? "", "edge.from", errors),
    to: safeId(edge?.to ?? "", "edge.to", errors),
    label: redactText(String(edge?.label ?? "edge"))
  };
}

function buildGraph(workflow) {
  const errors = [];
  const ids = new Set();
  for (const node of workflow.nodes) {
    if (ids.has(node.id)) {
      errors.push(issue("graph-run-plan.duplicate-node", `Duplicate node id ${node.id}.`));
    }
    ids.add(node.id);
  }
  const inbound = new Map(workflow.nodes.map((node) => [node.id, []]));
  const outbound = new Map(workflow.nodes.map((node) => [node.id, []]));
  for (const edge of workflow.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      errors.push(issue("graph-run-plan.dangling-edge", "Workflow edge references an unknown node."));
      continue;
    }
    inbound.get(edge.to).push(edge.from);
    outbound.get(edge.from).push(edge.to);
  }
  return { ok: errors.length === 0, inbound, outbound, errors };
}

function topologicalOrder(workflow, graph) {
  const indegree = new Map(workflow.nodes.map((node) => [node.id, graph.inbound.get(node.id).length]));
  const ready = workflow.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const order = [];
  while (ready.length > 0) {
    const nodeId = ready.shift();
    order.push(nodeId);
    for (const childId of graph.outbound.get(nodeId) ?? []) {
      indegree.set(childId, indegree.get(childId) - 1);
      if (indegree.get(childId) === 0) {
        ready.push(childId);
      }
    }
  }
  if (order.length !== workflow.nodes.length) {
    return { ok: false, order: [], errors: [issue("graph-run-plan.cycle", "Workflow graph contains a cycle.")] };
  }
  return { ok: true, order, errors: [] };
}

function summarize(nodePlans, edgePlans) {
  const counts = Object.fromEntries(classificationOrder.map((classification) => [
    classification.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase()),
    0
  ]));
  for (const node of nodePlans) {
    const key = node.classification.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    counts[key] += 1;
  }
  return {
    nodes: nodePlans.length,
    edges: edgePlans.length,
    executable: counts.executable,
    permissionRequired: counts.permissionRequired,
    blocked: counts.blocked,
    handoffOnly: counts.handoffOnly
  };
}

function withCredentialedTransform(ir) {
  return {
    ...ir,
    nodes: ir.nodes.map((node) => (
      node.id === "normalize" ? { ...node, credentials: ["vault:providerCredential"] } : node
    ))
  };
}

function withCapabilityMetadata(plan, capability) {
  if (!capability) {
    return {
      ...plan,
      sourcePlatform: null,
      sourceFamily: null,
      executionLane: plan.classification === "executable"
        ? "local-scheduler"
        : plan.classification === "permission-required"
          ? "permission-review"
          : plan.classification === "handoff-only"
            ? "external-handoff"
            : "blocked",
      handoffDescriptor: null
    };
  }
  return {
    ...plan,
    permissionFamilies: plan.permissionFamilies.length > 0 ? plan.permissionFamilies : capability.permissionFamilies,
    sourcePlatform: capability.sourcePlatform,
    sourceFamily: capability.sourceFamily,
    executionLane: capability.executionLane,
    handoffDescriptor: capability.handoffDescriptor,
    reasons: plan.reasons.map((entry) => reason(entry.code, entry.message))
  };
}

function normalizeCapability(capability, errors) {
  if (capability == null) return null;
  if (typeof capability !== "object" || Array.isArray(capability)) {
    errors.push(issue("graph-run-plan.invalid-capability", "Platform capability metadata must be an object."));
    return null;
  }
  const primaryClassification = String(capability.primaryClassification ?? "");
  if (!primaryClassifications.has(primaryClassification)) {
    errors.push(issue("graph-run-plan.invalid-capability", "Platform capability primary classification is unsupported."));
    return {
      sourcePlatform: safeLabel(capability.sourcePlatform ?? "unknown"),
      sourceFamily: safeLabel(capability.sourceFamily ?? "unknown"),
      primaryClassification: "blocked",
      executionLane: "blocked",
      permissionFamilies: [],
      handoffDescriptor: null,
      reasons: [reason("graph-run-plan.invalid-capability", "Platform capability primary classification is unsupported.")]
    };
  }
  return {
    sourcePlatform: safeLabel(capability.sourcePlatform ?? "unknown"),
    sourceFamily: safeLabel(capability.sourceFamily ?? "unknown"),
    primaryClassification,
    executionLane: safeLabel(capability.executionLane ?? "blocked"),
    permissionFamilies: Array.isArray(capability.permissionFamilies) ? capability.permissionFamilies.map(safeLabel).filter(Boolean).sort() : [],
    handoffDescriptor: normalizeHandoffDescriptor(capability.handoffDescriptor),
    reasons: Array.isArray(capability.reasons)
      ? capability.reasons.map((entry) => reason(entry?.code ?? "graph-run-plan.platform-capability", entry?.message ?? "Platform capability metadata controls this node."))
      : []
  };
}

function normalizeHandoffDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) return null;
  return {
    kind: safeLabel(descriptor.kind ?? "platform-handoff"),
    mode: safeLabel(descriptor.mode ?? "handoff-only"),
    reviewOnly: true,
    localExecutionAllowed: false
  };
}

function emptyWorkflow() {
  return { schemaVersion: "agentique.workflowIr.v1", workflowId: "graph-run-plan", nodes: [], edges: [], sourceLinks: [] };
}

function safeId(value, fieldName, errors) {
  const text = String(value ?? "");
  if (!idPattern.test(text) || text.includes("..") || text.includes("/") || text.includes("\\")) {
    errors.push(issue("graph-run-plan.invalid-id", `${fieldName} must be a stable opaque id.`));
    return "invalid-id";
  }
  return text;
}

function safeLabel(value) {
  return redactText(String(value ?? "").replace(/\s+/gu, " ").trim()).slice(0, 160);
}

function reason(code, message) {
  return { code, message: redactText(message) };
}

function issue(code, message) {
  return { code, message: redactText(message) };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
