import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";
import { sampleWorkflowIr, validateWorkflowIr } from "./workflow-ir.mjs";

const descriptorSchemaVersion = "agentique.externalRuntimeHandoff.v1";
const unsafePathPattern = /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\)|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u;

export const externalRuntimeAdapterManifests = Object.freeze([
  {
    target: "n8n",
    label: "n8n",
    mode: "export-descriptor",
    exportFormat: "n8n-compatible-descriptor",
    acceptedNodeTypes: ["input", "transform", "handoff"],
    bridgeSupported: false
  },
  {
    target: "flowise",
    label: "Flowise",
    mode: "export-descriptor",
    exportFormat: "flowise-compatible-descriptor",
    acceptedNodeTypes: ["input", "transform", "viewer"],
    bridgeSupported: false
  },
  {
    target: "dify",
    label: "Dify",
    mode: "export-descriptor",
    exportFormat: "dify-compatible-descriptor",
    acceptedNodeTypes: ["input", "transform", "handoff"],
    bridgeSupported: false
  },
  {
    target: "comfyui",
    label: "ComfyUI",
    mode: "export-descriptor",
    exportFormat: "comfyui-compatible-descriptor",
    acceptedNodeTypes: ["input", "viewer"],
    bridgeSupported: false
  }
]);

export const externalRuntimeTargets = Object.freeze(externalRuntimeAdapterManifests.map((manifest) => manifest.target));

export const sampleExternalRuntimeHandoff = createExternalRuntimeHandoff(sampleWorkflowIr, "n8n", {
  createdAt: "2026-06-11T00:20:00.000Z"
});

export function createExternalRuntimeHandoff(workflowIr, target, options = {}) {
  const manifest = externalRuntimeAdapterManifests.find((entry) => entry.target === String(target));
  if (!manifest) {
    return failedDescriptor(target, "external-runtime.unsupported-target", "External runtime target is not supported.");
  }

  const unsafeDestination = validateDestination(options.destination);
  if (unsafeDestination) {
    return failedDescriptor(target, unsafeDestination.code, unsafeDestination.message);
  }

  try {
    assertNoInlineSecrets(workflowIr);
  } catch (error) {
    return failedDescriptor(target, error.code ?? "external-runtime.inline-secret", error.message);
  }

  const validation = validateWorkflowIr(workflowIr);
  const unsupportedNodes = collectUnsupportedNodes(workflowIr, manifest, validation);
  const blockingErrors = [
    ...validation.errors.map((error) => ({
      code: error.code,
      message: error.message
    })),
    ...unsupportedNodes
      .filter((node) => !validation.errors.some((error) => error.message.includes(node.id)))
      .map((node) => ({
        code: "external-runtime.unsupported-node",
        message: `${node.id} is not supported by ${manifest.label}.`
      }))
  ];

  const descriptor = {
    ok: blockingErrors.length === 0,
    schemaVersion: descriptorSchemaVersion,
    target: manifest.target,
    label: manifest.label,
    mode: manifest.mode,
    createdAt: isoDate(options.createdAt ?? new Date().toISOString()),
    workflow: summarizeWorkflow(workflowIr),
    artifacts: {
      fileName: `${redactText(workflowIr.workflowId ?? "workflow")}-${manifest.target}.handoff.json`,
      mediaType: "application/json",
      exportFormat: manifest.exportFormat,
      writesFiles: false
    },
    compatibility: {
      status: blockingErrors.length === 0 ? "compatible" : "blocked",
      acceptedNodeTypes: manifest.acceptedNodeTypes,
      unsupportedNodes,
      bridgeSupported: manifest.bridgeSupported,
      adapterManifestRequired: true,
      universalRuntimeClaim: false
    },
    execution: noExecution(),
    cleanup: reversibleCleanup(),
    userActions: buildUserActions(manifest, blockingErrors.length),
    errors: blockingErrors.map((error) => ({
      code: error.code,
      message: redactText(error.message)
    }))
  };

  assertExternalRuntimeDescriptorSafe(descriptor);
  return clone(descriptor);
}

export function assertExternalRuntimeDescriptorSafe(descriptor) {
  assertNoInlineSecrets(descriptor);
  const text = JSON.stringify(descriptor);
  if (unsafePathPattern.test(text)) {
    throw issue("external-runtime.unsafe-path", "External runtime descriptor contains local path material.");
  }
  if (text.includes([".", "planning"].join("")) || text.includes(["reference", "docs"].join("/"))) {
    throw issue("external-runtime.unsafe-output", "External runtime descriptor contains private planning material.");
  }
  if (/\b(?:spawn|exec)(?:\s|$)|\b(?:curl|powershell|bash|npm\s+run|python\s+)/iu.test(text)) {
    throw issue("external-runtime.command-output", "External runtime descriptor must not include executable commands.");
  }
  return true;
}

function collectUnsupportedNodes(workflowIr, manifest, validation) {
  const accepted = new Set(manifest.acceptedNodeTypes);
  const nodes = workflowIr?.nodes ?? [];
  const unsupported = [];
  for (const node of nodes) {
    const validatorRejected = validation.errors.some((error) => (
      error.code === "workflow.unsupported-node" && error.message.includes(node.id)
    ));
    if (validatorRejected || !accepted.has(node.type)) {
      unsupported.push({
        id: redactText(node.id),
        type: redactText(node.type),
        label: redactText(node.label),
        reason: validatorRejected ? "unsupported-ir-node" : "target-adapter-gap"
      });
    }
  }
  return unsupported;
}

function summarizeWorkflow(workflowIr) {
  return {
    workflowId: redactText(workflowIr?.workflowId ?? "workflow"),
    nodes: Array.isArray(workflowIr?.nodes) ? workflowIr.nodes.length : 0,
    edges: Array.isArray(workflowIr?.edges) ? workflowIr.edges.length : 0,
    sourceLinks: Array.isArray(workflowIr?.sourceLinks) ? workflowIr.sourceLinks.length : 0
  };
}

function buildUserActions(manifest, blockerCount) {
  const actions = [
    `Review the ${manifest.label} compatibility report.`,
    "Export the descriptor only after unsupported nodes are resolved.",
    "Import the descriptor through the user-owned external runtime UI.",
    "Delete the descriptor to roll back."
  ];
  if (blockerCount > 0) {
    return actions.slice(0, 2);
  }
  return actions;
}

function failedDescriptor(target, code, message) {
  return {
    ok: false,
    schemaVersion: descriptorSchemaVersion,
    target: String(target ?? "unknown"),
    label: "Unsupported external runtime",
    mode: "unsupported",
    createdAt: null,
    workflow: { workflowId: "unknown", nodes: 0, edges: 0, sourceLinks: 0 },
    artifacts: { fileName: null, mediaType: "application/json", exportFormat: "none", writesFiles: false },
    compatibility: {
      status: "blocked",
      acceptedNodeTypes: [],
      unsupportedNodes: [],
      bridgeSupported: false,
      adapterManifestRequired: true,
      universalRuntimeClaim: false
    },
    execution: noExecution(),
    cleanup: reversibleCleanup(),
    userActions: ["Choose a supported external runtime target."],
    errors: [{ code, message: redactText(message) }]
  };
}

function validateDestination(destination) {
  if (destination == null || destination === "") {
    return null;
  }
  if (typeof destination !== "string" || unsafePathPattern.test(destination)) {
    return issue("external-runtime.unsafe-destination", "External runtime handoff destination must be user-selected and path-free.");
  }
  return null;
}

function noExecution() {
  return {
    willExecute: false,
    startsBridge: false,
    makesNetworkRequest: false,
    writesFiles: false,
    requiresUserReview: true
  };
}

function reversibleCleanup() {
  return {
    reversible: true,
    removes: ["external runtime descriptor"],
    leavesWorkflowLibraryRecord: true
  };
}

function isoDate(value) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    throw issue("external-runtime.invalid-date", "createdAt must be an ISO date.");
  }
  return time.toISOString();
}

function issue(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
