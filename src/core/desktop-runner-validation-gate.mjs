import { redactText } from "./secret-vault.mjs";

const schemaVersion = "agentique.desktopRunnerEvidence.v1";
const requiredPlatforms = Object.freeze(["windows", "macos", "linux"]);
const requiredWorkflowActions = Object.freeze([
  "approve-permissions",
  "start-run",
  "cancel-run",
  "view-status",
  "view-logs",
  "view-artifacts"
]);
const requiredAdapterEvidence = Object.freeze({
  python: "verified",
  node: "verified",
  wasm: "preflight-only",
  containers: "preflight-only"
});
const privatePlanMarker = "\\." + "planning";
const privateReferenceDocsMarker = "reference" + "\\/" + "docs";
const rawSensitivePattern = /bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|ya29\./iu;
const unsafeEvidenceReferencePattern = new RegExp(
  `(?<![A-Za-z])[A-Za-z]:[\\\\/]|\\\\\\\\|(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)|\\.\\.[\\\\/]|(?:^|[\\s"'(])~[\\\\/]|${privatePlanMarker}|${privateReferenceDocsMarker}|bearer\\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|ya29\\.`,
  "iu"
);

export const sampleDesktopRunnerEvidence = Object.freeze({
  schemaVersion,
  sopReferences: ["docs/security/desktop-runner-sop.md"],
  supportedPlatforms: ["windows", "macos", "linux"],
  platforms: {
    windows: platformEvidence("windows"),
    macos: platformEvidence("macos"),
    linux: platformEvidence("linux")
  },
  adapterEvidence: {
    python: { status: "verified", signer: "agentique-adapter-release", digest: "a".repeat(64) },
    node: { status: "verified", signer: "agentique-adapter-release", digest: "b".repeat(64) },
    wasm: { status: "preflight-only", gate: "wasm-wasi-sandbox-gate" },
    containers: { status: "preflight-only", gate: "rootless-container-preflight-gate" }
  },
  releaseClaims: {
    localRunnerScope: "supported-local-only",
    productionDesktopRuntime: false,
    installerUpdater: false,
    hostedRuntime: false,
    universalRuntime: false,
    automaticExecution: false
  }
});

export function validateDesktopRunnerEvidence(evidence = sampleDesktopRunnerEvidence) {
  const errors = [];
  if (!evidence || typeof evidence !== "object") {
    return blockedReview([issue("desktop-runner.invalid", "Desktop runner evidence must be an object.")]);
  }

  assertNoUnsafeEvidenceText(evidence, errors);

  if (evidence.schemaVersion !== schemaVersion) {
    errors.push(issue("desktop-runner.schema", "Desktop runner evidence schema is unsupported."));
  }

  const sop = reviewSopReferences(evidence.sopReferences, errors);
  const platforms = reviewPlatforms(evidence, errors);
  const adapters = reviewAdapters(evidence.adapterEvidence, errors);
  const releaseClaims = reviewReleaseClaims(evidence.releaseClaims, errors);
  const ok = errors.length === 0;

  return {
    schemaVersion: "agentique.desktopRunnerEvidenceReview.v1",
    ok,
    status: ok ? "accepted" : "blocked",
    sop,
    platforms,
    adapters,
    releaseClaims,
    summary: {
      supportedPlatforms: Object.keys(platforms).length,
      workflowActions: requiredWorkflowActions.length,
      adapterChecks: Object.keys(adapters).length,
      productionClaimsBlocked: releaseClaims.productionDesktopRuntime === false && releaseClaims.installerUpdater === false
    },
    errors: errors.map((error) => ({ code: error.code, message: redactText(error.message) }))
  };
}

export function reviewDesktopRunnerValidationGate() {
  const accepted = validateDesktopRunnerEvidence();
  const missingPlatform = validateDesktopRunnerEvidence({
    ...sampleDesktopRunnerEvidence,
    supportedPlatforms: ["windows", "macos"],
    platforms: {
      windows: sampleDesktopRunnerEvidence.platforms.windows,
      macos: sampleDesktopRunnerEvidence.platforms.macos
    }
  });
  const unsafeReference = validateDesktopRunnerEvidence({
    ...sampleDesktopRunnerEvidence,
    platforms: {
      ...sampleDesktopRunnerEvidence.platforms,
      windows: {
        ...sampleDesktopRunnerEvidence.platforms.windows,
        commandLogRef: ["C", ":\\private\\runner.log"].join("")
      }
    }
  });
  const overclaim = validateDesktopRunnerEvidence({
    ...sampleDesktopRunnerEvidence,
    releaseClaims: {
      ...sampleDesktopRunnerEvidence.releaseClaims,
      productionDesktopRuntime: true,
      installerUpdater: true
    }
  });

  return {
    schemaVersion: "agentique.desktopRunnerValidationGateReview.v1",
    ok: accepted.ok && !missingPlatform.ok && !unsafeReference.ok && !overclaim.ok,
    acceptedStatus: accepted.status,
    missingPlatformBlocked: missingPlatform.errors.some((error) => error.code === "desktop-runner.platform-missing"),
    unsafeReferenceBlocked: unsafeReference.errors.some((error) => error.code === "desktop-runner.evidence-reference"),
    overclaimBlocked: overclaim.errors.some((error) => error.code === "desktop-runner.release-claim"),
    summary: accepted.summary
  };
}

function platformEvidence(platform) {
  return {
    status: "passed",
    commandLogRef: `evidence/${platform}-runner-command-log.txt`,
    localExecution: "passed",
    processCleanup: {
      status: "passed",
      receipt: true,
      orphanProcesses: 0
    },
    crashRecovery: {
      status: "passed",
      recoveredState: "cleaned"
    },
    artifactRedaction: {
      status: "passed",
      noSecrets: true,
      noLocalPaths: true
    },
    scans: {
      noSecrets: "passed",
      publicBoundary: "passed"
    },
    playwright: {
      status: "passed",
      workflows: [...requiredWorkflowActions],
      traceRef: `evidence/${platform}-runner-playwright-trace.zip`
    }
  };
}

function reviewSopReferences(references, errors) {
  const refs = Array.isArray(references) ? references.map(String) : [];
  if (!refs.includes("docs/security/desktop-runner-sop.md")) {
    errors.push(issue("desktop-runner.sop-reference", "Runner acceptance evidence must reference the desktop runner SOP."));
  }
  for (const ref of refs) {
    validateEvidenceReference(ref, errors);
  }
  return refs;
}

function reviewPlatforms(evidence, errors) {
  const supported = Array.isArray(evidence.supportedPlatforms) ? evidence.supportedPlatforms.map(String) : [];
  const output = {};
  for (const platform of requiredPlatforms) {
    if (!supported.includes(platform) || !evidence.platforms?.[platform]) {
      errors.push(issue("desktop-runner.platform-missing", `${platform} desktop runner evidence is required.`));
      continue;
    }
    output[platform] = reviewPlatformEvidence(platform, evidence.platforms[platform], errors);
  }
  return output;
}

function reviewPlatformEvidence(platform, evidence = {}, errors) {
  if (evidence.status !== "passed") {
    errors.push(issue("desktop-runner.platform-status", `${platform} evidence status must pass.`));
  }
  validateEvidenceReference(evidence.commandLogRef, errors);
  if (evidence.localExecution !== "passed") {
    errors.push(issue("desktop-runner.local-execution", `${platform} local execution evidence must pass.`));
  }
  if (evidence.processCleanup?.status !== "passed" || evidence.processCleanup?.receipt !== true || evidence.processCleanup?.orphanProcesses !== 0) {
    errors.push(issue("desktop-runner.cleanup", `${platform} process cleanup evidence must pass with zero orphan processes.`));
  }
  if (evidence.crashRecovery?.status !== "passed" || !["cleaned", "failed-safe", "recovered"].includes(evidence.crashRecovery?.recoveredState)) {
    errors.push(issue("desktop-runner.crash-recovery", `${platform} crash recovery evidence must pass.`));
  }
  if (evidence.artifactRedaction?.status !== "passed" || evidence.artifactRedaction?.noSecrets !== true || evidence.artifactRedaction?.noLocalPaths !== true) {
    errors.push(issue("desktop-runner.artifact-redaction", `${platform} artifact redaction evidence must pass.`));
  }
  if (evidence.scans?.noSecrets !== "passed" || evidence.scans?.publicBoundary !== "passed") {
    errors.push(issue("desktop-runner.scans", `${platform} no-secret and public-boundary scans must pass.`));
  }
  if (evidence.playwright?.status !== "passed") {
    errors.push(issue("desktop-runner.playwright", `${platform} Playwright runner workflow evidence must pass.`));
  }
  const workflows = Array.isArray(evidence.playwright?.workflows) ? evidence.playwright.workflows.map(String) : [];
  for (const action of requiredWorkflowActions) {
    if (!workflows.includes(action)) {
      errors.push(issue("desktop-runner.playwright", `${platform} Playwright workflow is missing ${action}.`));
      break;
    }
  }
  validateEvidenceReference(evidence.playwright?.traceRef, errors);
  return {
    status: evidence.status === "passed" ? "passed" : "blocked",
    commandLogRef: redactText(String(evidence.commandLogRef ?? "")),
    localExecution: evidence.localExecution === "passed" ? "passed" : "blocked",
    processCleanup: {
      status: evidence.processCleanup?.status === "passed" ? "passed" : "blocked",
      receipt: evidence.processCleanup?.receipt === true,
      orphanProcesses: Number(evidence.processCleanup?.orphanProcesses ?? -1)
    },
    crashRecovery: {
      status: evidence.crashRecovery?.status === "passed" ? "passed" : "blocked",
      recoveredState: redactText(String(evidence.crashRecovery?.recoveredState ?? ""))
    },
    artifactRedaction: {
      status: evidence.artifactRedaction?.status === "passed" ? "passed" : "blocked",
      noSecrets: evidence.artifactRedaction?.noSecrets === true,
      noLocalPaths: evidence.artifactRedaction?.noLocalPaths === true
    },
    scans: {
      noSecrets: evidence.scans?.noSecrets === "passed" ? "passed" : "blocked",
      publicBoundary: evidence.scans?.publicBoundary === "passed" ? "passed" : "blocked"
    },
    playwright: {
      status: evidence.playwright?.status === "passed" ? "passed" : "blocked",
      workflows,
      traceRef: redactText(String(evidence.playwright?.traceRef ?? ""))
    }
  };
}

function reviewAdapters(adapterEvidence = {}, errors) {
  const output = {};
  for (const [adapter, expectedStatus] of Object.entries(requiredAdapterEvidence)) {
    const evidence = adapterEvidence[adapter] ?? {};
    if (evidence.status !== expectedStatus) {
      errors.push(issue(adapter === "python" || adapter === "node" ? "desktop-runner.adapter-signature" : "desktop-runner.adapter-preflight", `${adapter} adapter evidence must be ${expectedStatus}.`));
    }
    if ((adapter === "python" || adapter === "node") && (evidence.signer !== "agentique-adapter-release" || !/^[a-f0-9]{64}$/u.test(String(evidence.digest ?? "")))) {
      errors.push(issue("desktop-runner.adapter-signature", `${adapter} adapter signature evidence is incomplete.`));
    }
    output[adapter] = {
      status: evidence.status === expectedStatus ? expectedStatus : "blocked",
      signer: redactText(String(evidence.signer ?? "")),
      digest: String(evidence.digest ?? "").slice(0, 12),
      gate: redactText(String(evidence.gate ?? ""))
    };
  }
  return output;
}

function reviewReleaseClaims(claims = {}, errors) {
  const normalized = {
    localRunnerScope: String(claims.localRunnerScope ?? ""),
    productionDesktopRuntime: claims.productionDesktopRuntime === true,
    installerUpdater: claims.installerUpdater === true,
    hostedRuntime: claims.hostedRuntime === true,
    universalRuntime: claims.universalRuntime === true,
    automaticExecution: claims.automaticExecution === true
  };
  if (normalized.localRunnerScope !== "supported-local-only") {
    errors.push(issue("desktop-runner.release-scope", "Runner evidence scope must be supported-local-only."));
  }
  for (const [claim, value] of Object.entries(normalized)) {
    if (claim !== "localRunnerScope" && value === true) {
      errors.push(issue("desktop-runner.release-claim", `${claim} is not supported by desktop runner evidence.`));
    }
  }
  return normalized;
}

function validateEvidenceReference(reference, errors) {
  const text = String(reference ?? "");
  if (!/^(docs\/security\/desktop-runner-sop\.md|evidence\/[A-Za-z0-9._/-]+|docs\/validation\/[A-Za-z0-9._/-]+)$/u.test(text) || text.includes("..") || unsafeEvidenceReferencePattern.test(text)) {
    errors.push(issue("desktop-runner.evidence-reference", "Evidence references must be path-neutral, public-safe, and secret-free."));
  }
}

function assertNoUnsafeEvidenceText(value, errors) {
  if (value == null) return;
  if (typeof value === "string") {
    if (rawSensitivePattern.test(value)) {
      errors.push(issue("desktop-runner.inline-secret", "Desktop runner evidence contains inline sensitive material."));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertNoUnsafeEvidenceText(entry, errors);
    return;
  }
  if (typeof value === "object") {
    for (const nested of Object.values(value)) assertNoUnsafeEvidenceText(nested, errors);
  }
}

function blockedReview(errors) {
  return {
    schemaVersion: "agentique.desktopRunnerEvidenceReview.v1",
    ok: false,
    status: "blocked",
    sop: [],
    platforms: {},
    adapters: {},
    releaseClaims: {},
    summary: { supportedPlatforms: 0, workflowActions: requiredWorkflowActions.length, adapterChecks: 0, productionClaimsBlocked: false },
    errors: errors.map((error) => ({ code: error.code, message: redactText(error.message) }))
  };
}

function issue(code, message) {
  const error = new Error(redactText(message));
  error.code = code;
  return error;
}
