import { assertNoInlineSecrets } from "./secret-vault.mjs";

const supportedNodeTypes = new Set(["input", "transform", "viewer", "handoff"]);
const riskLevels = new Set(["low", "medium", "high"]);

export const sampleWorkflowIr = Object.freeze({
  schemaVersion: "agentique.workflowIr.v1",
  workflowId: "visual-guide-flow",
  nodes: [
    {
      id: "intent",
      type: "input",
      label: "Import intent",
      inputs: [],
      outputs: ["resource"],
      risk: "low",
      credentials: []
    },
    {
      id: "verify",
      type: "transform",
      label: "Verify package",
      inputs: ["resource"],
      outputs: ["verifiedResource"],
      risk: "medium",
      credentials: []
    },
    {
      id: "preview",
      type: "viewer",
      label: "Static preview",
      inputs: ["verifiedResource"],
      outputs: ["previewArtifact"],
      risk: "low",
      credentials: []
    },
    {
      id: "provider-sync",
      type: "external-action",
      label: "Provider sync",
      inputs: ["verifiedResource"],
      outputs: ["externalResult"],
      risk: "high",
      credentials: ["vault:providerCredential"]
    },
    {
      id: "handoff",
      type: "handoff",
      label: "Descriptor handoff",
      inputs: ["previewArtifact"],
      outputs: ["handoffDescriptor"],
      risk: "low",
      credentials: []
    }
  ],
  edges: [
    { from: "intent", to: "verify", label: "resource" },
    { from: "verify", to: "preview", label: "verifiedResource" },
    { from: "verify", to: "provider-sync", label: "blockedExternalAction" },
    { from: "preview", to: "handoff", label: "previewArtifact" }
  ],
  sourceLinks: [
    { label: "resource bundle", href: "agentique:resource-bundle" },
    { label: "config diff", href: "agentique:config-diff" }
  ]
});

export function validateWorkflowIr(ir) {
  const errors = [];
  if (!ir || typeof ir !== "object") {
    return failed("workflow.invalid", "Workflow IR must be an object.");
  }
  if (ir.schemaVersion !== "agentique.workflowIr.v1") {
    errors.push(issue("workflow.invalid-schema", "Workflow IR schema is unsupported."));
  }
  if (!Array.isArray(ir.nodes) || ir.nodes.length === 0) {
    errors.push(issue("workflow.missing-nodes", "Workflow IR requires nodes."));
  }
  if (!Array.isArray(ir.edges)) {
    errors.push(issue("workflow.invalid-edges", "Workflow IR edges must be an array."));
  }

  const nodeIds = new Set();
  for (const node of ir.nodes ?? []) {
    if (!node || typeof node !== "object") {
      errors.push(issue("workflow.invalid-node", "Node must be an object."));
      continue;
    }
    if (nodeIds.has(node.id)) {
      errors.push(issue("workflow.duplicate-node", `Duplicate node: ${node.id}`));
    }
    nodeIds.add(node.id);
    if (!supportedNodeTypes.has(node.type)) {
      errors.push(issue("workflow.unsupported-node", `${node.id} uses unsupported type ${node.type}.`));
    }
    if (!riskLevels.has(node.risk)) {
      errors.push(issue("workflow.invalid-risk", `${node.id} has invalid risk.`));
    }
    try {
      assertNoInlineSecrets(node);
    } catch (error) {
      errors.push(issue(error.code ?? "workflow.unsafe-node", error.message));
    }
  }

  for (const edge of ir.edges ?? []) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      errors.push(issue("workflow.invalid-edge", "Workflow edge references an unknown node."));
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: summarizeWorkflow(ir, errors),
    nodes: ir.nodes ?? [],
    edges: ir.edges ?? []
  };
}

export function summarizeWorkflow(ir, errors = []) {
  const nodes = ir?.nodes ?? [];
  return {
    nodes: nodes.length,
    edges: Array.isArray(ir?.edges) ? ir.edges.length : 0,
    highRisk: nodes.filter((node) => node.risk === "high").length,
    requiredCredentials: nodes.flatMap((node) => node.credentials ?? []).length,
    unsupportedNodes: errors.filter((error) => error.code === "workflow.unsupported-node").length
  };
}

function failed(code, message) {
  return {
    ok: false,
    errors: [issue(code, message)],
    summary: { nodes: 0, edges: 0, highRisk: 0, requiredCredentials: 0, unsupportedNodes: 0 },
    nodes: [],
    edges: []
  };
}

function issue(code, message) {
  return { code, message };
}

