import { redactText } from "./secret-vault.mjs";

const schemaVersion = "agentique.runnerCapabilityCloseout.v1";
const requiredValidationSteps = Object.freeze([
  "validate:contracts",
  "validate:native-runner-boundary",
  "validate:local-run-state-machine",
  "validate:permission-grants",
  "validate:run-folder-writer",
  "validate:python-adapter-runner",
  "validate:node-adapter-runner",
  "validate:workflow-scheduler",
  "validate:graph-run-execution-ui",
  "validate:external-runtime-bridge-guard",
  "validate:wasm-wasi-sandbox-gate",
  "validate:rootless-container-preflight-gate",
  "validate:desktop-runner-validation-gate",
  "validate:public",
  "npm test"
]);
const requiredCapabilities = Object.freeze([
  "runner-capability-contract",
  "native-command-boundary",
  "run-queue-state-machine",
  "permission-grants",
  "run-folder-artifacts",
  "python-adapter",
  "node-adapter",
  "workflow-scheduler",
  "graph-run-controls",
  "external-bridge-guard",
  "wasm-preflight",
  "container-preflight",
  "desktop-runner-evidence-gate"
]);
const pathNeutralReferencePattern = /^(docs\/validation\/[A-Za-z0-9._/-]+|docs\/contracts\/[A-Za-z0-9._/-]+|docs\/security\/[A-Za-z0-9._/-]+|evidence\/[A-Za-z0-9._/-]+)$/u;
const privatePlanMarker = "\\." + "planning";
const privateReferenceDocsMarker = "reference" + "\\/" + "docs";
const unsafeTextPattern = new RegExp(
  `(?<![A-Za-z])[A-Za-z]:[\\\\/]|\\\\\\\\|(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)|\\.\\.[\\\\/]|${privatePlanMarker}|${privateReferenceDocsMarker}|bearer\\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|ya29\\.`,
  "iu"
);

export const sampleRunnerCapabilityCloseout = Object.freeze({
  schemaVersion,
  validationSteps: [...requiredValidationSteps],
  capabilities: Object.fromEntries(requiredCapabilities.map((capability) => [
    capability,
    { status: "accepted", evidenceRef: "docs/validation/runner-capability-closeout.md" }
  ])),
  claimBoundary: {
    supportedLocalRunScope: "supported-local-only",
    supportedLocalRuns: true,
    universalRuntime: false,
    hostedRuntime: false,
    automaticExecution: false,
    productionDesktopRuntime: false,
    installerUpdater: false,
    paidCloudRuntime: false
  },
  releaseBoundary: {
    windowsInstaller: "blocked",
    macosInstaller: "blocked",
    linuxPackages: "blocked",
    updater: "blocked",
    productionDesktopRuntime: "blocked"
  },
  publicSafety: {
    publicBoundaryScan: "passed",
    noSecretScan: "passed",
    privateMarkersAbsent: true,
    evidenceRefsPathNeutral: true
  }
});

export function reviewRunnerCapabilityCloseout(closeout = sampleRunnerCapabilityCloseout) {
  const errors = [];
  if (!closeout || typeof closeout !== "object") {
    return blockedReview([issue("runner-closeout.invalid", "Runner capability closeout must be an object.")]);
  }
  assertNoUnsafeText(closeout, errors);
  if (closeout.schemaVersion !== schemaVersion) {
    errors.push(issue("runner-closeout.schema", "Runner capability closeout schema is unsupported."));
  }

  const validation = reviewValidationSteps(closeout.validationSteps, errors);
  const capabilities = reviewCapabilities(closeout.capabilities, errors);
  const claimBoundary = reviewClaimBoundary(closeout.claimBoundary, errors);
  const releaseBoundary = reviewReleaseBoundary(closeout.releaseBoundary, errors);
  const publicSafety = reviewPublicSafety(closeout.publicSafety, errors);
  const ok = errors.length === 0;

  return {
    schemaVersion: "agentique.runnerCapabilityCloseoutReview.v1",
    ok,
    status: ok ? "accepted" : "blocked",
    validation,
    capabilities,
    claimBoundary,
    releaseBoundary,
    publicSafety,
    summary: {
      validationSteps: validation.present.length,
      acceptedCapabilities: capabilities.accepted,
      supportedLocalRunScope: claimBoundary.supportedLocalRunScope,
      releaseClaimsBlocked: releaseBoundary.allBlocked,
      publicSafety: publicSafety.status
    },
    errors: errors.map((error) => ({ code: error.code, message: redactText(error.message) }))
  };
}

export function reviewRunnerCapabilityCloseoutGate() {
  const accepted = reviewRunnerCapabilityCloseout();
  const missingValidation = reviewRunnerCapabilityCloseout({
    ...sampleRunnerCapabilityCloseout,
    validationSteps: sampleRunnerCapabilityCloseout.validationSteps.filter((step) => step !== "validate:desktop-runner-validation-gate")
  });
  const overclaim = reviewRunnerCapabilityCloseout({
    ...sampleRunnerCapabilityCloseout,
    claimBoundary: {
      ...sampleRunnerCapabilityCloseout.claimBoundary,
      universalRuntime: true,
      productionDesktopRuntime: true,
      installerUpdater: true
    }
  });
  const unsafeReference = reviewRunnerCapabilityCloseout({
    ...sampleRunnerCapabilityCloseout,
    capabilities: {
      ...sampleRunnerCapabilityCloseout.capabilities,
      "python-adapter": { status: "accepted", evidenceRef: ["C", ":\\private\\runner.log"].join("") }
    }
  });

  return {
    schemaVersion: "agentique.runnerCapabilityCloseoutGateReview.v1",
    ok: accepted.ok && !missingValidation.ok && !overclaim.ok && !unsafeReference.ok,
    acceptedStatus: accepted.status,
    missingValidationBlocked: missingValidation.errors.some((error) => error.code === "runner-closeout.validation-step"),
    overclaimBlocked: overclaim.errors.some((error) => error.code === "runner-closeout.claim-boundary"),
    unsafeReferenceBlocked: unsafeReference.errors.some((error) => error.code === "runner-closeout.evidence-ref"),
    summary: accepted.summary
  };
}

function reviewValidationSteps(steps, errors) {
  const list = Array.isArray(steps) ? steps.map(String) : [];
  for (const step of requiredValidationSteps) {
    if (!list.includes(step)) {
      errors.push(issue("runner-closeout.validation-step", `Required runner validation step is missing: ${step}.`));
    }
  }
  return {
    present: list,
    missing: requiredValidationSteps.filter((step) => !list.includes(step))
  };
}

function reviewCapabilities(capabilities = {}, errors) {
  let accepted = 0;
  const output = {};
  for (const capability of requiredCapabilities) {
    const evidence = capabilities[capability] ?? {};
    if (evidence.status !== "accepted") {
      errors.push(issue("runner-closeout.capability-status", `${capability} closeout status must be accepted.`));
    } else {
      accepted += 1;
    }
    validateEvidenceRef(evidence.evidenceRef, errors);
    output[capability] = {
      status: evidence.status === "accepted" ? "accepted" : "blocked",
      evidenceRef: redactText(String(evidence.evidenceRef ?? ""))
    };
  }
  return {
    accepted,
    required: requiredCapabilities.length,
    items: output
  };
}

function reviewClaimBoundary(claims = {}, errors) {
  const normalized = {
    supportedLocalRunScope: String(claims.supportedLocalRunScope ?? ""),
    supportedLocalRuns: claims.supportedLocalRuns === true,
    universalRuntime: claims.universalRuntime === true,
    hostedRuntime: claims.hostedRuntime === true,
    automaticExecution: claims.automaticExecution === true,
    productionDesktopRuntime: claims.productionDesktopRuntime === true,
    installerUpdater: claims.installerUpdater === true,
    paidCloudRuntime: claims.paidCloudRuntime === true
  };
  if (normalized.supportedLocalRunScope !== "supported-local-only" || normalized.supportedLocalRuns !== true) {
    errors.push(issue("runner-closeout.local-scope", "Runner closeout must claim supported local-run scope only."));
  }
  for (const [claim, value] of Object.entries(normalized)) {
    if (!["supportedLocalRunScope", "supportedLocalRuns"].includes(claim) && value === true) {
      errors.push(issue("runner-closeout.claim-boundary", `${claim} must remain false at runner closeout.`));
    }
  }
  return normalized;
}

function reviewReleaseBoundary(boundary = {}, errors) {
  const required = ["windowsInstaller", "macosInstaller", "linuxPackages", "updater", "productionDesktopRuntime"];
  const output = {};
  for (const key of required) {
    const value = String(boundary[key] ?? "");
    if (value !== "blocked") {
      errors.push(issue("runner-closeout.release-boundary", `${key} release boundary must remain blocked.`));
    }
    output[key] = value === "blocked" ? "blocked" : "unsafe";
  }
  output.allBlocked = required.every((key) => output[key] === "blocked");
  return output;
}

function reviewPublicSafety(safety = {}, errors) {
  if (safety.publicBoundaryScan !== "passed" || safety.noSecretScan !== "passed" || safety.privateMarkersAbsent !== true || safety.evidenceRefsPathNeutral !== true) {
    errors.push(issue("runner-closeout.public-safety", "Runner closeout public-safety checks must pass."));
  }
  return {
    publicBoundaryScan: safety.publicBoundaryScan === "passed" ? "passed" : "blocked",
    noSecretScan: safety.noSecretScan === "passed" ? "passed" : "blocked",
    privateMarkersAbsent: safety.privateMarkersAbsent === true,
    evidenceRefsPathNeutral: safety.evidenceRefsPathNeutral === true,
    status: safety.publicBoundaryScan === "passed" && safety.noSecretScan === "passed" && safety.privateMarkersAbsent === true && safety.evidenceRefsPathNeutral === true ? "passed" : "blocked"
  };
}

function validateEvidenceRef(reference, errors) {
  const text = String(reference ?? "");
  if (!pathNeutralReferencePattern.test(text) || text.includes("..") || unsafeTextPattern.test(text)) {
    errors.push(issue("runner-closeout.evidence-ref", "Runner closeout evidence references must be path-neutral and public-safe."));
  }
}

function assertNoUnsafeText(value, errors) {
  if (value == null) return;
  if (typeof value === "string") {
    if (unsafeTextPattern.test(value)) {
      errors.push(issue("runner-closeout.unsafe-text", "Runner closeout contains unsafe public text."));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertNoUnsafeText(entry, errors);
    return;
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value)) assertNoUnsafeText(entry, errors);
  }
}

function blockedReview(errors) {
  return {
    schemaVersion: "agentique.runnerCapabilityCloseoutReview.v1",
    ok: false,
    status: "blocked",
    validation: { present: [], missing: [...requiredValidationSteps] },
    capabilities: { accepted: 0, required: requiredCapabilities.length, items: {} },
    claimBoundary: {},
    releaseBoundary: { allBlocked: false },
    publicSafety: { status: "blocked" },
    summary: { validationSteps: 0, acceptedCapabilities: 0, supportedLocalRunScope: "", releaseClaimsBlocked: false, publicSafety: "blocked" },
    errors: errors.map((error) => ({ code: error.code, message: redactText(error.message) }))
  };
}

function issue(code, message) {
  const error = new Error(redactText(message));
  error.code = code;
  return error;
}
