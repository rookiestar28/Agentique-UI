const internalItemCodePattern = new RegExp(`\\b${"R"}\\d{4}\\b`, "u");
const privatePathPattern = /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\)|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u;
const privateMarkerPattern = new RegExp(`(?:\\.${"plan"}${"ning"}|${"reference"}/${"docs"}|private evidence|operator note)`, "iu");
const unsupportedClaimPattern = /\b(?:released installer|signed updater is available|production desktop runtime|automatic workflow execution|universal workflow runtime)\b/iu;

export const releasePublicationPolicy = Object.freeze({
  repositoryVisibility: "public-source",
  separateSystemsBoundary: "excluded-from-public-source",
  npmPackagePublication: "disabled-by-private-package-flag",
  licensePosture: "apache-2.0-source-license",
  releaseAuthority: "draft-release-automation-with-maintainer-publish-review",
  allowedTagPattern: "^v\\d+\\.\\d+\\.\\d+(?:-(?:rc|beta|alpha)\\.\\d+)?$"
});

export function validateReleasePublicationPolicy({ packageJson, policy = releasePublicationPolicy } = {}) {
  const findings = [];
  if (!packageJson || typeof packageJson !== "object") {
    findings.push(issue("release.package-missing", "package metadata is missing"));
  } else {
    if (packageJson.private !== true) {
      findings.push(issue("release.package-publication-open", "package must remain private until registry publication is approved"));
    }
    if (packageJson.license !== "Apache-2.0") {
      findings.push(issue("release.license", "package source license must be Apache-2.0"));
    }
  }

  if (policy.repositoryVisibility !== "public-source") {
    findings.push(issue("release.repository-visibility", "public source repository policy is required"));
  }
  if (policy.separateSystemsBoundary !== "excluded-from-public-source") {
    findings.push(issue("release.system-boundary", "separate Agentique web/catalog system contents must remain outside this public source release"));
  }
  if (policy.releaseAuthority !== "draft-release-automation-with-maintainer-publish-review") {
    findings.push(issue("release.publish-authority", "stable release requires maintainer review"));
  }

  return {
    ok: findings.length === 0,
    findings,
    policy
  };
}

export function validatePublicReleaseName(value) {
  const name = String(value ?? "");
  const findings = [];
  if (name.length === 0 || name.length > 120) {
    findings.push(issue("release.name-length", "release name must be short and non-empty"));
  }
  for (const [code, pattern, message] of [
    ["release.internal-item-code", internalItemCodePattern, "release name must not include private planning identifiers"],
    ["release.private-path", privatePathPattern, "release name must not include local or traversal paths"],
    ["release.private-marker", privateMarkerPattern, "release name must not include private evidence markers"],
    ["release.unsupported-claim", unsupportedClaimPattern, "release name must not claim unavailable installer or runtime behavior"]
  ]) {
    if (pattern.test(name)) findings.push(issue(code, message));
  }
  return {
    ok: findings.length === 0,
    value: name,
    findings
  };
}

export function validateReleaseTag(value, pattern = releasePublicationPolicy.allowedTagPattern) {
  const tag = String(value ?? "");
  const regex = new RegExp(pattern, "u");
  const nameSafety = validatePublicReleaseName(tag);
  const findings = [...nameSafety.findings];
  if (!regex.test(tag)) {
    findings.push(issue("release.tag-format", "release tag must use semantic version format with a v prefix"));
  }
  return {
    ok: findings.length === 0,
    value: tag,
    findings
  };
}

function issue(code, message) {
  return { code, message };
}
