import fs from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const updaterReleaseSchemaVersion = "agentique.updaterReleaseGate.v1";
const localPathPattern = /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\|\/[A-Za-z0-9_.-])|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u;

export const sampleUpdaterBlockedEvidence = Object.freeze({
  schemaVersion: "agentique.updaterReleaseEvidence.v1",
  releaseVersion: "0.1.0",
  keyCustody: { status: "missing" },
  latestJson: null,
  signatureFiles: [],
  downloadChecks: [],
  versionChecks: { status: "missing" },
  failureModeTests: {
    badSignatureBlocked: false,
    noUpdateNoop: false,
    rollbackTested: false
  }
});

export const sampleUpdaterReadyEvidence = Object.freeze({
  schemaVersion: "agentique.updaterReleaseEvidence.v1",
  releaseVersion: "0.1.1",
  keyCustody: {
    status: "verified",
    signingKeyStorage: "external-secret-store",
    publicKeyConfigured: true,
    endpointConfigured: true
  },
  latestJson: {
    version: "0.1.1",
    notes: "Updater gate verification sample.",
    pub_date: "2026-06-11T00:00:00.000Z",
    platforms: {
      "windows-x86_64": {
        signature: "signature-windows-base64",
        url: "https://example.com/agentique-ui/v0.1.1/windows-installer.exe"
      },
      "darwin-aarch64": {
        signature: "signature-macos-base64",
        url: "https://example.com/agentique-ui/v0.1.1/macos-app.tar.gz"
      },
      "linux-x86_64": {
        signature: "signature-linux-base64",
        url: "https://example.com/agentique-ui/v0.1.1/linux.AppImage.tar.gz"
      }
    }
  },
  signatureFiles: [
    { platform: "windows-x86_64", fileName: "windows-installer.exe.sig" },
    { platform: "darwin-aarch64", fileName: "macos-app.tar.gz.sig" },
    { platform: "linux-x86_64", fileName: "linux.AppImage.tar.gz.sig" }
  ],
  downloadChecks: [
    { platform: "windows-x86_64", downloaded: true, signatureVerified: true, versionMatches: true },
    { platform: "darwin-aarch64", downloaded: true, signatureVerified: true, versionMatches: true },
    { platform: "linux-x86_64", downloaded: true, signatureVerified: true, versionMatches: true }
  ],
  versionChecks: {
    status: "passed",
    currentVersion: "0.1.0",
    updateVersion: "0.1.1"
  },
  failureModeTests: {
    badSignatureBlocked: true,
    noUpdateNoop: true,
    rollbackTested: true
  }
});

export function readUpdaterReleaseInputs({
  specPath = "release/updater-policy.spec.json",
  manifestSchemaPath = "release/updater-manifest.schema.json",
  tauriPath = "src-tauri/tauri.conf.json",
  packagePath = "package.json"
} = {}) {
  return {
    spec: JSON.parse(fs.readFileSync(specPath, "utf8")),
    manifestSchema: JSON.parse(fs.readFileSync(manifestSchemaPath, "utf8")),
    tauriConfig: JSON.parse(fs.readFileSync(tauriPath, "utf8")),
    packageJson: JSON.parse(fs.readFileSync(packagePath, "utf8"))
  };
}

export function validateUpdaterReleaseGate({
  spec,
  manifestSchema,
  tauriConfig,
  packageJson,
  evidence = sampleUpdaterBlockedEvidence
} = readUpdaterReleaseInputs()) {
  const gateFindings = [];
  const blockers = [];

  try {
    assertUpdaterEvidenceSafe(evidence);
  } catch (error) {
    gateFindings.push(issue(error.code ?? "updater.evidence-unsafe", error.message));
  }

  if (spec?.schemaVersion !== updaterReleaseSchemaVersion) {
    gateFindings.push(issue("updater.schema", "Updater release spec schema version is unsupported."));
  }
  if (!Array.isArray(spec?.requiredPlatforms) || spec.requiredPlatforms.length === 0) {
    gateFindings.push(issue("updater.platforms", "Updater release spec must list required platforms."));
  }
  if (spec?.keyCustody?.privateKeyStorage !== "external-secret-store" || spec?.keyCustody?.privateKeysInRepository !== false) {
    gateFindings.push(issue("updater.key-custody-policy", "Updater private key custody must be external-only."));
  }
  if (spec?.configurationPolicy?.createUpdaterArtifactsBeforeSigning !== false) {
    gateFindings.push(issue("updater.artifact-policy", "Updater artifacts must stay disabled before signing evidence exists."));
  }

  const manifestResult = validateLatestJsonSchema(manifestSchema, evidence?.latestJson);
  if (!manifestResult.ok) {
    blockers.push(issue("updater.latest-json-invalid", `latest.json schema validation failed: ${manifestResult.errors.join("; ")}`));
  }

  if (tauriConfig?.bundle?.createUpdaterArtifacts !== true) {
    blockers.push(issue("updater.artifacts-disabled", "Tauri updater artifact generation is disabled until signing is configured."));
  }
  if (!tauriConfig?.plugins?.updater?.pubkey) {
    blockers.push(issue("updater.public-key-missing", "Tauri updater public key is not configured."));
  }
  if (!Array.isArray(tauriConfig?.plugins?.updater?.endpoints) || tauriConfig.plugins.updater.endpoints.length === 0) {
    blockers.push(issue("updater.endpoint-missing", "Tauri updater endpoint is not configured."));
  }
  if (evidence?.keyCustody?.status !== "verified" || evidence?.keyCustody?.signingKeyStorage !== "external-secret-store") {
    blockers.push(issue("updater.key-custody-missing", "Updater signing key custody evidence is missing."));
  }
  if (evidence?.keyCustody?.publicKeyConfigured !== true || evidence?.keyCustody?.endpointConfigured !== true) {
    blockers.push(issue("updater.config-evidence-missing", "Updater public key and endpoint evidence is missing."));
  }

  const requiredPlatforms = spec?.requiredPlatforms ?? [];
  for (const platform of requiredPlatforms) {
    const platformManifest = evidence?.latestJson?.platforms?.[platform];
    if (!platformManifest) {
      blockers.push(issue("updater.platform-missing", `${platform} is missing from latest.json.`));
    }
    if (!evidence?.signatureFiles?.some((entry) => entry.platform === platform && safeSignatureName(entry.fileName))) {
      blockers.push(issue("updater.signature-file-missing", `${platform} .sig evidence is missing.`));
    }
    const check = evidence?.downloadChecks?.find((entry) => entry.platform === platform);
    if (!check?.downloaded || !check?.signatureVerified || !check?.versionMatches) {
      blockers.push(issue("updater.download-check-missing", `${platform} download/signature/version check is missing.`));
    }
  }

  if (!semverGreater(evidence?.versionChecks?.updateVersion, packageJson?.version)) {
    blockers.push(issue("updater.version-check", "Updater version evidence must be newer than the current package version."));
  }
  if (evidence?.failureModeTests?.badSignatureBlocked !== true) {
    blockers.push(issue("updater.bad-signature-missing", "Bad-signature behavior test evidence is missing."));
  }
  if (evidence?.failureModeTests?.noUpdateNoop !== true) {
    blockers.push(issue("updater.no-update-missing", "No-update behavior test evidence is missing."));
  }
  if (evidence?.failureModeTests?.rollbackTested !== true) {
    blockers.push(issue("updater.rollback-missing", "Rollback behavior test evidence is missing."));
  }

  const ok = gateFindings.length === 0;
  const ready = ok && blockers.length === 0;
  return {
    ok,
    ready,
    publicationAllowed: ready,
    status: ready ? "ready" : "blocked",
    gateFindings,
    blockers,
    manifestSchemaValid: manifestResult.ok,
    summary: {
      createUpdaterArtifacts: tauriConfig?.bundle?.createUpdaterArtifacts === true,
      platforms: requiredPlatforms.length,
      signatureFiles: Array.isArray(evidence?.signatureFiles) ? evidence.signatureFiles.length : 0,
      downloadChecks: Array.isArray(evidence?.downloadChecks) ? evidence.downloadChecks.length : 0,
      rollback: evidence?.failureModeTests?.rollbackTested === true ? "tested" : "blocked"
    }
  };
}

export function validateLatestJsonSchema(schema, latestJson) {
  if (!latestJson || typeof latestJson !== "object") {
    return { ok: false, errors: ["manifest is missing"] };
  }
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(latestJson);
  return {
    ok,
    errors: ok ? [] : (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`)
  };
}

export function assertUpdaterEvidenceSafe(evidence) {
  assertNoInlineSecrets(evidence);
  const text = JSON.stringify(evidence);
  if (localPathPattern.test(text)) {
    throw issue("updater.local-path", "Updater release evidence must use URLs or artifact names, not local paths.");
  }
  if (text.includes([".", "planning"].join("")) || text.includes(["reference", "docs"].join("/"))) {
    throw issue("updater.private-reference", "Updater release evidence must not include private planning references.");
  }
  return true;
}

function safeSignatureName(fileName) {
  return /^[A-Za-z0-9._ -]+\.(sig)$/u.test(String(fileName ?? "")) && !localPathPattern.test(String(fileName ?? ""));
}

function semverGreater(candidate, current) {
  const a = parseSemver(candidate);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return true;
    if (a[index] < b[index]) return false;
  }
  return false;
}

function parseSemver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(String(value ?? ""));
  if (!match) return null;
  return match.slice(1, 4).map((part) => Number.parseInt(part, 10));
}

function issue(code, message) {
  return { code, message: redactText(message) };
}
