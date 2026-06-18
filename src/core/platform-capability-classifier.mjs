import {
  parseDifyDslYaml,
  parseLangGraphManifest,
  parseN8nWorkflowJson,
  platformAdapterIntakeSchemaVersion,
  sampleDifyDslYaml,
  sampleLangGraphManifest,
  sampleN8nWorkflowJson
} from "./platform-format-adapter.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const platformCapabilityMatrixSchemaVersion = "agentique.platformCapabilityMatrix.v1";
export const platformNodeCapabilitySchemaVersion = "agentique.platformNodeCapability.v1";

const primaryClassifications = new Set(["executable", "permission-required", "blocked", "handoff-only"]);
const supportedPlatforms = new Set(["n8n", "dify", "langgraph"]);
const unsafePathPattern = /(?:[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|\/(?:home|Users|mnt)\/)/u;
const privateReferencePattern = new RegExp(`${escapeRegExp([".", "planning"].join(""))}|${escapeRegExp(["reference", "docs"].join("/"))}`, "iu");
const commandLikePattern = /\b(?:execSync|spawnSync|execFileSync|subprocess\.(?:run|popen|call)|ProcessBuilder|docker\s+run|curl\s+[-\w]*\s*https?:|wget\s+[-\w]*\s*https?:|powershell|pwsh|cmd\.exe|bash\s+-c|npm\s+install|pip\s+install|package\.json|requirements\.txt|pyproject\.toml|Dockerfile)\b/iu;

const blockedFamilies = new Set([
  "code",
  "shell-process",
  "package-manager",
  "container",
  "browser-data",
  "ambient-environment",
  "downloaded-workflow",
  "unknown-provider"
]);

const permissionFamiliesBySource = Object.freeze({
  "credentialed-operation": ["secrets", "externalProviders"],
  filesystem: ["filesystem"],
  "http-api": ["network"],
  "network-trigger": ["network"],
  "tool-provider": ["network", "externalProviders"],
  "external-effect": ["network", "filesystem"]
});

export function classifyPlatformIntakeCapabilities(intake, options = {}) {
  const checked = validateIntake(intake);
  if (!checked.ok) {
    return failedMatrix(checked.platform, checked.errors, options);
  }

  const nodeClassifications = intake.nodes.map((node) => classifyPlatformNode(intake.platform, node));
  const errors = [
    ...(intake.ok ? [] : (intake.errors ?? []).map((error) => issue(error.code ?? "platform-capability.source-blocked", error.message ?? "Platform intake is blocked."))),
    ...nodeClassifications
      .filter((node) => node.primaryClassification === "blocked")
      .flatMap((node) => node.reasons.map((entry) => issue(entry.code, entry.message)))
  ];
  const matrixRows = summarizeMatrixRows(nodeClassifications);
  const summary = summarizeNodeClassifications(nodeClassifications);
  const decision = summary.blocked > 0 || !intake.ok
    ? "blocked"
    : summary.permissionRequired > 0
      ? "permission-required"
      : "accepted";
  const report = {
    ok: decision !== "blocked",
    schemaVersion: platformCapabilityMatrixSchemaVersion,
    platform: intake.platform,
    decision,
    boundary: createBoundary(),
    summary,
    matrixRows,
    nodeClassifications,
    errors
  };
  assertPlatformCapabilityOutputSafe(report, options);
  return cloneFreeze(report);
}

export function reviewPlatformCapabilityClassifierGate(options = {}) {
  const samples = [
    classifyPlatformIntakeCapabilities(parseN8nWorkflowJson(sampleN8nWorkflowJson, options), options),
    classifyPlatformIntakeCapabilities(parseDifyDslYaml(sampleDifyDslYaml, options), options),
    classifyPlatformIntakeCapabilities(parseLangGraphManifest(sampleLangGraphManifest, options), options),
    classifyPlatformIntakeCapabilities(createFamilyCoverageIntake(), options)
  ];
  const coverage = new Set(samples.flatMap((sample) => sample.nodeClassifications.map((node) => node.sourceFamily)));
  const matrixRows = samples.flatMap((sample) => sample.matrixRows);
  const requiredFamilies = [
    "trigger",
    "data-transform",
    "credentialed-operation",
    "model-provider",
    "http-api",
    "filesystem",
    "code",
    "shell-process",
    "package-manager",
    "container",
    "browser-data",
    "ambient-environment",
    "downloaded-workflow",
    "tool-provider",
    "subflow",
    "human-approval",
    "retry-control",
    "external-runtime",
    "unknown-provider",
    "external-effect"
  ];
  const unsafeExecutable = samples.flatMap((sample) => sample.nodeClassifications)
    .filter((node) => blockedFamilies.has(node.sourceFamily) && node.primaryClassification === "executable");
  const ok = samples.every((sample) => sample.schemaVersion === platformCapabilityMatrixSchemaVersion) &&
    requiredFamilies.every((family) => coverage.has(family)) &&
    unsafeExecutable.length === 0;

  return cloneFreeze({
    ok,
    schemaVersion: "agentique.platformCapabilityClassifierReview.v1",
    boundary: createBoundary(),
    summary: {
      samples: samples.length,
      nodes: samples.reduce((total, sample) => total + sample.summary.nodes, 0),
      sourceFamilies: coverage.size,
      executable: samples.reduce((total, sample) => total + sample.summary.executable, 0),
      permissionRequired: samples.reduce((total, sample) => total + sample.summary.permissionRequired, 0),
      blocked: samples.reduce((total, sample) => total + sample.summary.blocked, 0),
      handoffOnly: samples.reduce((total, sample) => total + sample.summary.handoffOnly, 0)
    },
    platformRows: samples.map((sample) => ({
      platform: sample.platform,
      decision: sample.decision,
      nodes: sample.summary.nodes,
      executable: sample.summary.executable,
      permissionRequired: sample.summary.permissionRequired,
      blocked: sample.summary.blocked,
      handoffOnly: sample.summary.handoffOnly
    })),
    matrixRows,
    requiredFamilies,
    errors: ok ? [] : [issue("platform-capability.review", "Platform capability classifier review failed.")]
  });
}

export function assertPlatformCapabilityOutputSafe(value) {
  assertNoInlineSecrets(value);
  const serialized = JSON.stringify(value);
  if (unsafePathPattern.test(serialized)) {
    throw issue("platform-capability.unsafe-path", "Platform capability output contains local or traversal path material.");
  }
  if (privateReferencePattern.test(serialized)) {
    throw issue("platform-capability.private-reference", "Platform capability output contains private planning material.");
  }
  if (commandLikePattern.test(serialized)) {
    throw issue("platform-capability.command-text", "Platform capability output contains executable command text.");
  }
  return true;
}

function classifyPlatformNode(platform, node) {
  const inferredFamily = inferSourceFamily(platform, node);
  const credentialRefs = Array.isArray(node.credentials) ? node.credentials.length : 0;
  const sourceFamily = credentialRefs > 0 && isLocalExecutableFamily(inferredFamily) ? "credentialed-operation" : inferredFamily;
  const base = {
    schemaVersion: platformNodeCapabilitySchemaVersion,
    platform,
    nodeId: safeText(node.id),
    originalId: safeText(node.originalId ?? node.id),
    label: safeText(node.label ?? node.id),
    platformType: safePlatformType(node.platformType ?? node.type),
    sourceFamily,
    providerRequirements: safeList(node.providerRequirements),
    credentialRefs
  };
  const explicitBlocked = node.classification === "blocked";
  const hasCredentials = base.credentialRefs > 0;
  const hasUnknownProvider = base.providerRequirements.some((provider) => /unknown|unsupported|untrusted/iu.test(provider));
  const reasons = [];

  if (explicitBlocked) {
    reasons.push(reason("platform-capability.source-blocked", "Source platform intake marked this node blocked."));
  }
  if (blockedFamilies.has(sourceFamily)) {
    reasons.push(reason(`platform-capability.${sourceFamily}`, `${sourceFamily} nodes cannot become local executable nodes.`));
  }
  if (hasUnknownProvider) {
    reasons.push(reason("platform-capability.unknown-provider", "Unknown or unsupported provider cannot become a local executable node."));
  }

  if (reasons.length > 0) {
    return {
      ...base,
      primaryClassification: "blocked",
      executionLane: "blocked",
      permissionFamilies: [],
      handoffDescriptor: createHandoffDescriptor(platform, sourceFamily, "blocked"),
      reasons
    };
  }

  if (hasCredentials && isLocalExecutableFamily(sourceFamily)) {
    return {
      ...base,
      primaryClassification: "permission-required",
      executionLane: "signed-adapter-review",
      permissionFamilies: ["secrets", "externalProviders"],
      handoffDescriptor: null,
      reasons: [reason("platform-capability.credentialed-operation", "Credentialed source node requires scoped permission review.")]
    };
  }

  if (permissionFamiliesBySource[sourceFamily]) {
    return {
      ...base,
      primaryClassification: "permission-required",
      executionLane: "signed-adapter-review",
      permissionFamilies: permissionFamiliesBySource[sourceFamily],
      handoffDescriptor: null,
      reasons: [reason(`platform-capability.${sourceFamily}`, `${sourceFamily} node requires scoped permission review before any adapter lane can be considered.`)]
    };
  }

  if (sourceFamily === "model-provider" || sourceFamily === "subflow" || sourceFamily === "human-approval" || sourceFamily === "external-runtime") {
    return {
      ...base,
      primaryClassification: "handoff-only",
      executionLane: "external-handoff",
      permissionFamilies: [],
      handoffDescriptor: createHandoffDescriptor(platform, sourceFamily, "handoff-only"),
      reasons: [reason(`platform-capability.${sourceFamily}`, `${sourceFamily} node is preserved as an external handoff descriptor.`)]
    };
  }

  return {
    ...base,
    primaryClassification: "executable",
    executionLane: "local-scheduler",
    permissionFamilies: [],
    handoffDescriptor: null,
    reasons: [reason(`platform-capability.${sourceFamily}`, `${sourceFamily} node is eligible for reviewed local scheduler planning.`)]
  };
}

function inferSourceFamily(platform, node) {
  const type = `${node.type ?? ""} ${node.platformType ?? ""}`.toLowerCase();
  const providers = safeList(node.providerRequirements).join(" ").toLowerCase();
  if (node.trigger && /webhook|http/iu.test(type)) return "network-trigger";
  if (node.trigger) return "trigger";
  if (/executecommand|shell|process|exec\b|command/iu.test(type)) return "shell-process";
  if (/\bcode\b|functionitem|function|javascript|python/iu.test(type)) return "code";
  if (/docker|container|kubernetes|image/iu.test(type)) return "container";
  if (/npm|pip|package|dependency|requirements|pyproject/iu.test(type) || /package-reference|remote-reference/iu.test(providers)) return "package-manager";
  if (/browser|cookie|session|localstorage|indexeddb/iu.test(type)) return "browser-data";
  if (/\benv\b|environment|dotenv/iu.test(type) || /environment/iu.test(providers)) return "ambient-environment";
  if (/download|imported-workflow|remote-workflow/iu.test(type)) return "downloaded-workflow";
  if (/file|filesystem|readfile|writefile|storage/iu.test(type)) return "filesystem";
  if (/external.?effect|side.?effect|mutation|write-api/iu.test(type)) return "external-effect";
  if (/httprequest|http|api|webhook/iu.test(type)) return "http-api";
  if (/llm|model|chat|completion|embedding/iu.test(type) || providers.length > 0 && platform === "dify") {
    return providers.includes("unknown") ? "unknown-provider" : "model-provider";
  }
  if (/tool|connector|provider|slack|github|notion|email/iu.test(type)) return providers.includes("unknown") ? "unknown-provider" : "tool-provider";
  if (/subflow|workflow-call|execute-workflow|executeworkflow/iu.test(type)) return "subflow";
  if (/human|approval|review/iu.test(type)) return "human-approval";
  if (/retry|wait|delay|loop|iteration/iu.test(type)) return "retry-control";
  if (platform === "langgraph" || /entrypoint|external-runtime|graph-entrypoint/iu.test(type)) return "external-runtime";
  if (/unknown|unsupported/iu.test(type) || providers.includes("unknown")) return "unknown-provider";
  return "data-transform";
}

function isLocalExecutableFamily(sourceFamily) {
  return sourceFamily === "trigger" || sourceFamily === "data-transform" || sourceFamily === "retry-control";
}

function summarizeNodeClassifications(nodes) {
  const counts = {
    nodes: nodes.length,
    executable: 0,
    permissionRequired: 0,
    blocked: 0,
    handoffOnly: 0,
    sourceFamilies: [...new Set(nodes.map((node) => node.sourceFamily))].sort(),
    permissionFamilies: [...new Set(nodes.flatMap((node) => node.permissionFamilies))].sort(),
    handoffDescriptors: nodes.filter((node) => node.handoffDescriptor).length,
    signedAdapterLanes: nodes.filter((node) => node.executionLane === "signed-adapter-review").length
  };
  for (const node of nodes) {
    if (!primaryClassifications.has(node.primaryClassification)) {
      counts.blocked += 1;
    } else if (node.primaryClassification === "permission-required") {
      counts.permissionRequired += 1;
    } else if (node.primaryClassification === "handoff-only") {
      counts.handoffOnly += 1;
    } else {
      counts[node.primaryClassification] += 1;
    }
  }
  return counts;
}

function summarizeMatrixRows(nodes) {
  const groups = new Map();
  for (const node of nodes) {
    const key = `${node.platform}:${node.sourceFamily}:${node.primaryClassification}:${node.executionLane}`;
    const current = groups.get(key) ?? {
      platform: node.platform,
      sourceFamily: node.sourceFamily,
      primaryClassification: node.primaryClassification,
      executionLane: node.executionLane,
      nodes: 0,
      permissionFamilies: new Set(),
      reasons: new Set()
    };
    current.nodes += 1;
    node.permissionFamilies.forEach((family) => current.permissionFamilies.add(family));
    node.reasons.forEach((entry) => current.reasons.add(entry.code));
    groups.set(key, current);
  }
  return [...groups.values()]
    .map((row) => ({
      platform: row.platform,
      sourceFamily: row.sourceFamily,
      primaryClassification: row.primaryClassification,
      executionLane: row.executionLane,
      nodes: row.nodes,
      permissionFamilies: [...row.permissionFamilies].sort(),
      reasons: [...row.reasons].sort()
    }))
    .sort((left, right) => `${left.platform}:${left.sourceFamily}`.localeCompare(`${right.platform}:${right.sourceFamily}`));
}

function createFamilyCoverageIntake() {
  return {
    ok: true,
    schemaVersion: platformAdapterIntakeSchemaVersion,
    platform: "n8n",
    decision: "accepted",
    source: {
      platformLabel: "n8n",
      format: "json",
      version: "coverage",
      name: "capability coverage",
      preserved: { originalNodeIds: [], originalEdgeIds: [], unsupportedKeys: [] }
    },
    boundary: createBoundary(),
    summary: { nodes: 20, edges: 0, credentialReferences: 1, expressions: 0, triggers: 1, unsupportedMetadata: 0, blockedFindings: 0 },
    nodes: [
      fixtureNode("manual", "n8n-nodes-base.manualTrigger", { trigger: true }),
      fixtureNode("set", "n8n-nodes-base.set"),
      fixtureNode("credentialed", "n8n-nodes-base.set", { credentials: [{ kind: "api", ref: "redacted:vault-reference" }] }),
      fixtureNode("model", "dify.llm", { providerRequirements: ["openai"] }),
      fixtureNode("http", "n8n-nodes-base.httpRequest"),
      fixtureNode("file", "n8n-nodes-base.readWriteFile"),
      fixtureNode("code", "n8n-nodes-base.code"),
      fixtureNode("shell", "n8n-nodes-base.executeCommand"),
      fixtureNode("package", "n8n-nodes-base.packageManager"),
      fixtureNode("container", "n8n-nodes-base.docker"),
      fixtureNode("browser", "n8n-nodes-base.browserSession"),
      fixtureNode("env", "n8n-nodes-base.environment"),
      fixtureNode("download", "n8n-nodes-base.downloadedWorkflow"),
      fixtureNode("tool", "dify.tool"),
      fixtureNode("subflow", "n8n-nodes-base.executeWorkflow"),
      fixtureNode("approval", "n8n-nodes-base.humanApproval"),
      fixtureNode("retry", "n8n-nodes-base.retry"),
      fixtureNode("external", "langgraph-entrypoint"),
      fixtureNode("unknown", "n8n-nodes-base.unknownProvider", { providerRequirements: ["unknown_vendor"] }),
      fixtureNode("effect", "n8n-nodes-base.externalEffect")
    ],
    edges: [],
    unsupported: [],
    errors: []
  };
}

function fixtureNode(id, type, overrides = {}) {
  return {
    id,
    originalId: id,
    label: id,
    type,
    platformType: type,
    classification: "handoff-only",
    trigger: false,
    position: null,
    credentials: [],
    expressions: [],
    providerRequirements: [],
    unsupportedMetadata: [],
    ...overrides
  };
}

function validateIntake(intake) {
  if (!intake || typeof intake !== "object") {
    return { ok: false, platform: "unknown", errors: [issue("platform-capability.invalid-input", "Platform intake must be an object.")] };
  }
  const platform = safeText(intake.platform || "unknown");
  if (intake.schemaVersion !== platformAdapterIntakeSchemaVersion) {
    return { ok: false, platform, errors: [issue("platform-capability.invalid-schema", "Platform intake schema is unsupported.")] };
  }
  if (!supportedPlatforms.has(platform)) {
    return { ok: false, platform, errors: [issue("platform-capability.unsupported-platform", "Platform capability classifier does not support this platform.")] };
  }
  if (!Array.isArray(intake.nodes)) {
    return { ok: false, platform, errors: [issue("platform-capability.invalid-nodes", "Platform intake nodes must be an array.")] };
  }
  return { ok: true, platform, errors: [] };
}

function failedMatrix(platform, errors, options = {}) {
  const report = {
    ok: false,
    schemaVersion: platformCapabilityMatrixSchemaVersion,
    platform: safeText(platform || "unknown"),
    decision: "blocked",
    boundary: createBoundary(),
    summary: {
      nodes: 0,
      executable: 0,
      permissionRequired: 0,
      blocked: 0,
      handoffOnly: 0,
      sourceFamilies: [],
      permissionFamilies: [],
      handoffDescriptors: 0,
      signedAdapterLanes: 0
    },
    matrixRows: [],
    nodeClassifications: [],
    errors
  };
  assertPlatformCapabilityOutputSafe(report, options);
  return cloneFreeze(report);
}

function createHandoffDescriptor(platform, sourceFamily, mode) {
  return {
    kind: `${platform}:${sourceFamily}`,
    mode,
    reviewOnly: true,
    localExecutionAllowed: false
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
    noBrowserDataRead: true,
    noEnvironmentRead: true,
    noCredentialRead: true,
    grantsRuntimeCompatibility: false
  };
}

function safePlatformType(value) {
  const text = safeText(value);
  return commandLikePattern.test(text) || unsafePathPattern.test(text) ? "redacted:platform-type" : text;
}

function safeList(values) {
  return stableUnique(Array.isArray(values) ? values.map((value) => safeText(value)) : []);
}

function stableUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function safeText(value) {
  return redactText(String(value ?? "").replace(/\s+/gu, " ").trim()).slice(0, 160);
}

function reason(code, message) {
  return { code, message: redactText(message) };
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
