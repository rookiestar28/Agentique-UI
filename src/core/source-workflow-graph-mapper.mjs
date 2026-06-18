import { validateWorkflowIr } from "./workflow-ir.mjs";

export const sourceWorkflowGraphMapperVersion = "agentique.sourceWorkflowGraphMapper.v1";
export const workflowIrSchemaVersion = "agentique.workflowIr.v1";
export const sourceGraphContractVersion = "agentique.resourceGraphIR.v1";

const supportedWorkflowTypes = new Set(["input", "transform", "viewer", "handoff"]);
const inputKinds = new Set(["input", "trigger", "prompt", "source"]);
const viewerKinds = new Set(["output", "viewer", "display", "artifact", "document"]);
const handoffKinds = new Set(["handoff", "component_team", "agentflow"]);
const transformKinds = new Set(["workflow", "agent", "tool", "model", "mcp_server", "database", "http", "storage", "component"]);
const executionRiskFlags = new Set([
  "package_execution",
  "command_node",
  "code_node",
  "webhook",
  "external_mutation",
  "docker_build_hint",
  "code_executor",
  "dynamic_code",
  "notebook_output"
]);
const highRiskFlags = new Set([
  "secret_like_value",
  "credential_reference",
  "auth_header",
  "local_path",
  "remote_url",
  "package_execution",
  "command_node",
  "code_node",
  "webhook",
  "external_mutation",
  "docker_build_hint",
  "env_file_hint",
  "custom_auth_handler",
  "code_executor",
  "dynamic_code",
  "notebook_output",
  "local_storage",
  "security_evaluation_source"
]);
const unsafeTextPattern = new RegExp(
  [
    "sk-[A-Za-z0-9]{20,}",
    "ghp_[A-Za-z0-9_]{20,}",
    "github_pat_[A-Za-z0-9_]{20,}",
    "bearer\\s+[A-Za-z0-9._-]{12,}",
    "-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "[A-Za-z]:[\\\\/]",
    "file://",
    "(?:^|[\\s\"'`(])/(?:Users|home|private|tmp|var)/",
    "(?:api[_-]?key|password|token|credential|cookie)\\s*[:=]",
    "\\b(?:npm|pnpm|yarn|python|node|bash|sh|powershell|docker)\\s+[A-Za-z0-9_./:-]+"
  ].join("|"),
  "iu"
);

export function createWorkflowGraphFromSourceGraph(graph, options = {}) {
  try {
    const normalizedGraph = normalizeSourceGraph(graph, options);
    const credentialReferences = collectCredentialReferences(normalizedGraph.variables);
    const unsupportedNodes = [];
    const nodes = normalizedGraph.nodes.map((node, index) => {
      const projected = projectNode(node, normalizedGraph.edges, credentialReferences, index);
      if (projected.unsupported) {
        unsupportedNodes.push({
          id: projected.node.id,
          label: projected.node.label,
          sourceKind: sanitizeText(node.kind ?? "unknown", 80),
          projectedType: projected.node.type,
          riskFlags: [...projected.riskFlags],
          reason: projected.reason
        });
      }
      return projected.node;
    });
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = normalizedGraph.edges.map((edge) => projectEdge(edge)).filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
    const workflowIr = {
      schemaVersion: workflowIrSchemaVersion,
      workflowId: normalizeId(options.workflowId ?? normalizedGraph.sourceProvenance.parserId ?? normalizedGraph.title ?? "source-graph"),
      nodes,
      edges,
      sourceLinks: [
        { label: "source graph", href: "agentique:source-graph" },
        { label: "resource bundle", href: "agentique:resource-bundle" }
      ]
    };
    const validation = validateWorkflowIr(workflowIr);
    if (!validation.ok) {
      throw issue("workflow.validation-failed", "Projected workflow failed UI validation.", validation.errors);
    }

    return {
      ok: true,
      projection: {
        schemaVersion: sourceWorkflowGraphMapperVersion,
        source: {
          contractVersion: normalizedGraph.contractVersion,
          ecosystem: normalizedGraph.sourceProvenance.ecosystem,
          sourceFormat: normalizedGraph.sourceProvenance.sourceFormat,
          evidenceCompleteness: normalizedGraph.evidenceCompleteness,
          staticAnalysisConfidence: normalizedGraph.staticAnalysisConfidence
        },
        workflowIr,
        unsupportedNodes,
        riskSummary: summarizeRisk(normalizedGraph, unsupportedNodes),
        credentialReferences: summarizeCredentialReferences(nodes),
        issueSummary: normalizedGraph.issues.filter((entry) => entry.publicSafe).map((entry) => ({
          code: sanitizeText(entry.code, 80),
          category: sanitizeText(entry.category, 40),
          severity: sanitizeText(entry.severity, 40),
          message: sanitizeText(entry.message, 240)
        })),
        noExecution: noExecutionBoundary(normalizedGraph.noExecutionBoundary),
        noOverclaim: noOverclaim()
      }
    };
  } catch (error) {
    return {
      ok: false,
      errors: [toIssue(error)]
    };
  }
}

export function createWorkflowGraphFromParserImport(parserImport, options = {}) {
  const input = parserImport && typeof parserImport === "object" ? parserImport : {};
  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  const edges = Array.isArray(input.edges) ? input.edges : [];
  return createWorkflowGraphFromSourceGraph({
    contractVersion: sourceGraphContractVersion,
    title: input.title ?? options.title ?? "Parser import graph",
    sourceProvenance: {
      ecosystem: input.ecosystem ?? "generic",
      sourceFormat: input.sourceFormat ?? "json",
      parserId: input.resourceId ?? options.workflowId ?? "parser-import"
    },
    nodes: nodes.map((node, index) => ({
      id: node.id ?? `node-${index + 1}`,
      kind: node.type ?? node.kind ?? "unknown",
      label: node.label ?? node.id ?? `Node ${index + 1}`,
      riskFlags: riskFlagsFromParserNode(node),
      metadata: {}
    })),
    edges: edges.map((edge, index) => ({
      id: `edge-${index + 1}`,
      fromNodeId: edge.from ?? edge.fromNodeId ?? "",
      toNodeId: edge.to ?? edge.toNodeId ?? "",
      label: edge.label ?? edge.kind ?? "data",
      kind: edge.kind ?? "unknown"
    })),
    variables: nodes.flatMap((node) => normalizeTextArray(node.credentials).map((credential) => ({
      name: credential,
      kind: "credential_name",
      required: true,
      publicValueAllowed: false,
      riskFlags: ["credential_reference"]
    }))),
    riskFlags: [],
    issues: [],
    evidenceCompleteness: "PARTIAL",
    staticAnalysisConfidence: "UNKNOWN",
    noExecutionBoundary: noExecutionBoundary()
  }, options);
}

function normalizeSourceGraph(graph, options) {
  if (!graph || typeof graph !== "object") {
    throw issue("graph.invalid", "Source graph must be an object.");
  }
  if (graph.contractVersion !== sourceGraphContractVersion) {
    throw issue("graph.invalid-contract", "Source graph contract is unsupported.");
  }
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    throw issue("graph.missing-nodes", "Source graph requires nodes.");
  }
  if (graph.issues?.some((entry) => entry && entry.publicSafe === false)) {
    throw issue("graph.private-issue", "Source graph includes private issue evidence.");
  }

  const nodes = graph.nodes.map((node, index) => normalizeNode(node, index));
  const nodeIds = nodes.map((node) => node.id);
  if (new Set(nodeIds).size !== nodeIds.length) {
    throw issue("graph.duplicate-node", "Source graph contains duplicate node ids.");
  }
  const nodeIdSet = new Set(nodeIds);
  const edges = normalizeArray(graph.edges).map((edge, index) => normalizeEdge(edge, index));
  if (edges.some((edge) => !nodeIdSet.has(edge.fromNodeId) || !nodeIdSet.has(edge.toNodeId))) {
    throw issue("graph.invalid-edge", "Source graph edge references an unknown node.");
  }

  return {
    contractVersion: graph.contractVersion,
    title: optionalSafeText(graph.title ?? options.title, ""),
    sourceProvenance: {
      ecosystem: optionalSafeText(graph.sourceProvenance?.ecosystem, "generic"),
      sourceFormat: optionalSafeText(graph.sourceProvenance?.sourceFormat, "json"),
      parserId: optionalSafeText(graph.sourceProvenance?.parserId, "source-graph")
    },
    nodes,
    edges,
    variables: normalizeArray(graph.variables).map(normalizeVariable),
    riskFlags: normalizeTextArray(graph.riskFlags),
    issues: normalizeArray(graph.issues).map(normalizeIssue),
    evidenceCompleteness: optionalSafeText(graph.evidenceCompleteness, "PARTIAL"),
    staticAnalysisConfidence: optionalSafeText(graph.staticAnalysisConfidence, "UNKNOWN"),
    noExecutionBoundary: noExecutionBoundary(graph.noExecutionBoundary)
  };
}

function normalizeNode(node, index) {
  if (!node || typeof node !== "object") {
    throw issue("graph.invalid-node", "Source graph node must be an object.");
  }
  const id = normalizeId(node.id ?? `node-${index + 1}`);
  const kind = optionalSafeText(node.kind, "unknown");
  const label = sanitizeText(node.label ?? kind ?? id, 96);
  return {
    id,
    kind,
    label,
    riskFlags: normalizeTextArray(node.riskFlags),
    metadata: {}
  };
}

function normalizeEdge(edge, index) {
  if (!edge || typeof edge !== "object") {
    throw issue("graph.invalid-edge", "Source graph edge must be an object.");
  }
  return {
    id: normalizeId(edge.id ?? `edge-${index + 1}`),
    fromNodeId: normalizeId(edge.fromNodeId ?? edge.from),
    toNodeId: normalizeId(edge.toNodeId ?? edge.to),
    label: sanitizeText(edge.label ?? edge.kind ?? "data", 64),
    kind: optionalSafeText(edge.kind, "unknown")
  };
}

function normalizeVariable(variable) {
  if (!variable || typeof variable !== "object") {
    throw issue("graph.invalid-variable", "Source graph variable must be an object.");
  }
  return {
    name: sanitizeText(variable.name, 96),
    kind: optionalSafeText(variable.kind, "unknown"),
    publicValueAllowed: false,
    riskFlags: normalizeTextArray(variable.riskFlags)
  };
}

function normalizeIssue(entry) {
  if (!entry || typeof entry !== "object") {
    throw issue("graph.invalid-issue", "Source graph issue must be an object.");
  }
  return {
    code: sanitizeText(entry.code ?? "issue", 80),
    category: sanitizeText(entry.category ?? "display", 40),
    severity: sanitizeText(entry.severity ?? "warning", 40),
    message: sanitizeText(entry.message ?? "Issue", 240),
    publicSafe: entry.publicSafe !== false
  };
}

function projectNode(node, edges, credentialReferences, index) {
  const executionRisk = node.riskFlags.some((flag) => executionRiskFlags.has(flag));
  const mappedType = executionRisk ? "viewer" : mapNodeType(node.kind);
  const unsupported = executionRisk || !isKnownKind(node.kind);
  const id = normalizeId(node.id || `node-${index + 1}`);
  const credentials = node.riskFlags.includes("credential_reference")
    ? credentialReferences
    : [];
  return {
    node: {
      id,
      type: supportedWorkflowTypes.has(mappedType) ? mappedType : "viewer",
      label: node.label,
      inputs: uniqueSorted(edges.filter((edge) => normalizeId(edge.toNodeId) === id).map((edge) => edge.label)),
      outputs: uniqueSorted(edges.filter((edge) => normalizeId(edge.fromNodeId) === id).map((edge) => edge.label)),
      risk: riskForFlags(node.riskFlags),
      credentials
    },
    unsupported,
    riskFlags: node.riskFlags,
    reason: executionRisk ? "execution_risk_flag" : "unsupported_source_kind"
  };
}

function projectEdge(edge) {
  return {
    from: normalizeId(edge.fromNodeId),
    to: normalizeId(edge.toNodeId),
    label: sanitizeText(edge.label ?? edge.kind ?? "data", 64)
  };
}

function mapNodeType(kind) {
  const normalized = String(kind ?? "").toLowerCase();
  if (inputKinds.has(normalized)) return "input";
  if (viewerKinds.has(normalized)) return "viewer";
  if (handoffKinds.has(normalized)) return "handoff";
  if (transformKinds.has(normalized)) return "transform";
  return "viewer";
}

function isKnownKind(kind) {
  const normalized = String(kind ?? "").toLowerCase();
  return inputKinds.has(normalized) || viewerKinds.has(normalized) || handoffKinds.has(normalized) || transformKinds.has(normalized);
}

function riskForFlags(flags) {
  if (flags.some((flag) => highRiskFlags.has(flag))) return "high";
  return flags.length > 0 ? "medium" : "low";
}

function summarizeRisk(graph, unsupportedNodes) {
  const flags = uniqueSorted([
    ...graph.riskFlags,
    ...graph.nodes.flatMap((node) => node.riskFlags),
    ...unsupportedNodes.flatMap((node) => node.riskFlags)
  ]);
  const level = flags.some((flag) => highRiskFlags.has(flag)) || unsupportedNodes.length > 0 ? "high" : flags.length > 0 ? "medium" : "low";
  return {
    level,
    reviewRequired: level !== "low",
    flags,
    reasons: [
      ...(unsupportedNodes.length > 0 ? ["unsupported_nodes_present"] : []),
      ...(flags.includes("credential_reference") ? ["credential_references_present"] : []),
      ...(flags.some((flag) => executionRiskFlags.has(flag)) ? ["execution_risk_flags_present"] : [])
    ]
  };
}

function collectCredentialReferences(variables) {
  return uniqueSorted(
    normalizeArray(variables)
      .filter((variable) => variable.kind === "credential_name" || variable.kind === "secret_name")
      .map((variable) => `credential:${normalizeId(variable.name)}`)
  );
}

function summarizeCredentialReferences(nodes) {
  return nodes.flatMap((node) => {
    if (!Array.isArray(node.credentials) || node.credentials.length === 0) return [];
    return [{
      nodeId: node.id,
      nodeLabel: node.label,
      references: [...node.credentials],
      valuesIncluded: false
    }];
  });
}

function noExecutionBoundary(input = {}) {
  return {
    importedModules: false,
    packageManagersExecuted: false,
    lifecycleHooksExecuted: false,
    workflowsExecuted: false,
    mcpServersExecuted: false,
    notebookOutputsExecuted: false,
    dockerBuildsExecuted: false,
    networkRequestsPerformed: false,
    filesystemTraversalOutsidePackage: false,
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value === false))
  };
}

function noOverclaim() {
  return {
    editableWorkflow: false,
    localRunnerAvailable: false,
    credentialValuesAvailable: false,
    filePermissionGranted: false,
    networkPermissionGranted: false,
    shellPermissionGranted: false
  };
}

function riskFlagsFromParserNode(node) {
  const flags = [];
  if (node.risk === "high") flags.push("unknown_vendor_node");
  if (normalizeTextArray(node.credentials).length > 0) flags.push("credential_reference");
  if (node.execution === true || node.type === "command" || node.type === "webhook") flags.push("command_node");
  return flags;
}

function optionalSafeText(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return sanitizeText(value, 160);
}

function sanitizeText(value, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw issue("graph.invalid-text", "Graph text must be a non-empty string.");
  }
  const text = value.trim().replace(/\s+/gu, " ").slice(0, maxLength);
  if (unsafeTextPattern.test(text)) {
    throw issue("graph.unsafe-text", "Graph text contains unsafe public metadata.");
  }
  return text;
}

function normalizeId(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "node";
  const normalized = text
    .replace(/[^a-z0-9._:-]+/gu, "-")
    .replace(/^[^a-z0-9]+/u, "")
    .replace(/[^a-z0-9]+$/u, "")
    .slice(0, 80);
  return normalized || "node";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTextArray(value) {
  return normalizeArray(value).map((item) => sanitizeText(String(item), 96));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function issue(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function toIssue(error) {
  return {
    code: error.code ?? "graph.error",
    message: error.message ?? "Workflow graph mapping failed.",
    details: error.details
  };
}
