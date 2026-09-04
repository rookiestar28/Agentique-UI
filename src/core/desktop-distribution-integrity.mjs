import { createHash, createPublicKey, verify } from "node:crypto";

export const desktopDistributionSchemaVersion = "agentique.desktopDistributionIntegrity.v1";
export const desktopDistributionReceiptSchemaVersion = "agentique.desktopDistributionIntegrityReceipt.v1";
export const supportedDistributionPlatforms = Object.freeze(["windows-x86_64", "linux-x86_64"]);

const requiredTargets = Object.freeze({
  "windows-x86_64": Object.freeze(["nsis", "msi"]),
  "linux-x86_64": Object.freeze(["deb", "rpm", "appimage"])
});
const manifestFields = Object.freeze([
  "schemaVersion",
  "releaseVersion",
  "channel",
  "generatedAt",
  "expiresAt",
  "minimumSupportedVersion",
  "rollbackFloor",
  "signingKeyId",
  "artifacts"
]);
const artifactFields = Object.freeze(["platform", "target", "fileName", "byteLength", "sha256", "signature"]);
const observedFields = Object.freeze(["platform", "target", "fileName", "byteLength", "sha256"]);
const sha256Pattern = /^[a-f0-9]{64}$/u;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const channels = Object.freeze(["stable", "beta"]);

export function canonicalDistributionJson(value) {
  return JSON.stringify(normalizeCanonicalValue(value));
}

export function deriveDistributionKeyId(publicKey) {
  const key = parseEd25519PublicKey(publicKey);
  const der = key.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex");
}

export function artifactSignaturePayload(manifest, artifact) {
  return Buffer.from(
    `agentique.desktop-distribution-artifact.v1\n${canonicalDistributionJson({
      schemaVersion: manifest.schemaVersion,
      releaseVersion: manifest.releaseVersion,
      channel: manifest.channel,
      signingKeyId: manifest.signingKeyId,
      platform: artifact.platform,
      target: artifact.target,
      fileName: artifact.fileName,
      byteLength: artifact.byteLength,
      sha256: artifact.sha256
    })}`,
    "utf8"
  );
}

export function manifestSignaturePayload(manifest) {
  return Buffer.from(`agentique.desktop-distribution-manifest.v1\n${canonicalDistributionJson(manifest)}`, "utf8");
}

export function verifyDesktopDistributionEnvelope({
  envelope,
  publicKey,
  observedArtifacts,
  expectedChannel,
  currentVersion,
  now = new Date().toISOString(),
  allowRollback = false
}) {
  assertExactFields(envelope, ["manifest", "manifestSignature"], "distribution.envelope-fields");
  const manifest = envelope.manifest;
  validateManifest(manifest);

  if (!channels.includes(expectedChannel) || manifest.channel !== expectedChannel) {
    throw issue("distribution.channel", "Distribution manifest channel does not match the requested channel.");
  }

  const key = parseEd25519PublicKey(publicKey);
  const derivedKeyId = deriveDistributionKeyId(key);
  if (manifest.signingKeyId !== derivedKeyId) {
    throw issue("distribution.key-id-mismatch", "Distribution signing key identifier does not match the supplied public key.");
  }

  for (const artifact of manifest.artifacts) {
    const signature = decodeSignature(artifact.signature);
    if (!verify(null, artifactSignaturePayload(manifest, artifact), key, signature)) {
      throw issue("distribution.artifact-signature", "Distribution artifact signature verification failed.");
    }
  }
  const manifestSignature = decodeSignature(envelope.manifestSignature);
  if (!verify(null, manifestSignaturePayload(manifest), key, manifestSignature)) {
    throw issue("distribution.manifest-signature", "Distribution manifest signature verification failed.");
  }

  validateObservedArtifacts(manifest.artifacts, observedArtifacts);
  validateTimeWindow(manifest, now);
  const status = evaluateVersionPolicy(manifest, currentVersion, allowRollback);

  return Object.freeze({
    schemaVersion: desktopDistributionReceiptSchemaVersion,
    status,
    releaseVersion: manifest.releaseVersion,
    channel: manifest.channel,
    signingKeyId: derivedKeyId,
    manifestSha256: createHash("sha256").update(manifestSignaturePayload(manifest)).digest("hex"),
    platformCount: supportedDistributionPlatforms.length,
    artifactCount: manifest.artifacts.length,
    signaturesVerified: manifest.artifacts.length + 1,
    publicationAllowed: false,
    productionSigned: false,
    macosVerified: false
  });
}

function validateManifest(manifest) {
  assertExactFields(manifest, manifestFields, "distribution.manifest-fields");
  if (manifest.schemaVersion !== desktopDistributionSchemaVersion) {
    throw issue("distribution.schema", "Distribution manifest schema version is unsupported.");
  }
  for (const [name, value] of [
    ["releaseVersion", manifest.releaseVersion],
    ["minimumSupportedVersion", manifest.minimumSupportedVersion],
    ["rollbackFloor", manifest.rollbackFloor]
  ]) {
    if (!semverPattern.test(String(value ?? ""))) {
      throw issue("distribution.version", `Distribution ${name} must be a strict three-part semantic version.`);
    }
  }
  if (!channels.includes(manifest.channel)) {
    throw issue("distribution.channel", "Distribution manifest channel is unsupported.");
  }
  if (!sha256Pattern.test(String(manifest.signingKeyId ?? ""))) {
    throw issue("distribution.key-id", "Distribution signing key identifier must be a lowercase SHA-256 digest.");
  }
  if (!Array.isArray(manifest.artifacts)) {
    throw issue("distribution.artifact-set", "Distribution artifacts must be a complete array.");
  }

  const identities = [];
  for (const artifact of manifest.artifacts) {
    validateArtifact(artifact);
    identities.push(`${artifact.platform}:${artifact.target}`);
  }
  const expected = supportedDistributionPlatforms.flatMap((platform) => requiredTargets[platform].map((target) => `${platform}:${target}`));
  if (identities.length !== expected.length || new Set(identities).size !== identities.length || expected.some((id) => !identities.includes(id))) {
    throw issue("distribution.artifact-set", "Distribution manifest must contain each supported platform target exactly once.");
  }
  if (identities.some((identity, index) => identity !== expected[index])) {
    throw issue("distribution.artifact-order", "Distribution artifacts must use the canonical platform and target order.");
  }
  if (compareSemver(manifest.rollbackFloor, manifest.releaseVersion) > 0) {
    throw issue("distribution.rollback-floor", "Distribution rollback floor cannot be newer than the signed release.");
  }

  // IMPORTANT: signing depends on one deterministic byte sequence; accepting loose JSON values
  // would let producers and verifiers bind different meanings to the same apparent manifest.
  canonicalDistributionJson(manifest);
}

function validateArtifact(artifact) {
  assertExactFields(artifact, artifactFields, "distribution.artifact-fields");
  if (!supportedDistributionPlatforms.includes(artifact.platform)) {
    throw issue("distribution.artifact-platform", "Distribution artifact platform is unsupported.");
  }
  if (!requiredTargets[artifact.platform].includes(artifact.target)) {
    throw issue("distribution.artifact-target", "Distribution artifact target is unsupported for its platform.");
  }
  if (!safeArtifactName(artifact.platform, artifact.target, artifact.fileName)) {
    throw issue("distribution.artifact-name", "Distribution artifact filename is unsafe or has the wrong extension.");
  }
  if (!Number.isSafeInteger(artifact.byteLength) || artifact.byteLength <= 0 || artifact.byteLength > 2_147_483_648) {
    throw issue("distribution.artifact-length", "Distribution artifact byte length is outside the accepted bound.");
  }
  if (!sha256Pattern.test(String(artifact.sha256 ?? ""))) {
    throw issue("distribution.artifact-digest", "Distribution artifact digest must be lowercase SHA-256.");
  }
  decodeSignature(artifact.signature);
}

function validateObservedArtifacts(expectedArtifacts, observedArtifacts) {
  if (!Array.isArray(observedArtifacts)) {
    throw issue("distribution.observed-set", "Observed artifact evidence must be a complete array.");
  }
  const expectedIds = expectedArtifacts.map(artifactIdentity).sort();
  const observedIds = [];
  for (const observed of observedArtifacts) {
    assertExactFields(observed, observedFields, "distribution.observed-fields");
    observedIds.push(artifactIdentity(observed));
  }
  observedIds.sort();
  if (canonicalDistributionJson(expectedIds) !== canonicalDistributionJson(observedIds)) {
    throw issue("distribution.observed-set", "Observed artifact identities do not match the signed manifest.");
  }
  for (const expected of expectedArtifacts) {
    const observed = observedArtifacts.find((candidate) => artifactIdentity(candidate) === artifactIdentity(expected));
    if (observed.sha256 !== expected.sha256) {
      throw issue("distribution.observed-digest", "Observed artifact digest does not match the signed manifest.");
    }
    if (observed.byteLength !== expected.byteLength) {
      throw issue("distribution.observed-length", "Observed artifact byte length does not match the signed manifest.");
    }
    if (observed.fileName !== expected.fileName) {
      throw issue("distribution.observed-name", "Observed artifact filename does not match the signed manifest.");
    }
  }
}

function validateTimeWindow(manifest, nowValue) {
  const generatedAt = parseExactTimestamp(manifest.generatedAt, "distribution.generated-at");
  const expiresAt = parseExactTimestamp(manifest.expiresAt, "distribution.expires-at");
  const current = parseExactTimestamp(nowValue, "distribution.now");
  if (expiresAt <= generatedAt) {
    throw issue("distribution.time-window", "Distribution manifest expiry must be after generation.");
  }
  if (generatedAt > current) {
    throw issue("distribution.future", "Distribution manifest generation time is in the future.");
  }
  if (expiresAt <= current) {
    throw issue("distribution.expired", "Distribution manifest has expired.");
  }
}

function evaluateVersionPolicy(manifest, currentVersion, allowRollback) {
  if (!semverPattern.test(String(currentVersion ?? ""))) {
    throw issue("distribution.current-version", "Current version must be a strict three-part semantic version.");
  }
  if (compareSemver(currentVersion, manifest.minimumSupportedVersion) < 0) {
    throw issue("distribution.current-below-minimum", "Current version is below the signed minimum supported version.");
  }
  const comparison = compareSemver(manifest.releaseVersion, currentVersion);
  if (comparison === 0) return "no-update";
  if (comparison > 0) return "eligible";
  if (!allowRollback) {
    throw issue("distribution.rollback-forbidden", "Distribution downgrade is blocked without explicit rollback policy.");
  }
  if (compareSemver(manifest.releaseVersion, manifest.rollbackFloor) < 0) {
    throw issue("distribution.rollback-floor", "Distribution downgrade falls below the signed rollback floor.");
  }
  return "rollback-eligible";
}

function parseExactTimestamp(value, code) {
  const time = Date.parse(String(value ?? ""));
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    throw issue(code, "Distribution timestamp must be an exact UTC ISO-8601 value.");
  }
  return time;
}

function parseEd25519PublicKey(publicKey) {
  try {
    const key = publicKey?.type === "public" ? publicKey : createPublicKey(publicKey);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong key type");
    return key;
  } catch {
    throw issue("distribution.public-key", "Distribution public key must be a valid Ed25519 public key.");
  }
}

function decodeSignature(value) {
  const text = String(value ?? "");
  if (!text || text.length > 256 || text.length % 4 !== 0 || !base64Pattern.test(text)) {
    throw issue("distribution.signature-encoding", "Distribution signature must use bounded canonical base64.");
  }
  const decoded = Buffer.from(text, "base64");
  if (decoded.length !== 64 || decoded.toString("base64") !== text) {
    throw issue("distribution.signature-encoding", "Distribution signature must be a canonical Ed25519 signature.");
  }
  return decoded;
}

function safeArtifactName(platform, target, value) {
  const fileName = String(value ?? "");
  if (
    fileName.length < 1 ||
    fileName.length > 180 ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    [...fileName].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127) ||
    fileName.includes("..")
  ) {
    return false;
  }
  const extension = {
    nsis: ".exe",
    msi: ".msi",
    deb: ".deb",
    rpm: ".rpm",
    appimage: ".AppImage"
  }[target];
  return supportedDistributionPlatforms.includes(platform) && fileName.endsWith(extension);
}

function artifactIdentity(value) {
  return `${value.platform}:${value.target}`;
}

function compareSemver(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

function assertExactFields(value, fields, code) {
  if (!isPlainObject(value)) throw issue(code, "Distribution object must be a plain object.");
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (canonicalDistributionJson(actual) !== canonicalDistributionJson(expected)) {
    throw issue(code, "Distribution object fields do not match the exact schema.");
  }
}

function normalizeCanonicalValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw issue("distribution.canonical-number", "Canonical distribution numbers must be safe integers.");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeCanonicalValue);
  if (!isPlainObject(value)) {
    throw issue("distribution.canonical-value", "Canonical distribution values must be JSON plain data.");
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeCanonicalValue(value[key])])
  );
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(code, message) {
  return Object.assign(new Error(message), { code });
}
