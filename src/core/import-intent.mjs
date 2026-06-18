export const importIntentContractVersion = "agentique.importIntent.v1";
export const legacyResourceUriAlias = "agentique://resources/{resourceId}";

const resourceIdPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|[._:-](?=[A-Za-z0-9])){0,127}$/u;
const resourceVersionPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|[._+-](?=[A-Za-z0-9])){0,95}$/u;
const noncePattern = /^[A-Za-z0-9_-]{12,96}$/u;

export const sampleImportIntent = [
  "agentique://import?",
  new URLSearchParams({
    version: importIntentContractVersion,
    action: "import",
    resourceId: "example.visual-guide",
    resourceVersion: "0.1.0",
    origin: "https://www.agentique.io",
    readbackUrl: "/api/public/v1/resources/example.visual-guide/readback",
    issuedAt: "2026-06-11T00:00:00.000Z",
    expiresAt: "2026-06-11T00:10:00.000Z",
    nonce: "Aq2ULu3DZpaS"
  }).toString()
].join("");

/**
 * @param {unknown} input
 * @param {{ now?: string, replayedNonces?: string[], expectedOrigin?: string }} options
 * @returns {{
 *   ok: boolean,
 *   intent?: {
 *     source?: string,
 *     compatibilityAlias?: string | null,
 *     version?: string,
 *     action?: string,
 *     resource: { id: string, version: string },
 *     origin: string,
 *     readbackUrl?: string,
 *     audience: string,
 *     nonce: string,
 *     issuedAt?: string,
 *     expiresAt?: string,
 *     security?: {
 *       grantsAuthorization: false,
 *       grantsDownload: false,
 *       grantsExecution: false,
 *       grantsPermission: false,
 *       requiresReadbackVerification: true
 *     }
 *   },
 *   errors?: Array<{ code: string, message: string }>
 * }}
 */
export function validateImportIntent(input, options = {}) {
  const parsed = parseIntent(input);
  if (!parsed.ok) return parsed;

  if (parsed.intent.source === "legacy-resource-uri") {
    return {
      ok: true,
      intent: parsed.intent
    };
  }

  const now = options.now ? new Date(options.now) : new Date();
  const replayedNonces = new Set(options.replayedNonces ?? []);
  const intent = parsed.intent;
  const errors = [];

  if (intent.version !== importIntentContractVersion) {
    errors.push(issue("intent.unsupported-version", "Import intent version is unsupported."));
  }
  if (intent.action !== "import") {
    errors.push(issue("intent.unsupported-action", "Unsupported import action."));
  }
  if (!resourceIdPattern.test(intent.resource.id)) {
    errors.push(issue("resource.invalid-id", "Resource id is malformed."));
  }
  if (!resourceVersionPattern.test(intent.resource.version)) {
    errors.push(issue("resource.invalid-version", "Resource version is malformed."));
  }
  if (!isHttpsOrigin(intent.origin)) {
    errors.push(issue("origin.insecure", "Origin must use HTTPS."));
  }
  if (options.expectedOrigin && normalizeOrigin(options.expectedOrigin) !== normalizeOrigin(intent.origin)) {
    errors.push(issue("origin.mismatch", "Intent origin does not match the expected site."));
  }
  if (!isValidReadbackUrl(intent.readbackUrl, intent.origin)) {
    errors.push(issue("readback.invalid-url", "Readback URL must target the public resource readback endpoint."));
  }
  if (!noncePattern.test(intent.nonce)) {
    errors.push(issue("nonce.invalid", "Intent nonce is malformed."));
  }
  if (intent.nonce && replayedNonces.has(intent.nonce)) {
    errors.push(issue("nonce.replayed", "Intent nonce was already used."));
  }

  const issuedAt = parseDate(intent.issuedAt);
  const expiresAt = parseDate(intent.expiresAt);
  if (!issuedAt) {
    errors.push(issue("issuedAt.invalid", "Intent issue time is invalid."));
  }
  if (!expiresAt) {
    errors.push(issue("expiresAt.invalid", "Intent expiry time is invalid."));
  }
  if (issuedAt && expiresAt && issuedAt >= expiresAt) {
    errors.push(issue("intent.invalid-window", "Intent expiry must be after issue time."));
  }
  if (expiresAt && expiresAt <= now) {
    errors.push(issue("intent.expired", "Intent is expired."));
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    intent: {
      ...intent,
      security: noAuthoritySecurity()
    }
  };
}

function parseIntent(input) {
  const value = String(input ?? "").trim();
  if (!value) {
    return { ok: false, errors: [issue("intent.empty", "Import intent is empty.")] };
  }

  if (value.startsWith("{")) {
    return parseJsonIntent(value);
  }

  return parseUrlIntent(value);
}

function parseUrlIntent(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, errors: [issue("intent.malformed", "Import intent is not a valid URL or JSON object.")] };
  }

  if (url.protocol !== "agentique:") {
    return { ok: false, errors: [issue("intent.invalid-protocol", "Intent must use the agentique protocol.")] };
  }

  if (url.hostname === "resources") {
    return parseLegacyResourceUri(url, value);
  }
  if (url.hostname !== "import") {
    return { ok: false, errors: [issue("intent.unsupported-action", "Unsupported import action.")] };
  }

  return {
    ok: true,
    intent: {
      source: "canonical-import-intent",
      compatibilityAlias: null,
      version: singleParam(url.searchParams, "version"),
      action: singleParam(url.searchParams, "action"),
      resource: {
        id: singleParam(url.searchParams, "resourceId"),
        version: singleParam(url.searchParams, "resourceVersion")
      },
      origin: singleParam(url.searchParams, "origin"),
      readbackUrl: singleParam(url.searchParams, "readbackUrl"),
      nonce: singleParam(url.searchParams, "nonce"),
      issuedAt: singleParam(url.searchParams, "issuedAt"),
      expiresAt: singleParam(url.searchParams, "expiresAt"),
      audience: "agentique-ui",
      security: noAuthoritySecurity()
    }
  };
}

function parseJsonIntent(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { ok: false, errors: [issue("intent.invalid-json", "Import intent JSON is malformed.")] };
  }

  return {
    ok: true,
    intent: {
      source: "canonical-import-intent",
      compatibilityAlias: null,
      version: parsed.schemaVersion ?? parsed.version ?? "",
      action: parsed.action ?? "",
      resource: {
        id: parsed.resource?.id ?? parsed.resourceId ?? "",
        version: parsed.resource?.version ?? parsed.resourceVersion ?? ""
      },
      origin: parsed.origin?.site ?? parsed.origin ?? "",
      readbackUrl: parsed.readbackUrl ?? "",
      audience: "agentique-ui",
      nonce: parsed.nonce ?? "",
      issuedAt: parsed.issuedAt ?? "",
      expiresAt: parsed.expiresAt ?? "",
      security: noAuthoritySecurity()
    }
  };
}

function parseLegacyResourceUri(url, rawUrl) {
  const pathSegments = url.pathname.split("/").filter(Boolean);
  if (pathSegments.length !== 1 || url.search || url.hash) {
    return { ok: false, errors: [issue("legacy.unsupported-path", "Legacy resource URI must contain one encoded resource id.")] };
  }

  let resourceId;
  try {
    resourceId = decodeURIComponent(pathSegments[0]);
  } catch {
    return { ok: false, errors: [issue("resource.invalid-id", "Resource id is malformed.")] };
  }

  if (!resourceIdPattern.test(resourceId)) {
    return { ok: false, errors: [issue("resource.invalid-id", "Resource id is malformed.")] };
  }

  return {
    ok: true,
    intent: {
      source: "legacy-resource-uri",
      compatibilityAlias: legacyResourceUriAlias,
      version: "agentique.legacyResourceUri.v1",
      action: "import",
      resource: {
        id: resourceId,
        version: ""
      },
      origin: "legacy-resource-uri",
      readbackUrl: `/api/public/v1/resources/${encodeURIComponent(resourceId)}/readback`,
      audience: "agentique-ui",
      nonce: "",
      issuedAt: "",
      expiresAt: "",
      rawUrl,
      security: noAuthoritySecurity()
    }
  };
}

function singleParam(searchParams, name) {
  const values = searchParams.getAll(name);
  return values.length === 1 ? values[0] : "";
}

function isHttpsOrigin(value) {
  const normalized = normalizeOrigin(value);
  return Boolean(normalized);
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return "";
    }
    return url.origin;
  } catch {
    return "";
  }
}

function isValidReadbackUrl(value, origin) {
  if (!value || value.includes("\\") || value.includes("..")) return false;
  if (value.startsWith("/")) {
    return value.startsWith("/api/public/v1/resources/") && value.endsWith("/readback") && !value.startsWith("//");
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.origin === normalizeOrigin(origin) &&
      url.pathname.startsWith("/api/public/v1/resources/") &&
      url.pathname.endsWith("/readback") &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function noAuthoritySecurity() {
  return {
    grantsAuthorization: false,
    grantsDownload: false,
    grantsExecution: false,
    grantsPermission: false,
    requiresReadbackVerification: true
  };
}

function issue(code, message) {
  return { code, message };
}
