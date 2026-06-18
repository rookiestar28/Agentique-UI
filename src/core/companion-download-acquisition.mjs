import { normalizeCompanionDownloadMetadata, sampleCompanionReadback } from "./companion-readback-adapter.mjs";

export const companionDownloadAcquisitionVersion = "agentique.companionDownloadAcquisition.v1";

const SOURCE_PACKAGE = "@agentique.io/readback";
const SOURCE_VERSION = "download-source-semantics-v1";
const DEFAULT_BASE_URL = "https://agentique.io";
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const ABSOLUTE_MAX_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const MAX_REDIRECTS = 10;
const RESERVED_WINDOWS_NAMES = new Set(["con", "prn", "aux", "nul", "clock$"]);
const SENSITIVE_QUERY_PATTERN = /(token|signature|secret|credential|key|expires|policy|auth|session)/iu;
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/gu,
  /\bsk-[A-Za-z0-9_-]{20,}\b/gu,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/gu,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/giu
];
const WINDOWS_PATH_PATTERN = new RegExp("[A-Za-z]:\\\\[^\\s\"'<>]+", "gu");
const POSIX_PATH_PATTERN = new RegExp(`/(?:${["home", "Users", "mnt"].join("|")})/[^\\s"'<>]+`, "gu");
const INTERNAL_PATH_PATTERN = new RegExp(
  [
    ["\\.", "planning"].join(""),
    ["\\.", "sessions"].join(""),
    ["reference", "docs"].join("[\\\\/]"),
    "(?:^|[\\\\/])REFERENCE(?:[\\\\/]|$)"
  ].join("|"),
  "giu"
);

export const sampleCompanionAcquisitionRequest = Object.freeze({
  userSelectedDestination: true,
  destinationRoot: "workspace:library",
  filename: "example-visual-guide.agentique.zip",
  maxBytes: 16 * 1024 * 1024,
  allowOverwrite: false,
  allowedRedirectOrigins: ["https://agentique.io", "https://cdn.agentique.io"],
  maxRedirects: 3,
  existingFiles: []
});

export const sampleCompanionAcquisitionResult = Object.freeze({
  ok: true,
  bytesWritten: 10 * 1024 * 1024,
  sha256: "e".repeat(64),
  atomicRename: true,
  partialWrite: false,
  cleanupReceipt: {
    required: false,
    performed: false,
    status: "not-required"
  }
});

export function createCompanionDownloadAcquisitionPlan(
  metadataInput = sampleCompanionReadback,
  requestInput = sampleCompanionAcquisitionRequest,
  options = {}
) {
  const metadata = normalizeCompanionDownloadMetadata(metadataInput);
  const request = normalizeRequest(requestInput, options);
  const findings = [];
  const transfer = normalizeTransfer(metadata, options, findings);
  const destination = normalizeDestination(metadata, request, findings);
  const redirectPolicy = normalizeRedirectPolicy(request, transfer, findings);
  const integrity = normalizeIntegrity(metadata, request, findings);

  if (metadata.availability !== "available") {
    findings.push(issue("download.unavailable", "Download metadata is not available.", "metadata.availability"));
  }
  if (!metadata.digestPresent || !metadata.digestValid || !metadata.digest) {
    findings.push(issue("download.invalid-digest", "Download metadata must include a valid SHA-256 digest.", "metadata.digest"));
  }
  if (metadata.urlRedacted) {
    findings.push(issue("download.unsafe-url", "Download URL was redacted by the public readback adapter.", "metadata.url"));
  }

  const ok = findings.length === 0;
  return deepFreeze({
    schemaVersion: companionDownloadAcquisitionVersion,
    sourcePackage: SOURCE_PACKAGE,
    sourceVersion: SOURCE_VERSION,
    sourceSurface: "download-metadata-acquisition-proof",
    operationMode: "local-acquisition-plan",
    ok,
    decision: ok ? "ready" : "blocked",
    checkedAt: safeIso(options.checkedAt ?? "2026-06-13T00:00:00.000Z"),
    metadata: {
      resourceId: safeString(metadata.resourceId),
      availability: metadata.availability,
      downloadKind: metadata.downloadKind,
      method: metadata.method,
      filename: safeString(metadata.filename),
      mediaType: safeString(metadata.mediaType),
      sizeBytes: metadata.sizeBytes,
      digest: metadata.digest,
      observedAt: safeString(metadata.observedAt),
      expiresAt: safeString(metadata.expiresAt)
    },
    request: {
      userSelectedDestination: request.userSelectedDestination,
      noOverwriteDefault: request.allowOverwrite !== true,
      allowOverwrite: request.allowOverwrite,
      maxBytes: request.maxBytes
    },
    transfer,
    destination,
    redirectPolicy,
    integrity,
    cleanup: createCleanupState({ findings }),
    findings,
    proofRows: createPlanRows({ ok, transfer, destination, redirectPolicy, integrity, findings }),
    noInstall: createNoInstallBoundary(),
    noExecution: createNoExecutionBoundary(),
    noOverclaim: createNoOverclaimBoundary()
  });
}

export function createCompanionArtifactAcquisitionProof(plan, resultInput = sampleCompanionAcquisitionResult, options = {}) {
  const basePlan = plan?.schemaVersion === companionDownloadAcquisitionVersion
    ? plan
    : createCompanionDownloadAcquisitionPlan(plan, sampleCompanionAcquisitionRequest, options);
  const result = normalizeResult(resultInput);
  const findings = [...(basePlan.findings ?? [])];

  if (!basePlan.ok) {
    findings.push(issue("acquisition.plan-blocked", "Acquisition proof cannot pass because the plan is blocked.", "plan"));
  } else {
    if (result.ok !== true) {
      findings.push(issue("acquisition.failed", "Acquisition result did not complete successfully.", "result.ok"));
    }
    if (result.bytesWritten !== basePlan.integrity.expectedSizeBytes) {
      findings.push(issue("acquisition.size-mismatch", "Acquired byte count does not match expected size.", "result.bytesWritten"));
    }
    if (result.bytesWritten > basePlan.integrity.maxBytes) {
      findings.push(issue("acquisition.oversize-result", "Acquired byte count exceeds the max-byte boundary.", "result.bytesWritten"));
    }
    if (result.sha256 !== basePlan.integrity.expectedSha256) {
      findings.push(issue("acquisition.digest-mismatch", "Acquired SHA-256 digest does not match metadata.", "result.sha256"));
    }
    if (result.atomicRename !== true) {
      findings.push(issue("acquisition.atomic-write-missing", "Acquisition must finish with an atomic temp-file rename.", "result.atomicRename"));
    }
    if (result.partialWrite === true) {
      findings.push(issue("acquisition.partial-write", "Partial acquisition requires cleanup evidence.", "result.partialWrite"));
    }
    if (result.finalPathReference && result.finalPathReference !== basePlan.destination.finalPathReference) {
      findings.push(issue("acquisition.destination-mismatch", "Acquisition output reference differs from the planned destination.", "result.finalPathReference"));
    }
  }

  const cleanup = createCleanupState({ findings, result });
  if (cleanup.required && cleanup.performed !== true) {
    findings.push(issue("acquisition.cleanup-missing", "Failed or partial acquisition requires a cleanup receipt.", "result.cleanupReceipt"));
  }

  const ok = findings.length === 0;
  const finalCleanup = createCleanupState({ findings, result });
  return deepFreeze({
    schemaVersion: companionDownloadAcquisitionVersion,
    sourcePackage: SOURCE_PACKAGE,
    sourceVersion: SOURCE_VERSION,
    sourceSurface: "download-metadata-acquisition-proof",
    operationMode: "local-acquisition-proof",
    ok,
    decision: ok ? "accepted" : "blocked",
    checkedAt: safeIso(options.checkedAt ?? "2026-06-13T00:01:00.000Z"),
    plan: summarizePlan(basePlan),
    result: {
      ok: result.ok,
      bytesWritten: result.bytesWritten,
      sha256: result.sha256,
      atomicRename: result.atomicRename,
      partialWrite: result.partialWrite,
      finalPathReference: safeString(result.finalPathReference)
    },
    integrity: {
      expectedSizeBytes: basePlan.integrity.expectedSizeBytes,
      actualBytesWritten: result.bytesWritten,
      expectedSha256: basePlan.integrity.expectedSha256,
      actualSha256: result.sha256,
      sizeMatches: result.bytesWritten === basePlan.integrity.expectedSizeBytes,
      digestMatches: result.sha256 === basePlan.integrity.expectedSha256,
      maxBytes: basePlan.integrity.maxBytes
    },
    cleanup: finalCleanup,
    findings,
    proofRows: createProofRows({ ok, plan: basePlan, result, cleanup: finalCleanup, findings }),
    noInstall: createNoInstallBoundary(),
    noExecution: createNoExecutionBoundary(),
    noOverclaim: createNoOverclaimBoundary()
  });
}

export function assertNoInstallAcquisitionBoundary(proof) {
  const issues = [];
  for (const key of ["directInstall", "extractArchive", "openArtifact", "packageInstall", "approvalClaim"]) {
    if (proof?.noInstall?.[key] !== false) {
      issues.push(`install_flag:${key}`);
    }
  }
  for (const key of ["packageLifecycleScripts", "dependencyInstall", "builds", "tests", "workflowActions", "dockerBuilds", "arbitraryCode"]) {
    if (proof?.noExecution?.[key] !== false) {
      issues.push(`execution_flag:${key}`);
    }
  }
  if (proof?.noOverclaim?.broadByteTransfer !== false || proof?.noOverclaim?.platformApproval !== false) {
    issues.push("overclaim_flag");
  }
  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues };
}

function normalizeRequest(input = {}, options = {}) {
  const maxBytes = boundedNumber(input.maxBytes ?? options.maxBytes ?? DEFAULT_MAX_BYTES, DEFAULT_MAX_BYTES);
  const maxRedirects = boundedInteger(input.maxRedirects ?? options.maxRedirects ?? DEFAULT_MAX_REDIRECTS, DEFAULT_MAX_REDIRECTS);
  return {
    userSelectedDestination: input.userSelectedDestination === true,
    destinationRoot: safeString(input.destinationRoot ?? "workspace:library"),
    filename: safeString(input.filename ?? null),
    maxBytes,
    allowOverwrite: input.allowOverwrite === true || input.force === true,
    allowedRedirectOrigins: Array.isArray(input.allowedRedirectOrigins) ? input.allowedRedirectOrigins : [],
    maxRedirects,
    redirectChain: Array.isArray(input.redirectChain) ? input.redirectChain : [],
    existingFiles: Array.isArray(input.existingFiles) ? input.existingFiles.map(safeString).filter(Boolean) : []
  };
}

function normalizeTransfer(metadata, options, findings) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL, findings);
  const transfer = {
    mode: metadata.downloadKind,
    requestMethod: metadata.method,
    url: null,
    ticketEndpoint: null,
    ticketMethod: null,
    byteFetchMethod: null,
    origin: null
  };

  if (metadata.downloadKind === "direct-public-url") {
    const safeUrl = safeAcquisitionUrl(metadata.url, findings, "metadata.url");
    transfer.url = safeUrl?.href ?? null;
    transfer.requestMethod = "GET";
    transfer.byteFetchMethod = "GET";
    transfer.origin = safeUrl?.origin ?? null;
  } else if (metadata.downloadKind === "ticketed-post" || metadata.downloadKind === "ticket") {
    if (metadata.method !== "POST") {
      findings.push(issue("download.ticket-method", "Ticket metadata must use POST.", "metadata.method"));
    }
    const ticketUrl = normalizeTicketEndpoint(metadata.ticketEndpoint, baseUrl, findings);
    transfer.ticketEndpoint = ticketUrl?.href ?? null;
    transfer.ticketMethod = "POST";
    transfer.byteFetchMethod = "GET";
    transfer.origin = ticketUrl?.origin ?? baseUrl?.origin ?? null;
  } else {
    findings.push(issue("download.metadata-only", "Download metadata does not include a safe direct URL or ticket endpoint.", "metadata.downloadKind"));
  }

  return transfer;
}

function normalizeDestination(metadata, request, findings) {
  if (!request.userSelectedDestination) {
    findings.push(issue("destination.not-user-selected", "Destination must be selected by the user.", "request.destination"));
  }

  const root = normalizeWorkspaceRoot(request.destinationRoot, findings);
  const filename = safeFilename(request.filename ?? metadata.filename, findings);
  const finalPathReference = root && filename ? `${root}/${filename}` : null;
  const tempPathReference = root && filename ? `${root}/.${filename}.part` : null;

  const existing = new Set(request.existingFiles);
  if (finalPathReference && !request.allowOverwrite && (existing.has(finalPathReference) || existing.has(filename))) {
    findings.push(issue("destination.output-exists", "Destination already exists and overwrite was not explicitly allowed.", "request.existingFiles"));
  }

  return {
    userSelectedDestination: request.userSelectedDestination,
    rootReference: root,
    filename,
    finalPathReference,
    tempPathReference,
    rootBounded: Boolean(root && filename && finalPathReference?.startsWith(`${root}/`)),
    noOverwriteDefault: request.allowOverwrite !== true,
    overwriteAllowed: request.allowOverwrite,
    writeMode: "atomic-temp-rename"
  };
}

function normalizeRedirectPolicy(request, transfer, findings) {
  if (request.maxRedirects > MAX_REDIRECTS) {
    findings.push(issue("redirect.limit-too-large", "Redirect limit exceeds the local acquisition cap.", "request.maxRedirects"));
  }

  const allowedOrigins = new Set();
  if (transfer.origin) {
    allowedOrigins.add(transfer.origin);
  }
  for (const originInput of request.allowedRedirectOrigins) {
    const origin = normalizeOrigin(originInput, findings, "request.allowedRedirectOrigins");
    if (origin) {
      allowedOrigins.add(origin);
    }
  }

  const chain = [];
  for (const hop of request.redirectChain) {
    const from = safeAcquisitionUrl(hop?.from, findings, "request.redirectChain.from");
    const to = safeAcquisitionUrl(hop?.to, findings, "request.redirectChain.to");
    if (!from || !to) {
      continue;
    }
    chain.push({ from: from.href, to: to.href, toOrigin: to.origin });
    if (!allowedOrigins.has(to.origin)) {
      findings.push(issue("redirect.origin-denied", "Redirect target origin is not allowed.", "request.redirectChain.to"));
    }
  }

  if (chain.length > request.maxRedirects) {
    findings.push(issue("redirect.limit-exceeded", "Redirect chain exceeds the configured limit.", "request.redirectChain"));
  }

  return {
    maxRedirects: request.maxRedirects,
    allowedOrigins: [...allowedOrigins].sort(),
    observedRedirects: chain,
    bounded: request.maxRedirects <= MAX_REDIRECTS
  };
}

function normalizeIntegrity(metadata, request, findings) {
  const expectedSizeBytes = boundedNumber(metadata.sizeBytes, NaN);
  if (!Number.isFinite(expectedSizeBytes) || expectedSizeBytes <= 0) {
    findings.push(issue("integrity.missing-size", "Download metadata must include a positive expected size.", "metadata.sizeBytes"));
  }
  if (Number.isFinite(expectedSizeBytes) && expectedSizeBytes > request.maxBytes) {
    findings.push(issue("integrity.oversize-metadata", "Expected size exceeds the configured max-byte boundary.", "metadata.sizeBytes"));
  }
  if (request.maxBytes > ABSOLUTE_MAX_BYTES) {
    findings.push(issue("integrity.max-bytes-too-large", "Max-byte boundary exceeds the local acquisition cap.", "request.maxBytes"));
  }
  return {
    algorithm: "sha256",
    expectedSizeBytes,
    expectedSha256: metadata.digest,
    maxBytes: request.maxBytes,
    expectedSizeWithinMax: Number.isFinite(expectedSizeBytes) && expectedSizeBytes <= request.maxBytes
  };
}

function normalizeResult(input = {}) {
  return {
    ok: input.ok === true,
    bytesWritten: boundedNumber(input.bytesWritten, 0),
    sha256: safeDigest(input.sha256),
    atomicRename: input.atomicRename === true,
    partialWrite: input.partialWrite === true,
    finalPathReference: safeString(input.finalPathReference ?? null),
    cleanupReceipt: isRecord(input.cleanupReceipt) ? input.cleanupReceipt : {}
  };
}

function createCleanupState({ findings, result = null }) {
  const required = findings.length > 0 || result?.partialWrite === true || result?.ok === false;
  const receipt = isRecord(result?.cleanupReceipt) ? result.cleanupReceipt : {};
  const performed = receipt.performed === true || receipt.status === "completed";
  return {
    required,
    performed: required ? performed : false,
    status: required ? (performed ? "completed" : "required") : "not-required",
    reason: required ? findings[0]?.code ?? "acquisition.failure" : null,
    receiptId: safeString(receipt.receiptId ?? null)
  };
}

function createPlanRows({ ok, transfer, destination, redirectPolicy, integrity, findings }) {
  return deepFreeze([
    row("Acquisition bridge", ok ? "ready" : "blocked", ok ? "Download metadata is ready for local acquisition proof." : firstFindingMessage(findings)),
    row("Destination boundary", destination.rootBounded ? "pass" : "blocked", destination.rootBounded ? "User-selected workspace reference is root-bounded." : "Destination is not a safe workspace reference."),
    row("No-overwrite default", destination.noOverwriteDefault ? "pass" : "explicit", destination.noOverwriteDefault ? "Existing files are blocked unless overwrite is explicit." : "Overwrite was explicitly requested."),
    row("Redirect policy", redirectPolicy.bounded ? "pass" : "blocked", `${redirectPolicy.maxRedirects} maximum redirect hop(s); ${redirectPolicy.allowedOrigins.length} allowed origin(s).`),
    row("Byte/digest proof", integrity.expectedSizeWithinMax && integrity.expectedSha256 ? "pass" : "blocked", "Expected size and SHA-256 digest are required before byte acquisition."),
    row("Atomic write", destination.writeMode === "atomic-temp-rename" ? "pass" : "blocked", "Bytes must land in a temp reference before final rename."),
    row("Install boundary", "pass", "Acquisition does not install, extract, open, approve, or execute the artifact.")
  ]);
}

function createProofRows({ ok, plan, result, cleanup, findings }) {
  return deepFreeze([
    row("Acquisition bridge", ok ? "accepted" : "blocked", ok ? "Local artifact acquisition proof is accepted." : firstFindingMessage(findings)),
    row("Destination boundary", plan.destination.rootBounded ? "pass" : "blocked", plan.destination.finalPathReference ?? "No safe destination."),
    row("No-overwrite default", plan.destination.noOverwriteDefault ? "pass" : "explicit", plan.destination.noOverwriteDefault ? "No overwrite allowed by default." : "Overwrite was explicitly allowed."),
    row("Atomic write", result.atomicRename ? "pass" : "blocked", result.atomicRename ? "Temp write was finalized by atomic rename." : "Atomic rename evidence is missing."),
    row("Redirect policy", plan.redirectPolicy.bounded ? "pass" : "blocked", `${plan.redirectPolicy.maxRedirects} maximum redirect hop(s).`),
    row("Byte/digest proof", result.bytesWritten === plan.integrity.expectedSizeBytes && result.sha256 === plan.integrity.expectedSha256 ? "pass" : "blocked", "Byte count and SHA-256 digest must match metadata."),
    row("Cleanup receipt", cleanup.status, cleanup.required ? "Failure or partial write cleanup must be recorded." : "No cleanup was required for the accepted proof."),
    row("Install boundary", "pass", "No direct install, extraction, opening, package lifecycle, build, test, workflow, Docker, or arbitrary code execution.")
  ]);
}

function summarizePlan(plan) {
  return {
    ok: plan.ok,
    decision: plan.decision,
    resourceId: plan.metadata.resourceId,
    transferMode: plan.transfer.mode,
    finalPathReference: plan.destination.finalPathReference,
    tempPathReference: plan.destination.tempPathReference,
    maxBytes: plan.integrity.maxBytes,
    expectedSizeBytes: plan.integrity.expectedSizeBytes,
    expectedSha256: plan.integrity.expectedSha256
  };
}

function normalizeBaseUrl(value, findings) {
  const url = safeAcquisitionUrl(value, findings, "options.baseUrl");
  if (!url) {
    return null;
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url;
}

function normalizeTicketEndpoint(value, baseUrl, findings) {
  const text = safeString(value);
  if (!text) {
    findings.push(issue("download.missing-ticket-endpoint", "Ticketed download requires a ticket endpoint.", "metadata.ticketEndpoint"));
    return null;
  }
  if (text.startsWith("/") && !text.startsWith("//")) {
    if (hasParentPathSegment(text) || !baseUrl) {
      findings.push(issue("download.unsafe-ticket-endpoint", "Relative ticket endpoint must stay below the base URL.", "metadata.ticketEndpoint"));
      return null;
    }
    return safeAcquisitionUrl(new URL(text, baseUrl).href, findings, "metadata.ticketEndpoint");
  }
  return safeAcquisitionUrl(text, findings, "metadata.ticketEndpoint");
}

function safeAcquisitionUrl(value, findings, location) {
  const text = safeString(value);
  if (!text) {
    findings.push(issue("download.missing-url", "A safe URL is required.", location));
    return null;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    findings.push(issue("download.invalid-url", "URL could not be parsed.", location));
    return null;
  }
  if (!urlIsHttpsOrLoopback(url)) {
    findings.push(issue("download.unsafe-url", "URL must use HTTPS outside loopback development.", location));
    return null;
  }
  if (hasSensitiveQuery(url)) {
    findings.push(issue("download.unsafe-query", "URL query contains [redacted:secret] download material.", location));
    return null;
  }
  url.hash = "";
  return url;
}

function normalizeOrigin(value, findings, location) {
  const url = safeAcquisitionUrl(value, findings, location);
  if (!url) {
    return null;
  }
  return url.origin;
}

function normalizeWorkspaceRoot(value, findings) {
  const text = safeString(value);
  if (!text || !/^workspace:[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/u.test(text)) {
    findings.push(issue("destination.unsafe-root", `Destination root ${text ?? "value"} must be a workspace reference.`, "request.destinationRoot"));
    return null;
  }
  if (hasParentPathSegment(text) || pathIsAbsolute(text) || containsInternalPath(text)) {
    findings.push(issue("destination.unsafe-root", "Destination root must not traverse or expose private paths.", "request.destinationRoot"));
    return null;
  }
  return text.replace(/\/+$/u, "");
}

function safeFilename(value, findings) {
  const text = safeString(value);
  if (!text || text.length > 128) {
    findings.push(issue("destination.unsafe-filename", "Filename must be present and bounded.", "request.filename"));
    return null;
  }
  const namePart = text.split(".")[0].toLowerCase();
  if (
    text === "." ||
    text === ".." ||
    text.startsWith(".") ||
    /[\\/:\0<>|?*\u0000-\u001f]/u.test(text) ||
    text.split(/[\\/]+/u).includes("..") ||
    RESERVED_WINDOWS_NAMES.has(namePart) ||
    /^com[1-9]$/u.test(namePart) ||
    /^lpt[1-9]$/u.test(namePart)
  ) {
    findings.push(issue("destination.unsafe-filename", "Filename is unsafe for local acquisition.", "request.filename"));
    return null;
  }
  return text;
}

function safeDigest(value) {
  const text = safeString(value)?.toLowerCase();
  return /^[a-f0-9]{64}$/u.test(text ?? "") ? text : null;
}

function boundedNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function boundedInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function safeIso(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function urlIsHttpsOrLoopback(url) {
  return url.protocol === "https:" || (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
}

function hasSensitiveQuery(url) {
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_PATTERN.test(key)) {
      return true;
    }
  }
  return false;
}

function hasParentPathSegment(value) {
  return String(value).split(/[\\/]+/u).includes("..");
}

function pathIsAbsolute(value) {
  return /^[A-Za-z]:/u.test(value) || String(value).startsWith("/") || String(value).startsWith("\\");
}

function containsInternalPath(value) {
  INTERNAL_PATH_PATTERN.lastIndex = 0;
  return INTERNAL_PATH_PATTERN.test(value);
}

function createNoInstallBoundary() {
  return {
    directInstall: false,
    extractArchive: false,
    openArtifact: false,
    packageInstall: false,
    approvalClaim: false
  };
}

function createNoExecutionBoundary() {
  return {
    packageLifecycleScripts: false,
    dependencyInstall: false,
    builds: false,
    tests: false,
    workflowActions: false,
    dockerBuilds: false,
    arbitraryCode: false
  };
}

function createNoOverclaimBoundary() {
  return {
    broadByteTransfer: false,
    platformApproval: false,
    safetyCertification: false,
    publicationApproval: false,
    directInstallClaim: false,
    runtimeCompatibilityGuarantee: false
  };
}

function firstFindingMessage(findings) {
  return findings[0]?.message ?? "Acquisition boundary requires review.";
}

function row(label, status, detail) {
  return Object.freeze({
    label,
    status,
    detail: safeString(detail)
  });
}

function issue(code, message, location) {
  return Object.freeze({
    code,
    message: safeString(message),
    location: safeString(location)
  });
}

function safeString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  let text = String(value);
  text = text.replace(WINDOWS_PATH_PATTERN, "[redacted:path]");
  text = text.replace(POSIX_PATH_PATTERN, "[redacted:path]");
  text = text.replace(INTERNAL_PATH_PATTERN, "[redacted:internal]");
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[redacted:secret]");
  }
  return text.trim();
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return value;
}
