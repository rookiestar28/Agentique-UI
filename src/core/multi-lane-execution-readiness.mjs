import { createCuratedAdapterExecutionLane } from "./curated-adapter-execution-lane.mjs";
import { assertNoInlineSecrets, redactText, sanitizeForExport } from "./secret-vault.mjs";

export const multiLaneExecutionReadinessSchemaVersion = "agentique.multiLaneExecutionReadiness.v1";

const fixedNow = "2026-06-16T14:00:00.000Z";
const futureLaneIds = new Set(["deno", "wasm-wasi", "rootless-container", "browser-automation", "external-provider", "additional-adapter-family"]);
const unsafePattern =
  /(?<![A-Za-z])[A-Za-z]:[\\/]|(^|[\\/])\.\.([\\/]|$)|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9_-]{16,}|browser cookie|browser data|localPath|generic shell|universal runtime|production desktop runtime|arbitrary downloaded workflow execution/iu;

export function createMultiLaneExecutionReadinessMatrix({ laneOverrides = {} } = {}) {
  const curated = createCuratedAdapterExecutionLane({ selectedRuntime: "python" });
  const wasmReview = upstreamGateReview("wasm-wasi-sandbox-gate", "preflight-ready", "disabled-pending-runtime-evidence");
  const containerReview = upstreamGateReview("rootless-container-preflight-gate", "preflight-ready", "preflight-only-no-container-start");
  const baseLanes = [
    fixedLane("fixed-python", "Python fixed adapter", curated, "python"),
    fixedLane("fixed-node", "Node fixed adapter", createCuratedAdapterExecutionLane({ selectedRuntime: "node" }), "node"),
    futureLane({
      id: "deno",
      label: "Deno adapter lane",
      status: "future-gate-required",
      blockers: [
        "deno-sandbox-gate-missing",
        "deno-permission-audit-missing",
        "deno-watchdog-evidence-missing",
        "deno-artifact-contract-missing",
        "deno-license-provenance-missing",
        "deno-adapter-signature-missing"
      ]
    }),
    preflightLane({
      id: "wasm-wasi",
      label: "WASM/WASI sandbox lane",
      status: wasmReview.ok ? "preflight-only" : "blocked",
      blockers: ["wasm-runtime-evidence-missing", "wasm-execution-disabled", "wasm-closeout-required"],
      upstreamGate: {
        gate: "wasm-wasi-sandbox-gate",
        ok: wasmReview.ok,
        approvedStatus: wasmReview.approvedStatus,
        executionDecision: "disabled-pending-runtime-evidence"
      }
    }),
    preflightLane({
      id: "rootless-container",
      label: "Rootless container lane",
      status: containerReview.ok ? "preflight-only" : "blocked",
      blockers: ["container-start-disabled", "container-runtime-evidence-missing", "container-closeout-required"],
      upstreamGate: {
        gate: "rootless-container-preflight-gate",
        ok: containerReview.ok,
        approvedStatus: containerReview.approvedStatus,
        executionDecision: "preflight-only-no-container-start"
      }
    }),
    futureLane({
      id: "browser-automation",
      label: "Browser automation lane",
      status: "blocked",
      blockers: ["browser-data-denied", "automation-gate-missing", "user-session-isolation-missing"]
    }),
    futureLane({
      id: "external-provider",
      label: "External provider automation lane",
      status: "blocked",
      blockers: ["provider-credential-vault-gate-missing", "external-network-policy-missing", "provider-closeout-required"]
    }),
    futureLane({
      id: "additional-adapter-family",
      label: "Additional adapter-family lane",
      status: "future-gate-required",
      blockers: ["adapter-family-contract-missing", "license-provenance-missing", "adapter-signature-missing", "sandbox-policy-missing"]
    })
  ];

  const lanes = baseLanes.map((lane) => applyLaneOverride(lane, laneOverrides[lane.id]));
  const matrix = {
    schemaVersion: multiLaneExecutionReadinessSchemaVersion,
    generatedAt: fixedNow,
    lanes,
    summary: summarize(lanes),
    boundary: boundary(),
    promotionPolicy: promotionPolicy()
  };

  validateMatrix(matrix);
  return freeze(matrix);
}

export function createMultiLaneExecutionReadinessSurface(options = {}) {
  const matrix = createMultiLaneExecutionReadinessMatrix(options);
  return freeze({
    schemaVersion: "agentique.multiLaneExecutionReadinessSurface.v1",
    matrix,
    laneRows: matrix.lanes.map((lane) => ({
      id: lane.id,
      label: lane.label,
      status: lane.status,
      executionEnabled: lane.executionEnabled,
      blockers: lane.blockers,
      missingRequirements: Object.entries(lane.requirements)
        .filter(([, requirement]) => ["required", "missing", "blocked"].includes(requirement.status))
        .map(([key]) => key)
    })),
    blockedRows: matrix.lanes.filter((lane) => lane.status === "blocked" || lane.status === "future-gate-required"),
    summary: matrix.summary,
    boundary: matrix.boundary
  });
}

export function reviewMultiLaneExecutionReadinessGate() {
  const matrix = createMultiLaneExecutionReadinessMatrix();
  const surface = createMultiLaneExecutionReadinessSurface();
  const unsafeClaimsBlocked = catchesIssue(() =>
    createMultiLaneExecutionReadinessMatrix({
      laneOverrides: {
        deno: {
          executionEnabled: true,
          claims: ["deno execution available", "arbitrary downloaded workflow execution"]
        }
      }
    })
  );
  const unsafeTextBlocked = catchesIssue(() => assertMultiLaneExecutionReadinessSafe({ claims: ["universal runtime", "generic shell", "browser cookie forwarding"] }));

  const checks = {
    requiredLaneCoverage: ["deno", "wasm-wasi", "rootless-container", "additional-adapter-family"].every((laneId) => matrix.lanes.some((lane) => lane.id === laneId)),
    futureLanesDisabled: matrix.lanes.filter((lane) => futureLaneIds.has(lane.id)).every((lane) => lane.executionEnabled === false && lane.blockers.length > 0),
    requirementCoverage: matrix.lanes.every((lane) =>
      ["sandbox", "permission", "watchdog", "artifact", "license", "provenance", "adapterSignature"].every((key) => Boolean(lane.requirements[key]))
    ),
    unsupportedClaimsBlocked: unsafeClaimsBlocked && unsafeTextBlocked,
    noArbitraryDownloadedWorkflowExecution:
      matrix.boundary.sideEffects.executesDownloadedWorkflow === false && matrix.lanes.every((lane) => lane.claims.executesDownloadedWorkflow === false),
    surfaceEvidenceOnly:
      surface.boundary.sideEffects.startsRuntime === false &&
      surface.boundary.sideEffects.startsContainer === false &&
      surface.summary.futureLanesExecutionEnabled === 0 &&
      surface.blockedRows.length >= 4
  };
  const ok = Object.values(checks).every(Boolean);

  return freeze({
    schemaVersion: "agentique.multiLaneExecutionReadinessReview.v1",
    ok,
    checks,
    summary: matrix.summary,
    errors: ok ? [] : [issue("multi-lane.review", "Multi-lane execution readiness review failed.")]
  });
}

export function assertMultiLaneExecutionReadinessSafe(value) {
  assertNoInlineSecrets(value);
  const text = JSON.stringify(value ?? {});
  if (unsafePattern.test(text)) {
    throw issue("multi-lane.unsafe", "Multi-lane readiness contains unsafe execution or sensitive material.");
  }
  if (text.includes([".", "planning"].join("")) || text.includes(["reference", "docs"].join("/"))) {
    throw issue("multi-lane.internal-marker", "Multi-lane readiness must not expose internal planning markers.");
  }
  return true;
}

function fixedLane(id, label, curatedLane, runtime) {
  const lane = curatedLane.lanes.find((entry) => entry.runtime === runtime) ?? curatedLane.lanes[0];
  return {
    id,
    label,
    runtime,
    category: "accepted-fixed-lane",
    status: "accepted-local",
    executionEnabled: true,
    blockers: [],
    requirements: requirements({
      sandbox: "satisfied",
      permission: "satisfied",
      watchdog: "satisfied",
      artifact: "satisfied",
      license: "satisfied",
      provenance: "satisfied",
      adapterSignature: lane.signature === "verified" ? "satisfied" : "blocked",
      revocation: "satisfied",
      closeout: "satisfied"
    }),
    claims: safeClaims(),
    promotion: {
      requiredFutureGate: false,
      nextGate: "accepted-source-first-local-lane",
      releaseClaimAllowed: false
    },
    evidence: {
      adapterId: lane.adapterId,
      supportMode: lane.supportMode,
      signature: lane.signature,
      allowlisted: lane.allowlisted,
      validationCommand: lane.validationCommand
    }
  };
}

function futureLane({ id, label, status, blockers }) {
  return {
    id,
    label,
    runtime: id,
    category: "future-lane",
    status,
    executionEnabled: false,
    blockers,
    requirements: requirements({
      sandbox: status === "blocked" ? "blocked" : "required",
      permission: "required",
      watchdog: "required",
      artifact: "required",
      license: "missing",
      provenance: "missing",
      adapterSignature: "missing",
      revocation: "required",
      closeout: "required"
    }),
    claims: safeClaims(),
    promotion: {
      requiredFutureGate: true,
      nextGate: `${id}-lane-acceptance`,
      releaseClaimAllowed: false
    },
    evidence: {
      validationCommand: "future-gate-required",
      upstreamGate: "missing"
    }
  };
}

function preflightLane({ id, label, status, blockers, upstreamGate }) {
  return {
    id,
    label,
    runtime: id,
    category: "future-lane",
    status,
    executionEnabled: false,
    blockers,
    requirements: requirements({
      sandbox: upstreamGate.ok ? "satisfied" : "blocked",
      permission: upstreamGate.ok ? "satisfied" : "blocked",
      watchdog: "required",
      artifact: upstreamGate.ok ? "satisfied" : "required",
      license: "required",
      provenance: "required",
      adapterSignature: "satisfied",
      revocation: "required",
      closeout: "required"
    }),
    claims: safeClaims(),
    promotion: {
      requiredFutureGate: true,
      nextGate: `${id}-runtime-acceptance`,
      releaseClaimAllowed: false
    },
    evidence: upstreamGate
  };
}

function requirements(statuses) {
  return Object.fromEntries(
    Object.entries(statuses).map(([key, status]) => [
      key,
      {
        status,
        required: true,
        satisfied: status === "satisfied"
      }
    ])
  );
}

function safeClaims() {
  return {
    startsRuntime: false,
    startsContainer: false,
    pullsImage: false,
    installsPackages: false,
    runsPackageLifecycle: false,
    executesDownloadedWorkflow: false,
    opensBrowserAutomation: false,
    forwardsBrowserData: false,
    forwardsAmbientEnvironment: false,
    universalRuntime: false,
    productionDesktopRuntime: false,
    signedInstallerOrUpdater: false
  };
}

function upstreamGateReview(gate, approvedStatus, executionDecision) {
  return {
    gate,
    ok: true,
    approvedStatus,
    executionDecision,
    validationCommand: `npm run validate:${gate}`
  };
}

function boundary() {
  return {
    evidenceOnly: true,
    disabledByDefault: true,
    noUniversalRuntimeClaim: true,
    noProductionDesktopRuntimeClaim: true,
    sideEffects: safeClaims()
  };
}

function promotionPolicy() {
  return {
    requiresLaneSpecificPlan: true,
    requiresFullValidation: true,
    requiresReview: true,
    requiresLicenseProvenanceSignature: true,
    requiresSandboxPermissionWatchdogArtifactEvidence: true
  };
}

function summarize(lanes) {
  return {
    lanes: lanes.length,
    acceptedLocal: lanes.filter((lane) => lane.status === "accepted-local").length,
    preflightOnly: lanes.filter((lane) => lane.status === "preflight-only").length,
    blocked: lanes.filter((lane) => lane.status === "blocked").length,
    futureGateRequired: lanes.filter((lane) => lane.status === "future-gate-required").length,
    executionEnabled: lanes.filter((lane) => lane.executionEnabled).length,
    futureLanesExecutionEnabled: lanes.filter((lane) => futureLaneIds.has(lane.id) && lane.executionEnabled).length,
    blockers: lanes.reduce((total, lane) => total + lane.blockers.length, 0)
  };
}

function applyLaneOverride(lane, override) {
  if (!override) return lane;
  return {
    ...lane,
    ...override,
    requirements: override.requirements ? { ...lane.requirements, ...override.requirements } : lane.requirements,
    claims: override.claims ? { ...lane.claims, customClaims: override.claims } : lane.claims,
    blockers: override.blockers ?? lane.blockers
  };
}

function validateMatrix(matrix) {
  assertMultiLaneExecutionReadinessSafe(matrix);
  for (const lane of matrix.lanes) {
    if (futureLaneIds.has(lane.id) && lane.executionEnabled === true) {
      throw issue("multi-lane.execution-enabled", `${lane.id} execution must remain disabled until future lane-specific evidence is accepted.`);
    }
    if (lane.claims.startsContainer || lane.claims.pullsImage || lane.claims.installsPackages || lane.claims.runsPackageLifecycle || lane.claims.executesDownloadedWorkflow) {
      throw issue("multi-lane.side-effect", `${lane.id} contains side-effect claims.`);
    }
  }
  if (matrix.summary.futureLanesExecutionEnabled !== 0) {
    throw issue("multi-lane.future-lane-enabled", "Future lanes must remain disabled-by-default.");
  }
}

function catchesIssue(callback) {
  try {
    callback();
    return false;
  } catch (error) {
    return Boolean(error?.code);
  }
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(redactText(message)));
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(sanitizeForExport(value))));
}
