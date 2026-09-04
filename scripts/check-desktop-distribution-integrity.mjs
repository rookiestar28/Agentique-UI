import { generateKeyPairSync, sign } from "node:crypto";

import { artifactSignaturePayload, deriveDistributionKeyId, manifestSignaturePayload, verifyDesktopDistributionEnvelope } from "../src/core/desktop-distribution-integrity.mjs";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const signingKeyId = deriveDistributionKeyId(publicKeyPem);
const manifest = {
  schemaVersion: "agentique.desktopDistributionIntegrity.v1",
  releaseVersion: "0.2.0",
  channel: "stable",
  generatedAt: "2026-09-04T11:00:00.000Z",
  expiresAt: "2026-09-05T11:00:00.000Z",
  minimumSupportedVersion: "0.1.0",
  rollbackFloor: "0.1.0",
  signingKeyId,
  artifacts: [
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
  }))
};
for (const artifact of manifest.artifacts) {
  artifact.signature = sign(null, artifactSignaturePayload(manifest, artifact), privateKey).toString("base64");
}
const envelope = {
  manifest,
  manifestSignature: sign(null, manifestSignaturePayload(manifest), privateKey).toString("base64")
};
const observedArtifacts = manifest.artifacts.map((artifact) => ({
  platform: artifact.platform,
  target: artifact.target,
  fileName: artifact.fileName,
  byteLength: artifact.byteLength,
  sha256: artifact.sha256
}));
const verified = verifyDesktopDistributionEnvelope({
  envelope,
  publicKey: publicKeyPem,
  observedArtifacts,
  expectedChannel: "stable",
  currentVersion: "0.1.0",
  now: "2026-09-04T12:00:00.000Z"
});

let wrongChannelBlocked = false;
try {
  verifyDesktopDistributionEnvelope({
    envelope,
    publicKey: publicKeyPem,
    observedArtifacts,
    expectedChannel: "beta",
    currentVersion: "0.1.0",
    now: "2026-09-04T12:00:00.000Z"
  });
} catch (error) {
  wrongChannelBlocked = error.code === "distribution.channel";
}

const rollbackEnvelope = structuredClone(envelope);
rollbackEnvelope.manifest.releaseVersion = "0.1.0";
rollbackEnvelope.manifest.rollbackFloor = "0.1.1";
let rollbackFloorBlocked = false;
try {
  manifestSignaturePayload(rollbackEnvelope.manifest);
  verifyDesktopDistributionEnvelope({
    envelope: rollbackEnvelope,
    publicKey: publicKeyPem,
    observedArtifacts,
    expectedChannel: "stable",
    currentVersion: "0.2.0",
    now: "2026-09-04T12:00:00.000Z",
    allowRollback: true
  });
} catch (error) {
  rollbackFloorBlocked = error.code === "distribution.rollback-floor";
}

if (!wrongChannelBlocked || !rollbackFloorBlocked) process.exitCode = 1;
console.log(JSON.stringify({ ...verified, ephemeralTestKey: true, wrongChannelBlocked, rollbackFloorBlocked }, null, 2));
