import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const secondaryWorkflowFormatCompatibilitySchemaVersion = "agentique.secondaryWorkflowFormatCompatibility.v1";

const fixedNow = "2026-06-13T00:00:00.000Z";
const firstClassImportFormats = Object.freeze(["n8n", "dify", "langgraph"]);
const requiredCandidateIds = Object.freeze([
  "node-red",
  "serverless-workflow",
  "argo-workflows",
  "flowise",
  "langflow",
  "github-actions",
  "airflow",
  "bpmn",
  "haystack",
  "kestra",
  "autogen",
  "llamaindex-workflows",
  "crewai"
]);
const requiredRowFields = Object.freeze([
  "id",
  "label",
  "expectedInputFormat",
  "schemaAvailability",
  "importValue",
  "riskLevel",
  "executionRisk",
  "localExecutableSubset",
  "handoffTarget",
  "requiredDependencies",
  "securityConstraints",
  "fixtureFeasibility",
  "sourceReferences",
  "decision",
  "decisionRationale"
]);
const unsafePathPattern = /(?<![A-Za-z])(?:[A-Za-z]:[\\/]|\\\\)|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|\/(?:home|Users|mnt)\//iu;
const privateMarkerPattern = new RegExp([
  ["\\.", "planning"].join(""),
  ["reference", "docs"].join("\\/"),
  ["AUI", "EXEC"].join("-"),
  ["road", "map"].join("")
].join("|"), "iu");
const commandLikePattern = /\b(?:execSync|spawnSync|execFileSync|spawn\s*\(|exec\s*\(|curl\s+[-\w]*\s*https?:|wget\s+[-\w]*\s*https?:|powershell|pwsh|cmd\.exe|bash\s+-c|npm\s+(?:install|run)|npx\s+[\w@./-]+|node\s+[\w./-]+\.(?:js|mjs|cjs)|python\s+[\w./-]+\.py|pip\s+install|docker\s+run|podman\s+run|package\.json|requirements\.txt|pyproject\.toml|Dockerfile)\b/iu;
const supportClaimKeys = new Set([
  "supportedImport",
  "earlySupportPromise",
  "exposedInUi",
  "adapterImplemented",
  "lossReports",
  "capabilityMapping",
  "publicSafeFixtures",
  "localExecutionEnabled",
  "startsRuntime",
  "startsBridge",
  "automaticExecution",
  "hostedRuntime",
  "universalRuntime"
]);

export function createSecondaryWorkflowFormatCompatibilityBacklog({ now = fixedNow } = {}) {
  const candidates = createCandidates();
  const output = {
    schemaVersion: secondaryWorkflowFormatCompatibilitySchemaVersion,
    generatedAt: now,
    status: "backlog-review-ready",
    boundary: createBoundary(),
    firstClassImportFormats,
    promotionCriteria: createPromotionCriteria(),
    candidates,
    summary: {
      candidates: candidates.length,
      backlogOnly: candidates.filter((row) => row.supportState === "backlog-reference-only").length,
      goDecisions: candidates.filter((row) => row.decision === "go").length,
      noGoDecisions: candidates.filter((row) => row.decision === "no-go-for-early-support").length,
      highRisk: candidates.filter((row) => row.riskLevel === "high").length,
      mediumRisk: candidates.filter((row) => row.riskLevel === "medium").length,
      lowRisk: candidates.filter((row) => row.riskLevel === "low").length,
      exposedSupportedImports: candidates.filter((row) => row.exposedInUi).length
    }
  };
  assertSecondaryWorkflowFormatCompatibilitySafe(output);
  return freeze(output);
}

export function reviewSecondaryWorkflowFormatCompatibilityGate() {
  const backlog = createSecondaryWorkflowFormatCompatibilityBacklog();
  const candidateIds = new Set(backlog.candidates.map((row) => row.id));
  const requiredCandidatesCovered = requiredCandidateIds.every((id) => candidateIds.has(id));
  const rowsComplete = backlog.candidates.every((row) => requiredRowFields.every((field) => hasValue(row[field])));
  const sourceReferencesPresent = backlog.candidates.every((row) => Array.isArray(row.sourceReferences) && row.sourceReferences.length >= 1);
  const riskLevelsPresent = backlog.candidates.every((row) => ["low", "medium", "high"].includes(row.riskLevel));
  const backlogOnly = backlog.candidates.every((row) => row.supportState === "backlog-reference-only" && row.decision === "no-go-for-early-support");
  const noUiSupportExposure = backlog.candidates.every((row) => row.exposedInUi === false && row.supportedImport === false && row.earlySupportPromise === false);
  const promotionEvidenceClosed = backlog.candidates.every((row) => (
    row.promotionEvidence.adapterTests === false &&
    row.promotionEvidence.lossReports === false &&
    row.promotionEvidence.capabilityMapping === false &&
    row.promotionEvidence.publicSafeFixtures === false
  ));
  const firstClassOnly = backlog.firstClassImportFormats.join(",") === "n8n,dify,langgraph";
  const criteriaComplete = backlog.promotionCriteria.length >= 5 &&
    backlog.promotionCriteria.includes("adapter tests") &&
    backlog.promotionCriteria.includes("loss report mapping") &&
    backlog.promotionCriteria.includes("capability classification") &&
    backlog.promotionCriteria.includes("public-safe fixtures") &&
    backlog.promotionCriteria.includes("UI exposure review");
  const boundaryClosed = backlog.boundary.backlogOnly === true &&
    backlog.boundary.noSupportedImportClaim === true &&
    backlog.boundary.noExecution === true &&
    backlog.boundary.noRuntimeStart === true &&
    backlog.boundary.grantsRuntimeCompatibility === false;
  const ok = backlog.schemaVersion === secondaryWorkflowFormatCompatibilitySchemaVersion &&
    requiredCandidatesCovered &&
    rowsComplete &&
    sourceReferencesPresent &&
    riskLevelsPresent &&
    backlogOnly &&
    noUiSupportExposure &&
    promotionEvidenceClosed &&
    firstClassOnly &&
    criteriaComplete &&
    boundaryClosed;

  return freeze({
    schemaVersion: "agentique.secondaryWorkflowFormatCompatibilityReview.v1",
    ok,
    checks: {
      requiredCandidatesCovered,
      rowsComplete,
      sourceReferencesPresent,
      riskLevelsPresent,
      backlogOnly,
      noUiSupportExposure,
      promotionEvidenceClosed,
      firstClassOnly,
      criteriaComplete,
      boundaryClosed
    },
    summary: backlog.summary,
    errors: ok ? [] : [issue("secondary-format-compatibility.review", "Secondary workflow format compatibility review failed.")]
  });
}

export function assertSecondaryWorkflowFormatCompatibilitySafe(value) {
  assertNoInlineSecrets(value);
  const text = JSON.stringify(value ?? {});
  if (unsafePathPattern.test(text)) {
    throw issue("secondary-format-compatibility.unsafe-path", "Secondary format compatibility output contains a local or traversal path.");
  }
  if (privateMarkerPattern.test(text)) {
    throw issue("secondary-format-compatibility.private-marker", "Secondary format compatibility output contains internal-only planning material.");
  }
  if (commandLikePattern.test(text)) {
    throw issue("secondary-format-compatibility.command-text", "Secondary format compatibility output must not contain executable command text.");
  }
  rejectSupportClaims(value);
  return true;
}

function createCandidates() {
  return [
    candidate({
      id: "node-red",
      label: "Node-RED",
      expectedInputFormat: "flow JSON export",
      schemaAvailability: "documented flow JSON conventions; node palette schemas vary",
      importValue: "Useful for visual event flows and wiring conventions.",
      riskLevel: "high",
      executionRisk: "Node palette packages may perform network, filesystem, shell, and credentialed side effects.",
      localExecutableSubset: "none until node palette classification, credential mapping, and fixture conformance exist",
      handoffTarget: "user-owned Node-RED runtime descriptor",
      requiredDependencies: ["Node-RED runtime", "node palette registry", "credential storage model"],
      securityConstraints: ["block package lifecycle execution", "classify every node by side effect", "redact credentials and environment references"],
      fixtureFeasibility: "medium",
      sourceReferences: ["Node-RED import and export user guide", "Node-RED flow JSON concepts"],
      decisionRationale: "High import value, but custom node packages make early support unsafe without adapter and fixture gates."
    }),
    candidate({
      id: "serverless-workflow",
      label: "Serverless Workflow",
      expectedInputFormat: "JSON or YAML workflow definition",
      schemaAvailability: "published specification and schema artifacts",
      importValue: "Strong portable state-machine concepts and event-driven flow metadata.",
      riskLevel: "medium",
      executionRisk: "Actions can target services, events, functions, and external providers.",
      localExecutableSubset: "static graph and state transition review only until function/action mapping exists",
      handoffTarget: "serverless platform descriptor",
      requiredDependencies: ["specification version selection", "function/action catalog", "event model mapping"],
      securityConstraints: ["block service invocation", "require provider handoff descriptors", "preserve versioned schema provenance"],
      fixtureFeasibility: "high",
      sourceReferences: ["Serverless Workflow specification", "Serverless Workflow schema documentation"],
      decisionRationale: "Good schema basis, but function and event execution semantics require a separate adapter gate."
    }),
    candidate({
      id: "argo-workflows",
      label: "Argo Workflows",
      expectedInputFormat: "Kubernetes workflow YAML",
      schemaAvailability: "Kubernetes custom resource definitions and Argo documentation",
      importValue: "Useful for DAG and step templates plus artifact dependency modeling.",
      riskLevel: "high",
      executionRisk: "Container, cluster, secret, volume, and service-account semantics are high impact.",
      localExecutableSubset: "none until container and cluster resource policies are modeled as handoff-only",
      handoffTarget: "user-owned Kubernetes or Argo runtime descriptor",
      requiredDependencies: ["Argo workflow CRD", "Kubernetes resource model", "container image trust policy"],
      securityConstraints: ["block container start", "block cluster access", "require image digest and permission review"],
      fixtureFeasibility: "medium",
      sourceReferences: ["Argo Workflows concepts", "Argo workflow specification examples"],
      decisionRationale: "Valuable DAG concepts, but cluster execution and container trust must remain outside early support."
    }),
    candidate({
      id: "flowise",
      label: "Flowise",
      expectedInputFormat: "chatflow JSON export",
      schemaAvailability: "public project export format with evolving node catalog",
      importValue: "Useful for LLM chain and tool graph comparison with Dify and LangGraph.",
      riskLevel: "high",
      executionRisk: "Nodes can call providers, tools, vector stores, loaders, and credentials.",
      localExecutableSubset: "static graph review only until node catalog and provider mapping exist",
      handoffTarget: "user-owned Flowise runtime descriptor",
      requiredDependencies: ["Flowise chatflow export", "node catalog mapping", "provider credential classification"],
      securityConstraints: ["block provider calls", "redact credential references", "classify loaders and tools as handoff-only"],
      fixtureFeasibility: "medium",
      sourceReferences: ["Flowise chatflow documentation", "Flowise import and export concepts"],
      decisionRationale: "Adjacent to first-class LLM workflows, but provider/tool surface is too broad for early support."
    }),
    candidate({
      id: "langflow",
      label: "Langflow",
      expectedInputFormat: "flow JSON export",
      schemaAvailability: "public flow export format with component catalog",
      importValue: "Useful for component-level LLM pipeline graphs.",
      riskLevel: "high",
      executionRisk: "Components can invoke models, tools, vector stores, file loaders, and custom code.",
      localExecutableSubset: "static graph review only until component capability mapping exists",
      handoffTarget: "user-owned Langflow runtime descriptor",
      requiredDependencies: ["Langflow export", "component catalog mapping", "provider dependency map"],
      securityConstraints: ["block custom components", "block provider calls", "redact local data and credential references"],
      fixtureFeasibility: "medium",
      sourceReferences: ["Langflow flow documentation", "Langflow component concepts"],
      decisionRationale: "Useful LLM graph surface, but custom components and provider dependencies require later gates."
    }),
    candidate({
      id: "github-actions",
      label: "GitHub Actions",
      expectedInputFormat: "workflow YAML",
      schemaAvailability: "documented workflow syntax",
      importValue: "Useful for trigger, job, dependency, matrix, and artifact flow analysis.",
      riskLevel: "high",
      executionRisk: "Workflow steps can run arbitrary actions, scripts, secrets, package managers, and deployment tasks.",
      localExecutableSubset: "static job graph and permission review only",
      handoffTarget: "user-owned CI runtime descriptor",
      requiredDependencies: ["workflow syntax model", "action reference classifier", "permissions and secrets model"],
      securityConstraints: ["block arbitrary steps", "block secret material", "classify third-party actions as external handoff"],
      fixtureFeasibility: "high",
      sourceReferences: ["GitHub Actions workflow syntax", "GitHub Actions permissions model"],
      decisionRationale: "Good YAML structure, but arbitrary action and script execution must stay out of early import support."
    }),
    candidate({
      id: "airflow",
      label: "Apache Airflow",
      expectedInputFormat: "DAG definitions and optional serialized DAG metadata",
      schemaAvailability: "public DAG concepts; source definitions are commonly code-first",
      importValue: "Useful for DAG scheduling, operator taxonomy, and retry semantics.",
      riskLevel: "high",
      executionRisk: "Operators may run code, containers, cloud jobs, databases, and credentials.",
      localExecutableSubset: "none until operator families can be statically classified",
      handoffTarget: "user-owned Airflow deployment descriptor",
      requiredDependencies: ["operator catalog", "DAG serialization policy", "connection and variable model"],
      securityConstraints: ["block operator execution", "redact connections", "require static-only parser boundary"],
      fixtureFeasibility: "low",
      sourceReferences: ["Apache Airflow DAG authoring concepts", "Apache Airflow operator concepts"],
      decisionRationale: "Important scheduler reference, but code-first DAGs and operators make safe import expensive."
    }),
    candidate({
      id: "bpmn",
      label: "BPMN",
      expectedInputFormat: "BPMN XML",
      schemaAvailability: "OMG BPMN specification and XML schema family",
      importValue: "Useful for business process diagrams, events, gateways, and human tasks.",
      riskLevel: "medium",
      executionRisk: "Executable extensions vary by engine and can call services or scripts.",
      localExecutableSubset: "diagram and process graph review only",
      handoffTarget: "BPMN engine descriptor",
      requiredDependencies: ["BPMN XML parser", "engine extension policy", "service task classifier"],
      securityConstraints: ["ignore engine extensions until classified", "treat service and script tasks as handoff-only", "preserve diagrams without execution"],
      fixtureFeasibility: "high",
      sourceReferences: ["OMG BPMN specification", "BPMN XML schema concepts"],
      decisionRationale: "Strong interchange format, but executable engine extensions need a later safety gate."
    }),
    candidate({
      id: "haystack",
      label: "Haystack",
      expectedInputFormat: "pipeline YAML or Python-defined pipeline metadata",
      schemaAvailability: "public pipeline component documentation",
      importValue: "Useful for retrieval pipeline and component dependency mapping.",
      riskLevel: "high",
      executionRisk: "Components can call models, retrievers, databases, file converters, and custom code.",
      localExecutableSubset: "static pipeline graph review only",
      handoffTarget: "user-owned Haystack runtime descriptor",
      requiredDependencies: ["component catalog", "pipeline serialization policy", "provider dependency map"],
      securityConstraints: ["block model and retriever calls", "block file loaders until scanned", "redact provider credentials"],
      fixtureFeasibility: "medium",
      sourceReferences: ["Haystack pipeline documentation", "Haystack component concepts"],
      decisionRationale: "Useful AI pipeline model, but execution often depends on providers and source-defined components."
    }),
    candidate({
      id: "kestra",
      label: "Kestra",
      expectedInputFormat: "flow YAML",
      schemaAvailability: "public flow and task documentation",
      importValue: "Useful for workflow orchestration and task dependency concepts.",
      riskLevel: "high",
      executionRisk: "Tasks can invoke plugins, scripts, containers, files, secrets, and external services.",
      localExecutableSubset: "static flow graph review only",
      handoffTarget: "user-owned Kestra runtime descriptor",
      requiredDependencies: ["Kestra flow schema", "plugin catalog mapping", "secret and namespace policy"],
      securityConstraints: ["block plugin execution", "block container/script tasks", "redact secret references"],
      fixtureFeasibility: "medium",
      sourceReferences: ["Kestra flow documentation", "Kestra task and plugin concepts"],
      decisionRationale: "Good orchestration format, but plugin execution surface must be modeled before import support."
    }),
    candidate({
      id: "autogen",
      label: "AutoGen",
      expectedInputFormat: "agent/team definitions and code-first workflows",
      schemaAvailability: "public agent framework documentation; workflow data shape varies",
      importValue: "Useful for multi-agent conversation and tool orchestration concepts.",
      riskLevel: "high",
      executionRisk: "Agents can run tools, code executors, model calls, and external services.",
      localExecutableSubset: "none until agent and tool declarations are represented as safe descriptors",
      handoffTarget: "user-owned AutoGen runtime descriptor",
      requiredDependencies: ["agent declaration format", "tool capability classifier", "model/provider dependency map"],
      securityConstraints: ["block code executors", "block tool calls", "redact model and provider credentials"],
      fixtureFeasibility: "low",
      sourceReferences: ["AutoGen agent framework documentation", "AutoGen tool and team concepts"],
      decisionRationale: "Important multi-agent reference, but code-first workflows are not safe as early import support."
    }),
    candidate({
      id: "llamaindex-workflows",
      label: "LlamaIndex Workflows",
      expectedInputFormat: "workflow definitions and code-first event flows",
      schemaAvailability: "public workflow documentation; source definitions are commonly code-first",
      importValue: "Useful for event-driven AI workflow concepts.",
      riskLevel: "high",
      executionRisk: "Workflow steps can call tools, models, indexes, files, and services.",
      localExecutableSubset: "none until workflow events and steps can be statically described",
      handoffTarget: "user-owned LlamaIndex runtime descriptor",
      requiredDependencies: ["workflow event model", "step capability classifier", "index and provider dependency map"],
      securityConstraints: ["block step execution", "block provider calls", "redact index and credential references"],
      fixtureFeasibility: "low",
      sourceReferences: ["LlamaIndex workflow documentation", "LlamaIndex event and step concepts"],
      decisionRationale: "Relevant workflow model, but code-first semantics require a later descriptor format."
    }),
    candidate({
      id: "crewai",
      label: "CrewAI",
      expectedInputFormat: "crew, agent, task, and flow definitions",
      schemaAvailability: "public framework documentation; definitions can be YAML or code-first",
      importValue: "Useful for task delegation and multi-agent role modeling.",
      riskLevel: "high",
      executionRisk: "Agents can call tools, models, memory, files, and external services.",
      localExecutableSubset: "static role and task graph review only after descriptor schema is chosen",
      handoffTarget: "user-owned CrewAI runtime descriptor",
      requiredDependencies: ["crew/task declaration model", "tool capability classifier", "provider dependency map"],
      securityConstraints: ["block tool execution", "block provider calls", "redact memory and credential references"],
      fixtureFeasibility: "low",
      sourceReferences: ["CrewAI agents and tasks documentation", "CrewAI flows concepts"],
      decisionRationale: "Useful agent-task model, but tool and memory boundaries require later adapter work."
    })
  ];
}

function candidate(input) {
  const row = {
    ...input,
    supportState: "backlog-reference-only",
    decision: "no-go-for-early-support",
    supportedImport: false,
    earlySupportPromise: false,
    exposedInUi: false,
    promotionEvidence: {
      adapterTests: false,
      lossReports: false,
      capabilityMapping: false,
      publicSafeFixtures: false
    }
  };
  return sanitizeRow(row);
}

function sanitizeRow(row) {
  return {
    id: safeToken(row.id),
    label: safeText(row.label),
    expectedInputFormat: safeText(row.expectedInputFormat),
    schemaAvailability: safeText(row.schemaAvailability),
    importValue: safeText(row.importValue),
    riskLevel: safeText(row.riskLevel),
    executionRisk: safeText(row.executionRisk),
    localExecutableSubset: safeText(row.localExecutableSubset),
    handoffTarget: safeText(row.handoffTarget),
    requiredDependencies: safeList(row.requiredDependencies),
    securityConstraints: safeList(row.securityConstraints),
    fixtureFeasibility: safeText(row.fixtureFeasibility),
    sourceReferences: safeList(row.sourceReferences),
    decision: safeText(row.decision),
    decisionRationale: safeText(row.decisionRationale),
    supportState: safeText(row.supportState),
    supportedImport: row.supportedImport === true,
    earlySupportPromise: row.earlySupportPromise === true,
    exposedInUi: row.exposedInUi === true,
    promotionEvidence: {
      adapterTests: row.promotionEvidence?.adapterTests === true,
      lossReports: row.promotionEvidence?.lossReports === true,
      capabilityMapping: row.promotionEvidence?.capabilityMapping === true,
      publicSafeFixtures: row.promotionEvidence?.publicSafeFixtures === true
    }
  };
}

function createPromotionCriteria() {
  return [
    "adapter tests",
    "loss report mapping",
    "capability classification",
    "public-safe fixtures",
    "UI exposure review",
    "public boundary validation",
    "full validation pass"
  ];
}

function createBoundary() {
  return {
    backlogOnly: true,
    referenceOnly: true,
    noSupportedImportClaim: true,
    noEarlySupportPromise: true,
    noExecution: true,
    noRuntimeStart: true,
    noBridgeStart: true,
    noNetwork: true,
    noFilesystemRead: true,
    noFilesystemWrite: true,
    noDependencyInstall: true,
    noCredentialRead: true,
    noEnvironmentRead: true,
    noBrowserDataRead: true,
    grantsRuntimeCompatibility: false
  };
}

function rejectSupportClaims(value, path = "value") {
  if (value == null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (supportClaimKeys.has(key) && nested === true) {
      throw issue("secondary-format-compatibility.support-claim", `${nestedPath} enables unsupported secondary-format support.`);
    }
    rejectSupportClaims(nested, nestedPath);
  }
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function safeList(values) {
  return Array.isArray(values) ? [...new Set(values.map(safeText).filter(Boolean))].sort() : [];
}

function safeText(value) {
  return redactText(String(value ?? "").replace(/\s+/gu, " ").trim())
    .replace(unsafePathPattern, "redacted:sensitive-path")
    .slice(0, 260);
}

function safeToken(value) {
  return safeText(value).toLowerCase().replace(/[^a-z0-9._:-]/gu, "-").replace(/-+/gu, "-").slice(0, 96) || "format";
}

function issue(code, message) {
  const error = new Error(redactText(message));
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
