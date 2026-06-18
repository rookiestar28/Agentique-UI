import { createGraphRunPlan } from "./graph-run-plan.mjs";
import {
  parseDifyDslYaml,
  parseLangGraphManifest,
  parseN8nWorkflowJson,
  sampleDifyDslYaml,
  sampleLangGraphManifest,
  sampleN8nWorkflowJson
} from "./platform-format-adapter.mjs";
import { normalizePlatformIntakeToWorkflowIr } from "./platform-ir-normalizer.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const sourceRoundTripHandoffSchemaVersion = "agentique.sourceRoundTripHandoff.v1";

const fixedNow = "2026-06-13T00:00:00.000Z";
const lossyStatuses = new Set(["degraded", "blocked", "handoff-only"]);
const handoffClassifications = new Set(["permission-required", "blocked", "handoff-only"]);
const unsafePathPattern = /(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|\/(?:home|Users|mnt)\/|vault:[a-z][a-zA-Z0-9._-]{2,80}/iu;
const privateReferencePattern = new RegExp(`${escapeRegExp([".", "planning"].join(""))}|${escapeRegExp(["reference", "docs"].join("/"))}`, "iu");
const commandLikePattern = /\b(?:execSync|spawnSync|execFileSync|subprocess\.(?:run|popen|call)|ProcessBuilder|docker\s+run|curl\s+[-\w]*\s*https?:|wget\s+[-\w]*\s*https?:|powershell|pwsh|cmd\.exe|bash\s+-c|npm\s+(?:install|run)|npx\s+[\w@./-]+|node\s+[\w./-]+\.(?:js|mjs|cjs)|python\s+[\w./-]+\.py|pip\s+install|package\.json|requirements\.txt|pyproject\.toml|Dockerfile)\b/iu;

export function createSourceRoundTripHandoff({
  intakes = null,
  normalizations = null,
  now = fixedNow
} = {}) {
  const intakeRows = Array.isArray(intakes) && intakes.length > 0 ? intakes.map(clone) : createDefaultIntakes();
  const normalizationRows = Array.isArray(normalizations) && normalizations.length === intakeRows.length
    ? normalizations.map(clone)
    : intakeRows.map((intake) => normalizePlatformIntakeToWorkflowIr(intake));
  const exports = intakeRows.map((intake, index) => exportDescriptorFor(intake, normalizationRows[index], index, now));
  const output = {
    schemaVersion: sourceRoundTripHandoffSchemaVersion,
    generatedAt: now,
    status: exports.length > 0 && exports.every((entry) => entry.readyForReview) ? "round-trip-review-ready" : "round-trip-review-blocked",
    boundary: createBoundary(),
    summary: summarizeExports(exports),
    exports,
    sourcePlatformHandoffs: exports.flatMap((entry) => entry.handoffDescriptors),
    rollback: {
      reversible: true,
      removes: ["source export descriptor", "platform handoff metadata"],
      restores: "original source envelope and loss report review state"
    }
  };
  assertSourceRoundTripHandoffSafe(output);
  return freeze(output);
}

export function reviewSourceRoundTripHandoffGate() {
  const review = createSourceRoundTripHandoff();
  const lossyCovered = review.exports.every((entry) => {
    const lossyTotal = entry.agentiqueMetadata.lossReport.degraded +
      entry.agentiqueMetadata.lossReport.blocked +
      entry.agentiqueMetadata.lossReport.handoffOnly;
    return lossyTotal === 0 || entry.lossEntries.length > 0;
  });
  const ok = review.schemaVersion === sourceRoundTripHandoffSchemaVersion &&
    review.status === "round-trip-review-ready" &&
    review.summary.platforms === 3 &&
    review.summary.sourceFilesPreserved === 3 &&
    review.summary.sourceMapEntries >= 3 &&
    review.summary.handoffNeeds > 0 &&
    review.summary.localExecutableNodes > 0 &&
    lossyCovered &&
    review.boundary.noBridgeStart === true &&
    review.boundary.noRuntimeStart === true &&
    !unsafePathPattern.test(JSON.stringify(review)) &&
    !commandLikePattern.test(JSON.stringify(review));

  return freeze({
    schemaVersion: "agentique.sourceRoundTripHandoffReview.v1",
    ok,
    checks: {
      platforms: review.summary.platforms,
      sourceFilesPreserved: review.summary.sourceFilesPreserved,
      sourceMapEntries: review.summary.sourceMapEntries,
      lossEntries: review.summary.lossEntries,
      localExecutableNodes: review.summary.localExecutableNodes,
      blockedNodes: review.summary.blockedNodes,
      handoffNeeds: review.summary.handoffNeeds,
      permissionFamilies: review.summary.permissionFamilies.length,
      bridgeDisabled: review.boundary.noBridgeStart === true
    },
    errors: ok ? [] : [issue("source-roundtrip.review", "Source round-trip handoff review failed.")]
  });
}

export function assertSourceRoundTripHandoffSafe(value) {
  assertNoInlineSecrets(value);
  const text = JSON.stringify(value ?? {});
  if (unsafePathPattern.test(text)) {
    throw issue("source-roundtrip.unsafe-path", "Source round-trip descriptor contains local, traversal, or vault material.");
  }
  if (privateReferencePattern.test(text)) {
    throw issue("source-roundtrip.private-marker", "Source round-trip descriptor contains private planning material.");
  }
  if (commandLikePattern.test(text)) {
    throw issue("source-roundtrip.command-text", "Source round-trip descriptor contains executable command text.");
  }
  rejectExecutableClaims(value);
  rejectRawSourcePayload(value);
  return true;
}

function exportDescriptorFor(intake, normalization, index, now) {
  const safeIntake = normalizeIntake(intake);
  const safeNormalization = normalizeNormalization(normalization);
  const runPlan = safeNormalization.workflowIr ? createGraphRunPlan(safeNormalization.workflowIr) : null;
  const sourceMapNodes = Array.isArray(safeNormalization.sourceMap?.nodes) ? safeNormalization.sourceMap.nodes : [];
  const sourceMapEdges = Array.isArray(safeNormalization.sourceMap?.edges) ? safeNormalization.sourceMap.edges : [];
  const lossEntries = lossEntriesFor(safeNormalization.lossReport);
  const handoffDescriptors = handoffDescriptorsFor(safeIntake, safeNormalization, runPlan);
  const capabilitySummary = safeNormalization.capabilityMatrix?.summary ?? {};
  const lossSummary = safeNormalization.lossReport?.summary ?? emptyLossSummary();

  return {
    id: `source-roundtrip-${safeToken(safeIntake.platform)}-${String(index + 1).padStart(2, "0")}`,
    platform: safeText(safeIntake.platform),
    readyForReview: safeIntake.ok === true && safeNormalization.workflowIr != null,
    sourceFile: {
      emitsOriginalSourceFile: true,
      retainedOriginal: true,
      rawBytesEmbedded: false,
      format: safeText(safeIntake.source?.format ?? "unknown"),
      sourceIdentity: stableSourceIdentity(safeIntake),
      sourceName: safeText(safeIntake.source?.name ?? "source workflow"),
      sourceVersion: safeText(safeIntake.source?.version ?? "unknown"),
      unsupportedSemanticsRewritten: false
    },
    sourceEnvelope: {
      platformLabel: safeText(safeIntake.source?.platformLabel ?? safeIntake.platform),
      originalNodeIds: safeList(safeIntake.source?.preserved?.originalNodeIds),
      originalEdgeIds: safeList(safeIntake.source?.preserved?.originalEdgeIds),
      unsupportedKeys: safeList(safeIntake.source?.preserved?.unsupportedKeys),
      sourceMapNodes: sourceMapNodes.length,
      sourceMapEdges: sourceMapEdges.length
    },
    agentiqueMetadata: {
      workflowId: safeText(safeNormalization.workflowIr?.workflowId ?? "not-normalized"),
      workflowIrSchema: safeText(safeNormalization.workflowIr?.schemaVersion ?? "not-normalized"),
      lossReportSchema: safeText(safeNormalization.lossReport?.schemaVersion ?? "not-created"),
      lossReport: {
        preserved: integer(lossSummary.preserved),
        normalized: integer(lossSummary.normalized),
        degraded: integer(lossSummary.degraded),
        blocked: integer(lossSummary.blocked),
        handoffOnly: integer(lossSummary.handoffOnly)
      },
      capabilitySummary: {
        executable: integer(capabilitySummary.executable),
        permissionRequired: integer(capabilitySummary.permissionRequired),
        blocked: integer(capabilitySummary.blocked),
        handoffOnly: integer(capabilitySummary.handoffOnly)
      },
      localExecutableSubset: integer(runPlan?.summary?.executable),
      blockedNodes: integer(runPlan?.summary?.blocked),
      handoffNeeds: handoffDescriptors.length,
      permissionFamilies: stableUnique(handoffDescriptors.flatMap((descriptor) => descriptor.permissionFamilies)),
      providerDependencies: stableUnique(handoffDescriptors.flatMap((descriptor) => descriptor.providerDependencies))
    },
    lossEntries,
    handoffDescriptors,
    descriptorBoundary: {
      descriptorOnly: true,
      reviewOnly: true,
      localExecutionAllowed: false,
      startsBridge: false,
      startsRuntime: false,
      makesNetworkRequest: false,
      writesFiles: false
    },
    createdAt: now
  };
}

function handoffDescriptorsFor(intake, normalization, runPlan) {
  const sourceIdByCanonical = new Map((normalization.sourceMap?.nodes ?? []).map((entry) => [entry.canonicalId, entry.sourceId]));
  const capabilityBySourceId = new Map((normalization.capabilityMatrix?.nodeClassifications ?? []).map((entry) => [entry.nodeId, entry]));
  return (runPlan?.nodePlans ?? [])
    .filter((node) => handoffClassifications.has(node.classification))
    .map((node, index) => {
      const sourceId = sourceIdByCanonical.get(node.id) ?? node.id;
      const capability = capabilityBySourceId.get(sourceId) ?? {};
      return {
        id: `platform-handoff-${safeToken(intake.platform)}-${String(index + 1).padStart(2, "0")}-${safeToken(node.id)}`,
        platform: safeText(intake.platform),
        sourceNodeId: safeText(sourceId),
        canonicalNodeId: safeText(node.id),
        classification: safeText(node.classification),
        targetCategory: targetCategoryFor(node, capability),
        sourceFamily: safeText(node.sourceFamily ?? capability.sourceFamily ?? "unknown-source-family"),
        localExecutionAllowed: false,
        credentialReferenceCount: integer(node.credentialRefs ?? capability.credentialRefs),
        permissionFamilies: safeList(node.permissionFamilies?.length ? node.permissionFamilies : capability.permissionFamilies),
        providerDependencies: safeList(capability.providerRequirements),
        blockedLocalReasons: safeReasons(node.reasons),
        descriptorOnly: true,
        reviewOnly: true,
        startsBridge: false,
        startsRuntime: false
      };
    });
}

function lossEntriesFor(lossReport) {
  return (lossReport?.semantics ?? [])
    .filter((entry) => lossyStatuses.has(entry.status))
    .map((entry) => ({
      id: safeText(entry.id),
      sourceId: safeText(entry.sourceId),
      label: safeText(entry.label),
      status: safeText(entry.status),
      reason: safeText(entry.reason),
      executionEligible: false
    }));
}

function summarizeExports(exports) {
  const handoffs = exports.flatMap((entry) => entry.handoffDescriptors);
  const lossEntries = exports.flatMap((entry) => entry.lossEntries);
  return {
    platforms: exports.length,
    exportDescriptors: exports.length,
    sourceFilesPreserved: exports.filter((entry) => entry.sourceFile.retainedOriginal).length,
    sourceMapEntries: exports.reduce((total, entry) => total + entry.sourceEnvelope.sourceMapNodes + entry.sourceEnvelope.sourceMapEdges, 0),
    lossEntries: lossEntries.length,
    localExecutableNodes: exports.reduce((total, entry) => total + entry.agentiqueMetadata.localExecutableSubset, 0),
    blockedNodes: exports.reduce((total, entry) => total + entry.agentiqueMetadata.blockedNodes, 0),
    handoffNeeds: handoffs.length,
    credentialReferences: handoffs.reduce((total, entry) => total + entry.credentialReferenceCount, 0),
    permissionFamilies: stableUnique(handoffs.flatMap((entry) => entry.permissionFamilies)),
    providerDependencies: stableUnique(handoffs.flatMap((entry) => entry.providerDependencies)),
    bridgeStarts: handoffs.filter((entry) => entry.startsBridge).length,
    runtimeStarts: handoffs.filter((entry) => entry.startsRuntime).length
  };
}

function createDefaultIntakes() {
  return [
    parseN8nWorkflowJson(sampleN8nWorkflowJson),
    parseDifyDslYaml(sampleDifyDslYaml),
    parseLangGraphManifest(sampleLangGraphManifest)
  ].map(clone);
}

function normalizeIntake(intake) {
  return intake && typeof intake === "object" ? intake : { ok: false, platform: "unknown", source: { preserved: {} }, errors: [] };
}

function normalizeNormalization(normalization) {
  return normalization && typeof normalization === "object" ? normalization : { workflowIr: null, lossReport: null, sourceMap: { nodes: [], edges: [] }, capabilityMatrix: null };
}

function targetCategoryFor(node, capability) {
  const family = String(node.sourceFamily ?? capability.sourceFamily ?? "").toLowerCase();
  const classification = String(node.classification ?? "");
  if (classification === "permission-required") return "permission-review-or-source-platform";
  if (/model|provider|tool|http|network/u.test(family)) return "source-platform-provider";
  if (/external-runtime|subflow|human/u.test(family)) return "source-platform-runtime";
  if (classification === "blocked") return "blocked-source-platform-review";
  return "source-platform-handoff";
}

function stableSourceIdentity(intake) {
  const payload = {
    platform: intake.platform,
    format: intake.source?.format,
    version: intake.source?.version,
    name: intake.source?.name,
    nodeIds: intake.source?.preserved?.originalNodeIds ?? [],
    edgeIds: intake.source?.preserved?.originalEdgeIds ?? []
  };
  return `source-${safeToken(intake.platform)}-${stableHash(JSON.stringify(payload))}`;
}

function createBoundary() {
  return {
    sourcePreserving: true,
    descriptorOnly: true,
    reviewOnly: true,
    noExecution: true,
    noBridgeStart: true,
    noRuntimeStart: true,
    noSchedulerStart: true,
    noNetwork: true,
    noFilesystemWrite: true,
    noCredentialRead: true,
    noEnvironmentRead: true,
    noBrowserDataRead: true,
    grantsRuntimeCompatibility: false
  };
}

function rejectExecutableClaims(value, path = "value") {
  if (value == null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if ((key === "startsBridge" || key === "startsRuntime" || key === "makesNetworkRequest" || key === "localExecutionAllowed") && nested === true) {
      throw issue("source-roundtrip.executable-claim", `${nestedPath} enables an executable claim.`);
    }
    rejectExecutableClaims(nested, nestedPath);
  }
}

function rejectRawSourcePayload(value, path = "value") {
  if (value == null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (/^(rawSource|rawBytes|sourceBytes|fileContents)$/iu.test(key) && typeof nested === "string" && nested.length > 0) {
      throw issue("source-roundtrip.raw-source", `${nestedPath} contains raw source payload.`);
    }
    rejectRawSourcePayload(nested, nestedPath);
  }
}

function safeReasons(reasons) {
  return Array.isArray(reasons)
    ? reasons.map((entry) => ({
      code: safeText(entry?.code ?? "source-roundtrip.reason"),
      message: safeText(entry?.message ?? "Source platform handoff review is required.")
    }))
    : [];
}

function safeList(values) {
  return stableUnique(Array.isArray(values) ? values.map(safeText) : []);
}

function stableUnique(values) {
  return [...new Set(values.map(safeText).filter(Boolean))].sort();
}

function safeText(value) {
  return redactText(String(value ?? "").replace(/\s+/gu, " ").trim())
    .replace(unsafePathPattern, "redacted:sensitive-reference")
    .slice(0, 220);
}

function safeToken(value) {
  return safeText(value).toLowerCase().replace(/[^a-z0-9._:-]/gu, "-").replace(/-+/gu, "-").slice(0, 80) || "value";
}

function integer(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
}

function emptyLossSummary() {
  return { preserved: 0, normalized: 0, degraded: 0, blocked: 0, handoffOnly: 0 };
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function issue(code, message) {
  const error = new Error(redactText(message));
  error.code = code;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  return Object.freeze(clone(value));
}
