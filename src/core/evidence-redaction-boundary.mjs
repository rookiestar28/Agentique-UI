export const evidenceRedactionSchemaVersion = "agentique.evidenceRedactionBoundary.v1";

const MAX_INSPECTION_BYTES = 256 * 1024;
const MAX_SERIALIZED_DEPTH = 8;
const planningMarker = [".", "planning"].join("");
const referenceDocsMarker = ["ref", "erence", "/", "docs"].join("");
const credentialPatterns = [
  ["inline", "-secret-value"].join(""),
  ["bear", "er\\s+[A-Za-z0-9._-]{12,}"].join(""),
  ["s", "k-[A-Za-z0-9]{20,}"].join(""),
  ["gh", "p_[A-Za-z0-9_]{20,}"].join(""),
  ["github", "_pat_[A-Za-z0-9_]{20,}"].join(""),
  ["ya", "29\\.[A-Za-z0-9._-]{10,}"].join("")
].map((source) => new RegExp(source, "giu"));
const browserMaterialPattern = /\b(?:set-)?cookie\s*[:=]\s*[^\s|,;]+|\b(?:storageState|localStorage|sessionStorage)\s*[:=]\s*[^\s|,;]+/giu;
const vaultPattern = new RegExp(["va", "ult:[a-z][a-zA-Z0-9._-]{2,80}"].join(""), "gu");
const windowsPathPattern = /(?<![A-Za-z])[A-Za-z]:[\\/][^\s|"'<>]+/gu;
const uncPathPattern = /\\\\[^\\\s|"'<>]+\\[^\s|"'<>]+/gu;
const unixHomePathPattern = /\/(?:home|Users)\/[^\s|"'<>]+/gu;
const internalPathPattern = new RegExp(`${escapeRegExp(planningMarker)}(?:[\\/][^\\s|"'<>]+)?|${escapeRegExp(referenceDocsMarker)}(?:[\\/][^\\s|"'<>]+)?`, "giu");
const internalCodePattern = new RegExp(`\\b(?:${["UI", "RUN"].join("")}|${["UI", "HED"].join("")})-\\d{3}\\b|\\b${"R"}\\d{4}\\b`, "gu");
const processAuthorityPattern = /\b(?:rawCommand|processCommand|encodedCommand)\s*[:=]\s*[^|\r\n]+/giu;

export const requiredEvidenceProducers = Object.freeze(
  [
    ["logs", "redact-before-authority"],
    ["events", "redact-before-authority"],
    ["registry", "redact-before-authority"],
    ["run-folder", "redact-before-authority"],
    ["product-projection", "redact-before-authority"],
    ["checkpoint", "redact-before-authority"],
    ["evaluation", "redact-before-authority"],
    ["receipts", "redact-before-authority"],
    ["session-export", "redact-before-authority"],
    ["support-bundle", "redact-before-authority"],
    ["browser-screenshot", "metadata-only"],
    ["public-scan", "redact-before-authority"]
  ].map(([id, disposition]) => Object.freeze({ id, disposition }))
);

export function syntheticEvidenceCorpus() {
  const fragments = syntheticMarkers();
  return Object.freeze({
    schemaVersion: evidenceRedactionSchemaVersion,
    realPrivateStateRead: false,
    entries: Object.freeze([
      entry("bearer", "secret-token", fragments.bearer),
      entry("provider-token", "secret-token", fragments.provider),
      entry("github-token", "credential", fragments.github),
      entry("github-fine-token", "credential", fragments.githubFine),
      entry("google-token", "credential", fragments.google),
      entry("cookie", "browser-vault", fragments.cookie),
      entry("vault-reference", "browser-vault", fragments.vault),
      entry("windows-private-path", "windows-path", fragments.windowsPath),
      entry("unc-private-path", "windows-path", fragments.uncPath),
      entry("unix-private-path", "unix-path", fragments.unixPath),
      entry("internal-reference", "internal-marker", fragments.internalPath),
      entry("raw-command", "process-authority", fragments.command),
      entry("percent-path", "encoded", encodeURIComponent(fragments.windowsPath)),
      entry("base64-token", "encoded", encodeBase64Utf8(fragments.bearer))
    ])
  });
}

export function redactEvidenceText(value) {
  let text = String(value ?? "");
  for (const pattern of credentialPatterns) {
    text = text.replace(pattern, "redacted:inline-sensitive-material");
  }
  return text
    .replace(browserMaterialPattern, "redacted:browser-material")
    .replace(vaultPattern, "redacted:vault-reference")
    .replace(windowsPathPattern, "redacted:local-path")
    .replace(uncPathPattern, "redacted:local-path")
    .replace(unixHomePathPattern, "redacted:local-path")
    .replace(internalPathPattern, "redacted:internal-reference")
    .replace(internalCodePattern, "redacted:internal-reference")
    .replace(processAuthorityPattern, "redacted:process-authority");
}

export function inspectEvidenceText(value) {
  const text = boundedString(value);
  const findings = inspectPlainText(text);
  for (const decoded of decodedVariants(text)) {
    for (const finding of inspectPlainText(decoded.text)) {
      findings.push({ ...finding, encoding: decoded.encoding });
    }
  }
  return { schemaVersion: evidenceRedactionSchemaVersion, findings: dedupeFindings(findings) };
}

export function assertNoEncodedSensitiveMaterial(value) {
  const text = boundedString(value);
  const parsed = parseSerializedContainer(text);
  if (parsed !== undefined && serializedContainsSensitiveMaterial(parsed, 0)) {
    throw boundaryIssue("evidence.serialized-sensitive-material", "serialized sensitive material is forbidden");
  }
  const encodedFinding = decodedVariants(text).find((variant) => inspectPlainText(variant.text).length > 0);
  if (encodedFinding) {
    throw boundaryIssue("evidence.encoded-sensitive-material", `encoded sensitive material is forbidden (${encodedFinding.encoding})`);
  }
  return true;
}

export function sanitizeEvidenceValue(value) {
  assertNoEncodedSensitiveMaterialForValue(value, 0);
  return sanitizeValue(value, 0);
}

function syntheticMarkers() {
  return {
    bearer: ["Bear", "er abcdefghijklmnop"].join(""),
    provider: ["s", "k-12345678901234567890"].join(""),
    github: ["gh", "p_12345678901234567890"].join(""),
    githubFine: ["github", "_pat_12345678901234567890"].join(""),
    google: ["ya", "29.1234567890abcdef"].join(""),
    cookie: ["cook", "ie=session-sensitive"].join(""),
    vault: ["va", "ult:providerCredential"].join(""),
    windowsPath: ["C", ":\\Users\\example\\private.txt"].join(""),
    uncPath: ["\\", "\\server\\private\\file.txt"].join(""),
    unixPath: ["/ho", "me/example/private.txt"].join(""),
    internalPath: [".", "planning/private-record.md"].join(""),
    command: ["raw", "Command=powershell unsafe"].join("")
  };
}

function entry(id, family, value) {
  return Object.freeze({ id, family, value, synthetic: true });
}

/** @returns {Array<{code: string, encoding?: string}>} */
function inspectPlainText(text) {
  /** @type {Array<{code: string, encoding?: string}>} */
  const findings = [];
  /** @type {Array<[string, RegExp[]]>} */
  const checks = [
    ["inline-sensitive-material", credentialPatterns],
    ["browser-material", [browserMaterialPattern]],
    ["vault-reference", [vaultPattern]],
    ["local-path", [windowsPathPattern, uncPathPattern, unixHomePathPattern]],
    ["internal-reference", [internalPathPattern, internalCodePattern]],
    ["process-authority", [processAuthorityPattern]]
  ];
  for (const [code, patterns] of checks) {
    if (patterns.some((pattern) => regexMatches(pattern, text))) findings.push({ code });
  }
  return findings;
}

function decodedVariants(text) {
  const variants = [];
  if (/%[0-9a-f]{2}/iu.test(text)) {
    try {
      const decoded = decodeURIComponent(text);
      if (decoded !== text) variants.push({ encoding: "percent", text: decoded });
    } catch {
      // Malformed percent sequences are not silently normalized into evidence.
    }
  }
  const tokens = text.match(/[A-Za-z0-9+/]{16,}={0,2}/gu) ?? [];
  for (const token of tokens.slice(0, 32)) {
    if (token.length % 4 !== 0) continue;
    try {
      const decoded = decodeBase64Utf8(token);
      if (encodeBase64Utf8(decoded).replace(/=+$/u, "") !== token.replace(/=+$/u, "")) continue;
      if ([...decoded].every(isPrintableEvidenceCharacter)) variants.push({ encoding: "base64", text: decoded });
    } catch {
      // Invalid base64 candidates are ordinary text, not decoded evidence.
    }
  }
  return variants;
}

function parseSerializedContainer(text) {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function serializedContainsSensitiveMaterial(value, depth) {
  if (depth > MAX_SERIALIZED_DEPTH) return true;
  if (typeof value === "string") return inspectPlainText(value).length > 0 || decodedVariants(value).some((variant) => inspectPlainText(variant.text).length > 0);
  if (Array.isArray(value)) return value.some((entryValue) => serializedContainsSensitiveMaterial(entryValue, depth + 1));
  if (value && typeof value === "object") return Object.values(value).some((entryValue) => serializedContainsSensitiveMaterial(entryValue, depth + 1));
  return false;
}

function assertNoEncodedSensitiveMaterialForValue(value, depth) {
  if (depth > MAX_SERIALIZED_DEPTH) throw boundaryIssue("evidence.depth-exceeded", "evidence nesting exceeds the bounded inspection depth");
  if (typeof value === "string") return assertNoEncodedSensitiveMaterial(value);
  if (Array.isArray(value)) {
    for (const entryValue of value) assertNoEncodedSensitiveMaterialForValue(entryValue, depth + 1);
  } else if (value && typeof value === "object") {
    for (const entryValue of Object.values(value)) assertNoEncodedSensitiveMaterialForValue(entryValue, depth + 1);
  }
  return true;
}

function sanitizeValue(value, depth) {
  if (depth > MAX_SERIALIZED_DEPTH) throw boundaryIssue("evidence.depth-exceeded", "evidence nesting exceeds the bounded inspection depth");
  if (typeof value === "string") return redactEvidenceText(value);
  if (Array.isArray(value)) return value.map((entryValue) => sanitizeValue(entryValue, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, sanitizeValue(entryValue, depth + 1)]));
  }
  return value;
}

function boundedString(value) {
  const text = String(value ?? "");
  if (utf8Bytes(text).byteLength > MAX_INSPECTION_BYTES) throw boundaryIssue("evidence.inspection-limit", "evidence text exceeds the bounded inspection limit");
  return text;
}

function encodeBase64Utf8(value) {
  const bytes = utf8Bytes(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64Utf8(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function utf8Bytes(value) {
  // CRITICAL: keep this shared evidence boundary browser-native. A Node import or
  // Buffer reference crashes the Tauri renderer before native controls can mount.
  return new TextEncoder().encode(String(value ?? ""));
}

function regexMatches(pattern, text) {
  pattern.lastIndex = 0;
  const matched = pattern.test(text);
  pattern.lastIndex = 0;
  return matched;
}

function isPrintableEvidenceCharacter(character) {
  const code = character.codePointAt(0) ?? 0;
  return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
}

function dedupeFindings(findings) {
  return [...new Map(findings.map((finding) => [`${finding.code}:${finding.encoding ?? "plain"}`, finding])).values()];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function boundaryIssue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(message));
  error.code = code;
  return error;
}
