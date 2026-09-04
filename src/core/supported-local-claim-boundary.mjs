const schemaVersion = "agentique.supportedLocalClaimBoundary.v1";
const exactVerifiedPlatforms = Object.freeze(["windows", "linux"]);
const exactUnverifiedPlatforms = Object.freeze(["macos"]);
const exactSupportedExecutionLanes = Object.freeze(["fixed-native-python", "fixed-native-node", "fixed-native-dag-scheduler"]);
const exactReviewOnlyLanes = Object.freeze([
  "workflow-scheduler-model",
  "external-runtime-bridge",
  "wasm-wasi-preflight",
  "rootless-container-preflight",
  "browser-automation-consent"
]);
const forbiddenClaimNames = Object.freeze([
  "genericShell",
  "packageLifecycle",
  "arbitrarySubprocess",
  "browserData",
  "ambientEnvironment",
  "hostedRuntime",
  "universalRuntime",
  "productionDesktopRuntime",
  "installer",
  "updater",
  "externalProviderAutomation"
]);
const exactPlatformEvidence = Object.freeze({
  windows: "runtime-verified",
  linux: "runtime-verified",
  macos: "unverified-owner-waived"
});
const privatePlanMarker = `.${["plan", "ning"].join("")}`;
const unsafePublicTextPattern = new RegExp(
  [
    "(?<![A-Za-z])[A-Za-z]:[\\\\/]",
    "\\\\\\\\",
    privatePlanMarker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"),
    "reference[\\\\/]docs",
    "bearer\\s+[A-Za-z0-9._-]{12,}",
    "sk-[A-Za-z0-9]{20,}",
    "(?:ghp|github_pat)_[A-Za-z0-9_]{20,}"
  ].join("|"),
  "iu"
);

const requiredSurfacePhrases = Object.freeze({
  readme: Object.freeze([
    "Fixed native Python and Node local execution is supported for source validation on Windows and Linux only.",
    "The fixed native DAG scheduler supports pre-approved attempts and checkpointed human-approval interrupts on Windows and Linux only.",
    "macOS local execution remains unverified and is not currently supported.",
    "The earlier workflow scheduler model remains review-only evidence, not a native execution lane."
  ]),
  support: Object.freeze([
    "Supported local execution: fixed native Python and Node on Windows and Linux source-validation environments only.",
    "Supported native orchestration: deterministic fixed-adapter DAGs with pre-approved attempts or checkpointed human-approval interrupts on Windows and Linux only.",
    "macOS local execution is unverified and unsupported.",
    "The workflow scheduler model remains review-only evidence."
  ]),
  security: Object.freeze([
    "The supported execution lanes are the fixed native Python and Node adapters plus their deterministic native DAG scheduler on verified Windows and Linux environments only.",
    "macOS is unverified and is not a supported local-execution platform.",
    "Scheduler models do not grant executable authority; only the fixed native DAG scheduler can launch attempts after native approval validation."
  ]),
  nativeRunner: Object.freeze([
    "The supported runtime claim covers the fixed native Python and Node adapters on Windows and Linux only.",
    "The native DAG scheduler may orchestrate only those fixed adapters through distinct pre-approved attempts or checkpointed approval interrupts.",
    "The macOS process-group source branch is unverified and does not establish macOS support."
  ]),
  runnerCloseout: Object.freeze([
    "Accepted execution scope: fixed native Python and Node plus deterministic fixed-adapter DAG orchestration with checkpointed approval interrupts on Windows and Linux only.",
    "macOS remains unverified; the earlier scheduler model remains review-only."
  ])
});

const publicOverclaimPatterns = Object.freeze([
  /\bmacOS local execution is supported\b/iu,
  /\bsupports macOS local execution\b/iu,
  /\bmacOS (?:runtime|local execution) (?:is )?(?:verified|validated)\b/iu,
  /\bworkflow scheduler is an accepted execution lane\b/iu,
  /\bworkflow scheduler (?:is )?supported for execution\b/iu,
  /\bprovides? (?:a )?(?:hosted|universal|production desktop) (?:workflow )?runtime\b/iu,
  /\bcan execute arbitrary (?:commands|processes|resources)\b/iu,
  /\bgeneric shell (?:access|execution) is supported\b/iu,
  /\bbrowser-data access is supported\b/iu,
  /\bambient environment forwarding is supported\b/iu,
  /\b(?:installer|updater) publication is supported\b/iu
]);

export const supportedLocalClaimBoundary = deepFreeze({
  schemaVersion,
  supportMode: "supported-local-only",
  verifiedPlatforms: [...exactVerifiedPlatforms],
  unverifiedPlatforms: [...exactUnverifiedPlatforms],
  supportedExecutionLanes: [...exactSupportedExecutionLanes],
  reviewOnlyLanes: [...exactReviewOnlyLanes],
  platformEvidence: { ...exactPlatformEvidence },
  laneEvidence: {
    "fixed-native-python": {
      adapterId: "adapter.local-python",
      runtime: "python",
      transport: "native-fixed-adapter",
      status: "runtime-verified"
    },
    "fixed-native-node": {
      adapterId: "adapter.local-node",
      runtime: "node",
      transport: "native-fixed-adapter",
      status: "runtime-verified"
    },
    "fixed-native-dag-scheduler": {
      runtime: "native",
      transport: "native-fixed-adapter-dag",
      ordering: "stable-sequential",
      attempts: "distinct-preapproved-or-checkpointed-interrupt",
      approvalAuthority: "native-decision-and-one-use-grant",
      status: "runtime-verified"
    }
  },
  forbiddenClaims: Object.fromEntries(forbiddenClaimNames.map((name) => [name, false]))
});

export function reviewSupportedLocalClaimBoundary(candidate = supportedLocalClaimBoundary) {
  const errors = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return blockedReview([issue("supported-local.invalid", "Supported-local claim boundary must be an object.")]);
  }

  if (unsafePublicTextPattern.test(JSON.stringify(candidate))) {
    errors.push(issue("supported-local.unsafe-text", "Supported-local claim evidence must be public-safe and path-neutral."));
  }
  if (candidate.schemaVersion !== schemaVersion || candidate.supportMode !== "supported-local-only") {
    errors.push(issue("supported-local.schema", "Supported-local claim schema or support mode is invalid."));
  }

  reviewExactArray(candidate.verifiedPlatforms, exactVerifiedPlatforms, "supported-local.verified-platforms", errors);
  reviewExactArray(candidate.unverifiedPlatforms, exactUnverifiedPlatforms, "supported-local.unverified-platforms", errors);
  reviewExactArray(candidate.supportedExecutionLanes, exactSupportedExecutionLanes, "supported-local.supported-lanes", errors);
  reviewExactArray(candidate.reviewOnlyLanes, exactReviewOnlyLanes, "supported-local.review-only-lanes", errors);

  if (!samePlainRecord(candidate.platformEvidence, exactPlatformEvidence)) {
    errors.push(issue("supported-local.platform-evidence", "Platform evidence must preserve Windows/Linux verification and macOS unverified state."));
  }

  const pythonLane = candidate.laneEvidence?.["fixed-native-python"];
  const nodeLane = candidate.laneEvidence?.["fixed-native-node"];
  const schedulerLane = candidate.laneEvidence?.["fixed-native-dag-scheduler"];
  const exactLanes =
    pythonLane?.adapterId === "adapter.local-python" &&
    pythonLane?.runtime === "python" &&
    pythonLane?.transport === "native-fixed-adapter" &&
    pythonLane?.status === "runtime-verified" &&
    nodeLane?.adapterId === "adapter.local-node" &&
    nodeLane?.runtime === "node" &&
    nodeLane?.transport === "native-fixed-adapter" &&
    nodeLane?.status === "runtime-verified" &&
    schedulerLane?.runtime === "native" &&
    schedulerLane?.transport === "native-fixed-adapter-dag" &&
    schedulerLane?.ordering === "stable-sequential" &&
    schedulerLane?.attempts === "distinct-preapproved-or-checkpointed-interrupt" &&
    schedulerLane?.approvalAuthority === "native-decision-and-one-use-grant" &&
    schedulerLane?.status === "runtime-verified" &&
    Object.keys(candidate.laneEvidence ?? {}).length === 3;
  if (!exactLanes) {
    errors.push(issue("supported-local.lane-evidence", "The fixed native adapters and DAG scheduler require exact runtime evidence."));
  }

  const claims = candidate.forbiddenClaims;
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
    errors.push(issue("supported-local.forbidden-claim", "Forbidden claim state is missing."));
  } else {
    const claimKeys = Object.keys(claims);
    if (!sameArray(claimKeys, forbiddenClaimNames) || forbiddenClaimNames.some((name) => claims[name] !== false)) {
      errors.push(issue("supported-local.forbidden-claim", "Unsupported authority and release claims must remain explicitly false."));
    }
  }

  return {
    schemaVersion: "agentique.supportedLocalClaimBoundaryReview.v1",
    ok: errors.length === 0,
    status: errors.length === 0 ? "accepted" : "blocked",
    verifiedPlatforms: exactArrayOrEmpty(candidate.verifiedPlatforms),
    unverifiedPlatforms: exactArrayOrEmpty(candidate.unverifiedPlatforms),
    supportedExecutionLanes: exactArrayOrEmpty(candidate.supportedExecutionLanes),
    reviewOnlyLanes: exactArrayOrEmpty(candidate.reviewOnlyLanes),
    errors
  };
}

export function reviewSupportedLocalClaimSurfaces(surfaces = {}) {
  const errors = [];
  const checkedSurfaces = [];
  for (const [surface, phrases] of Object.entries(requiredSurfacePhrases)) {
    const text = String(surfaces[surface] ?? "");
    checkedSurfaces.push(surface);
    if (unsafePublicTextPattern.test(text)) {
      errors.push(issue("supported-local.public-unsafe", `${surface} claim surface is not public-safe.`));
    }
    for (const phrase of phrases) {
      if (!text.includes(phrase)) {
        errors.push(issue("supported-local.public-qualifier", `${surface} is missing a required support qualifier.`));
      }
    }
    for (const pattern of publicOverclaimPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        errors.push(issue("supported-local.public-overclaim", `${surface} contains an unsupported positive runtime claim.`));
      }
    }
  }
  return {
    schemaVersion: "agentique.supportedLocalClaimSurfaceReview.v1",
    ok: errors.length === 0,
    status: errors.length === 0 ? "accepted" : "blocked",
    checkedSurfaces,
    errors
  };
}

export function reviewSupportedLocalClaimGate() {
  const canonical = reviewSupportedLocalClaimBoundary();
  const macos = structuredClone(supportedLocalClaimBoundary);
  macos.verifiedPlatforms.push("macos");
  const unknownLane = structuredClone(supportedLocalClaimBoundary);
  unknownLane.supportedExecutionLanes.push("generic-subprocess");
  const authority = structuredClone(supportedLocalClaimBoundary);
  authority.forbiddenClaims.genericShell = true;
  const publicOverclaim = reviewSupportedLocalClaimSurfaces({
    ...Object.fromEntries(Object.entries(requiredSurfacePhrases).map(([surface, phrases]) => [surface, phrases.join("\n")])),
    readme: `${requiredSurfacePhrases.readme.join("\n")}\nmacOS local execution is supported.`
  });
  const summary = {
    canonicalAccepted: canonical.ok,
    macosOverclaimBlocked: !reviewSupportedLocalClaimBoundary(macos).ok,
    unknownLaneBlocked: !reviewSupportedLocalClaimBoundary(unknownLane).ok,
    authorityOverclaimBlocked: !reviewSupportedLocalClaimBoundary(authority).ok,
    publicOverclaimBlocked: !publicOverclaim.ok
  };
  return {
    schemaVersion: "agentique.supportedLocalClaimGateReview.v1",
    ok: Object.values(summary).every(Boolean),
    ...summary
  };
}

function reviewExactArray(candidate, expected, code, errors) {
  if (!Array.isArray(candidate) || new Set(candidate).size !== candidate.length || !sameArray(candidate, expected)) {
    errors.push(issue(code, "Supported-local claim allowlists must match the verified policy exactly."));
  }
}

function sameArray(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function samePlainRecord(left, right) {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return sameArray(leftKeys, rightKeys) && rightKeys.every((key) => left[key] === right[key]);
}

function exactArrayOrEmpty(value) {
  return Array.isArray(value) ? [...value] : [];
}

function blockedReview(errors) {
  return {
    schemaVersion: "agentique.supportedLocalClaimBoundaryReview.v1",
    ok: false,
    status: "blocked",
    verifiedPlatforms: [],
    unverifiedPlatforms: [],
    supportedExecutionLanes: [],
    reviewOnlyLanes: [],
    errors
  };
}

function issue(code, message) {
  return { code, message };
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
