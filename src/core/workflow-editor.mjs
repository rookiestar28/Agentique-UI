import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";
import { sampleWorkflowIr, validateWorkflowIr } from "./workflow-ir.mjs";

const stateSchemaVersion = "agentique.workflowEditorState.v1";
const exportSchemaVersion = "agentique.workflowEditorExport.v1";
const supportedOperations = new Set(["add-node", "update-node", "remove-node", "connect-edge", "remove-edge"]);
const rawMutationTypes = new Set(["mutate-raw", "import-raw-external", "raw-external-mutation"]);

export const sampleWorkflowEditorState = createWorkflowEditorState(sampleWorkflowIr, {
  createdAt: "2026-06-11T00:15:00.000Z"
});

export function createWorkflowEditorState(workflowIr, options = {}) {
  const present = clone(workflowIr);
  const validation = validateWorkflowIr(present);
  return {
    schemaVersion: stateSchemaVersion,
    operationMode: "describe-only",
    createdAt: isoDate(options.createdAt ?? new Date().toISOString()),
    updatedAt: isoDate(options.updatedAt ?? options.createdAt ?? new Date().toISOString()),
    present,
    past: [],
    future: [],
    validation,
    compatibilityWarnings: buildCompatibilityWarnings(validation),
    lastDiff: emptyDiff(),
    safety: editorSafety()
  };
}

export function applyWorkflowEdit(inputState, operation, options = {}) {
  const state = normalizeState(inputState);
  const blocked = validateOperationEnvelope(operation);
  if (blocked) {
    return failedEdit(state, blocked);
  }

  const present = clone(state.present);
  let next;
  try {
    next = applyOperation(present, operation);
  } catch (error) {
    return failedEdit(state, error);
  }
  if (!next.ok) {
    return failedEdit(state, next.error);
  }

  const validation = validateWorkflowIr(next.workflow);
  if (!validation.ok) {
    return failedEdit(state, {
      code: "workflow-editor.validation-blocked",
      message: "Workflow edit is blocked until validation errors are resolved.",
      details: validation.errors
    });
  }

  const diff = diffWorkflowStates(state.present, next.workflow);
  const updatedState = {
    ...state,
    updatedAt: isoDate(options.updatedAt ?? new Date().toISOString()),
    present: next.workflow,
    past: [...state.past, state.present],
    future: [],
    validation,
    compatibilityWarnings: buildCompatibilityWarnings(validation),
    lastDiff: diff,
    safety: editorSafety()
  };

  return {
    ok: true,
    state: updatedState,
    diff,
    errors: []
  };
}

export function undoWorkflowEdit(inputState) {
  const state = normalizeState(inputState);
  if (state.past.length === 0) {
    return state;
  }
  const present = state.past[state.past.length - 1];
  const validation = validateWorkflowIr(present);
  return {
    ...state,
    present,
    past: state.past.slice(0, -1),
    future: [state.present, ...state.future],
    validation,
    compatibilityWarnings: buildCompatibilityWarnings(validation),
    lastDiff: diffWorkflowStates(state.present, present)
  };
}

export function redoWorkflowEdit(inputState) {
  const state = normalizeState(inputState);
  if (state.future.length === 0) {
    return state;
  }
  const present = state.future[0];
  const validation = validateWorkflowIr(present);
  return {
    ...state,
    present,
    past: [...state.past, state.present],
    future: state.future.slice(1),
    validation,
    compatibilityWarnings: buildCompatibilityWarnings(validation),
    lastDiff: diffWorkflowStates(state.present, present)
  };
}

export function diffWorkflowStates(before, after) {
  const beforeNodes = new Map((before?.nodes ?? []).map((node) => [node.id, node]));
  const afterNodes = new Map((after?.nodes ?? []).map((node) => [node.id, node]));
  const beforeEdges = new Map((before?.edges ?? []).map((edge) => [edgeKey(edge), edge]));
  const afterEdges = new Map((after?.edges ?? []).map((edge) => [edgeKey(edge), edge]));

  const addedNodes = [...afterNodes.keys()].filter((id) => !beforeNodes.has(id)).sort();
  const removedNodes = [...beforeNodes.keys()].filter((id) => !afterNodes.has(id)).sort();
  const updatedNodes = [...afterNodes.keys()]
    .filter((id) => beforeNodes.has(id) && JSON.stringify(beforeNodes.get(id)) !== JSON.stringify(afterNodes.get(id)))
    .sort();
  const addedEdges = [...afterEdges.keys()].filter((key) => !beforeEdges.has(key)).sort();
  const removedEdges = [...beforeEdges.keys()].filter((key) => !afterEdges.has(key)).sort();

  return {
    schemaVersion: "agentique.workflowDiff.v1",
    addedNodes,
    removedNodes,
    updatedNodes,
    addedEdges,
    removedEdges,
    summary: {
      addedNodes: addedNodes.length,
      removedNodes: removedNodes.length,
      updatedNodes: updatedNodes.length,
      addedEdges: addedEdges.length,
      removedEdges: removedEdges.length
    }
  };
}

export function exportWorkflowEditorState(inputState, options = {}) {
  const state = normalizeState(inputState);
  const exportable = {
    schemaVersion: exportSchemaVersion,
    exportedAt: isoDate(options.exportedAt ?? new Date().toISOString()),
    operationMode: state.operationMode,
    workflow: sanitizeWorkflowForExport(state.present),
    validation: {
      ok: state.validation.ok,
      summary: state.validation.summary,
      errors: state.validation.errors.map((error) => ({ code: error.code, message: error.message }))
    },
    compatibilityWarnings: state.compatibilityWarnings,
    lastDiff: state.lastDiff,
    history: {
      undoEntries: state.past.length,
      redoEntries: state.future.length
    },
    redaction: {
      vaultReferencesRemoved: countVaultReferences(state.present)
    },
    safety: editorSafety()
  };

  return {
    ok: true,
    descriptor: exportable
  };
}

export function importWorkflowEditorState(exportDescriptor, options = {}) {
  if (!exportDescriptor || typeof exportDescriptor !== "object" || !exportDescriptor.workflow) {
    return {
      ok: false,
      errors: [issue("workflow-editor.invalid-import", "Workflow editor import requires an exported workflow descriptor.")]
    };
  }
  const state = createWorkflowEditorState(exportDescriptor.workflow, {
    createdAt: options.createdAt ?? exportDescriptor.exportedAt ?? new Date().toISOString()
  });
  return {
    ok: state.validation.ok,
    state,
    errors: state.validation.errors
  };
}

function normalizeState(input) {
  if (input?.schemaVersion === stateSchemaVersion) {
    return {
      ...input,
      present: clone(input.present),
      past: clone(input.past ?? []),
      future: clone(input.future ?? [])
    };
  }
  return createWorkflowEditorState(input);
}

function sanitizeWorkflowForExport(workflow) {
  assertNoInlineSecrets(workflow);
  return {
    ...workflow,
    workflowId: redactText(workflow.workflowId),
    nodes: workflow.nodes.map((node) => ({
      ...node,
      id: redactText(node.id),
      label: redactText(node.label),
      inputs: node.inputs.map((input) => redactText(input)),
      outputs: node.outputs.map((output) => redactText(output)),
      credentials: []
    })),
    edges: workflow.edges.map((edge) => ({
      from: redactText(edge.from),
      to: redactText(edge.to),
      label: redactText(edge.label)
    })),
    sourceLinks: (workflow.sourceLinks ?? []).map((link) => ({
      label: redactText(link.label),
      href: redactText(link.href)
    }))
  };
}

function countVaultReferences(workflow) {
  return workflow.nodes.reduce((total, node) => total + (node.credentials ?? []).length, 0);
}

function validateOperationEnvelope(operation) {
  if (!operation || typeof operation !== "object") {
    return issue("workflow-editor.invalid-operation", "Workflow edit operation is required.");
  }
  if (rawMutationTypes.has(operation.type) || operation.rawFormat || operation.rawPayload) {
    return issue("workflow-editor.raw-mutation-blocked", "Raw external workflow mutations must be imported through a converter first.");
  }
  if (!supportedOperations.has(operation.type)) {
    return issue("workflow-editor.unsupported-operation", "Workflow edit operation is not supported.");
  }
  return null;
}

function applyOperation(workflow, operation) {
  if (operation.type === "add-node") {
    const node = normalizeNode(operation.node);
    if (workflow.nodes.some((entry) => entry.id === node.id)) {
      return failedOperation("workflow-editor.duplicate-node", "Node already exists.");
    }
    return succeededOperation({ ...workflow, nodes: [...workflow.nodes, node] });
  }

  if (operation.type === "update-node") {
    const nodeId = requireText(operation.nodeId ?? operation.id, "nodeId");
    const index = workflow.nodes.findIndex((node) => node.id === nodeId);
    if (index < 0) {
      return failedOperation("workflow-editor.missing-node", "Node does not exist.");
    }
    if (operation.patch?.id && operation.patch.id !== nodeId) {
      return failedOperation("workflow-editor.node-id-immutable", "Node id changes require an explicit remove and add operation.");
    }
    const nodes = workflow.nodes.slice();
    nodes[index] = normalizeNode({ ...nodes[index], ...operation.patch, id: nodeId });
    return succeededOperation({ ...workflow, nodes });
  }

  if (operation.type === "remove-node") {
    const nodeId = requireText(operation.nodeId ?? operation.id, "nodeId");
    if (!workflow.nodes.some((node) => node.id === nodeId)) {
      return failedOperation("workflow-editor.missing-node", "Node does not exist.");
    }
    return succeededOperation({
      ...workflow,
      nodes: workflow.nodes.filter((node) => node.id !== nodeId),
      edges: workflow.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId)
    });
  }

  if (operation.type === "connect-edge") {
    const edge = normalizeEdge(operation.edge ?? operation);
    if (workflow.edges.some((entry) => edgeKey(entry) === edgeKey(edge))) {
      return failedOperation("workflow-editor.duplicate-edge", "Edge already exists.");
    }
    return succeededOperation({ ...workflow, edges: [...workflow.edges, edge] });
  }

  if (operation.type === "remove-edge") {
    const edge = normalizeEdge(operation.edge ?? operation);
    const nextEdges = workflow.edges.filter((entry) => edgeKey(entry) !== edgeKey(edge));
    if (nextEdges.length === workflow.edges.length) {
      return failedOperation("workflow-editor.missing-edge", "Edge does not exist.");
    }
    return succeededOperation({ ...workflow, edges: nextEdges });
  }

  return failedOperation("workflow-editor.unsupported-operation", "Workflow edit operation is not supported.");
}

function normalizeNode(node) {
  if (!node || typeof node !== "object") {
    throw issue("workflow-editor.invalid-node", "Node payload is required.");
  }
  return {
    id: requireText(node.id, "id"),
    type: requireText(node.type, "type"),
    label: requireText(node.label, "label"),
    inputs: normalizeTextArray(node.inputs),
    outputs: normalizeTextArray(node.outputs),
    risk: requireText(node.risk ?? "low", "risk"),
    credentials: normalizeTextArray(node.credentials)
  };
}

function normalizeEdge(edge) {
  if (!edge || typeof edge !== "object") {
    throw issue("workflow-editor.invalid-edge", "Edge payload is required.");
  }
  return {
    from: requireText(edge.from, "from"),
    to: requireText(edge.to, "to"),
    label: requireText(edge.label, "label")
  };
}

function buildCompatibilityWarnings(validation) {
  return validation.errors.map((error) => ({
    code: error.code,
    message: error.message,
    severity: error.code === "workflow.unsupported-node" ? "blocking" : "warning"
  }));
}

function failedEdit(state, error) {
  return {
    ok: false,
    state,
    diff: emptyDiff(),
    errors: [serializeError(error)]
  };
}

function succeededOperation(workflow) {
  return {
    ok: true,
    workflow
  };
}

function failedOperation(code, message) {
  return {
    ok: false,
    error: issue(code, message)
  };
}

function emptyDiff() {
  return {
    schemaVersion: "agentique.workflowDiff.v1",
    addedNodes: [],
    removedNodes: [],
    updatedNodes: [],
    addedEdges: [],
    removedEdges: [],
    summary: {
      addedNodes: 0,
      removedNodes: 0,
      updatedNodes: 0,
      addedEdges: 0,
      removedEdges: 0
    }
  };
}

function editorSafety() {
  return {
    willExecute: false,
    writesFiles: false,
    startsBridge: false,
    acceptsRawExternalMutation: false,
    requiresConverterForRawExternalWorkflows: true
  };
}

function normalizeTextArray(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw issue("workflow-editor.invalid-array", "Expected an array of strings.");
  }
  return value.map((item) => requireText(item, "arrayItem"));
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw issue("workflow-editor.invalid-field", `${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function edgeKey(edge) {
  return `${edge.from}->${edge.to}:${edge.label}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isoDate(value) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    throw issue("workflow-editor.invalid-date", "Date must be an ISO date.");
  }
  return time.toISOString();
}

function serializeError(error) {
  const normalized = /** @type {Error & {code?: string, details?: unknown}} */ (error);
  return {
    code: normalized.code ?? "workflow-editor.error",
    message: normalized.message,
    details: normalized.details
  };
}

function issue(code, message, details) {
  const error = /** @type {Error & {code?: string, details?: unknown}} */ (new Error(message));
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
}
