const feasibilitySchemaVersion = "agentique.heddlePackageFeasibility.v1";
const allowedDispositions = new Set(["ADOPT_RUNTIME_SIDECAR", "ADOPT_RUN_CLIENT_ONLY", "NO_ADOPT"]);
const expectedPackages = Object.freeze({
  runtime: Object.freeze({
    name: "@heddleagent/runtime",
    version: "7.1.0",
    integrity: "sha512-CB3FXphO8tk/pcgl50t6Oy6OvU3NTdatueJBA7U/scbojyHEHGx6cnJx1ozPR/edP4XnMx8Y5pOFA44DV342Qw=="
  }),
  runClient: Object.freeze({
    name: "@heddleagent/run-client",
    version: "6.0.0",
    integrity: "sha512-SNdXnnpSH7vPaKgk0pKmbiYxxxWynsV4PL+dP3N9jmVNEuq37RoOodv5qQL6TL31sqX5Xgj5P8g5ide7NYoITg=="
  })
});
const privateDirectoryName = `.${["plan", "ning"].join("")}`;
const unsafeReceiptPattern = new RegExp(
  String.raw`(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|(?:^|[\\/])${privateDirectoryName}(?:[\\/]|$)|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_]{20,}|cookie\s*=`,
  "iu"
);

export function validateHeddlePackageFeasibilityReceipt(receipt) {
  const errors = [];
  if (!isRecord(receipt)) return failure("heddle-feasibility.receipt", "Feasibility receipt must be an object.");

  if (receipt.schemaVersion !== feasibilitySchemaVersion) {
    add(errors, "heddle-feasibility.schema-version", "Feasibility receipt schema version is unsupported.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(receipt.assessedAt ?? "")) {
    add(errors, "heddle-feasibility.assessed-at", "Assessment date must use YYYY-MM-DD.");
  }
  if (!/^[a-f0-9]{40}$/u.test(receipt.sourceCommit ?? "")) {
    add(errors, "heddle-feasibility.source-commit", "Source commit must be an immutable SHA-1 identifier.");
  }
  if (!Array.isArray(receipt.recordedDisposition) || receipt.recordedDisposition.length !== 1) {
    add(errors, "heddle-feasibility.disposition-count", "Exactly one disposition must be recorded.");
  } else if (!allowedDispositions.has(receipt.recordedDisposition[0])) {
    add(errors, "heddle-feasibility.disposition", "Recorded disposition is unsupported.");
  }

  validateProductRequirements(receipt.productRequirements, errors);
  validateCandidate("runtime", receipt.candidates?.runtime, errors);
  validateCandidate("runClient", receipt.candidates?.runClient, errors);

  for (const field of ["comparison", "rollback", "notes"]) {
    if (receipt[field] === undefined) add(errors, "heddle-feasibility.missing-field", `Receipt field ${field} is required.`);
  }
  if (unsafeReceiptPattern.test(JSON.stringify(receipt))) {
    add(errors, "heddle-feasibility.unsafe-receipt", "Receipt contains unsafe local or secret material.");
  }

  return freeze({ ok: errors.length === 0, errors });
}

export function evaluateHeddlePackageFeasibility(receipt) {
  const validation = validateHeddlePackageFeasibilityReceipt(receipt);
  if (!validation.ok) throw issue(validation.errors[0].code, validation.errors[0].message);

  const runtime = receipt.candidates.runtime;
  const runClient = receipt.candidates.runClient;
  const runtimeEligible = runtime.packagedNodeRuntime && runtime.closesAcceptedProductGap && runtime.lockPackageCount <= 20 && Object.values(runtime.protocol).every(Boolean);
  const runClientEligible = runClient.closesAcceptedProductGap && receipt.productRequirements.needsHttpSseTransport && Object.values(runClient.protocol).every(Boolean);

  const options = {
    conceptOnly: {
      eligible: true,
      reason: "The accepted Agentique protocol remains sufficient without a new package, transport, or runtime prerequisite."
    },
    runClient: {
      eligible: runClientEligible,
      reason: runClientEligible
        ? "The client closes an accepted transport gap while preserving every protocol invariant."
        : "An adapter would duplicate the accepted protocol while adding transport/CSP surface without complete run address, conflict, and payload guarantees."
    },
    runtime: {
      eligible: runtimeEligible,
      reason: runtimeEligible
        ? "The isolated runtime closes an accepted product gap with a bounded package and protocol surface."
        : "A runtime sidecar would require a packaged Node runtime and a broad graph without closing an accepted product gap."
    }
  };

  const eligibleDispositions = [...(runtimeEligible ? ["ADOPT_RUNTIME_SIDECAR"] : []), ...(runClientEligible ? ["ADOPT_RUN_CLIENT_ONLY"] : []), "NO_ADOPT"];
  const disposition = receipt.recordedDisposition[0];
  if (!eligibleDispositions.includes(disposition)) {
    throw issue("heddle-feasibility.ineligible-disposition", "Recorded package disposition does not satisfy its adoption gates.");
  }

  return freeze({
    status: "accepted",
    disposition,
    eligibleDispositions,
    options,
    reasons: [options.runtime.reason, options.runClient.reason, options.conceptOnly.reason]
  });
}

function validateProductRequirements(value, errors) {
  if (!isRecord(value)) {
    add(errors, "heddle-feasibility.product-requirements", "Product requirements must be an object.");
    return;
  }
  if (typeof value.allowsUserInstalledNode !== "boolean" || typeof value.needsHttpSseTransport !== "boolean") {
    add(errors, "heddle-feasibility.product-requirements", "Product requirement flags must be boolean.");
  }
  if (value.protocolOwner !== "agentique") {
    add(errors, "heddle-feasibility.protocol-owner", "Agentique must remain the protocol owner.");
  }
}

function validateCandidate(key, candidate, errors) {
  if (!isRecord(candidate)) {
    add(errors, "heddle-feasibility.candidate", `Candidate ${key} must be an object.`);
    return;
  }
  const expected = expectedPackages[key];
  if (candidate.name !== expected.name || candidate.version !== expected.version) {
    add(errors, "heddle-feasibility.package-identity", `Candidate ${key} identity does not match the audited version.`);
  }
  if (candidate.expectedIntegrity !== expected.integrity || candidate.observedIntegrity !== expected.integrity) {
    add(errors, "heddle-feasibility.integrity", `Candidate ${key} integrity does not match the exact audited tarball.`);
  }
  if (candidate.license !== "MIT") {
    add(errors, "heddle-feasibility.license", `Candidate ${key} must retain its reviewed MIT license.`);
  }
  if (!Array.isArray(candidate.lifecycleScripts) || candidate.lifecycleScripts.length !== 0) {
    add(errors, "heddle-feasibility.lifecycle", `Candidate ${key} may not require lifecycle scripts.`);
  }
  for (const field of ["tarballBytes", "unpackedBytes", "installedBytes", "fileCount", "lockPackageCount", "directDependencyCount", "binaryPackageCount"]) {
    if (!Number.isSafeInteger(candidate[field]) || candidate[field] < 0) {
      add(errors, "heddle-feasibility.measurement", `Candidate ${key} field ${field} must be a non-negative integer.`);
    }
  }
  if (typeof candidate.packagedNodeRuntime !== "boolean" || typeof candidate.closesAcceptedProductGap !== "boolean") {
    add(errors, "heddle-feasibility.candidate-flags", `Candidate ${key} adoption flags must be boolean.`);
  }
  validateAdvisories(key, candidate.advisories, errors);
  validateEffects(key, candidate.defaultEffects, errors);
  validateProtocol(key, candidate.protocol, errors);
}

function validateAdvisories(key, advisories, errors) {
  if (!isRecord(advisories)) {
    add(errors, "heddle-feasibility.advisories", `Candidate ${key} advisory summary must be an object.`);
    return;
  }
  for (const severity of ["info", "low", "moderate", "high", "critical"]) {
    if (!Number.isSafeInteger(advisories[severity]) || advisories[severity] < 0) {
      add(errors, "heddle-feasibility.advisories", `Candidate ${key} advisory count is invalid.`);
    }
  }
  if ((advisories.high ?? 0) > 0 || (advisories.critical ?? 0) > 0) {
    add(errors, "heddle-feasibility.material-advisory", `Candidate ${key} has a material advisory.`);
  }
}

function validateEffects(key, effects, errors) {
  if (!isRecord(effects)) {
    add(errors, "heddle-feasibility.default-effects", `Candidate ${key} effect summary must be an object.`);
    return;
  }
  for (const field of ["network", "listener", "credentialEnvironment", "arbitraryFilesystem", "childProcess", "residualHandles"]) {
    if (effects[field] !== 0) {
      add(errors, "heddle-feasibility.default-effect", `Candidate ${key} performed a forbidden default effect.`);
    }
  }
}

function validateProtocol(key, protocol, errors) {
  if (!isRecord(protocol)) {
    add(errors, "heddle-feasibility.protocol", `Candidate ${key} protocol summary must be an object.`);
    return;
  }
  for (const field of ["completeAddress", "conflictingDuplicateRejection", "contiguousSequence", "safePayloadBoundary", "singleTerminal"]) {
    if (typeof protocol[field] !== "boolean") {
      add(errors, "heddle-feasibility.protocol", `Candidate ${key} protocol field ${field} must be boolean.`);
    }
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function add(errors, code, message) {
  errors.push({ code, message });
}

function failure(code, message) {
  return freeze({ ok: false, errors: [{ code, message }] });
}

function issue(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
