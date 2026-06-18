import { parseDocument } from "yaml";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const platformAdapterIntakeSchemaVersion = "agentique.platformAdapterIntake.v1";
export const platformAdapterReviewSchemaVersion = "agentique.platformAdapterReview.v1";

const textEncoder = new TextEncoder();
const supportedPlatforms = new Set(["n8n", "dify", "langgraph"]);
const defaultPolicy = Object.freeze({
  maxBytes: 256 * 1024,
  maxNodes: 250,
  maxEdges: 1000
});

const unsafePathPattern = /(?:[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|\/(?:home|Users|mnt)\/)/u;
const environmentFilePattern = /(?:^|[\s"'=:,/[\\])\.env(?:\.[A-Za-z0-9_-]+)?(?:\b|$)/iu;
const obviousSecretPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{16,}\b|\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bAKIA[0-9A-Z]{16}\b|\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._-]{16,}\b|\b(?:api[_-]?key|api[_-]?token|secret|password|token)\s*[:=]\s*["'][^"'\s]{8,}["']/iu;
const childProcessMarker = ["child", "_", "process"].join("");
const commandMarkerPattern = new RegExp(`\\b(?:${childProcessMarker}|execSync|spawnSync|execFileSync|subprocess\\.(?:run|popen|call)|ProcessBuilder|docker\\s+run|curl\\s+[-\\w]*\\s*https?:|wget\\s+[-\\w]*\\s*https?:|powershell|pwsh|cmd\\.exe|bash\\s+-c|npm\\s+install|pip\\s+install|package\\.json|requirements\\.txt|pyproject\\.toml|Dockerfile)\\b`, "iu");
const nodeExecutionTypePattern = /(?:executeCommand|\.code\b|functionItem|function|shell|docker|httpRequest|webhook)/iu;

export const sampleN8nWorkflowJson = Object.freeze({
  name: "Agentique sample n8n flow",
  versionId: "n8n-sample-v1",
  nodes: [
    {
      id: "start",
      name: "Manual Trigger",
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [0, 0],
      parameters: {}
    },
    {
      id: "set-summary",
      name: "Set Summary",
      type: "n8n-nodes-base.set",
      typeVersion: 3,
      position: [260, 0],
      parameters: {
        values: {
          string: [
            { name: "title", value: "={{ $json.title }}" }
          ]
        }
      },
      credentials: {
        sampleApi: {
          id: "vault:n8nSampleApi",
          name: "Sample API"
        }
      }
    }
  ],
  connections: {
    "Manual Trigger": {
      main: [
        [
          {
            node: "Set Summary",
            type: "main",
            index: 0
          }
        ]
      ]
    }
  }
});

export const sampleDifyDslYaml = [
  "app:",
  "  name: Agentique Dify sample",
  "  mode: workflow",
  "version: 0.3.0",
  "workflow:",
  "  graph:",
  "    nodes:",
  "      - id: start",
  "        data:",
  "          title: Start",
  "          type: start",
  "        position:",
  "          x: 0",
  "          y: 0",
  "      - id: answer",
  "        data:",
  "          title: Answer",
  "          type: llm",
  "          model:",
  "            provider: openai",
  "            name: gpt-safe-review",
  "          prompt_template:",
  "            - role: user",
  "              text: \"Review {{#sys.query#}}\"",
  "        position:",
  "          x: 260",
  "          y: 0",
  "    edges:",
  "      - id: edge-start-answer",
  "        source: start",
  "        target: answer",
  "        data:",
  "          sourceType: start",
  "          targetType: llm",
  ""
].join("\n");

export const sampleLangGraphManifest = Object.freeze({
  node_version: "20",
  graphs: {
    agent: "./src/agent/graph.py:graph"
  },
  dependencies: ["."],
  env: {}
});

export function parsePlatformWorkflow(input, options = {}) {
  const platform = normalizePlatform(options.platform ?? inferPlatform(input));
  if (!platform) {
    return failedIntake("unknown", "platform.unsupported", "Platform adapter is not supported.", options);
  }

  if (platform === "n8n") return parseN8nWorkflowJson(input, options);
  if (platform === "dify") return parseDifyDslYaml(input, options);
  if (platform === "langgraph") return parseLangGraphManifest(input, options);
  return failedIntake(platform, "platform.unsupported", "Platform adapter is not supported.", options);
}

export function parseN8nWorkflowJson(input, options = {}) {
  const prepared = prepareJsonLikeInput(input, "n8n", options);
  if (!prepared.ok) return prepared.report;

  const workflow = prepared.value;
  const errors = [];
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    return failedIntake("n8n", "platform.invalid-schema", "n8n workflow must be an object.", options);
  }
  if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    errors.push(issue("platform.missing-nodes", "n8n workflow requires nodes."));
  }
  if (workflow.connections != null && (typeof workflow.connections !== "object" || Array.isArray(workflow.connections))) {
    errors.push(issue("platform.invalid-edges", "n8n connections must be an object."));
  }

  const nameToId = new Map();
  const nodes = [];
  for (const rawNode of workflow.nodes ?? []) {
    const node = normalizeN8nNode(rawNode, errors);
    if (node) {
      nodes.push(node);
      nameToId.set(String(rawNode.name ?? rawNode.id), node.id);
    }
  }

  const edges = normalizeN8nEdges(workflow.connections ?? {}, nameToId, errors);
  return finishIntake({
    platform: "n8n",
    format: "json",
    sourceVersion: String(workflow.versionId ?? workflow.version ?? workflow.id ?? "unknown"),
    sourceName: String(workflow.name ?? "n8n workflow"),
    nodes,
    edges,
    errors,
    unsupported: unsupportedWorkflowKeys(workflow, ["name", "version", "versionId", "id", "nodes", "connections", "settings", "pinData", "meta"])
  }, options);
}

export function parseDifyDslYaml(input, options = {}) {
  const prepared = prepareTextInput(input, "dify", options);
  if (!prepared.ok) return prepared.report;

  const document = parseDocument(prepared.text, { uniqueKeys: true });
  if (document.errors.length > 0) {
    return failedIntake("dify", "platform.invalid-yaml", "Dify DSL YAML is malformed.", options);
  }

  const dsl = document.toJSON();
  const errors = [];
  if (!dsl || typeof dsl !== "object" || Array.isArray(dsl)) {
    return failedIntake("dify", "platform.invalid-schema", "Dify DSL must be an object.", options);
  }

  const graph = dsl.workflow?.graph ?? dsl.workflow ?? dsl.graph ?? {};
  const rawNodes = graph.nodes ?? dsl.nodes;
  const rawEdges = graph.edges ?? dsl.edges ?? [];
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    errors.push(issue("platform.missing-nodes", "Dify DSL requires graph nodes."));
  }
  if (!Array.isArray(rawEdges)) {
    errors.push(issue("platform.invalid-edges", "Dify DSL graph edges must be an array."));
  }

  const nodes = (rawNodes ?? []).map((node) => normalizeDifyNode(node, errors)).filter(Boolean);
  const edges = (Array.isArray(rawEdges) ? rawEdges : []).map((edge, index) => normalizeDifyEdge(edge, index, errors)).filter(Boolean);
  return finishIntake({
    platform: "dify",
    format: "yaml",
    sourceVersion: String(dsl.version ?? dsl.dsl_version ?? dsl.app?.version ?? "unknown"),
    sourceName: String(dsl.app?.name ?? dsl.name ?? "Dify workflow"),
    nodes,
    edges,
    errors,
    unsupported: unsupportedWorkflowKeys(dsl, ["app", "version", "dsl_version", "workflow", "graph", "nodes", "edges"])
  }, options);
}

export function parseLangGraphManifest(input, options = {}) {
  const prepared = prepareJsonLikeInput(input, "langgraph", options);
  if (!prepared.ok) return prepared.report;

  const manifest = prepared.value;
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return failedIntake("langgraph", "platform.invalid-schema", "LangGraph manifest must be an object.", options);
  }
  if (!manifest.graphs || typeof manifest.graphs !== "object" || Array.isArray(manifest.graphs)) {
    errors.push(issue("platform.missing-graphs", "LangGraph manifest requires a graphs object."));
  }
  if (manifest.env && Object.keys(manifest.env).length > 0) {
    errors.push(issue("platform.env-reference", "Environment file or variable references are blocked."));
  }
  if (manifest.dockerfile || manifest.dockerFile || manifest.image) {
    errors.push(issue("platform.container-reference", "Container runtime references are blocked."));
  }

  const graphEntries = Object.entries(manifest.graphs ?? {});
  const nodes = graphEntries.map(([id, ref]) => normalizeLangGraphNode(id, ref, manifest, errors)).filter(Boolean);
  return finishIntake({
    platform: "langgraph",
    format: "json",
    sourceVersion: String(manifest.node_version ?? manifest.version ?? "unknown"),
    sourceName: "langgraph.json",
    nodes,
    edges: [],
    errors,
    unsupported: unsupportedWorkflowKeys(manifest, ["node_version", "python_version", "graphs", "dependencies", "env"])
  }, options);
}

export function reviewPlatformFormatAdapterGate(options = {}) {
  const samples = [
    parseN8nWorkflowJson(sampleN8nWorkflowJson, options),
    parseDifyDslYaml(sampleDifyDslYaml, options),
    parseLangGraphManifest(sampleLangGraphManifest, options)
  ];
  const rows = samples.map((sample) => ({
    platform: sample.platform,
    label: sample.source.platformLabel,
    decision: sample.decision,
    nodes: sample.summary.nodes,
    edges: sample.summary.edges,
    blockedFindings: sample.summary.blockedFindings,
    credentialReferences: sample.summary.credentialReferences,
    expressions: sample.summary.expressions
  }));
  return freezePlain({
    ok: samples.every((sample) => sample.ok),
    schemaVersion: platformAdapterReviewSchemaVersion,
    decision: samples.every((sample) => sample.ok) ? "accepted" : "blocked",
    boundary: createBoundary(),
    summary: {
      platforms: rows.length,
      accepted: rows.filter((row) => row.decision === "accepted").length,
      blocked: rows.filter((row) => row.decision === "blocked").length,
      nodes: rows.reduce((total, row) => total + row.nodes, 0),
      edges: rows.reduce((total, row) => total + row.edges, 0),
      credentialReferences: rows.reduce((total, row) => total + row.credentialReferences, 0),
      expressions: rows.reduce((total, row) => total + row.expressions, 0)
    },
    platformRows: rows,
    errors: samples.flatMap((sample) => sample.errors)
  });
}

function normalizeN8nNode(rawNode, errors) {
  if (!rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) {
    errors.push(issue("platform.invalid-node", "n8n node must be an object."));
    return null;
  }
  const id = requireId(rawNode.id ?? rawNode.name, "n8n node", errors);
  if (!id) return null;
  const type = safeText(rawNode.type ?? "unknown");
  const nodeErrors = suspiciousNodeFindings(type, rawNode.parameters);
  errors.push(...nodeErrors.map((error) => issue(error.code, `${id}: ${error.message}`)));
  return {
    id,
    originalId: safeText(rawNode.id ?? rawNode.name),
    label: safeText(rawNode.name ?? rawNode.id),
    type,
    platformType: type,
    classification: nodeErrors.length > 0 ? "blocked" : "handoff-only",
    trigger: /trigger/iu.test(type),
    position: normalizePosition(rawNode.position),
    credentials: collectN8nCredentials(rawNode.credentials),
    expressions: collectExpressions(rawNode.parameters),
    providerRequirements: stableUnique([type.split(".").at(-1) ?? type]),
    unsupportedMetadata: unsupportedWorkflowKeys(rawNode, ["id", "name", "type", "typeVersion", "position", "parameters", "credentials"])
  };
}

function normalizeN8nEdges(connections, nameToId, errors) {
  const edges = [];
  for (const [sourceName, groups] of Object.entries(connections).sort(([left], [right]) => left.localeCompare(right))) {
    const sourceId = nameToId.get(sourceName) ?? safeText(sourceName);
    const outputs = Array.isArray(groups?.main) ? groups.main : [];
    outputs.forEach((outputGroup, outputIndex) => {
      if (!Array.isArray(outputGroup)) return;
      outputGroup.forEach((target, targetIndex) => {
        const targetId = nameToId.get(String(target?.node ?? "")) ?? safeText(target?.node);
        if (!targetId) {
          errors.push(issue("platform.invalid-edge", "n8n connection target is missing."));
          return;
        }
        edges.push({
          id: safeText(`${sourceId}->${targetId}:${outputIndex}:${targetIndex}`),
          originalId: safeText(`${sourceName}->${target?.node ?? "unknown"}`),
          from: sourceId,
          to: targetId,
          label: safeText(target?.type ?? "main"),
          classification: "handoff-only"
        });
      });
    });
  }
  return edges;
}

function normalizeDifyNode(rawNode, errors) {
  if (!rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) {
    errors.push(issue("platform.invalid-node", "Dify node must be an object."));
    return null;
  }
  const data = rawNode.data && typeof rawNode.data === "object" ? rawNode.data : {};
  const id = requireId(rawNode.id, "Dify node", errors);
  if (!id) return null;
  const type = safeText(data.type ?? rawNode.type ?? "unknown");
  const nodeErrors = suspiciousNodeFindings(type, data);
  errors.push(...nodeErrors.map((error) => issue(error.code, `${id}: ${error.message}`)));
  return {
    id,
    originalId: id,
    label: safeText(data.title ?? data.label ?? rawNode.title ?? id),
    type,
    platformType: type,
    classification: nodeErrors.length > 0 ? "blocked" : "handoff-only",
    trigger: type === "start",
    position: normalizePosition(rawNode.position),
    credentials: collectCredentialReferences(data),
    expressions: collectExpressions(data),
    providerRequirements: stableUnique([data.model?.provider, data.provider, data.tool_provider, data.provider_name].filter(Boolean).map(String)),
    unsupportedMetadata: unsupportedWorkflowKeys(rawNode, ["id", "type", "title", "data", "position"])
  };
}

function normalizeDifyEdge(rawEdge, index, errors) {
  if (!rawEdge || typeof rawEdge !== "object" || Array.isArray(rawEdge)) {
    errors.push(issue("platform.invalid-edge", "Dify edge must be an object."));
    return null;
  }
  const from = requireId(rawEdge.source ?? rawEdge.from, "Dify edge source", errors);
  const to = requireId(rawEdge.target ?? rawEdge.to, "Dify edge target", errors);
  if (!from || !to) return null;
  return {
    id: safeText(rawEdge.id ?? `${from}->${to}:${index}`),
    originalId: safeText(rawEdge.id ?? `${from}->${to}`),
    from,
    to,
    label: safeText(rawEdge.data?.sourceType && rawEdge.data?.targetType ? `${rawEdge.data.sourceType}->${rawEdge.data.targetType}` : rawEdge.label ?? "edge"),
    classification: "handoff-only"
  };
}

function normalizeLangGraphNode(idValue, refValue, manifest, errors) {
  const id = requireId(idValue, "LangGraph graph", errors);
  if (!id) return null;
  const refText = typeof refValue === "string" ? refValue : JSON.stringify(refValue ?? "");
  const nodeErrors = suspiciousNodeFindings("langgraph-entrypoint", { ref: refText });
  errors.push(...nodeErrors.map((error) => issue(error.code, `${id}: ${error.message}`)));
  return {
    id,
    originalId: id,
    label: safeText(`LangGraph ${id}`),
    type: "langgraph-entrypoint",
    platformType: "graph-entrypoint",
    classification: nodeErrors.length > 0 ? "blocked" : "handoff-only",
    trigger: false,
    position: null,
    credentials: [],
    expressions: [],
    providerRequirements: dependencyKinds(manifest.dependencies),
    sourceReferences: [{
      kind: sourceRefKind(refText),
      redacted: "redacted:platform-source-reference"
    }],
    unsupportedMetadata: []
  };
}

function finishIntake({ platform, format, sourceVersion, sourceName, nodes, edges, errors, unsupported }, options = {}) {
  const validationErrors = [
    ...errors,
    ...validateCounts(nodes, edges, options),
    ...validateDuplicateIds(nodes, edges),
    ...validateEdges(nodes, edges),
    ...validateAcyclic(nodes, edges)
  ];
  const blockedFindings = validationErrors.length;
  const summary = {
    nodes: nodes.length,
    edges: edges.length,
    credentialReferences: nodes.reduce((total, node) => total + node.credentials.length, 0),
    expressions: nodes.reduce((total, node) => total + node.expressions.length, 0),
    triggers: nodes.filter((node) => node.trigger).length,
    unsupportedMetadata: unsupported.length + nodes.reduce((total, node) => total + node.unsupportedMetadata.length, 0),
    blockedFindings
  };
  const report = {
    ok: blockedFindings === 0,
    schemaVersion: platformAdapterIntakeSchemaVersion,
    platform,
    decision: blockedFindings === 0 ? "accepted" : "blocked",
    source: {
      platformLabel: platformLabel(platform),
      format,
      version: safeText(sourceVersion),
      name: safeText(sourceName),
      preserved: {
        originalNodeIds: nodes.map((node) => node.originalId).sort(),
        originalEdgeIds: edges.map((edge) => edge.originalId).sort(),
        unsupportedKeys: unsupported.map((item) => item.key).sort()
      }
    },
    boundary: createBoundary(),
    summary,
    nodes: nodes.map(sanitizeNode).sort((left, right) => left.id.localeCompare(right.id)),
    edges: edges.map(sanitizeEdge).sort((left, right) => left.id.localeCompare(right.id)),
    unsupported: unsupported.map((item) => ({
      kind: item.kind,
      key: safeText(item.key),
      reason: safeText(item.reason)
    })).sort((left, right) => `${left.kind}:${left.key}`.localeCompare(`${right.kind}:${right.key}`)),
    errors: validationErrors.map((error) => ({
      code: error.code,
      message: redactText(error.message),
      severity: "high"
    }))
  };

  assertAdapterOutputSafe(report);
  return freezePlain(report);
}

function prepareJsonLikeInput(input, platform, options) {
  if (typeof input === "string") {
    const prepared = prepareTextInput(input, platform, options);
    if (!prepared.ok) return prepared;
    try {
      return { ok: true, value: JSON.parse(prepared.text) };
    } catch {
      return { ok: false, report: failedIntake(platform, "platform.invalid-json", `${platformLabel(platform)} JSON is malformed.`, options) };
    }
  }

  const text = JSON.stringify(input ?? null);
  const preflight = inspectRawInput(text, platform, options);
  if (!preflight.ok) return preflight;
  try {
    assertNoInlineSecrets(input);
  } catch (error) {
    return { ok: false, report: failedIntake(platform, error.code ?? "platform.inline-secret", "Inline sensitive material is blocked.", options) };
  }
  return { ok: true, value: clone(input) };
}

function prepareTextInput(input, platform, options) {
  if (typeof input !== "string" || input.trim().length === 0) {
    return { ok: false, report: failedIntake(platform, "platform.empty-input", `${platformLabel(platform)} input must be non-empty text.`, options) };
  }
  const preflight = inspectRawInput(input, platform, options);
  if (!preflight.ok) return preflight;
  try {
    assertNoInlineSecrets(input);
  } catch (error) {
    return { ok: false, report: failedIntake(platform, error.code ?? "platform.inline-secret", "Inline sensitive material is blocked.", options) };
  }
  return { ok: true, text: input };
}

function inspectRawInput(text, platform, options = {}) {
  const policy = normalizePolicy(options.policy ?? options);
  const bytes = textEncoder.encode(text).byteLength;
  if (bytes > policy.maxBytes) {
    return { ok: false, report: failedIntake(platform, "platform.oversized", "Platform input exceeds the bounded parser size.", options) };
  }
  if (obviousSecretPattern.test(text)) {
    return { ok: false, report: failedIntake(platform, "platform.inline-secret", "Inline sensitive material is blocked.", options) };
  }
  if (unsafePathPattern.test(text)) {
    return { ok: false, report: failedIntake(platform, "platform.unsafe-path", "Local or traversal path material is blocked.", options) };
  }
  if (environmentFilePattern.test(text)) {
    return { ok: false, report: failedIntake(platform, "platform.env-reference", "Environment file references are blocked.", options) };
  }
  if (commandMarkerPattern.test(text)) {
    return { ok: false, report: failedIntake(platform, "platform.executable-marker", "Executable command, package, or container markers are blocked.", options) };
  }
  return { ok: true };
}

function suspiciousNodeFindings(type, payload) {
  const text = `${type}\n${JSON.stringify(payload ?? {})}`;
  const findings = [];
  if (nodeExecutionTypePattern.test(text) || commandMarkerPattern.test(text)) {
    findings.push(issue("platform.executable-node", "Executable node capability is blocked for parse-only intake."));
  }
  if (environmentFilePattern.test(text)) {
    findings.push(issue("platform.env-reference", "Environment file references are blocked."));
  }
  if (obviousSecretPattern.test(text)) {
    findings.push(issue("platform.inline-secret", "Inline sensitive material is blocked."));
  }
  return findings;
}

function failedIntake(platform, code, message, options = {}) {
  const normalizedPlatform = normalizePlatform(platform) ?? "unknown";
  const report = {
    ok: false,
    schemaVersion: platformAdapterIntakeSchemaVersion,
    platform: normalizedPlatform,
    decision: "blocked",
    source: {
      platformLabel: platformLabel(normalizedPlatform),
      format: "unknown",
      version: "unknown",
      name: "blocked input",
      preserved: {
        originalNodeIds: [],
        originalEdgeIds: [],
        unsupportedKeys: []
      }
    },
    boundary: createBoundary(),
    summary: {
      nodes: 0,
      edges: 0,
      credentialReferences: 0,
      expressions: 0,
      triggers: 0,
      unsupportedMetadata: 0,
      blockedFindings: 1
    },
    nodes: [],
    edges: [],
    unsupported: [],
    errors: [{ code, message: redactText(message), severity: "high" }]
  };
  assertAdapterOutputSafe(report, options);
  return freezePlain(report);
}

function validateCounts(nodes, edges, options = {}) {
  const policy = normalizePolicy(options.policy ?? options);
  const errors = [];
  if (nodes.length > policy.maxNodes) {
    errors.push(issue("platform.max-nodes", "Platform workflow exceeds node limit."));
  }
  if (edges.length > policy.maxEdges) {
    errors.push(issue("platform.max-edges", "Platform workflow exceeds edge limit."));
  }
  return errors;
}

function validateDuplicateIds(nodes, edges) {
  const errors = [];
  for (const duplicate of duplicates(nodes.map((node) => node.id))) {
    errors.push(issue("platform.duplicate-node", `Duplicate node id: ${duplicate}`));
  }
  for (const duplicate of duplicates(edges.map((edge) => edge.id))) {
    errors.push(issue("platform.duplicate-edge", `Duplicate edge id: ${duplicate}`));
  }
  return errors;
}

function validateEdges(nodes, edges) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const errors = [];
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      errors.push(issue("platform.dangling-edge", "Platform edge references an unknown node."));
    }
  }
  return errors;
}

function validateAcyclic(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (adjacency.has(edge.from)) adjacency.get(edge.from).push(edge.to);
  }
  const visiting = new Set();
  const visited = new Set();
  const errors = [];
  const visit = (nodeId) => {
    if (visiting.has(nodeId)) {
      errors.push(issue("platform.cycle", "Platform workflow graph contains a cycle."));
      return;
    }
    if (visited.has(nodeId) || errors.some((error) => error.code === "platform.cycle")) return;
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) visit(next);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const node of nodes) visit(node.id);
  return errors;
}

function collectN8nCredentials(credentials) {
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) return [];
  return Object.entries(credentials).map(([kind, value]) => ({
    kind: safeText(kind),
    ref: redactText(value?.id ?? value?.name ?? kind)
  })).sort((left, right) => left.kind.localeCompare(right.kind));
}

function collectCredentialReferences(value, path = "") {
  if (value == null) return [];
  if (typeof value === "string") {
    return /(credential|api[_-]?key|token|secret)/iu.test(path)
      ? [{ kind: safeText(path.split(".").at(-1) ?? "credential"), ref: redactText(value) }]
      : [];
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => collectCredentialReferences(item, `${path}.${index}`));
  if (typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => collectCredentialReferences(nested, path ? `${path}.${key}` : key));
}

function collectExpressions(value) {
  const expressions = [];
  const visit = (nested) => {
    if (expressions.length >= 12 || nested == null) return;
    if (typeof nested === "string") {
      if (/\{\{[\s\S]{0,200}\}\}|#(?:sys|conversation|context|node)\.[^#]{1,120}#/u.test(nested)) {
        expressions.push(redactText(nested).slice(0, 160));
      }
      return;
    }
    if (Array.isArray(nested)) {
      nested.forEach(visit);
      return;
    }
    if (typeof nested === "object") {
      Object.values(nested).forEach(visit);
    }
  };
  visit(value);
  return stableUnique(expressions);
}

function dependencyKinds(dependencies) {
  if (!Array.isArray(dependencies)) return [];
  return stableUnique(dependencies.map((dependency) => {
    const text = String(dependency);
    if (text === ".") return "local-project-reference";
    if (/^https?:/iu.test(text)) return "remote-reference";
    if (/^[A-Za-z0-9_.@/-]+$/u.test(text)) return "package-reference";
    return "unknown-reference";
  }));
}

function sourceRefKind(value) {
  if (/\.py:/iu.test(value)) return "python-entrypoint";
  if (/\.js:/iu.test(value) || /\.ts:/iu.test(value)) return "javascript-entrypoint";
  return "graph-entrypoint";
}

function normalizePosition(position) {
  if (Array.isArray(position) && position.length >= 2) {
    return { x: Number(position[0]) || 0, y: Number(position[1]) || 0 };
  }
  if (position && typeof position === "object") {
    return { x: Number(position.x) || 0, y: Number(position.y) || 0 };
  }
  return null;
}

function unsupportedWorkflowKeys(value, allowedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const allowed = new Set(allowedKeys);
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => ({ kind: "source-field", key: safeText(key), reason: "preserved-for-review" }));
}

function sanitizeNode(node) {
  return {
    id: safeText(node.id),
    originalId: safeText(node.originalId),
    label: safeText(node.label),
    type: safeText(node.type),
    platformType: safeText(node.platformType),
    classification: node.classification,
    trigger: Boolean(node.trigger),
    position: node.position,
    credentials: node.credentials.map((credential) => ({
      kind: safeText(credential.kind),
      ref: redactText(credential.ref)
    })),
    expressions: node.expressions.map((expression) => redactText(expression)),
    providerRequirements: node.providerRequirements.map(safeText),
    sourceReferences: (node.sourceReferences ?? []).map((reference) => ({
      kind: safeText(reference.kind),
      redacted: "redacted:platform-source-reference"
    })),
    unsupportedMetadata: node.unsupportedMetadata.map((item) => ({
      kind: item.kind,
      key: safeText(item.key),
      reason: safeText(item.reason)
    }))
  };
}

function sanitizeEdge(edge) {
  return {
    id: safeText(edge.id),
    originalId: safeText(edge.originalId),
    from: safeText(edge.from),
    to: safeText(edge.to),
    label: safeText(edge.label),
    classification: edge.classification
  };
}

export function assertAdapterOutputSafe(report) {
  assertNoInlineSecrets(report);
  const serialized = JSON.stringify(report);
  if (unsafePathPattern.test(serialized)) {
    throw issue("platform.output-unsafe-path", "Adapter output contains local or traversal path material.");
  }
  if (environmentFilePattern.test(serialized)) {
    throw issue("platform.output-env-reference", "Adapter output contains environment file material.");
  }
  if (serialized.includes([".", "planning"].join("")) || serialized.includes(["reference", "docs"].join("/"))) {
    throw issue("platform.output-private-reference", "Adapter output contains private planning material.");
  }
  if (obviousSecretPattern.test(serialized)) {
    throw issue("platform.output-inline-secret", "Adapter output contains inline sensitive material.");
  }
  return true;
}

function createBoundary() {
  return {
    localOnly: true,
    parseOnly: true,
    reviewOnly: true,
    noExecution: true,
    noNetwork: true,
    noFilesystemWrite: true,
    noPackageInstall: true,
    noDependencyInstall: true,
    noContainerStart: true,
    noEnvironmentRead: true,
    noCredentialRead: true,
    grantsRuntimeCompatibility: false
  };
}

function requireId(value, label, errors) {
  const id = safeText(value);
  if (!id) {
    errors.push(issue("platform.invalid-id", `${label} id is missing.`));
    return "";
  }
  return id;
}

function normalizePolicy(options = {}) {
  return {
    maxBytes: positiveInteger(options.maxBytes, defaultPolicy.maxBytes),
    maxNodes: positiveInteger(options.maxNodes, defaultPolicy.maxNodes),
    maxEdges: positiveInteger(options.maxEdges, defaultPolicy.maxEdges)
  };
}

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function normalizePlatform(value) {
  const platform = String(value ?? "").trim().toLowerCase();
  return supportedPlatforms.has(platform) ? platform : null;
}

function inferPlatform(input) {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) {
      try {
        return inferPlatform(JSON.parse(trimmed));
      } catch {
        return null;
      }
    }
    if (/^\s*(app|workflow|version):/mu.test(trimmed)) return "dify";
    return null;
  }
  if (input?.connections && Array.isArray(input?.nodes)) return "n8n";
  if (input?.graphs && typeof input.graphs === "object") return "langgraph";
  return null;
}

function platformLabel(platform) {
  if (platform === "n8n") return "n8n";
  if (platform === "dify") return "Dify";
  if (platform === "langgraph") return "LangGraph";
  return "Unsupported platform";
}

function safeText(value) {
  return redactText(String(value ?? "").replace(/\s+/gu, " ").trim()).slice(0, 160);
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function stableUnique(values) {
  return [...new Set(values.map((value) => safeText(value)).filter(Boolean))].sort();
}

function issue(code, message) {
  return { code, message: redactText(message) };
}

function freezePlain(value) {
  return Object.freeze(clone(value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
