export const companionReadbackAdapterVersion = "agentique.companionReadbackAdapter.v1";

const DEFAULT_BASE_URL = "https://agentique.io";
const PUBLIC_RESOURCE_API_PREFIX = "/api/public/v1/resources";
const DEFAULT_STALE_AFTER_SECONDS = 15 * 60;

const MUTATION_WORDS = Object.freeze(["publish", "edit", "update", "delete", "admin", "moderate", "submit", "approve", "upload"]);

const PRIVATE_PROJECTION_KEYS = new Set([
  "adminnote",
  "adminnotes",
  "authtoken",
  "bearertoken",
  "credential",
  "credentials",
  "objectkey",
  "objectpath",
  "password",
  "privateendpoint",
  "privatekey",
  "privatereviewnotes",
  "privateuri",
  "privateurl",
  "rawscan",
  "rawscanresult",
  "rawscanresults",
  "refreshtoken",
  "reviewnote",
  "reviewnotes",
  "secret",
  "secrets",
  "secretvalue",
  "sessiontoken",
  "storagekey",
  "storagepath"
]);

const PUBLIC_PRIVATE_TERM_KEYS = new Set(["privatemcpboundary", "credentialreferencekind", "credentialvaluespresent"]);
const PROTOTYPE_POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const UNSAFE_FILENAME_PATTERN = /[<>:"/\\|?*\x00-\x1f]/u;

const BADGE_STATES = Object.freeze({
  parsed: badgeTemplate("parsed", "Parsed", "0969da", "Public readback includes parsed parser metadata."),
  partial: badgeTemplate("partial", "Parser partial", "bf8700", "Public readback shows parser metadata that needs review."),
  unsupported: badgeTemplate("unsupported", "Parser unsupported", "6e7781", "Public readback marks the parser or variant target as unsupported."),
  "variant-available": badgeTemplate("variant-available", "Variant available", "0969da", "Public readback includes a platform variant projection."),
  "agent-native-ready": badgeTemplate("agent-native-ready", "Agent-native ready", "0969da", "Public readback includes current agent-native metadata."),
  "agent-native-review-required": badgeTemplate("agent-native-review-required", "Agent-native review", "bf8700", "Public readback shows agent-native metadata that needs review."),
  "agent-native-private-denied": badgeTemplate("agent-native-private-denied", "Private denied", "6e7781", "Public readback denies private runtime access."),
  "agent-native-ambiguous": badgeTemplate("agent-native-ambiguous", "Resolver ambiguous", "8250df", "Public readback shows multiple possible agent-native matches."),
  published: badgeTemplate("published", "Published", "2ea44f", "The platform readback currently marks this resource as published."),
  "review-required": badgeTemplate("review-required", "Review required", "bf8700", "The platform readback requires review before normal public use."),
  "rescan-required": badgeTemplate(
    "rescan-required",
    "Rescan required",
    "9a6700",
    "The platform readback indicates local content should be scanned again before normal public use."
  ),
  blocked: badgeTemplate("blocked", "Blocked", "cf222e", "The platform readback currently blocks normal public use."),
  stale: badgeTemplate("stale", "Status stale", "6e7781", "The last readback is older than the configured freshness window."),
  unavailable: badgeTemplate("unavailable", "Status unavailable", "6e7781", "The readback endpoint could not provide a current status."),
  "rate-limited": badgeTemplate("rate-limited", "Rate limited", "8250df", "The readback endpoint asked the client to retry later.")
});

export class CompanionReadbackError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "CompanionReadbackError";
    this.code = options.code ?? "companion-readback-error";
    this.status = options.status ?? null;
    this.retryAfter = options.retryAfter ?? null;
    this.cause = options.cause;
  }
}

export const sampleCompanionReadback = Object.freeze({
  observedAt: "2026-06-13T00:00:00.000Z",
  resourceId: "example.visual-guide",
  title: "Example Visual Guide",
  status: "published",
  platformUrl: "https://www.agentique.io/resources/example.visual-guide",
  download: {
    availability: "available",
    method: "POST",
    ticketEndpoint: "/api/public/v1/resources/example.visual-guide/download",
    filename: "example-visual-guide.agentique.zip",
    sizeBytes: 10485760,
    digest: "e".repeat(64)
  },
  sourcePackage: {
    platformId: "source-package",
    artifactKind: "source-package",
    status: "DOWNLOADABLE",
    method: "POST",
    downloadEndpoint: "/api/public/v1/resources/example.visual-guide/download",
    file: {
      fileName: "example-visual-guide.agentique.zip",
      contentType: "application/zip",
      byteSize: 10485760,
      checksumSha256: "e".repeat(64)
    }
  },
  platformProjection: {
    publicationState: "published"
  },
  trustPanel: {
    state: "current"
  },
  parserVariant: {
    parserEvidence: { parseStatus: "parsed" },
    compatibility: { status: "available" },
    platformVariants: [
      {
        state: "available",
        validationState: "current",
        download: { availability: "available" }
      }
    ]
  },
  agentNative: {
    namespace: {
      latestPointer: { state: "current" }
    },
    provenanceTrust: { state: "current" },
    privateMcpBoundary: { availability: "private-denied", visibility: "private-denied" },
    resolverResult: {
      state: "matched",
      ambiguity: "none",
      checkpoints: [{ state: "current" }]
    },
    installGuidance: [{ state: "current", downloadAvailability: "available" }]
  }
});

export function createCompanionReadbackClient(options = {}) {
  const baseUrl = normalizeCompanionBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new CompanionReadbackError("A fetch implementation is required.", { code: "missing-fetch" });
  }

  const requestJson = async (path, params) => {
    const url = buildUrl(baseUrl, path, params);
    let response;

    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json"
        }
      });
    } catch (error) {
      throw new CompanionReadbackError("Readback endpoint is unavailable.", {
        code: "unavailable",
        cause: error
      });
    }

    if (response.status === 429) {
      throw new CompanionReadbackError("Readback endpoint is rate limited.", {
        code: "rate-limited",
        status: 429,
        retryAfter: response.headers?.get?.("retry-after") ?? null
      });
    }

    if (response.status === 404) {
      throw new CompanionReadbackError("Readback resource was not found.", {
        code: "not-found",
        status: 404
      });
    }

    if (response.status >= 500) {
      throw new CompanionReadbackError("Readback endpoint is unavailable.", {
        code: "unavailable",
        status: response.status,
        retryAfter: response.headers?.get?.("retry-after") ?? null
      });
    }

    if (!response.ok) {
      throw new CompanionReadbackError("Readback request failed.", {
        code: "http-error",
        status: response.status
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new CompanionReadbackError("Readback endpoint returned invalid JSON.", {
        code: "invalid-json",
        status: response.status,
        cause: error
      });
    }

    return normalizeCompanionPublicReadback(payload);
  };

  return Object.freeze({
    listResources(params = {}) {
      return requestJson(PUBLIC_RESOURCE_API_PREFIX, pickListParams(params));
    },
    getResource(resourceId) {
      return requestJson(`${PUBLIC_RESOURCE_API_PREFIX}/${encodeSegment(resourceId)}`);
    },
    getDownloadMetadata(resourceId) {
      return requestJson(`${PUBLIC_RESOURCE_API_PREFIX}/${encodeSegment(resourceId)}/download`);
    },
    getReadback(resourceId) {
      return requestJson(`${PUBLIC_RESOURCE_API_PREFIX}/${encodeSegment(resourceId)}/readback`);
    },
    getContextBundle(resourceId, params = {}) {
      return requestJson(`${PUBLIC_RESOURCE_API_PREFIX}/${encodeSegment(resourceId)}/context-bundle`, pickContextBundleParams(params));
    },
    getSelectionReadback(resourceId, params = {}) {
      return requestJson(`${PUBLIC_RESOURCE_API_PREFIX}/${encodeSegment(resourceId)}/selection-readback`, pickSelectionReadbackParams(params));
    }
  });
}

export function assertReadOnlyCompanionClientSurface(client) {
  if (!client || typeof client !== "object" || Array.isArray(client)) {
    return { ok: false, issues: ["missing_client"] };
  }

  const issues = [];
  for (const [key, value] of Object.entries(client)) {
    const normalized = normalizeStatus(key);
    if (typeof value !== "function") {
      issues.push(`non_function_surface:${key}`);
    }
    if (MUTATION_WORDS.some((word) => normalized.includes(word))) {
      issues.push(`mutation_surface:${key}`);
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, issues: [] };
}

export function normalizeCompanionBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new CompanionReadbackError("Readback base URL is invalid.", {
      code: "invalid-base-url",
      cause: error
    });
  }

  const isHttps = parsed.protocol === "https:";
  const isLoopbackHttp = parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]");

  if (!isHttps && !isLoopbackHttp) {
    throw new CompanionReadbackError("Readback base URL must use HTTPS outside loopback development.", {
      code: "unsafe-base-url"
    });
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

export function normalizeCompanionPublicReadback(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => normalizeCompanionPublicReadback(entry)));
  }

  if (!isRecord(value)) {
    return value;
  }

  const normalized = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    // Guard before assignment; these keys can mutate prototypes or expose private projections.
    if (PROTOTYPE_POLLUTION_KEYS.has(key) || isPrivateProjectionKey(key)) {
      continue;
    }
    normalized[key] = normalizeCompanionPublicReadback(nestedValue);
  }

  return Object.freeze(normalized);
}

export function normalizeCompanionResourceList(value) {
  const normalized = normalizeCompanionPublicReadback(value);
  const source = Array.isArray(normalized) ? { items: normalized } : isRecord(normalized?.resources) ? normalized.resources : normalized;
  const items = Array.isArray(source?.items) ? source.items.filter(isRecord).map(projectResourceListItem) : [];
  return Object.freeze({
    items: Object.freeze(items),
    pageInfo: Object.freeze({
      hasNextPage: Boolean(source?.pageInfo?.hasNextPage),
      endCursor: stringOrNull(source?.pageInfo?.endCursor),
      totalCount: numberOrNull(source?.pageInfo?.totalCount)
    }),
    observedAt: stringOrNull(source?.observedAt ?? normalized?.observedAt ?? normalized?.updatedAt)
  });
}

export function normalizeCompanionResourceDetail(value) {
  const normalized = normalizeCompanionPublicReadback(value);
  const detail = isRecord(normalized?.resource) ? normalized.resource : normalized;
  if (!isRecord(detail)) {
    return Object.freeze({
      resourceId: null,
      title: null,
      summary: null,
      status: "unavailable",
      platformUrl: null,
      downloadAvailability: "unknown",
      updatedAt: null
    });
  }

  return Object.freeze({
    resourceId: stringOrNull(detail.resourceId ?? detail.id),
    title: stringOrNull(detail.title ?? detail.name),
    summary: stringOrNull(detail.summary ?? detail.description),
    status: normalizePublicState(detail.status ?? detail.state ?? detail.publicationStatus ?? detail.publicationState),
    platformUrl: stringOrNull(detail.platformUrl ?? detail.resourceUrl ?? detail.url ?? detail.canonicalUrl),
    downloadAvailability: normalizePublicState(detail.downloadAvailability ?? detail.download?.availability),
    updatedAt: stringOrNull(detail.updatedAt ?? detail.observedAt)
  });
}

export function normalizeCompanionDownloadMetadata(value) {
  const normalized = normalizeCompanionPublicReadback(value);
  if (!isRecord(normalized)) {
    return emptyDownloadMetadata();
  }

  const body = unwrapCompanionDownloadMetadataEnvelope(normalized);
  const canonicalSourcePackage = projectCanonicalSourcePackage(body.sourcePackage);
  const download = isRecord(body.download) ? body.download : {};
  const file = canonicalSourcePackage?.file ?? firstRecord(download.file, body.file, download.files?.[0], body.files?.[0]);
  const endpointValue = canonicalSourcePackage
    ? canonicalSourcePackage.endpointValue
    : firstString(download.ticketEndpoint, body.ticketEndpoint, download.downloadEndpoint, body.downloadEndpoint, download.endpoint, body.endpoint, download.path, body.path);
  const rawUrl = canonicalSourcePackage ? null : firstString(download.url, body.downloadUrl, body.url, file?.url, file?.downloadUrl);
  const projectedUrl = projectPublicDownloadUrl(rawUrl);
  const ticketEndpoint = projectTicketEndpoint(endpointValue);
  const digestValue = canonicalSourcePackage
    ? canonicalSourcePackage.digestValue
    : firstString(download.digest, body.digest, file?.digest, download.sha256, body.sha256, file?.sha256);
  const digest = projectDigest(digestValue);
  const method = normalizeDownloadMethod(canonicalSourcePackage ? canonicalSourcePackage.methodValue : (download.method ?? body.method ?? (ticketEndpoint ? "POST" : null)));
  const canonicalUnavailableReason = canonicalSourcePackage ? getCanonicalSourcePackageUnavailableReason(canonicalSourcePackage, { digest, method, ticketEndpoint }) : null;
  const availability = canonicalSourcePackage
    ? canonicalUnavailableReason
      ? "unavailable"
      : "available"
    : normalizePublicState(download.availability ?? body.availability ?? file?.availability ?? body.status ?? normalized.availability ?? normalized.status ?? normalized.state);
  const digestValid = canonicalSourcePackage ? typeof digestValue !== "string" || isSha256Digest(digest) : typeof digestValue !== "string" || digest !== null;

  return Object.freeze({
    resourceId: stringOrNull(body.resourceId ?? body.id ?? normalized.resourceId ?? normalized.id),
    availability,
    downloadKind: projectDownloadKind({ availability, url: projectedUrl, ticketEndpoint, method }),
    method,
    ticketEndpoint,
    url: projectedUrl,
    urlRedacted: typeof rawUrl === "string" && projectedUrl === null,
    filename: canonicalSourcePackage
      ? canonicalSourcePackage.filename
      : stringOrNull(download.filename ?? download.fileName ?? body.filename ?? body.fileName ?? file?.filename ?? file?.fileName),
    mediaType: canonicalSourcePackage
      ? canonicalSourcePackage.mediaType
      : stringOrNull(download.mediaType ?? body.mediaType ?? file?.mediaType ?? download.contentType ?? body.contentType ?? file?.contentType),
    sizeBytes: canonicalSourcePackage
      ? canonicalSourcePackage.sizeBytes
      : numberOrNull(download.sizeBytes ?? download.size ?? body.sizeBytes ?? body.size ?? file?.sizeBytes ?? file?.size),
    digest,
    digestPresent: typeof digestValue === "string",
    digestValid,
    unavailableReason: stringOrNull(
      canonicalSourcePackage
        ? firstString(
            canonicalSourcePackage.sourcePackage.unavailableReason,
            canonicalSourcePackage.file?.unavailableReason,
            canonicalSourcePackage.sourcePackage.reason,
            canonicalUnavailableReason
          )
        : firstString(download.unavailableReason, body.unavailableReason, file?.unavailableReason, download.reason, body.reason)
    ),
    observedAt: stringOrNull(
      canonicalSourcePackage?.sourcePackage.observedAt ?? download.observedAt ?? body.observedAt ?? file?.observedAt ?? normalized.observedAt ?? normalized.updatedAt
    ),
    expiresAt: stringOrNull(canonicalSourcePackage?.sourcePackage.expiresAt ?? download.expiresAt ?? body.expiresAt ?? file?.expiresAt ?? normalized.expiresAt)
  });
}

export function normalizeCompanionTrustReadback(value) {
  const normalized = normalizeCompanionPublicReadback(value);
  if (!isRecord(normalized)) {
    return Object.freeze({ platformState: "unavailable", trustPanelState: null, reviewState: null });
  }

  return Object.freeze({
    platformState: normalizePublicState(normalized.platformProjection?.publicationState ?? normalized.status ?? normalized.state),
    trustPanelState: normalizePublicState(normalized.trustPanel?.state),
    reviewState: normalizePublicState(normalized.reviewEligibility?.state)
  });
}

export function normalizeCompanionParserVariantReadback(value) {
  const parserVariant = normalizeCompanionPublicReadback(value)?.parserVariant;
  if (!isRecord(parserVariant)) {
    return Object.freeze({ state: "unavailable", variantCount: 0, downloadAvailability: "unknown" });
  }

  const platformVariants = Array.isArray(parserVariant.platformVariants) ? parserVariant.platformVariants : [];
  return Object.freeze({
    state: parserVariantBadgeState({ parserVariant }) ?? "unavailable",
    parseStatus: normalizePublicState(parserVariant.parserEvidence?.parseStatus),
    compatibilityStatus: normalizePublicState(parserVariant.compatibility?.status),
    variantCount: platformVariants.length,
    downloadAvailability: normalizePublicState(platformVariants[0]?.download?.availability)
  });
}

export function normalizeCompanionAgentNativeReadback(value) {
  const agentNative = normalizeCompanionPublicReadback(value)?.agentNative;
  if (!isRecord(agentNative)) {
    return Object.freeze({ state: "unavailable", privateAvailability: "unknown", installTargets: 0 });
  }

  return Object.freeze({
    state: agentNativeBadgeState({ agentNative }) ?? "unavailable",
    resolverState: normalizePublicState(agentNative.resolverResult?.state),
    privateAvailability: normalizePublicState(agentNative.privateMcpBoundary?.availability),
    installTargets: Array.isArray(agentNative.installGuidance) ? agentNative.installGuidance.length : 0
  });
}

export function createCompanionBadgeState(readback, options = {}) {
  if (readback?.code === "rate-limited" || readback?.status === 429) {
    return badge("rate-limited", { retryAfter: readback.retryAfter ?? null });
  }

  if (!readback || readback.code === "unavailable") {
    return badge("unavailable");
  }

  const now = toDate(options.now ?? new Date());
  const staleAfterSeconds = options.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS;
  const observedAt = readback.observedAt ?? readback.checkedAt ?? readback.updatedAt ?? null;

  if (observedAt && isStale(observedAt, now, staleAfterSeconds)) {
    return badge("stale", { observedAt });
  }

  const parserState = parserVariantBadgeState(readback);
  if (parserState) {
    return badge(parserState, { platformUrl: readback.platformUrl ?? readback.url ?? null });
  }

  const agentNativeState = agentNativeBadgeState(readback);
  if (agentNativeState) {
    return badge(agentNativeState, {
      platformUrl: readback.agentNative?.resolverResult?.platformUrl ?? readback.platformUrl ?? readback.url ?? null
    });
  }

  const trustState = trustBadgeState(readback);
  if (trustState) {
    return badge(trustState, { platformUrl: readback.platformUrl ?? readback.url ?? null });
  }

  const status = normalizePublicState(readback.status ?? readback.publicationStatus ?? readback.state);
  if (status === "published") {
    return badge("published", { platformUrl: readback.platformUrl ?? readback.url ?? null });
  }
  if (["review-required", "pending-review"].includes(status)) {
    return badge("review-required");
  }
  if (["blocked", "quarantined", "rejected"].includes(status)) {
    return badge("blocked");
  }
  return badge("unavailable");
}

export function createCompanionReadbackReview(readback = sampleCompanionReadback, options = {}) {
  const normalized = normalizeCompanionPublicReadback(readback);
  const detail = normalizeCompanionResourceDetail(normalized);
  const download = normalizeCompanionDownloadMetadata(normalized);
  const trust = normalizeCompanionTrustReadback(normalized);
  const parserVariant = normalizeCompanionParserVariantReadback(normalized);
  const agentNative = normalizeCompanionAgentNativeReadback(normalized);
  const badgeState = createCompanionBadgeState(normalized, options);

  return Object.freeze({
    schemaVersion: companionReadbackAdapterVersion,
    sourcePackage: "@agentique.io/readback",
    sourceSurface: "read-only-client-normalizers-badges",
    detail,
    download,
    trust,
    parserVariant,
    agentNative,
    badge: badgeState,
    readOnly: Object.freeze({
      mutationMethods: false,
      authRequired: false,
      credentialForwarding: false
    }),
    noOverclaim: Object.freeze({
      liveUploadAvailable: false,
      reviewApprovalAvailable: false,
      publicationAvailable: false,
      runtimeReleaseAvailable: false
    })
  });
}

function trustBadgeState(readback) {
  const desiredState = normalizePublicState(readback.desiredState?.readbackState);
  const scannerFreshness = normalizePublicState(readback.scannerPolicy?.freshness);
  const trustPanelState = normalizePublicState(readback.trustPanel?.state);
  const reviewState = normalizePublicState(readback.reviewEligibility?.state);
  const platformState = normalizePublicState(readback.platformProjection?.publicationState);

  if ([trustPanelState, platformState].some((state) => ["blocked", "quarantined", "rejected"].includes(state))) {
    return "blocked";
  }
  if ([desiredState, scannerFreshness, trustPanelState].includes("rescan-required")) {
    return "rescan-required";
  }
  if ([desiredState, trustPanelState, platformState].includes("review-required") || reviewState === "needs-evidence") {
    return "review-required";
  }
  if (platformState === "published" || trustPanelState === "current") {
    return "published";
  }
  if ([desiredState, scannerFreshness, trustPanelState, platformState].includes("stale")) {
    return "stale";
  }
  return null;
}

function agentNativeBadgeState(readback) {
  const agentNative = readback?.agentNative;
  if (!isRecord(agentNative)) {
    return null;
  }

  const latestState = normalizePublicState(agentNative.namespace?.latestPointer?.state);
  const provenanceState = normalizePublicState(agentNative.provenanceTrust?.state);
  const privateAvailability = normalizePublicState(agentNative.privateMcpBoundary?.availability);
  const privateVisibility = normalizePublicState(agentNative.privateMcpBoundary?.visibility);
  const resolverState = normalizePublicState(agentNative.resolverResult?.state);
  const ambiguity = normalizePublicState(agentNative.resolverResult?.ambiguity);
  const installTargets = Array.isArray(agentNative.installGuidance) ? agentNative.installGuidance : [];
  const installStates = installTargets.map((target) => normalizePublicState(target?.state));
  const downloadStates = installTargets.map((target) => normalizePublicState(target?.downloadAvailability));
  const checkpointStates = Array.isArray(agentNative.resolverResult?.checkpoints)
    ? agentNative.resolverResult.checkpoints.map((checkpoint) => normalizePublicState(checkpoint?.state))
    : [];
  const allStates = [latestState, provenanceState, privateAvailability, resolverState, ...installStates, ...checkpointStates];

  if (allStates.some((state) => ["blocked", "invalid", "failed"].includes(state)) || downloadStates.includes("blocked")) {
    return "blocked";
  }
  if (privateAvailability === "private-denied" || privateVisibility === "private-denied") {
    return "agent-native-private-denied";
  }
  if (
    allStates.some((state) => ["review-required", "stale", "unsupported", "unavailable", "rollback"].includes(state)) ||
    downloadStates.some((state) => ["unavailable", "guidance-only"].includes(state)) ||
    ambiguity === "manual-review-required"
  ) {
    return "agent-native-review-required";
  }
  if (resolverState === "ambiguous" || ambiguity === "alternatives-available") {
    return "agent-native-ambiguous";
  }
  if (
    ["matched", "unknown"].includes(resolverState) &&
    ["none", "unknown"].includes(ambiguity) &&
    ["current", "unknown"].includes(latestState) &&
    ["current", "missing", "unknown"].includes(provenanceState)
  ) {
    return "agent-native-ready";
  }
  return null;
}

function parserVariantBadgeState(readback) {
  const parserVariant = readback?.parserVariant;
  if (!isRecord(parserVariant)) {
    return null;
  }

  const parserStatus = normalizePublicState(parserVariant.parserEvidence?.parseStatus);
  const compatibilityStatus = normalizePublicState(parserVariant.compatibility?.status);
  const platformVariants = Array.isArray(parserVariant.platformVariants) ? parserVariant.platformVariants : [];
  const variantStates = platformVariants.map((variant) => normalizePublicState(variant?.state));
  const validationStates = platformVariants.map((variant) => normalizePublicState(variant?.validationState));
  const downloadStates = platformVariants.map((variant) => normalizePublicState(variant?.download?.availability));

  if (["blocked", "failed"].includes(parserStatus) || compatibilityStatus === "blocked" || variantStates.includes("blocked")) {
    return "blocked";
  }
  if (variantStates.includes("stale") || validationStates.includes("stale")) {
    return "stale";
  }
  if (parserStatus === "unsupported" || compatibilityStatus === "unsupported" || variantStates.includes("unsupported")) {
    return "unsupported";
  }
  if (parserStatus === "partial" || compatibilityStatus === "partial" || variantStates.includes("review-required")) {
    return "partial";
  }
  if (variantStates.includes("available") || downloadStates.includes("available") || downloadStates.includes("source-only")) {
    return "variant-available";
  }
  if (parserStatus === "parsed") {
    return "parsed";
  }
  return null;
}

function badge(state, extras = {}) {
  return Object.freeze({
    ...BADGE_STATES[state],
    ...extras
  });
}

function badgeTemplate(state, label, color, description) {
  return Object.freeze({ state, label, color, description });
}

function projectResourceListItem(item) {
  return Object.freeze({
    resourceId: stringOrNull(item.resourceId ?? item.id),
    title: stringOrNull(item.title ?? item.name),
    summary: stringOrNull(item.summary ?? item.description),
    status: normalizePublicState(item.status ?? item.state ?? item.publicationStatus),
    platformUrl: stringOrNull(item.platformUrl ?? item.resourceUrl ?? item.url),
    updatedAt: stringOrNull(item.updatedAt ?? item.observedAt)
  });
}

function unwrapCompanionDownloadMetadataEnvelope(normalized) {
  if (!isRecord(normalized)) {
    return normalized;
  }
  if (isRecord(normalized.downloadMetadata)) {
    return normalized.downloadMetadata;
  }
  if (isRecord(normalized.data)) {
    return { ...normalized.data, availability: normalized.data.availability ?? normalized.availability };
  }
  return normalized;
}

function projectCanonicalSourcePackage(value) {
  if (!hasCanonicalSourcePackageFields(value)) {
    return null;
  }

  const sourcePackage = value;
  const file = isRecord(sourcePackage.file) ? sourcePackage.file : {};
  const filenameValue = firstString(file.fileName, file.filename, sourcePackage.fileName, sourcePackage.filename);
  const mediaTypeValue = firstString(file.contentType, file.mediaType, sourcePackage.contentType, sourcePackage.mediaType);

  return {
    sourcePackage,
    file,
    status: normalizeSourcePackageStatus(sourcePackage.status),
    methodValue: firstString(sourcePackage.method, sourcePackage.downloadMethod),
    endpointValue: firstString(sourcePackage.downloadEndpoint, sourcePackage.ticketEndpoint, sourcePackage.endpoint, sourcePackage.path),
    filename: isSafePublicFilename(filenameValue) ? filenameValue : null,
    filenameValue,
    mediaType: isSafePublicContentType(mediaTypeValue) ? mediaTypeValue : null,
    mediaTypeValue,
    sizeBytes: numberOrNull(file.byteSize ?? file.sizeBytes ?? file.size ?? sourcePackage.byteSize ?? sourcePackage.sizeBytes ?? sourcePackage.size),
    digestValue: firstString(
      file.checksumSha256,
      file.sha256,
      file.digestSha256,
      file.digest,
      sourcePackage.checksumSha256,
      sourcePackage.sha256,
      sourcePackage.digestSha256,
      sourcePackage.digest
    )
  };
}

function hasCanonicalSourcePackageFields(value) {
  if (!isRecord(value)) {
    return false;
  }
  return ["status", "file", "method", "downloadMethod", "downloadEndpoint", "ticketEndpoint", "artifactKind", "platformId"].some((key) => Object.hasOwn(value, key));
}

function normalizeSourcePackageStatus(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/gu, "_");
}

function getCanonicalSourcePackageUnavailableReason(sourcePackage, { digest, method, ticketEndpoint }) {
  // Canonical source-package metadata is authoritative; legacy fields must not make metadata-only rows downloadable.
  if (sourcePackage.status !== "DOWNLOADABLE") {
    return "source_package_not_downloadable";
  }
  if (!isSafePublicFilename(sourcePackage.filenameValue)) {
    return "source_file_name_invalid";
  }
  if (!isSafePublicContentType(sourcePackage.mediaTypeValue)) {
    return "source_file_content_type_invalid";
  }
  if (!Number.isSafeInteger(sourcePackage.sizeBytes) || sourcePackage.sizeBytes <= 0) {
    return "source_file_size_invalid";
  }
  if (typeof sourcePackage.digestValue !== "string") {
    return "source_file_checksum_missing";
  }
  if (!isSha256Digest(digest)) {
    return "source_file_checksum_invalid";
  }
  if (method !== "POST") {
    return "download_method_unsupported";
  }
  if (!ticketEndpoint) {
    return "download_endpoint_missing";
  }
  return null;
}

function buildUrl(baseUrl, path, params = {}) {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function pickListParams(params) {
  return pickAllowedParams(params, ["limit", "cursor", "q", "type", "platform"]);
}

function pickContextBundleParams(params) {
  return pickAllowedParams(params, ["variant", "platform"]);
}

function pickSelectionReadbackParams(params) {
  return pickAllowedParams(params, ["selection", "variant", "platform"]);
}

function pickAllowedParams(params, allowed) {
  const result = {};
  for (const key of allowed) {
    if (Object.hasOwn(params ?? {}, key)) {
      result[key] = params[key];
    }
  }
  return result;
}

function encodeSegment(value) {
  return encodeURIComponent(String(value ?? ""));
}

function projectTicketEndpoint(value) {
  const text = stringOrNull(value);
  if (!text) {
    return null;
  }
  if (text.startsWith("/") && !text.startsWith("//") && !hasParentPathSegment(text)) {
    return text.split("#")[0].split("?")[0];
  }
  try {
    const url = new URL(text);
    if ((url.protocol === "https:" || isLoopbackUrl(url)) && !hasSensitiveQuery(url)) {
      url.search = "";
      url.hash = "";
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function projectPublicDownloadUrl(value) {
  const text = stringOrNull(value);
  if (!text) {
    return null;
  }
  try {
    const url = new URL(text);
    if ((url.protocol === "https:" || isLoopbackUrl(url)) && !hasSensitiveQuery(url)) {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function isSafePublicFilename(value) {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    value === value.trim() &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !UNSAFE_FILENAME_PATTERN.test(value) &&
    !WINDOWS_RESERVED_NAMES.test(value)
  );
}

function isSafePublicContentType(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*(?:\s*;\s*[a-z0-9!#$&^_.+-]+=[^;\r\n]+)*$/iu.test(value.trim());
}

function projectDownloadKind({ availability, url, ticketEndpoint, method }) {
  if (availability === "unavailable" || availability === "blocked") {
    return "unavailable";
  }
  if (ticketEndpoint && method === "POST") {
    return "ticketed-post";
  }
  if (url) {
    return "direct-public-url";
  }
  return "metadata-only";
}

function normalizeDownloadMethod(value) {
  const method = normalizeStatus(value).toUpperCase();
  return ["GET", "POST"].includes(method) ? method : null;
}

function projectDigest(value) {
  const digest = stringOrNull(value)?.toLowerCase();
  if (/^[a-f0-9]{64}$/u.test(digest ?? "")) {
    return digest;
  }
  const prefixed = /^sha-?256:([a-f0-9]{64})$/u.exec(digest ?? "");
  return prefixed ? prefixed[1] : null;
}

function isSha256Digest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function emptyDownloadMetadata() {
  return Object.freeze({
    resourceId: null,
    availability: "unavailable",
    downloadKind: "unavailable",
    method: null,
    ticketEndpoint: null,
    url: null,
    urlRedacted: false,
    filename: null,
    mediaType: null,
    sizeBytes: null,
    digest: null,
    digestPresent: false,
    digestValid: false,
    unavailableReason: null,
    observedAt: null,
    expiresAt: null
  });
}

function normalizePublicState(value) {
  const normalized = normalizeStatus(value);
  return normalized || "unknown";
}

function normalizeStatus(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/gu, "-")
    .replace(/\s+/gu, "-");
}

function isPrivateProjectionKey(key) {
  const normalized = normalizeStatus(key).replace(/[^a-z0-9]/gu, "");
  return PRIVATE_PROJECTION_KEYS.has(normalized) && !PUBLIC_PRIVATE_TERM_KEYS.has(normalized);
}

function isStale(value, now, staleAfterSeconds) {
  const observedAt = toDate(value);
  const ageMs = now.getTime() - observedAt.getTime();
  return Number.isFinite(ageMs) && ageMs > staleAfterSeconds * 1000;
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function firstRecord(...values) {
  return values.find(isRecord) ?? {};
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0) ?? null;
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasParentPathSegment(value) {
  return String(value)
    .split(/[\\/]+/u)
    .includes("..");
}

function isLoopbackUrl(url) {
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function hasSensitiveQuery(url) {
  for (const key of url.searchParams.keys()) {
    if (/(token|signature|secret|credential|key|expires|policy)/iu.test(key)) {
      return true;
    }
  }
  return false;
}
