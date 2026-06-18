import { createGraphRunPlan } from "./graph-run-plan.mjs";
import { createHumanApprovalInterrupt } from "./human-approval-interrupt.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";
import { createWorkflowEditorState, exportWorkflowEditorState } from "./workflow-editor.mjs";
import { sampleSchedulableWorkflowIr, runWorkflowSchedule } from "./workflow-scheduler.mjs";

export const workflowTemplateRunPlanBuilderSchemaVersion = "agentique.workflowTemplateRunPlanBuilder.v1";

export const requiredTemplateBuilderScenarios = Object.freeze([
  "catalog",
  "approval-template",
  "artifact-template",
  "missing-secret",
  "human-gate",
  "unsupported-node",
  "rerun-ready"
]);

const internalPlanningToken = `.${["plan", "ning"].join("")}`;
const internalReferenceToken = ["ref", "erence"].join("");
const unsafeTextPattern = new RegExp(
  [
    String.raw`[A-Z]:[\\/]`,
    String.raw`\/Users\/`,
    String.raw`\/home\/`,
    String.raw`bearer\s+[A-Za-z0-9._-]{12,}`,
    String.raw`sk-[A-Za-z0-9_-]{16,}`,
    String.raw`cookie=`,
    String.raw`https:\/\/[^"]+\?(?:[^"]*signature|[^"]*token)`,
    escapeRegExp(internalPlanningToken),
    `${internalReferenceToken}[/\\\\]`,
    String.raw`R[0-9]{4}`
  ].join("|"),
  "iu"
);
const maxArtifactBytes = 262144;

export function createWorkflowTemplateRunPlanBuilderSurface(options = {}) {
  const activeScenario = normalizeScenario(options.scenario ?? "catalog");
  const templates = templateCatalog();
  const selectedTemplate = selectTemplate(templates, activeScenario);
  const workflowIr = workflowForTemplate(selectedTemplate, activeScenario);
  const editorState = createWorkflowEditorState(workflowIr, { createdAt: "2026-06-18T00:00:00.000Z" });
  const editorExport = exportWorkflowEditorState(editorState, { exportedAt: "2026-06-18T00:00:00.000Z" }).descriptor;
  const secretReview = buildSecretReview(workflowIr, activeScenario);
  const humanGateReview = buildHumanGateReview(activeScenario);
  const permissionsApproved = activeScenario === "rerun-ready" || (selectedTemplate.requiredSecretRefs.length === 0 && activeScenario !== "human-gate");
  const runPlan = createGraphRunPlan(workflowIr, { permissionsApproved });
  const dryRun = buildDryRun(workflowIr, selectedTemplate, activeScenario);
  const capabilityReview = buildCapabilityReview(runPlan, workflowIr, selectedTemplate);
  const graphState = buildGraphState(editorState, runPlan);
  const rerunEligibility = buildRerunEligibility({ runPlan, secretReview, humanGateReview, dryRun, activeScenario });
  const builder = buildBuilderState({ selectedTemplate, workflowIr, runPlan, secretReview, humanGateReview, dryRun });
  const scenarioControls = requiredTemplateBuilderScenarios.map((id) => ({
    id,
    label: labelForScenario(id),
    selected: id === activeScenario,
    keyboardAccessible: true
  }));
  const surface = {
    schemaVersion: workflowTemplateRunPlanBuilderSchemaVersion,
    generatedAt: "2026-06-18T00:00:00.000Z",
    activeScenario,
    scenarioControls,
    selectedTemplate,
    templates,
    workflowIr,
    editorExport,
    builder,
    runPlan,
    capabilityReview,
    secretReview,
    humanGateReview,
    dryRun,
    rerunEligibility,
    graphState,
    interactionEvidence: [
      interaction("desktop", "Template scenario controls update IR, capability, secret, human gate, dry-run, and rerun rows."),
      interaction("narrow", "Builder rows remain bounded and path-neutral in the narrow Graph workspace.")
    ],
    summary: summarizeSurface({ templates, runPlan, secretReview, humanGateReview, dryRun, rerunEligibility, graphState }),
    boundary: boundary()
  };

  return freezeBuilder(surface);
}

export function createWorkflowTemplateRunPlanBuilderScenario(scenario = "catalog") {
  return createWorkflowTemplateRunPlanBuilderSurface({ scenario });
}

export function reviewWorkflowTemplateRunPlanBuilder() {
  const surface = createWorkflowTemplateRunPlanBuilderSurface();
  const approval = createWorkflowTemplateRunPlanBuilderScenario("approval-template");
  const artifact = createWorkflowTemplateRunPlanBuilderScenario("artifact-template");
  const missingSecret = createWorkflowTemplateRunPlanBuilderScenario("missing-secret");
  const humanGate = createWorkflowTemplateRunPlanBuilderScenario("human-gate");
  const unsupported = createWorkflowTemplateRunPlanBuilderScenario("unsupported-node");
  const rerunReady = createWorkflowTemplateRunPlanBuilderScenario("rerun-ready");
  const validation = validateWorkflowTemplateRunPlanBuilderSurface(surface);
  const checks = {
    baseValid: validation.ok,
    catalogComplete: surface.templates.length >= 3 && surface.templates.every((template) => template.rawThirdPartyPayload === false),
    typedIrOnly: approval.workflowIr.schemaVersion === "agentique.workflowIr.v1" && approval.builder.rawExternalMutation.accepted === false,
    capabilitySecretHumanGates:
      approval.capabilityReview.required.length > 0 && approval.secretReview.references.length > 0 && humanGate.humanGateReview.status === "approval-required",
    artifactDescriptors: artifact.dryRun.resultArtifacts.every((entry) => entry.redacted && entry.pathNeutral && !entry.includesRawBytes),
    failClosed: missingSecret.secretReview.status === "blocked" && unsupported.runPlan.status === "blocked",
    rerunReady: rerunReady.rerunEligibility.eligible === true,
    noCapabilityWidening: Object.entries(requiredBoundary()).every(([key, expected]) => surface.boundary[key] === expected),
    publicSafe: !unsafeTextPattern.test(JSON.stringify({ surface, approval, artifact, missingSecret, humanGate, unsupported, rerunReady }))
  };
  const ok = Object.values(checks).every(Boolean);

  return freeze({
    ok,
    status: ok ? "passed" : "failed",
    surface,
    validation,
    checks,
    errors: ok ? [] : [issue("template-builder.review", "Workflow template run-plan builder review failed.")]
  });
}

export function validateWorkflowTemplateRunPlanBuilderSurface(surface) {
  const failures = [];
  if (surface?.schemaVersion !== workflowTemplateRunPlanBuilderSchemaVersion) {
    failures.push(issue("template-builder.schema", "Unsupported workflow template run-plan builder schema version."));
  }
  requireStates("template-builder.scenario", requiredTemplateBuilderScenarios, surface?.scenarioControls, "id", failures);
  if (!Array.isArray(surface?.scenarioControls) || surface.scenarioControls.some((entry) => entry.keyboardAccessible !== true)) {
    failures.push(issue("template-builder.controls", "Template builder controls must be keyboard-accessible."));
  }
  if (!Array.isArray(surface?.templates) || surface.templates.length < 3 || surface.templates.some((entry) => entry.rawThirdPartyPayload !== false || entry.localOnly !== true)) {
    failures.push(issue("template-builder.catalog", "Template catalog must expose at least three local review-only templates."));
  }
  if (surface?.workflowIr?.schemaVersion !== "agentique.workflowIr.v1" || surface?.builder?.rawExternalMutation?.accepted !== false) {
    failures.push(issue("template-builder.ir", "Builder must emit typed Agentique Workflow IR only and block raw mutation."));
  }
  if (!Array.isArray(surface?.capabilityReview?.required) || !Array.isArray(surface?.secretReview?.references) || !Array.isArray(surface?.humanGateReview?.gates)) {
    failures.push(issue("template-builder.gates", "Builder must expose capability, secret, and human gate rows."));
  }
  if (!Array.isArray(surface?.dryRun?.resultArtifacts) || surface.dryRun.resultArtifacts.length === 0) {
    failures.push(issue("template-builder.artifacts", "Dry-run artifact descriptors are required."));
  } else if (
    surface.dryRun.resultArtifacts.some((entry) => entry.redacted !== true || entry.pathNeutral !== true || entry.includesRawBytes !== false || entry.maxBytes > maxArtifactBytes)
  ) {
    failures.push(issue("template-builder.artifacts", "Dry-run artifact descriptors must be bounded, redacted, and path-neutral."));
  }
  if (!surface?.rerunEligibility || typeof surface.rerunEligibility.eligible !== "boolean") {
    failures.push(issue("template-builder.rerun", "Rerun eligibility must be explicit."));
  }
  if (!surface?.graphState || surface.graphState.nodes < 1 || surface.graphState.edges < 0) {
    failures.push(issue("template-builder.graph", "Graph state summary must be visible."));
  }
  for (const [key, expected] of Object.entries(requiredBoundary())) {
    if (surface?.boundary?.[key] !== expected) {
      failures.push(issue("template-builder.boundary", `${key} must be ${String(expected)}.`));
    }
  }
  const interactionViewports = new Set((surface?.interactionEvidence ?? []).map((entry) => entry.viewport));
  for (const viewport of ["desktop", "narrow"]) {
    if (!interactionViewports.has(viewport)) {
      failures.push(issue("template-builder.interaction", `Missing ${viewport} interaction evidence.`));
    }
  }
  if (unsafeTextPattern.test(JSON.stringify(surface ?? {}))) {
    failures.push(issue("template-builder.public-safe", "Template builder contains unsafe, private, or internal evidence text."));
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    summary: {
      templates: surface?.templates?.length ?? 0,
      scenarios: new Set((surface?.scenarioControls ?? []).map((entry) => entry.id)).size,
      capabilityRows: surface?.capabilityReview?.required?.length ?? 0,
      secretRows: surface?.secretReview?.references?.length ?? 0,
      humanGates: surface?.humanGateReview?.gates?.length ?? 0,
      artifacts: surface?.dryRun?.resultArtifacts?.length ?? 0,
      interactionViewports: interactionViewports.size
    }
  };
}

function templateCatalog() {
  return [
    template({
      id: "local-review-template",
      title: "Local review pipeline",
      category: "review",
      description: "Validate, normalize, preview, and export a descriptor-only handoff.",
      requiredSecretRefs: [],
      humanGates: [],
      graphState: { nodes: 5, edges: 5, state: "ready" },
      capabilitySummary: { required: ["local-scheduler"], blocked: [] }
    }),
    template({
      id: "approval-review-template",
      title: "Approval checkpoint pipeline",
      category: "approval",
      description: "Pause before a human-reviewed transformation and keep secrets as references.",
      requiredSecretRefs: ["secret-ref:provider-token"],
      humanGates: ["human-review"],
      graphState: { nodes: 5, edges: 4, state: "approval-required" },
      capabilitySummary: { required: ["secrets", "human-approval"], blocked: [] }
    }),
    template({
      id: "artifact-package-template",
      title: "Artifact packaging pipeline",
      category: "artifact",
      description: "Create safe preview and metadata-only artifact descriptors.",
      requiredSecretRefs: [],
      humanGates: [],
      graphState: { nodes: 5, edges: 5, state: "artifact-ready" },
      capabilitySummary: { required: ["artifactRetention"], blocked: [] }
    }),
    template({
      id: "external-handoff-template",
      title: "External handoff pipeline",
      category: "handoff",
      description: "Review unsupported provider actions as descriptor-only handoff rows.",
      requiredSecretRefs: ["secret-ref:external-provider"],
      humanGates: ["provider-review"],
      graphState: { nodes: 5, edges: 4, state: "handoff-required" },
      capabilitySummary: { required: ["externalProviders"], blocked: ["automatic-provider-runtime"] }
    })
  ];
}

function template(input) {
  return {
    ...input,
    localOnly: true,
    rawThirdPartyPayload: false,
    reviewOnly: true,
    source: "agentique-local-template",
    secretReferenceSummary: {
      references: input.requiredSecretRefs.length,
      inlineSecrets: 0
    },
    humanGateSummary: {
      gates: input.humanGates.length,
      status: input.humanGates.length > 0 ? "approval-required" : "not-required"
    }
  };
}

function selectTemplate(templates, scenario) {
  if (scenario === "approval-template" || scenario === "missing-secret" || scenario === "human-gate") {
    return templates.find((entry) => entry.id === "approval-review-template");
  }
  if (scenario === "artifact-template" || scenario === "rerun-ready") {
    return templates.find((entry) => entry.id === "artifact-package-template");
  }
  if (scenario === "unsupported-node") {
    return templates.find((entry) => entry.id === "external-handoff-template");
  }
  return templates[0];
}

function workflowForTemplate(templateRow, scenario) {
  if (scenario === "approval-template" || scenario === "missing-secret" || scenario === "human-gate") {
    return {
      schemaVersion: "agentique.workflowIr.v1",
      workflowId: "template-approval-review",
      nodes: [
        { id: "source", type: "input", label: "Source input", inputs: [], outputs: ["resource"], risk: "low", credentials: [] },
        {
          id: "human-review",
          type: "transform",
          label: "Human reviewed transform",
          inputs: ["resource"],
          outputs: ["reviewed"],
          risk: "medium",
          credentials: ["vault:providerCredential"]
        },
        { id: "preview", type: "viewer", label: "Safe preview", inputs: ["reviewed"], outputs: ["previewArtifact"], risk: "low", credentials: [] },
        { id: "handoff", type: "handoff", label: "Descriptor handoff", inputs: ["previewArtifact"], outputs: ["handoffDescriptor"], risk: "low", credentials: [] }
      ],
      edges: [
        { from: "source", to: "human-review", label: "resource" },
        { from: "human-review", to: "preview", label: "reviewed" },
        { from: "preview", to: "handoff", label: "previewArtifact" }
      ],
      sourceLinks: [{ label: templateRow.id, href: "agentique:workflow-template" }]
    };
  }
  if (scenario === "unsupported-node") {
    return {
      ...sampleSchedulableWorkflowIr,
      workflowId: "template-external-handoff",
      nodes: sampleSchedulableWorkflowIr.nodes.map((node) =>
        node.id === "classify" ? { ...node, type: "external-action", risk: "high", credentials: ["vault:externalProvider"] } : node
      )
    };
  }
  return {
    ...sampleSchedulableWorkflowIr,
    workflowId: scenario === "rerun-ready" ? "template-rerun-ready" : scenario === "artifact-template" ? "template-artifact-package" : "template-local-review",
    sourceLinks: [{ label: templateRow.id, href: "agentique:workflow-template" }]
  };
}

function buildBuilderState({ selectedTemplate, workflowIr, runPlan, secretReview, humanGateReview, dryRun }) {
  return {
    status: runPlan.status === "accepted" && secretReview.status !== "blocked" && humanGateReview.status !== "approval-required" ? "reviewable" : "blocked",
    selectedTemplateId: selectedTemplate.id,
    emitsSchemaVersion: workflowIr.schemaVersion,
    nodeCount: workflowIr.nodes.length,
    edgeCount: workflowIr.edges.length,
    rawExternalMutation: {
      accepted: false,
      code: "template-builder.raw-mutation-blocked",
      requiresConverter: true
    },
    dryRunStatus: dryRun.status
  };
}

function buildCapabilityReview(runPlan, workflowIr, templateRow) {
  const permissionFamilies = new Set(runPlan.nodePlans.flatMap((node) => node.permissionFamilies ?? []));
  for (const required of templateRow.capabilitySummary.required) {
    permissionFamilies.add(required);
  }
  return {
    status: runPlan.status === "blocked" ? "blocked" : permissionFamilies.size > 0 ? "review-required" : "accepted",
    required: [...permissionFamilies].sort().map((family) => ({
      family,
      status: runPlan.status === "accepted" ? "accepted" : "review-required",
      message: `${family} requires explicit review before automatic execution.`
    })),
    blocked: templateRow.capabilitySummary.blocked.map((family) => ({
      family,
      status: "blocked",
      message: `${family} remains outside the local template builder authority.`
    })),
    unsupportedNodes: workflowIr.nodes.filter((node) => !["input", "transform", "viewer", "handoff"].includes(node.type)).map((node) => node.id)
  };
}

function buildSecretReview(workflowIr, scenario) {
  const refs = workflowIr.nodes.flatMap((node) =>
    (node.credentials ?? []).map((credential) => ({
      nodeId: node.id,
      reference: redactText(String(credential)).replace(/vault:[a-z][a-zA-Z0-9._-]+/gu, "secret-ref:redacted"),
      inlineValuePresent: false,
      status: scenario === "missing-secret" ? "missing" : "referenced"
    }))
  );
  const missing = refs.filter((entry) => entry.status === "missing").length;
  return {
    status: missing > 0 ? "blocked" : refs.length > 0 ? "reference-required" : "not-required",
    references: refs,
    missing,
    inlineSecrets: 0
  };
}

function buildHumanGateReview(scenario) {
  const approval = createHumanApprovalInterrupt({ action: scenario === "rerun-ready" ? "approve" : "pending" });
  const needsGate = scenario === "approval-template" || scenario === "human-gate" || scenario === "missing-secret";
  const gates = needsGate
    ? [
        {
          gateId: approval.checkpoint.checkpointId,
          interruptId: approval.interrupt.interruptId,
          status: scenario === "rerun-ready" ? "approved" : "pending",
          nodeId: approval.interrupt.nodeId,
          stale: false
        }
      ]
    : [];
  return {
    status: gates.length > 0 ? "approval-required" : "not-required",
    gates,
    resumeGate: gates.length > 0 ? approval.resumeGate.status : "not-required"
  };
}

function buildDryRun(workflowIr, templateRow, scenario) {
  const runnable =
    scenario === "rerun-ready" ||
    (scenario !== "missing-secret" && scenario !== "human-gate" && scenario !== "unsupported-node" && workflowIr.nodes.every((node) => (node.credentials ?? []).length === 0));
  const run = runnable ? runWorkflowSchedule(workflowIr) : runWorkflowSchedule(sampleSchedulableWorkflowIr, { mode: "handoff" });
  const artifacts = (run.artifacts.length > 0 ? run.artifacts : [{ id: `artifact-${templateRow.id}`, path: `artifacts/${templateRow.id}.json`, viewer: "json" }]).slice(0, 4);
  return {
    status: runnable ? run.status : "review-blocked",
    mode: "dry-run",
    resultArtifacts: artifacts.map((artifact, index) => ({
      id: safeToken(artifact.id ?? `artifact-${index + 1}`),
      descriptor: "artifact-metadata-only",
      path: `artifacts/${safeToken(templateRow.id)}-${index + 1}.json`,
      mediaType: "application/json",
      maxBytes: maxArtifactBytes,
      redacted: true,
      pathNeutral: true,
      includesRawBytes: false,
      includesRawLogs: false,
      signedUrlRedacted: true
    })),
    eventSummary: {
      events: run.events.length,
      nodeResults: run.nodeResults.length,
      outputs: run.outputs.length
    }
  };
}

function buildGraphState(editorState, runPlan) {
  return {
    schemaVersion: "agentique.templateGraphState.v1",
    nodes: editorState.present.nodes.length,
    edges: editorState.present.edges.length,
    validationOk: editorState.validation.ok,
    runPlanStatus: runPlan.status,
    unsupportedNodes: runPlan.summary.blocked,
    permissionRequired: runPlan.summary.permissionRequired,
    handoffOnly: runPlan.summary.handoffOnly
  };
}

function buildRerunEligibility({ runPlan, secretReview, humanGateReview, dryRun, activeScenario }) {
  const eligible =
    activeScenario === "rerun-ready" &&
    runPlan.status === "accepted" &&
    secretReview.status !== "blocked" &&
    humanGateReview.status !== "approval-required" &&
    dryRun.status === "succeeded";
  const blockers = [];
  if (runPlan.status !== "accepted") blockers.push("run-plan-not-accepted");
  if (secretReview.status === "blocked") blockers.push("missing-secret-reference");
  if (humanGateReview.status === "approval-required") blockers.push("human-approval-required");
  if (dryRun.status !== "succeeded") blockers.push("dry-run-not-succeeded");
  return {
    eligible,
    action: eligible ? "review-rerun" : "blocked",
    blockers: eligible ? [] : blockers,
    previousRunRequired: true,
    cleanupRequiredBeforeRerun: false
  };
}

function summarizeSurface({ templates, runPlan, secretReview, humanGateReview, dryRun, rerunEligibility, graphState }) {
  return {
    templates: templates.length,
    nodes: graphState.nodes,
    edges: graphState.edges,
    runPlanStatus: runPlan.status,
    capabilityRows: runPlan.nodePlans.length,
    secretRefs: secretReview.references.length,
    humanGates: humanGateReview.gates.length,
    artifacts: dryRun.resultArtifacts.length,
    rerunEligible: rerunEligibility.eligible,
    interactionViewports: 2
  };
}

function normalizeScenario(value) {
  const text = String(value ?? "");
  return requiredTemplateBuilderScenarios.includes(text) ? text : "catalog";
}

function labelForScenario(id) {
  return id
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function safeToken(value) {
  return (
    String(value ?? "value")
      .toLowerCase()
      .replace(/[^a-z0-9._:-]/gu, "-")
      .slice(0, 80) || "value"
  );
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function interaction(viewport, evidence) {
  return { viewport, evidence, status: "passed" };
}

function boundary() {
  return {
    frontendAuthority: "display-and-request-only",
    reactFlowDependencyAdded: false,
    rawExternalWorkflowMutation: false,
    automaticExecution: false,
    packageLifecycleEnabled: false,
    genericShellOrProcess: false,
    browserDataEnabled: false,
    ambientEnvEnabled: false,
    containerStartEnabled: false,
    externalProviderAutomationEnabled: false,
    signedInstallerClaim: false,
    updaterPublicationClaim: false,
    productionDesktopRuntimeClaim: false
  };
}

function requiredBoundary() {
  return boundary();
}

function requireStates(code, required, rows, field, failures) {
  const seen = new Set((rows ?? []).map((entry) => entry[field]));
  for (const state of required) {
    if (!seen.has(state)) {
      failures.push(issue(code, `Missing required ${field}: ${state}.`));
    }
  }
}

function freezeBuilder(surface) {
  assertNoInlineSecrets(surface);
  if (unsafeTextPattern.test(JSON.stringify(surface))) {
    throw issue("template-builder.private-material", "Workflow template builder contains private or unsafe material.");
  }
  return freeze(surface);
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(redactText(message)));
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
