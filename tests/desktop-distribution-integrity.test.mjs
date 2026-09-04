import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { artifactSignaturePayload, deriveDistributionKeyId, manifestSignaturePayload, verifyDesktopDistributionEnvelope } from "../src/core/desktop-distribution-integrity.mjs";

const now = "2026-09-04T12:00:00.000Z";

function createFixture(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const signingKeyId = deriveDistributionKeyId(publicKeyPem);
  const artifacts = [
    ["windows-x86_64", "nsis", "Agentique_UI_0.2.0_x64-setup.exe", 101, "1".repeat(64)],
    ["windows-x86_64", "msi", "Agentique_UI_0.2.0_x64_en-US.msi", 102, "2".repeat(64)],
    ["linux-x86_64", "deb", "agentique-ui_0.2.0_amd64.deb", 103, "3".repeat(64)],
    ["linux-x86_64", "rpm", "agentique-ui-0.2.0-1.x86_64.rpm", 104, "4".repeat(64)],
    ["linux-x86_64", "appimage", "agentique-ui_0.2.0_amd64.AppImage", 105, "5".repeat(64)]
  ].map(([platform, target, fileName, byteLength, sha256]) => ({
    platform,
    target,
    fileName,
    byteLength,
    sha256,
    signature: "pending"
  }));
  const manifest = {
    schemaVersion: "agentique.desktopDistributionIntegrity.v1",
    releaseVersion: "0.2.0",
    channel: "stable",
    generatedAt: "2026-09-04T11:00:00.000Z",
    expiresAt: "2026-09-05T11:00:00.000Z",
    minimumSupportedVersion: "0.1.0",
    rollbackFloor: "0.1.0",
    signingKeyId,
    artifacts
  };
  for (const artifact of manifest.artifacts) {
    artifact.signature = sign(null, artifactSignaturePayload(manifest, artifact), privateKey).toString("base64");
  }
  const envelope = {
    manifest,
    manifestSignature: sign(null, manifestSignaturePayload(manifest), privateKey).toString("base64")
  };
  const observedArtifacts = artifacts.map((artifact) => ({
    platform: artifact.platform,
    target: artifact.target,
    fileName: artifact.fileName,
    byteLength: artifact.byteLength,
    sha256: artifact.sha256
  }));
  return { envelope, observedArtifacts, privateKey, publicKeyPem, ...overrides };
}

function verify(fixture, overrides = {}) {
  return verifyDesktopDistributionEnvelope({
    envelope: fixture.envelope,
    publicKey: fixture.publicKeyPem,
    observedArtifacts: fixture.observedArtifacts,
    expectedChannel: "stable",
    currentVersion: "0.1.0",
    now,
    ...overrides
  });
}

function resign(fixture) {
  for (const artifact of fixture.envelope.manifest.artifacts) {
    artifact.signature = sign(null, artifactSignaturePayload(fixture.envelope.manifest, artifact), fixture.privateKey).toString("base64");
  }
  fixture.envelope.manifestSignature = sign(null, manifestSignaturePayload(fixture.envelope.manifest), fixture.privateKey).toString("base64");
}

test("verifies an exact Windows and Linux distribution envelope with ephemeral Ed25519 keys", () => {
  const fixture = createFixture();
  const result = verify(fixture);

  assert.equal(result.status, "eligible");
  assert.equal(result.artifactCount, 5);
  assert.equal(result.platformCount, 2);
  assert.equal(result.publicationAllowed, false);
  assert.equal(result.productionSigned, false);
  assert.equal(result.signaturesVerified, 6);
  assert.equal("signature" in result, false);
  assert.equal("publicKey" in result, false);
});

test("fails closed on key substitution, malformed signatures, and signed-payload drift", () => {
  const wrongKey = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" });
  assert.throws(() => verify(createFixture(), { publicKey: wrongKey }), { code: "distribution.key-id-mismatch" });

  const malformed = createFixture();
  malformed.envelope.manifestSignature = "not base64";
  assert.throws(() => verify(malformed), { code: "distribution.signature-encoding" });

  const drift = createFixture();
  drift.envelope.manifest.artifacts[0].byteLength += 1;
  assert.throws(() => verify(drift), { code: "distribution.artifact-signature" });
});

test("rejects observed artifact digest, length, missing, and extra evidence drift", () => {
  const digest = createFixture();
  digest.observedArtifacts[0].sha256 = "f".repeat(64);
  assert.throws(() => verify(digest), { code: "distribution.observed-digest" });

  const length = createFixture();
  length.observedArtifacts[0].byteLength += 1;
  assert.throws(() => verify(length), { code: "distribution.observed-length" });

  const missing = createFixture();
  missing.observedArtifacts.pop();
  assert.throws(() => verify(missing), { code: "distribution.observed-set" });

  const extra = createFixture();
  extra.observedArtifacts.push({ ...extra.observedArtifacts[0], target: "portable" });
  assert.throws(() => verify(extra), { code: "distribution.observed-set" });
});

test("rejects unsafe, duplicate, unsupported, or incomplete artifact sets", () => {
  const unsafe = createFixture();
  unsafe.envelope.manifest.artifacts[0].fileName = ["C", ":\\release\\setup.exe"].join("");
  assert.throws(() => verify(unsafe), { code: "distribution.artifact-name" });

  const duplicate = createFixture();
  duplicate.envelope.manifest.artifacts[1] = { ...duplicate.envelope.manifest.artifacts[0] };
  assert.throws(() => verify(duplicate), { code: "distribution.artifact-set" });

  const unsupported = createFixture();
  unsupported.envelope.manifest.artifacts[4].platform = "darwin-aarch64";
  assert.throws(() => verify(unsupported), { code: "distribution.artifact-platform" });

  const missing = createFixture();
  missing.envelope.manifest.artifacts.pop();
  assert.throws(() => verify(missing), { code: "distribution.artifact-set" });

  const reordered = createFixture();
  [reordered.envelope.manifest.artifacts[0], reordered.envelope.manifest.artifacts[1]] = [reordered.envelope.manifest.artifacts[1], reordered.envelope.manifest.artifacts[0]];
  resign(reordered);
  assert.throws(() => verify(reordered), { code: "distribution.artifact-order" });
});

test("fails closed for wrong channel, stale or future manifests", () => {
  assert.throws(() => verify(createFixture(), { expectedChannel: "beta" }), { code: "distribution.channel" });

  const stale = createFixture();
  stale.envelope.manifest.expiresAt = "2026-09-04T11:59:59.000Z";
  resign(stale);
  assert.throws(() => verify(stale), { code: "distribution.expired" });

  const future = createFixture();
  future.envelope.manifest.generatedAt = "2026-09-04T12:00:01.000Z";
  resign(future);
  assert.throws(() => verify(future), { code: "distribution.future" });
});

test("distinguishes no-update, upgrade, and explicit rollback floor policy", () => {
  assert.equal(verify(createFixture(), { currentVersion: "0.2.0" }).status, "no-update");
  assert.equal(verify(createFixture(), { currentVersion: "0.1.9" }).status, "eligible");

  const rollback = createFixture();
  rollback.envelope.manifest.releaseVersion = "0.1.5";
  rollback.envelope.manifest.minimumSupportedVersion = "0.1.0";
  rollback.envelope.manifest.rollbackFloor = "0.1.4";
  resign(rollback);
  assert.throws(() => verify(rollback, { currentVersion: "0.2.0" }), { code: "distribution.rollback-forbidden" });
  assert.equal(verify(rollback, { currentVersion: "0.2.0", allowRollback: true }).status, "rollback-eligible");

  rollback.envelope.manifest.rollbackFloor = "0.1.6";
  resign(rollback);
  assert.throws(() => verify(rollback, { currentVersion: "0.2.0", allowRollback: true }), {
    code: "distribution.rollback-floor"
  });
});

test("rejects invalid versions, current versions below minimum, unknown fields, and non-canonical values", () => {
  const version = createFixture();
  version.envelope.manifest.releaseVersion = "latest";
  assert.throws(() => verify(version), { code: "distribution.version" });

  assert.throws(() => verify(createFixture(), { currentVersion: "0.0.9" }), {
    code: "distribution.current-below-minimum"
  });

  const unknown = createFixture();
  unknown.envelope.manifest.debug = true;
  assert.throws(() => verify(unknown), { code: "distribution.manifest-fields" });

  const float = createFixture();
  float.envelope.manifest.artifacts[0].byteLength = 1.5;
  assert.throws(() => verify(float), { code: "distribution.artifact-length" });
});
