import { createGraphRunPlan } from "./graph-run-plan.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";
import { sampleWorkflowIr } from "./workflow-ir.mjs";

export const externalHandoffDescriptorsSchemaVersion = "agentique.externalHandoffDescriptors.v1";

const fixedNow = "2026-06-13T00:00:00.000Z";
const handoffClassifications = new Set(["blocked", "handoff-only", "permission-required"]);
const unsafeEvidencePattern = /(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|vault:[a-z][a-zA-Z0-9._-]{2,80}|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|cookie=|\b(?:spawn|exec)(?:\s|$)|\b(?:curl|powershell|bash|sh|cmd|npm\s+run|node\s+|python\s+|npx\s+|docker\s+|podman\s+)/iu;

/**
 * @param {{ runPlan?: any, localRun?: any, eventStream?: any, now?: string }} [input]
 */
export function createExternalHandoffDescriptors({
  runPlan = createGraphRunPlan(sampleWorkflowIr, { permissionsApproved: true }),
  localRun = null,
  eventStream = null,
  destinationScenario = "safe-user-owned",
  now = fixedNow
} = {}) {
  const normalizedRunPlan = normalizeRunPlan(runPlan);
  const destinationReview = destinationReviewFor(destinationScenario);
  const descriptors = normalizedRunPlan.nodePlans
    .filter((node) => handoffClassifications.has(node.classification))
    .map((node, index) => descriptorFor(node, index, normalizedRunPlan, localRun, eventStream, destinationReview, now));
  const output = {
    schemaVersion: externalHandoffDescriptorsSchemaVersion,
    generatedAt: now,
    workflowId: normalizedRunPlan.workflowId,
    status: descriptors.length > 0 ? "handoff-review-required" : "no-handoff-required",
    descriptors,
    destinationReview,
    summary: summarize(descriptors, normalizedRunPlan),
    bridgeBoundary: {
      descriptorOnly: true,
      startsBridge: false,
      startsRuntime: false,
      makesNetworkRequest: false,
      writesFiles: false,
      browserDataAccess: false,
      ambientEnvironment: false,
      requiresSeparateBridgeGate: true
    },
    rollback: {
      reversible: true,
      cleanupReceiptRequired: true,
      removes: ["external handoff descriptor", "temporary review note"]
    }
  };
  assertExternalHandoffDescriptorsSafe(output);
  return freeze(output);
}

export function reviewExternalHandoffDescriptorGate() {
  const blockedPlan = createGraphRunPlan(sampleWorkflowIr, { permissionsApproved: true });
  const blocked = createExternalHandoffDescriptors({ runPlan: blockedPlan });
  const permissionRequired = createExternalHandoffDescriptors({
    runPlan: createGraphRunPlan({
      ...sampleWorkflowIr,
      nodes: sampleWorkflowIr.nodes.map((node) => (
        node.id === "verify" ? { ...node, credentials: ["vault:providerCredential"] } : node
      ))
    })
  });
  const constrainedDestination = createExternalHandoffDescriptors({
    runPlan: createGraphRunPlan(sampleWorkflowIr, { permissionsApproved: true }),
    destinationScenario: "localhost-deeplink"
  });
  const unknownClient = createExternalHandoffDescriptors({
    runPlan: createGraphRunPlan(sampleWorkflowIr, { permissionsApproved: true }),
    destinationScenario: "unknown-client"
  });
  const unsafePayload = createExternalHandoffDescriptors({
    runPlan: createGraphRunPlan(sampleWorkflowIr, { permissionsApproved: true }),
    destinationScenario: "unsafe-payload"
  });
  const handoffOnly = blocked.descriptors.find((descriptor) => descriptor.classification === "handoff-only");
  const provider = blocked.descriptors.find((descriptor) => descriptor.nodeId === "provider-sync");
  const ok = blocked.schemaVersion === externalHandoffDescriptorsSchemaVersion &&
    blocked.status === "handoff-review-required" &&
    blocked.summary.descriptors >= 2 &&
    provider?.targetCategory === "provider-or-external-effect" &&
    provider?.descriptor.startsBridge === false &&
    provider?.descriptor.startsRuntime === false &&
    handoffOnly?.targetCategory === "descriptor-export" &&
    permissionRequired.descriptors.some((descriptor) => descriptor.classification === "permission-required") &&
    blocked.bridgeBoundary.browserDataAccess === false &&
    blocked.descriptors.every((descriptor) => descriptor.destinationPolicy.requiresExplicitUserAction === true && descriptor.destinationPolicy.automaticOpen === false) &&
    constrainedDestination.destinationReview.localhost.allowedHosts.includes("127.0.0.1") &&
    constrainedDestination.destinationReview.localhost.startsServer === false &&
    constrainedDestination.destinationReview.deepLink.opensAutomatically === false &&
    unknownClient.destinationReview.client.status === "blocked" &&
    unsafePayload.destinationReview.payload.status === "blocked" &&
    blocked.destinationReview.clientCloseout.ready === true &&
    blocked.destinationReview.cleanup.ready === true &&
    blocked.destinationReview.payload.credentialsForwarded === false &&
    blocked.destinationReview.payload.browserCookiesForwarded === false &&
    !unsafeEvidencePattern.test(JSON.stringify({ blocked, permissionRequired, constrainedDestination, unknownClient, unsafePayload }));

  return freeze({
    schemaVersion: "agentique.externalHandoffDescriptorReview.v1",
    ok,
    checks: {
      descriptorRows: blocked.summary.descriptors,
      blockedRows: blocked.summary.blocked,
      handoffOnlyRows: blocked.summary.handoffOnly,
      permissionRows: permissionRequired.summary.permissionRequired,
      bridgeDisabled: blocked.bridgeBoundary.startsBridge === false,
      userOwnedDestinationPolicy: blocked.descriptors.every(
        (descriptor) =>
          descriptor.destinationPolicy.requiresExplicitUserAction === true &&
          descriptor.destinationPolicy.allowedDestinations.includes("user-owned-client") &&
          descriptor.destinationPolicy.allowedDestinations.includes("export-folder")
      ),
      localhostDeepLinkConstrained:
        constrainedDestination.destinationReview.localhost.allowed === true &&
        constrainedDestination.destinationReview.localhost.startsServer === false &&
        constrainedDestination.destinationReview.deepLink.allowed === true &&
        constrainedDestination.destinationReview.deepLink.opensAutomatically === false,
      unknownClientsBlocked: unknownClient.destinationReview.client.status === "blocked" && unknownClient.summary.blockedDestinations > 0,
      unsafePayloadsBlocked: unsafePayload.destinationReview.payload.status === "blocked" && unsafePayload.summary.blockedDestinations > 0,
      cleanupReadiness: blocked.destinationReview.clientCloseout.ready === true && blocked.destinationReview.cleanup.ready === true,
      credentialAndBrowserDataDenied: blocked.destinationReview.payload.credentialsForwarded === false && blocked.destinationReview.payload.browserCookiesForwarded === false
    },
    errors: ok ? [] : [issue("external-handoff.review", "External handoff descriptor review failed.")]
  });
}

export function assertExternalHandoffDescriptorsSafe(value) {
  assertNoInlineSecrets(value);
  const text = JSON.stringify(value ?? {});
  const unsafeMatch = text.match(unsafeEvidencePattern);
  if (unsafeMatch) {
    throw issue("external-handoff.unsafe-output", "External handoff descriptor contains unsafe material.");
  }
  if (text.includes([".", "planning"].join("")) || text.includes(["reference", "docs"].join("/"))) {
    throw issue("external-handoff.private-marker", "External handoff descriptor contains private planning material.");
  }
  return true;
}

function descriptorFor(node, index, runPlan, localRun, eventStream, destinationReview, now) {
  const reasons = Array.isArray(node.reasons) ? node.reasons.map(normalizeReason) : [];
  const destinationPolicy = destinationPolicyFor(node, destinationReview);
  return {
    id: `external-handoff-${safeToken(runPlan.workflowId)}-${String(index + 1).padStart(2, "0")}-${safeToken(node.id)}`,
    nodeId: safeText(node.id),
    nodeLabel: safeText(node.label),
    nodeType: safeText(node.type),
    classification: safeText(node.classification),
    targetCategory: targetCategoryFor(node, reasons),
    sourcePlatform: node.sourcePlatform ? safeText(node.sourcePlatform) : "agentique",
    sourceFamily: node.sourceFamily ? safeText(node.sourceFamily) : sourceFamilyFor(node),
    requiredBoundary: boundaryFor(node),
    descriptor: {
      descriptorOnly: true,
      reviewOnly: true,
      localExecutionAllowed: false,
      startsBridge: false,
      startsRuntime: false,
      makesNetworkRequest: false,
      writesFiles: false,
      supportMode: "external-handoff",
      bridgeClaim: "disabled-by-guard"
    },
    destinationPolicy,
    userAction: explicitUserActionFor(destinationPolicy),
    reasons,
    partialEvidence: partialEvidenceFor(node, localRun, eventStream),
    userActions: userActionsFor(node),
    completion: {
      clientCloseoutReady: destinationReview.clientCloseout.ready,
      cleanupReady: destinationReview.cleanup.ready,
      cleanupReceiptRequired: destinationReview.cleanup.receiptRequired,
      completedByApp: false
    },
    cleanup: {
      reversible: true,
      receiptRequired: true,
      removes: ["descriptor review note", "temporary handoff mapping"]
    },
    createdAt: now
  };
}

function normalizeRunPlan(runPlan) {
  if (!runPlan || typeof runPlan !== "object") {
    return createGraphRunPlan(sampleWorkflowIr, { permissionsApproved: true });
  }
  return runPlan;
}

function targetCategoryFor(node, reasons) {
  const text = `${node.type} ${node.sourceFamily ?? ""} ${reasons.map((reason) => reason.code).join(" ")}`.toLowerCase();
  if (node.classification === "permission-required") return "credential-or-provider-review";
  if (node.classification === "handoff-only") return "descriptor-export";
  if (/provider|credential|external|network|high-risk/u.test(text)) return "provider-or-external-effect";
  return "unsupported-runtime-boundary";
}

function sourceFamilyFor(node) {
  if (node.type === "handoff") return "descriptor-handoff";
  if (node.credentialRefs > 0) return "credentialed-node";
  if (node.risk === "high" || /external|provider|network/iu.test(String(node.type))) return "external-effect";
  return "unsupported-node";
}

function boundaryFor(node) {
  if (node.classification === "permission-required") {
    return "scoped-permission-review-or-external-handoff";
  }
  if (node.classification === "handoff-only") {
    return "external-runtime-descriptor";
  }
  return "blocked-local-execution";
}

function destinationReviewFor(scenario) {
  const normalizedScenario = ["safe-user-owned", "localhost-deeplink", "unknown-client", "unsafe-payload"].includes(scenario) ? scenario : "safe-user-owned";
  const clientBlocked = normalizedScenario === "unknown-client";
  const payloadBlocked = normalizedScenario === "unsafe-payload";
  return {
    schemaVersion: "agentique.externalHandoffDestinationReview.v1",
    scenario: normalizedScenario,
    client: {
      status: clientBlocked ? "blocked" : "reviewable",
      reason: clientBlocked ? "unknown-client" : "user-owned-client",
      userOwnedRequired: true,
      automaticLaunch: false,
      appOpensClient: false
    },
    exportFolder: {
      status: "reviewable",
      reason: "export-folder",
      userSelected: true,
      writesFilesFromApp: false,
      automaticOpen: false
    },
    localhost: {
      allowed: normalizedScenario === "localhost-deeplink",
      allowedHosts: ["127.0.0.1", "localhost"],
      startsServer: false,
      makesNetworkRequest: false,
      requiresExplicitUserAction: true
    },
    deepLink: {
      allowed: normalizedScenario === "localhost-deeplink",
      allowedSchemes: ["agentique-client"],
      opensAutomatically: false,
      carriesCredentials: false,
      requiresExplicitUserAction: true
    },
    payload: {
      status: payloadBlocked ? "blocked" : "reviewable",
      reason: payloadBlocked ? "unsafe-payload" : "descriptor-only-payload",
      descriptorOnly: true,
      executableBridge: false,
      credentialsForwarded: false,
      browserCookiesForwarded: false,
      browserProfileForwarded: false,
      ambientEnvironmentForwarded: false
    },
    clientCloseout: {
      ready: true,
      requiresUserClose: true,
      appTerminatesClient: false
    },
    cleanup: {
      ready: true,
      receiptRequired: true,
      descriptorsCleanable: true
    }
  };
}

function destinationPolicyFor(node, destinationReview) {
  const blocked = destinationReview.client.status === "blocked" || destinationReview.payload.status === "blocked";
  return {
    status: blocked ? "blocked" : "reviewable",
    reason: blocked ? `${destinationReview.client.reason}:${destinationReview.payload.reason}` : targetCategoryFor(node, []),
    requiresExplicitUserAction: true,
    automaticOpen: false,
    allowedDestinations: ["user-owned-client", "export-folder"],
    userOwnedClient: {
      status: destinationReview.client.status,
      appOpensClient: false,
      automaticLaunch: false
    },
    exportFolder: {
      status: destinationReview.exportFolder.status,
      writesFilesFromApp: false,
      automaticOpen: false,
      userSelected: true
    },
    localhost: {
      allowed: destinationReview.localhost.allowed,
      allowedHosts: destinationReview.localhost.allowedHosts,
      startsServer: false
    },
    deepLink: {
      allowed: destinationReview.deepLink.allowed,
      allowedSchemes: destinationReview.deepLink.allowedSchemes,
      opensAutomatically: false
    }
  };
}

function explicitUserActionFor(destinationPolicy) {
  return {
    required: true,
    intent: "review-export-or-open-user-owned-client",
    automaticBridgeExecution: false,
    automaticOpen: false,
    exportOnly: true,
    destinationStatus: destinationPolicy.status
  };
}

function partialEvidenceFor(node, localRun, eventStream) {
  const nodeResults = Array.isArray(localRun?.nodeResults) ? localRun.nodeResults : [];
  const directResult = nodeResults.find((result) => result.nodeId === node.id) ?? null;
  const successful = nodeResults.filter((result) => result.status === "succeeded");
  const dependencyRows = Array.isArray(eventStream?.dependencyChains) ? eventStream.dependencyChains : [];
  return {
    linkedRunId: safeText(localRun?.runId ?? eventStream?.runId ?? "not-started"),
    localRunStatus: safeText(localRun?.status ?? eventStream?.status ?? "not-started"),
    nodeLocalStatus: directResult ? safeText(directResult.status) : "not-local",
    upstreamCompleted: successful.length,
    skippedDependencies: dependencyRows.filter((entry) => entry.status === "skipped").length,
    artifactDescriptors: Array.isArray(localRun?.artifacts) ? localRun.artifacts.slice(0, 3).map(safeText) : [],
    eventCursor: eventStream?.activeSample?.cursor ? safeText(eventStream.activeSample.cursor) : null
  };
}

function userActionsFor(node) {
  if (node.classification === "permission-required") {
    return [
      "Review scoped permission requirement.",
      "Choose explicit permission review or external runtime handoff.",
      "Keep values referenced through a secure vault."
    ];
  }
  return [
    "Review local blocker reason.",
    "Choose a user-owned external runtime outside this UI.",
    "Map required values through that runtime's secure vault.",
    "Return a redacted result artifact for review."
  ];
}

function summarize(descriptors, runPlan) {
  return {
    workflowId: safeText(runPlan.workflowId ?? "workflow"),
    descriptors: descriptors.length,
    blocked: descriptors.filter((descriptor) => descriptor.classification === "blocked").length,
    handoffOnly: descriptors.filter((descriptor) => descriptor.classification === "handoff-only").length,
    permissionRequired: descriptors.filter((descriptor) => descriptor.classification === "permission-required").length,
    bridgeStarts: descriptors.filter((descriptor) => descriptor.descriptor.startsBridge).length,
    runtimeStarts: descriptors.filter((descriptor) => descriptor.descriptor.startsRuntime).length,
    partialRunLinks: descriptors.filter((descriptor) => descriptor.partialEvidence.linkedRunId !== "not-started").length,
    blockedDestinations: descriptors.filter((descriptor) => descriptor.destinationPolicy.status === "blocked").length,
    explicitUserActions: descriptors.filter((descriptor) => descriptor.userAction.required === true).length
  };
}

function normalizeReason(reason) {
  return {
    code: safeText(reason?.code ?? "external-handoff.reason"),
    message: safeText(reason?.message ?? reason?.reason ?? "External handoff review is required.")
  };
}

function safeToken(value) {
  return String(value ?? "value").toLowerCase().replace(/[^a-z0-9._:-]/gu, "-").replace(/-+/gu, "-").slice(0, 80) || "value";
}

function safeText(value) {
  return redactText(String(value ?? "").replace(/\s+/gu, " ").trim())
    .replace(unsafeEvidencePattern, "redacted:sensitive-evidence")
    .slice(0, 220);
}

function issue(code, message) {
  const error = new Error(safeText(message));
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
