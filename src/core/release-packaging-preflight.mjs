import fs from "node:fs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const releasePackagingPreflightSchemaVersion = "agentique.releasePackagingPreflight.v1";

export const requiredReleasePackagingEntries = Object.freeze([
  "windows-installer",
  "macos-package",
  "linux-package",
  "signing-and-notarization",
  "updater-metadata",
  "checksums",
  "sbom-and-provenance",
  "clean-install-update-uninstall-smoke",
  "rollback",
  "public-boundary-scan",
  "owner-review"
]);

export const sampleReleasePackagingPreflightIncompleteEvidence = Object.freeze({
  schemaVersion: "agentique.releasePackagingPreflightEvidence.v1",
  generatedAt: "2026-06-17T00:00:00.000Z",
  entries: Object.fromEntries(
    requiredReleasePackagingEntries.map((name) => [
      name,
      {
        status: "missing",
        summary: `${name} evidence is not recorded.`
      }
    ])
  ),
  publicationClaims: {
    releasedInstaller: false,
    signedUpdater: false,
    productionRuntime: false
  }
});

export const sampleReleasePackagingPreflightReadyEvidence = Object.freeze({
  schemaVersion: "agentique.releasePackagingPreflightEvidence.v1",
  generatedAt: "2026-06-17T00:10:00.000Z",
  entries: Object.fromEntries(
    requiredReleasePackagingEntries.map((name) => [
      name,
      {
        status: "ready",
        summary: `${name} evidence is complete and public-safe.`
      }
    ])
  ),
  publicationClaims: {
    releasedInstaller: false,
    signedUpdater: false,
    productionRuntime: false
  }
});

export function readReleasePackagingPreflightInputs({
  specPath = "release/release-packaging-preflight.spec.json",
  packagePath = "package.json",
  evidence = sampleReleasePackagingPreflightIncompleteEvidence
} = {}) {
  return {
    spec: JSON.parse(fs.readFileSync(specPath, "utf8")),
    packageJson: JSON.parse(fs.readFileSync(packagePath, "utf8")),
    evidence
  };
}

export function validateReleasePackagingPreflight(inputs = readReleasePackagingPreflightInputs()) {
  const findings = [];
  let safeEvidence = true;
  try {
    assertReleasePackagingPreflightEvidenceSafe(inputs.evidence);
  } catch (error) {
    safeEvidence = false;
    findings.push(finding(error.code ?? "release-packaging.unsafe-evidence", error.message));
  }

  if (inputs.spec?.schemaVersion !== releasePackagingPreflightSchemaVersion) {
    findings.push(finding("release-packaging.schema", "Release packaging preflight spec schema version is unsupported."));
  }
  if (!String(inputs.packageJson?.scripts?.["validate:release-packaging-preflight"] ?? "").includes("check-release-packaging-preflight.mjs")) {
    findings.push(finding("release-packaging.package-script", "package.json must expose release packaging preflight validation."));
  }

  const requiredEntries = Array.isArray(inputs.spec?.requiredEntries) ? inputs.spec.requiredEntries : [];
  const matrix = requiredEntries.map((name) => normalizeEntry(name, inputs.evidence?.entries?.[name]));
  const matrixNames = matrix.map((entry) => entry.name);
  const missingRequiredEntries = requiredReleasePackagingEntries.filter((name) => !matrixNames.includes(name));
  const unexpectedEntries = matrixNames.filter((name) => !requiredReleasePackagingEntries.includes(name));

  for (const name of missingRequiredEntries) {
    findings.push(finding("release-packaging.required-entry-missing", `Release packaging preflight is missing required entry: ${name}.`));
  }
  for (const name of unexpectedEntries) {
    findings.push(finding("release-packaging.unexpected-entry", `Release packaging preflight has an unexpected entry: ${name}.`));
  }

  if (inputs.spec?.decisionPolicy?.goRequiresEveryEntryReady !== true || inputs.spec?.decisionPolicy?.noGoWhenAnyEntryBlocked !== true) {
    findings.push(finding("release-packaging.decision-policy", "Release packaging policy must require every entry ready and no-go when any entry is blocked."));
  }
  if (inputs.spec?.decisionPolicy?.ownerReviewRequiredForGo !== true) {
    findings.push(finding("release-packaging.owner-review-policy", "Release packaging policy must require owner review before go."));
  }

  const claims = {
    releasedInstaller: inputs.evidence?.publicationClaims?.releasedInstaller === true,
    signedUpdater: inputs.evidence?.publicationClaims?.signedUpdater === true,
    productionRuntime: inputs.evidence?.publicationClaims?.productionRuntime === true
  };
  for (const [claim, value] of Object.entries({ ...inputs.spec?.blockedPublicationClaims, ...claims })) {
    if (value !== false) {
      findings.push(finding("release-packaging.publication-claim", `Unsupported publication claim must remain false: ${claim}.`));
    }
  }

  const blockers = [];
  for (const entry of matrix) {
    if (!entry.ready) {
      const code = entry.name === "owner-review" ? "release-packaging.owner-review-missing" : "release-packaging.entry-blocked";
      blockers.push(finding(code, `${entry.label} evidence is not ready.`));
    }
  }

  const ok = safeEvidence && findings.length === 0;
  const ready = ok && blockers.length === 0 && matrix.length === requiredReleasePackagingEntries.length;
  return {
    ok,
    ready,
    publicationAllowed: ready,
    decision: ready ? "go" : "no-go",
    status: ready ? "ready" : "blocked",
    findings,
    blockers,
    matrix,
    claims,
    summary: {
      totalEntries: matrix.length,
      readyEntries: matrix.filter((entry) => entry.ready).length,
      blockedEntries: matrix.filter((entry) => !entry.ready).length,
      missingRequiredEntries,
      unexpectedEntries
    }
  };
}

export function assertReleasePackagingPreflightEvidenceSafe(evidence) {
  assertNoInlineSecrets(evidence);
  const text = JSON.stringify(evidence ?? {});
  if (/(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\)|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u.test(text)) {
    throw errorIssue("release-packaging.local-path", "Release packaging preflight evidence must not include local path material.");
  }
  if (text.includes([".", "planning"].join("")) || text.includes(["reference", "docs"].join("/"))) {
    throw errorIssue("release-packaging.private-reference", "Release packaging preflight evidence must not include private planning material.");
  }
  return true;
}

function normalizeEntry(name, evidence = {}) {
  return {
    name,
    label: name
      .split("-")
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" "),
    status: evidence.status === "ready" ? "ready" : "blocked",
    ready: evidence.status === "ready",
    summary: redactText(evidence.summary ?? `${name} evidence is missing.`)
  };
}

function finding(code, message) {
  return { code, message: redactText(message) };
}

function errorIssue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(redactText(message)));
  error.code = code;
  return error;
}
