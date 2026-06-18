export const sourceResourceBundleMapperVersion = "agentique.sourceResourceBundleMapper.v1";
export const resourceBundleSchemaVersion = "agentique.resourceBundle.v1";

const resourceIdPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|[._:-](?=[A-Za-z0-9])){0,127}$/u;
const resourceVersionPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|[._+-](?=[A-Za-z0-9])){0,95}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const supportModes = Object.freeze(["catalog-only", "visualizable", "editable", "dry-runnable", "locally-runnable", "external-handoff"]);
const platformIds = new Set(["windows", "macos", "linux"]);
const viewerHints = new Set(["markdown", "json", "csv", "image", "video-metadata", "pdf", "graph", "html-sandbox", "mermaid-sandbox"]);
const unsafeKeyPattern = /(authorization|cookie|password|credential|private|token|api[_-]?key|raw[_-]?command)/iu;
const sensitiveTransportKeyPattern = /(storage[_-]?key|object[_-]?key|signed[_-]?url|final[_-]?byte[_-]?url|scoped[_-]?get[_-]?ticket[_-]?endpoint)/iu;
const unsafeValuePattern = /(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|ya29\.[A-Za-z0-9._-]+|bearer\s+[A-Za-z0-9._-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/iu;
const localPathPattern = /(?:[A-Za-z]:[\\/]|\\\\|file:\/\/|\/(?:Users|home|private|tmp|var)\/)/u;
const safeRelativeEndpointPattern = /^\/(api|agents|resources|downloads)\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/u;
const bundlePathPattern = /^(docs|source|artifacts|schemas|metadata)\/[A-Za-z0-9._/-]+$/u;

export function createSupportModeDecision(input = {}) {
  const handoffTargets = uniqueText(input.handoffTargets ?? []).filter(isSafeTargetId);
  const hasPublicHandoff = Boolean(input.hasPublicHandoff || handoffTargets.length > 0);
  const modes = ["catalog-only", "visualizable"];
  if (hasPublicHandoff) modes.push("external-handoff");

  const unsupported = [
    { mode: "editable", reason: "editable_representation_not_evidenced" },
    { mode: "dry-runnable", reason: "dry_run_engine_not_evidenced" },
    { mode: "locally-runnable", reason: "local_runner_not_evidenced" }
  ];

  return {
    noDeadEnd: true,
    modes,
    primaryMode: hasPublicHandoff ? "external-handoff" : "visualizable",
    handoffTargets,
    unsupported
  };
}

export function createResourceBundleFromSourceMetadata(input, options = {}) {
  try {
    assertSafePublicMetadata(input);
    const source = input && typeof input === "object" ? input : {};
    const readback = source.readback && typeof source.readback === "object" ? source.readback : {};
    const resource = source.resource && typeof source.resource === "object" ? source.resource : readback;
    const importMetadata = source.importMetadata && typeof source.importMetadata === "object" ? source.importMetadata : {};
    const downloadMetadata = source.downloadMetadata && typeof source.downloadMetadata === "object" ? source.downloadMetadata : {};

    const identity = normalizeIdentity(resource, importMetadata);
    const packageFiles = normalizePackageFiles(resource, downloadMetadata, identity);
    const digests = packageFiles.map((file) => file.sha256).filter(isSha256);
    const provenance = normalizeProvenance(source.provenance, resource.provenance, digests);
    const handoff = normalizeHandoff(downloadMetadata, importMetadata);
    const support = createSupportModeDecision({
      hasPublicHandoff: handoff.available,
      handoffTargets: handoff.targets
    });
    const compatibility = normalizeCompatibility(resource.compatibility, source.compatibility);
    const capabilityRefs = normalizeCapabilityRefs(resource.manifest, source.capabilityRefs);
    const artifacts = normalizeArtifacts(resource.manifest, packageFiles);

    const bundle = {
      schemaVersion: resourceBundleSchemaVersion,
      resource: {
        id: identity.id,
        version: identity.version,
        title: identity.title,
        summary: identity.summary
      },
      package: {
        layoutVersion: "agentique.bundleLayout.v1",
        files: packageFiles
      },
      support: {
        modes: support.modes,
        primaryMode: support.primaryMode,
        minimumCompleteUx: support.primaryMode === "external-handoff"
          ? "Show verified metadata, artifact summary, and reversible external handoff instructions."
          : "Show verified metadata, documentation, and artifact summary without execution claims.",
        handoffTargets: support.handoffTargets
      },
      compatibility,
      capabilityRefs,
      provenance,
      artifacts
    };

    const digest = provenance.publishedDigest;
    const libraryRecord = {
      resourceId: identity.id,
      title: identity.title,
      version: identity.version,
      digest,
      supportMode: support.primaryMode,
      provenance,
      compatibility,
      permissionState: {
        files: "denied",
        network: "denied",
        shell: "denied",
        environment: "denied"
      },
      installState: {
        status: "verified-only",
        installedAt: null
      },
      cleanupState: {
        status: "not-required",
        lastAction: null
      },
      verifiedAt: normalizeDate(options.verifiedAt ?? source.observedAt ?? resource.observedAt ?? new Date().toISOString(), "verifiedAt")
    };

    return {
      ok: true,
      projection: {
        schemaVersion: sourceResourceBundleMapperVersion,
        source: {
          readOnly: true,
          importedFromPublicMetadata: true
        },
        bundle,
        libraryRecord,
        support,
        handoff,
        verification: createVerificationRequirements(packageFiles, handoff),
        noOverclaim: {
          scopedGetTicketEndpoint: false,
          finalByteUrlInMetadata: false,
          directInstallVerified: false,
          nativeRuntimeExecution: false,
          automaticWorkflowExecution: false
        }
      }
    };
  } catch (error) {
    return {
      ok: false,
      errors: [toIssue(error)]
    };
  }
}

function normalizeIdentity(resource, importMetadata) {
  const id = requirePattern(resource.id ?? importMetadata.resourceId, resourceIdPattern, "resource.invalid-id", "Resource id is malformed.");
  const version = requirePattern(
    resource.latestVersion ?? resource.version ?? importMetadata.resourceVersion,
    resourceVersionPattern,
    "resource.invalid-version",
    "Resource version is malformed."
  );
  return {
    id,
    version,
    title: clampText(requireText(resource.title ?? resource.name ?? id, "resource.invalid-title", "Resource title is required."), 160),
    summary: clampText(optionalText(resource.summary, "Small public resource bundle generated from source metadata."), 500)
  };
}

function normalizePackageFiles(resource, downloadMetadata, identity) {
  const versionFiles = Array.isArray(resource.versions)
    ? resource.versions.flatMap((version) => Array.isArray(version.files) ? version.files : [])
    : [];
  const sourceFiles = Array.isArray(downloadMetadata.files) ? downloadMetadata.files : versionFiles;
  const files = sourceFiles.map((file, index) => normalizePackageFile(file, index)).filter(Boolean);
  if (files.length > 0) return files;

  return [{
    path: "metadata/resource.json",
    mediaType: "application/json",
    sha256: fallbackDigest(identity.id, identity.version),
    sizeBytes: 0
  }];
}

function normalizePackageFile(file, index) {
  if (!file || typeof file !== "object") return null;
  const sha256 = requireDigest(file.sha256 ?? file.checksumSha256, "package.invalid-digest", "Package file digest is required.");
  const mediaType = requireText(file.mediaType ?? file.contentType, "package.invalid-media-type", "Package file media type is required.");
  const sizeBytes = Number(file.sizeBytes ?? file.byteSize);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > 2147483648) {
    throw issue("package.invalid-size", "Package file size is invalid.");
  }

  const explicitPath = typeof file.path === "string" ? file.path.trim() : "";
  const path = explicitPath && bundlePathPattern.test(explicitPath)
    ? explicitPath
    : buildBundlePath(file.fileName ?? file.id ?? `artifact-${index + 1}.json`, mediaType);

  if (!bundlePathPattern.test(path)) {
    throw issue("package.invalid-path", "Package file path is invalid.");
  }
  return { path, mediaType, sha256, sizeBytes };
}

function normalizeProvenance(...sources) {
  const source = sources.find((value) => value && typeof value === "object" && (value.sourceDigest || value.publishedDigest)) ?? {};
  const digestSource = sources.flatMap((value) => Array.isArray(value) ? value : []).find(isSha256);
  const sourceDigest = normalizeDigest(source.sourceDigest) ?? digestSource ?? "0".repeat(64);
  const publishedDigest = normalizeDigest(source.publishedDigest) ?? digestSource ?? sourceDigest;
  return {
    sourceDigest,
    publishedDigest,
    verificationStatus: ["verified", "reviewed", "unverified"].includes(source.verificationStatus) ? source.verificationStatus : "unverified",
    signer: optionalText(source.signer, "source-metadata")
  };
}

function normalizeHandoff(downloadMetadata, importMetadata) {
  const handoff = downloadMetadata.handoff && typeof downloadMetadata.handoff === "object" ? downloadMetadata.handoff : {};
  const endpoint = optionalEndpoint(handoff.endpoint ?? downloadMetadata.downloadEndpoint ?? importMetadata.downloadEndpoint);
  const targets = collectHandoffTargets(importMetadata.installTargets, downloadMetadata.platformDownloads, downloadMetadata.sourcePackage);
  const available = Boolean(endpoint && targets.length > 0);

  return {
    available,
    method: available ? "POST" : null,
    endpoint: available ? endpoint : null,
    targets,
    finalByteUrl: null,
    scopedTicketEndpoint: null,
    finalByteMethod: available ? "GET" : null,
    expiresInSeconds: Number.isInteger(handoff.expiresInSeconds) ? handoff.expiresInSeconds : null,
    replayMitigation: optionalText(handoff.ticket?.replayMitigation, "short_expiry_and_route_rate_limit"),
    noOverclaim: {
      scopedGetTicketEndpoint: false,
      finalByteUrlInMetadata: false,
      directInstallVerified: false,
      singleUseReplayGuarantee: false
    }
  };
}

function collectHandoffTargets(installTargets, platformDownloads, sourcePackage) {
  const targets = [];
  if (Array.isArray(installTargets)) {
    for (const target of installTargets) {
      if (!target || typeof target !== "object") continue;
      if (target.status === "download-backed" || target.status === "guidance-only" || target.download) {
        targets.push(target.targetId);
      }
    }
  }
  if (sourcePackage && typeof sourcePackage === "object" && sourcePackage.status === "DOWNLOADABLE") {
    targets.push(sourcePackage.platformId ?? "source-package");
  }
  if (Array.isArray(platformDownloads)) {
    for (const target of platformDownloads) {
      if (target && typeof target === "object" && target.status === "DOWNLOADABLE") {
        targets.push(target.platformId);
      }
    }
  }
  return uniqueText(targets).filter(isSafeTargetId);
}

function normalizeCompatibility(...sources) {
  const source = sources.find((value) => value && typeof value === "object") ?? {};
  const platforms = uniqueText(source.platforms ?? source.targetPlatforms ?? ["windows", "macos", "linux"]).filter((platform) => platformIds.has(platform));
  return {
    agentiqueUi: typeof source.agentiqueUi === "string" && /^>=\d+\.\d+\.\d+$/u.test(source.agentiqueUi) ? source.agentiqueUi : ">=0.1.0",
    platforms: platforms.length > 0 ? platforms : ["windows", "macos", "linux"]
  };
}

function normalizeCapabilityRefs(manifest, sourceRefs) {
  const manifestRecord = manifest && typeof manifest === "object" ? manifest : {};
  const raw = Array.isArray(sourceRefs) ? sourceRefs : Array.isArray(manifestRecord.capabilities) ? manifestRecord.capabilities : [];
  return uniqueText(raw)
    .map((value) => value.startsWith("capability:") ? value : `capability:${value}`)
    .filter((value) => /^capability:[A-Za-z0-9][A-Za-z0-9._:-]{1,80}$/u.test(value))
    .slice(0, 20);
}

function normalizeArtifacts(manifest, files) {
  const manifestRecord = manifest && typeof manifest === "object" ? manifest : {};
  const hints = new Set(["json"]);
  for (const file of files) {
    if (file.mediaType === "text/markdown") hints.add("markdown");
    if (file.mediaType === "application/pdf") hints.add("pdf");
    if (file.mediaType.startsWith("image/")) hints.add("image");
    if (file.mediaType === "text/csv") hints.add("csv");
  }
  if (manifestRecord.graph || manifestRecord.workflow || manifestRecord.nodes) hints.add("graph");
  return {
    contract: "agentique.artifactContract.v1",
    viewerHints: [...hints].filter((hint) => viewerHints.has(hint))
  };
}

function createVerificationRequirements(files, handoff) {
  return {
    requiresByteSize: true,
    requiresChecksumSha256: true,
    requiresContentType: true,
    requiresAttachmentDisposition: true,
    handoffMethod: handoff.available ? "POST" : null,
    files: files.map((file) => ({
      path: file.path,
      mediaType: file.mediaType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      attachmentDisposition: "required"
    }))
  };
}

function assertSafePublicMetadata(value, path = "input") {
  if (value == null) return;
  if (typeof value === "string") {
    if (unsafeValuePattern.test(value) || localPathPattern.test(value)) {
      throw issue("metadata.unsafe-value", `${path} contains unsafe public metadata.`);
    }
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (unsafeKeyPattern.test(key)) {
      throw issue("metadata.unsafe-field", `${nestedPath} is not allowed in public bundle metadata.`);
    }
    if (sensitiveTransportKeyPattern.test(key) && nested != null && nested !== false) {
      throw issue("metadata.unsafe-transport-field", `${nestedPath} must not expose private transport details.`);
    }
    assertSafePublicMetadata(nested, nestedPath);
  }
}

function requirePattern(value, pattern, code, message) {
  const text = requireText(value, code, message);
  if (!pattern.test(text)) throw issue(code, message);
  return text;
}

function requireDigest(value, code, message) {
  const digest = normalizeDigest(value);
  if (!digest) throw issue(code, message);
  return digest;
}

function normalizeDigest(value) {
  if (typeof value !== "string") return null;
  const digest = value.trim().toLowerCase().replace(/^sha256-/u, "");
  return sha256Pattern.test(digest) ? digest : null;
}

function isSha256(value) {
  return typeof value === "string" && sha256Pattern.test(value);
}

function requireText(value, code, message) {
  if (typeof value !== "string" || !value.trim()) throw issue(code, message);
  const text = value.trim();
  if (unsafeValuePattern.test(text) || localPathPattern.test(text)) throw issue("metadata.unsafe-value", `${code} contains unsafe text.`);
  return text;
}

function optionalText(value, fallback = "") {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return requireText(value, "metadata.invalid-text", "Text value is invalid.");
}

function clampText(value, maxLength) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function optionalEndpoint(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const endpoint = value.trim();
  if (!safeRelativeEndpointPattern.test(endpoint) || endpoint.startsWith("//") || endpoint.includes("..")) {
    throw issue("handoff.invalid-endpoint", "Handoff endpoint must be a safe relative endpoint.");
  }
  return endpoint;
}

function normalizeDate(value, fieldName) {
  const text = requireText(value, "metadata.invalid-date", `${fieldName} must be an ISO date.`);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw issue("metadata.invalid-date", `${fieldName} must be an ISO date.`);
  return date.toISOString();
}

function buildBundlePath(fileName, mediaType) {
  const name = String(fileName ?? "artifact.json")
    .split(/[\\/]/u)
    .filter(Boolean)
    .pop()
    ?.replace(/[^A-Za-z0-9._-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^[-.]+|[-.]+$/gu, "");
  const safeName = name || "artifact.json";
  if (mediaType === "text/markdown") return `docs/${safeName}`;
  if (mediaType === "application/json") return `metadata/${safeName}`;
  if (mediaType.includes("schema")) return `schemas/${safeName}`;
  return `artifacts/${safeName}`;
}

function fallbackDigest(...parts) {
  const text = parts.join(":");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").repeat(8).slice(0, 64);
}

function uniqueText(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean))];
}

function isSafeTargetId(value) {
  return /^[a-z0-9][a-z0-9._-]{1,80}$/u.test(value);
}

function issue(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function toIssue(error) {
  return {
    code: error.code ?? "metadata.error",
    message: error.message ?? "Resource bundle mapping failed."
  };
}
