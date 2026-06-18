import {
  assertAdapterOutputSafe,
  parseDifyDslYaml,
  parseLangGraphManifest,
  parseN8nWorkflowJson,
  platformAdapterIntakeSchemaVersion,
  sampleDifyDslYaml,
  sampleLangGraphManifest,
  sampleN8nWorkflowJson
} from "./platform-format-adapter.mjs";
import { classifyPlatformIntakeCapabilities } from "./platform-capability-classifier.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";
import { validateWorkflowIr } from "./workflow-ir.mjs";

export const platformIrNormalizationSchemaVersion = "agentique.platformIrNormalization.v1";
export const workflowImportLossReportSchemaVersion = "agentique.workflowImportLossReport.v1";

const unsafePathPattern = /(?:[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|\/(?:home|Users|mnt)\/)/u;
const privateReferencePattern = new RegExp(`${escapeRegExp([".", "planning"].join(""))}|${escapeRegExp(["reference", "docs"].join("/"))}`, "iu");
const commandLikePattern = /\b(?:npm\s+install|pip\s+install|docker\s+run|powershell|bash\s+-c|curl\s+[-\w]*\s*https?:|wget\s+[-\w]*\s*https?:)\b/iu;

export function normalizePlatformIntakeToWorkflowIr(intake, options = {}) {
  const checked = validateIntakeEnvelope(intake);
  if (!checked.ok) {
    return failedNormalization("unknown", checked.errors, options);
  }
  assertAdapterOutputSafe(intake);

  if (!intake.ok) {
    return failedNormalization(intake.platform, intake.errors, options, intake);
  }

  const capabilityMatrix = classifyPlatformIntakeCapabilities(intake, options);
  const capabilityBySourceId = new Map(capabilityMatrix.nodeClassifications.map((node) => [node.nodeId, node]));
  const nodeMap = new Map();
  const nodes = intake.nodes.map((node) => {
    const canonicalNodeId = canonicalId(intake.platform, node.id);
    nodeMap.set(node.id, canonicalNodeId);
    return normalizeNode(intake.platform, node, canonicalNodeId, capabilityBySourceId.get(node.id));
  });
  const edges = intake.edges.map((edge, index) => normalizeEdge(intake.platform, edge, index, nodeMap));
  const workflowIr = {
    schemaVersion: "agentique.workflowIr.v1",
    workflowId: canonicalId("import", `${intake.platform}-${intake.source.name || "workflow"}`),
    nodes,
    edges,
    sourceLinks: [
      { label: `${intake.source.platformLabel} intake`, href: "agentique:platform-intake" },
      { label: "workflow import loss report", href: "agentique:workflow-import-loss-report" }
    ]
  };

  const workflowValidation = validateWorkflowIr(workflowIr);
  const semantics = [
    ...intake.nodes.flatMap((node) => semanticEntriesForNode(intake.platform, node, nodeMap.get(node.id))),
    ...intake.edges.map((edge) => semanticEntry({
      id: `edge:${canonicalId(intake.platform, edge.id)}`,
      sourceId: edge.originalId,
      label: edge.label,
      status: "preserved",
      reason: "topology-preserved",
      executionEligible: false
    })),
    ...workflowValidation.errors.map((error, index) => semanticEntry({
      id: `validation:${index}`,
      sourceId: "workflow-ir",
      label: error.code,
      status: "blocked",
      reason: error.message,
      executionEligible: false
    }))
  ];
  const lossReport = buildLossReport(intake, semantics, workflowIr);
  const errors = workflowValidation.errors.map((error) => ({ code: error.code, message: redactText(error.message) }));
  const result = {
    ok: workflowValidation.ok && lossReport.summary.blocked === 0,
    schemaVersion: platformIrNormalizationSchemaVersion,
    platform: intake.platform,
    workflowIr,
    lossReport,
    capabilityMatrix,
    sourceMap: {
      nodes: [...nodeMap.entries()].map(([sourceId, canonical]) => ({ sourceId: redactText(sourceId), canonicalId: canonical })),
      edges: intake.edges.map((edge) => ({
        sourceId: redactText(edge.originalId),
        canonicalId: canonicalId(intake.platform, edge.id)
      }))
    },
    boundary: createBoundary(),
    errors
  };

  assertNormalizationOutputSafe(result);
  return cloneFreeze(result);
}

export function reviewPlatformIrNormalizerGate(options = {}) {
  const inputs = [
    parseN8nWorkflowJson(sampleN8nWorkflowJson, options),
    parseDifyDslYaml(sampleDifyDslYaml, options),
    parseLangGraphManifest(sampleLangGraphManifest, options)
  ];
  const normalizations = inputs.map((input) => normalizePlatformIntakeToWorkflowIr(input, options));
  const rows = normalizations.map((normalization) => ({
    platform: normalization.platform,
    decision: normalization.ok ? "normalized" : "blocked",
    nodes: normalization.workflowIr?.nodes.length ?? 0,
    edges: normalization.workflowIr?.edges.length ?? 0,
    preserved: normalization.lossReport.summary.preserved,
    normalized: normalization.lossReport.summary.normalized,
    degraded: normalization.lossReport.summary.degraded,
    blocked: normalization.lossReport.summary.blocked,
    handoffOnly: normalization.lossReport.summary.handoffOnly
  }));

  return cloneFreeze({
    ok: normalizations.every((normalization) => normalization.ok),
    schemaVersion: "agentique.platformIrNormalizerReview.v1",
    boundary: createBoundary(),
    summary: {
      platforms: rows.length,
      normalized: rows.filter((row) => row.decision === "normalized").length,
      blocked: rows.filter((row) => row.decision === "blocked").length,
      nodes: rows.reduce((total, row) => total + row.nodes, 0),
      edges: rows.reduce((total, row) => total + row.edges, 0),
      preserved: rows.reduce((total, row) => total + row.preserved, 0),
      semanticNormalized: rows.reduce((total, row) => total + row.normalized, 0),
      degraded: rows.reduce((total, row) => total + row.degraded, 0),
      handoffOnly: rows.reduce((total, row) => total + row.handoffOnly, 0)
    },
    platformRows: rows,
    errors: normalizations.flatMap((normalization) => normalization.errors)
  });
}

export function assertNormalizationOutputSafe(value) {
  assertNoInlineSecrets(value);
  const serialized = JSON.stringify(value);
  if (unsafePathPattern.test(serialized)) {
    throw issue("normalizer.unsafe-path", "Normalizer output contains local or traversal path material.");
  }
  if (privateReferencePattern.test(serialized)) {
    throw issue("normalizer.private-reference", "Normalizer output contains private planning material.");
  }
  if (commandLikePattern.test(serialized)) {
    throw issue("normalizer.command-text", "Normalizer output contains executable command text.");
  }
  return true;
}

function normalizeNode(platform, node, canonicalNodeId, capability) {
  const semantic = primarySemanticForNode(platform, node);
  const credentials = node.credentials.length > 0 ? ["redacted:vault-reference"] : [];
  return {
    id: canonicalNodeId,
    type: semantic.canonicalType,
    label: safeLabel(node.label || node.id),
    inputs: [],
    outputs: [`${canonicalNodeId}:output`],
    risk: semantic.risk,
    credentials,
    capability: capability ? normalizeCapabilityForWorkflowNode(capability) : null
  };
}

function normalizeEdge(platform, edge, index, nodeMap) {
  const from = nodeMap.get(edge.from) ?? canonicalId(platform, edge.from);
  const to = nodeMap.get(edge.to) ?? canonicalId(platform, edge.to);
  return {
    from,
    to,
    label: safeLabel(edge.label || `edge-${index}`)
  };
}

function semanticEntriesForNode(platform, node, canonicalNodeId) {
  const primary = primarySemanticForNode(platform, node);
  const entries = [
    semanticEntry({
      id: `node:${canonicalNodeId}`,
      sourceId: node.originalId,
      label: node.label,
      status: primary.status,
      reason: primary.reason,
      executionEligible: primary.executionEligible
    })
  ];

  if (node.credentials.length > 0) {
    entries.push(semanticEntry({
      id: `credential:${canonicalNodeId}`,
      sourceId: node.originalId,
      label: "credential reference",
      status: "degraded",
      reason: "credential-reference-preserved-for-review",
      executionEligible: false
    }));
  }
  if (node.expressions.length > 0) {
    entries.push(semanticEntry({
      id: `expression:${canonicalNodeId}`,
      sourceId: node.originalId,
      label: "platform expression",
      status: "degraded",
      reason: "expression-preserved-as-review-metadata",
      executionEligible: false
    }));
  }
  if (node.unsupportedMetadata.length > 0) {
    entries.push(semanticEntry({
      id: `metadata:${canonicalNodeId}`,
      sourceId: node.originalId,
      label: "unsupported metadata",
      status: "degraded",
      reason: "unsupported-fields-preserved-outside-execution-ir",
      executionEligible: false
    }));
  }

  return entries;
}

function primarySemanticForNode(platform, node) {
  if (node.classification === "blocked") {
    return {
      status: "blocked",
      canonicalType: "handoff",
      risk: "high",
      reason: "source-node-blocked-by-platform-intake",
      executionEligible: false
    };
  }
  if (platform === "langgraph") {
    return {
      status: "handoff-only",
      canonicalType: "handoff",
      risk: "high",
      reason: "code-first-graph-entrypoint-preserved-for-handoff",
      executionEligible: false
    };
  }
  if (node.type === "llm" || node.providerRequirements.length > 0 && !safeLocalTransform(node)) {
    return {
      status: "handoff-only",
      canonicalType: "handoff",
      risk: "medium",
      reason: "external-provider-or-platform-runtime-required",
      executionEligible: false
    };
  }
  if (node.trigger) {
    return {
      status: "preserved",
      canonicalType: "input",
      risk: "low",
      reason: "trigger-normalized-to-canonical-input",
      executionEligible: false
    };
  }
  return {
    status: "normalized",
    canonicalType: "transform",
    risk: node.expressions.length > 0 || node.credentials.length > 0 ? "medium" : "low",
    reason: "data-transform-normalized-for-review",
    executionEligible: false
  };
}

function normalizeCapabilityForWorkflowNode(capability) {
  return {
    schemaVersion: "agentique.platformNodeCapability.v1",
    sourcePlatform: safeLabel(capability.platform),
    sourceFamily: safeLabel(capability.sourceFamily),
    primaryClassification: safeLabel(capability.primaryClassification),
    executionLane: safeLabel(capability.executionLane),
    permissionFamilies: capability.permissionFamilies.map(safeLabel),
    handoffDescriptor: capability.handoffDescriptor ? {
      kind: safeLabel(capability.handoffDescriptor.kind),
      mode: safeLabel(capability.handoffDescriptor.mode),
      reviewOnly: true,
      localExecutionAllowed: false
    } : null,
    reasons: capability.reasons.map((entry) => ({
      code: safeLabel(entry.code),
      message: safeLabel(entry.message)
    }))
  };
}

function safeLocalTransform(node) {
  const localTransformTypes = new Set(["set", "start", "manualTrigger"]);
  return localTransformTypes.has(node.type) || node.platformType.endsWith(".set") || node.platformType.endsWith(".manualTrigger");
}

function buildLossReport(intake, semantics, workflowIr) {
  const summary = {
    nodes: workflowIr.nodes.length,
    edges: workflowIr.edges.length,
    totalSemantics: semantics.length,
    preserved: countStatus(semantics, "preserved"),
    normalized: countStatus(semantics, "normalized"),
    degraded: countStatus(semantics, "degraded"),
    blocked: countStatus(semantics, "blocked"),
    handoffOnly: countStatus(semantics, "handoff-only")
  };
  return {
    schemaVersion: workflowImportLossReportSchemaVersion,
    platform: intake.platform,
    source: {
      label: intake.source.platformLabel,
      format: intake.source.format,
      version: intake.source.version,
      originalNodeIds: intake.source.preserved.originalNodeIds,
      originalEdgeIds: intake.source.preserved.originalEdgeIds
    },
    summary,
    semantics: semantics.sort((left, right) => left.id.localeCompare(right.id))
  };
}

function failedNormalization(platform, errors, options = {}, intake = null) {
  const blockedSemantics = (errors.length > 0 ? errors : [{ code: "normalizer.blocked", message: "Platform intake is blocked." }])
    .map((error, index) => semanticEntry({
      id: `blocked:${index}`,
      sourceId: intake?.platform ?? platform,
      label: error.code ?? "blocked",
      status: "blocked",
      reason: error.message ?? "Platform intake is blocked.",
      executionEligible: false
    }));
  const lossReport = {
    schemaVersion: workflowImportLossReportSchemaVersion,
    platform: safeLabel(platform),
    source: {
      label: intake?.source?.platformLabel ?? "unknown",
      format: intake?.source?.format ?? "unknown",
      version: intake?.source?.version ?? "unknown",
      originalNodeIds: [],
      originalEdgeIds: []
    },
    summary: {
      nodes: 0,
      edges: 0,
      totalSemantics: blockedSemantics.length,
      preserved: 0,
      normalized: 0,
      degraded: 0,
      blocked: blockedSemantics.length,
      handoffOnly: 0
    },
    semantics: blockedSemantics
  };
  const result = {
    ok: false,
    schemaVersion: platformIrNormalizationSchemaVersion,
    platform: safeLabel(platform),
    workflowIr: null,
    lossReport,
    sourceMap: { nodes: [], edges: [] },
    boundary: createBoundary(),
    errors: errors.map((error) => ({ code: error.code ?? "normalizer.blocked", message: redactText(error.message ?? "Platform intake is blocked.") }))
  };
  assertNormalizationOutputSafe(result, options);
  return cloneFreeze(result);
}

function validateIntakeEnvelope(intake) {
  if (!intake || typeof intake !== "object") {
    return { ok: false, errors: [issue("normalizer.invalid-input", "Platform intake must be an object.")] };
  }
  if (intake.schemaVersion !== platformAdapterIntakeSchemaVersion) {
    return { ok: false, errors: [issue("normalizer.invalid-schema", "Platform intake schema is unsupported.")] };
  }
  return { ok: true, errors: [] };
}

function semanticEntry({ id, sourceId, label, status, reason, executionEligible }) {
  return {
    id: safeLabel(id),
    sourceId: redactText(sourceId),
    label: safeLabel(label),
    status,
    reason: safeLabel(reason),
    executionEligible: Boolean(executionEligible)
  };
}

function createBoundary() {
  return {
    reviewOnly: true,
    noExecution: true,
    noSchedulerStart: true,
    noNetwork: true,
    noFilesystemWrite: true,
    noDependencyInstall: true,
    noContainerStart: true,
    noEnvironmentRead: true,
    noCredentialRead: true,
    grantsRuntimeCompatibility: false
  };
}

function canonicalId(prefix, value) {
  const safe = String(value ?? "node")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80) || "node";
  return `${prefix}-${safe}`.slice(0, 96);
}

function safeLabel(value) {
  return redactText(String(value ?? "").replace(/\s+/gu, " ").trim()).slice(0, 160);
}

function countStatus(semantics, status) {
  return semantics.filter((entry) => entry.status === status).length;
}

function issue(code, message) {
  return { code, message: redactText(message) };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function cloneFreeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
