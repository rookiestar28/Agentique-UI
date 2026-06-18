import { redactText } from "./secret-vault.mjs";

const supportedRuntimes = new Set(["python", "node"]);
const decisionRank = Object.freeze({ deny: 0, ask: 1, allow: 2 });
const inlineSensitivePattern = /(inline-secret-value|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|ya29\.[A-Za-z0-9._-]+)/iu;

export const sampleAdapterPolicy = Object.freeze({
  schemaVersion: "agentique.adapterPolicy.v1",
  trustedSigners: ["agentique-adapter-release"],
  revokedDigests: [],
  allowlist: [
    {
      adapterId: "adapter.visual-python",
      version: "0.1.0",
      digest: "a".repeat(64),
      runtimes: ["python"],
      resourceTypes: ["visualizable", "dry-runnable"],
      maxPermissions: {
        files: "ask",
        network: "ask",
        shell: "deny",
        environment: "deny",
        gpu: "ask",
        containers: "ask",
        externalProviders: "ask",
        secrets: "ask",
        sidecars: "ask",
        browserData: "deny"
      }
    },
    {
      adapterId: "adapter.workflow-node",
      version: "0.1.0",
      digest: "d".repeat(64),
      runtimes: ["node"],
      resourceTypes: ["dry-runnable"],
      maxPermissions: {
        files: "ask",
        network: "ask",
        shell: "deny",
        environment: "deny",
        gpu: "deny",
        containers: "deny",
        externalProviders: "ask",
        secrets: "ask",
        sidecars: "ask",
        browserData: "deny"
      }
    }
  ]
});

export const sampleAdapterPack = Object.freeze({
  schemaVersion: "agentique.adapterPack.v1",
  adapter: {
    id: "adapter.visual-python",
    version: "0.1.0",
    runtime: "python",
    entrypoint: "agentique-adapter-visual-python",
    resourceTypes: ["visualizable"]
  },
  artifact: {
    digest: "a".repeat(64),
    sizeBytes: 245760
  },
  signature: {
    status: "verified",
    signer: "agentique-adapter-release",
    subjectDigest: "a".repeat(64)
  },
  compatibility: {
    agentiqueUi: ">=0.1.0",
    platforms: ["windows", "macos", "linux"],
    resourceTypes: ["visualizable"]
  },
  permissions: {
    files: "ask",
    network: "deny",
    shell: "deny",
    environment: "deny",
    gpu: "deny",
    containers: "deny",
    externalProviders: "ask",
    secrets: "ask",
    sidecars: "ask",
    browserData: "deny"
  },
  updatePolicy: {
    channel: "stable",
    rollback: "supported",
    minimumVersion: "0.1.0"
  },
  revocation: {
    status: "active",
    checkedAt: "2026-06-11T00:40:00.000Z"
  },
  provenance: {
    source: "agentique-adapter-pack",
    builder: "github-actions",
    predicateType: "https://slsa.dev/provenance/v1"
  }
});

export const sampleNodeAdapterPack = Object.freeze({
  schemaVersion: "agentique.adapterPack.v1",
  adapter: {
    id: "adapter.workflow-node",
    version: "0.1.0",
    runtime: "node",
    entrypoint: "agentique-adapter-workflow-node",
    resourceTypes: ["dry-runnable"]
  },
  artifact: {
    digest: "d".repeat(64),
    sizeBytes: 327680
  },
  signature: {
    status: "verified",
    signer: "agentique-adapter-release",
    subjectDigest: "d".repeat(64)
  },
  compatibility: {
    agentiqueUi: ">=0.1.0",
    platforms: ["windows", "macos", "linux"],
    resourceTypes: ["dry-runnable"]
  },
  permissions: {
    files: "ask",
    network: "ask",
    shell: "deny",
    environment: "deny",
    gpu: "deny",
    containers: "deny",
    externalProviders: "ask",
    secrets: "ask",
    sidecars: "ask",
    browserData: "deny"
  },
  updatePolicy: {
    channel: "stable",
    rollback: "supported",
    minimumVersion: "0.1.0"
  },
  revocation: {
    status: "active",
    checkedAt: "2026-06-11T00:44:00.000Z"
  },
  provenance: {
    source: "agentique-adapter-pack",
    builder: "github-actions",
    predicateType: "https://slsa.dev/provenance/v1"
  }
});

export function reviewAdapterPack(manifest = sampleAdapterPack, policy = sampleAdapterPolicy, resource = {}) {
  const errors = [];
  try {
    assertNoInlineSensitiveValues(manifest);
  } catch (error) {
    const caught = /** @type {Error & {code?: string}} */ (error);
    errors.push(issue(caught.code ?? "adapter.inline-secret", caught.message));
  }

  if (!manifest || typeof manifest !== "object") {
    return failedReview("adapter.invalid-manifest", "Adapter pack manifest must be an object.");
  }
  if (manifest.schemaVersion !== "agentique.adapterPack.v1") {
    errors.push(issue("adapter.invalid-schema", "Adapter pack schema is unsupported."));
  }

  const adapter = /** @type {any} */ (manifest.adapter ?? {});
  const artifact = /** @type {any} */ (manifest.artifact ?? {});
  const signature = /** @type {any} */ (manifest.signature ?? {});
  const revocation = /** @type {any} */ (manifest.revocation ?? {});
  const compatibility = /** @type {any} */ (manifest.compatibility ?? {});
  const permissions = manifest.permissions ?? {};
  const allowlistEntry = findAllowlistEntry(adapter, artifact, policy);

  if (!allowlistEntry) {
    errors.push(issue("adapter.not-allowlisted", "Adapter pack is not in the runtime allowlist."));
  }
  if (!supportedRuntimes.has(adapter.runtime)) {
    errors.push(issue("adapter.unsupported-runtime", "Adapter runtime is not supported."));
  }
  if (signature.status !== "verified") {
    errors.push(issue("adapter.unsigned", "Adapter pack signature is not verified."));
  }
  if (!Array.isArray(policy?.trustedSigners) || !policy.trustedSigners.includes(signature.signer)) {
    errors.push(issue("adapter.untrusted-signer", "Adapter signer is not trusted by policy."));
  }
  if (artifact.digest !== signature.subjectDigest) {
    errors.push(issue("adapter.digest-mismatch", "Adapter digest does not match the verified signature subject."));
  }
  if (!isDigest(artifact.digest)) {
    errors.push(issue("adapter.invalid-digest", "Adapter digest must be a SHA-256 digest."));
  }
  if ((policy?.revokedDigests ?? []).includes(artifact.digest) || revocation.status === "revoked") {
    errors.push(issue("adapter.revoked", "Adapter pack has been revoked."));
  }
  if (!Array.isArray(compatibility.platforms) || compatibility.platforms.length === 0) {
    errors.push(issue("adapter.invalid-compatibility", "Adapter compatibility matrix must list platforms."));
  }
  if (!Array.isArray(compatibility.resourceTypes) || compatibility.resourceTypes.length === 0) {
    errors.push(issue("adapter.invalid-compatibility", "Adapter compatibility matrix must list resource types."));
  }
  const resourceInput = /** @type {any} */ (resource ?? {});
  const requestedResourceType = resourceInput.supportMode ?? "visualizable";
  if (!compatibility.resourceTypes?.includes(requestedResourceType) || !adapter.resourceTypes?.includes(requestedResourceType)) {
    errors.push(issue("adapter.resource-type", `Adapter does not support resource type ${requestedResourceType}.`));
  }
  errors.push(...validatePermissions(permissions, allowlistEntry?.maxPermissions ?? {}));
  if (!manifest.updatePolicy || manifest.updatePolicy.rollback !== "supported") {
    errors.push(issue("adapter.update-policy", "Adapter update policy must support rollback."));
  }
  if (!manifest.provenance?.predicateType) {
    errors.push(issue("adapter.provenance", "Adapter provenance predicate is required."));
  }

  const review = {
    schemaVersion: "agentique.adapterReview.v1",
    ok: errors.length === 0,
    adapter: {
      id: String(adapter.id ?? ""),
      version: String(adapter.version ?? ""),
      runtime: String(adapter.runtime ?? ""),
      entrypoint: String(adapter.entrypoint ?? "")
    },
    artifact: {
      digest: String(artifact.digest ?? ""),
      sizeBytes: Number(artifact.sizeBytes ?? 0)
    },
    trust: {
      signature: signature.status === "verified" ? "verified" : "blocked",
      signer: String(signature.signer ?? ""),
      provenance: manifest.provenance?.predicateType ?? "missing",
      revocation: revocation.status ?? "unknown",
      allowlisted: Boolean(allowlistEntry)
    },
    compatibility: {
      resourceType: requestedResourceType,
      platforms: compatibility.platforms ?? [],
      resourceTypes: compatibility.resourceTypes ?? []
    },
    permissions: normalizePermissionMap(permissions),
    errors,
    summary: {
      blockingErrors: errors.length,
      runtime: String(adapter.runtime ?? "unknown"),
      permissionAsks: Object.values(normalizePermissionMap(permissions)).filter((decision) => decision === "ask").length,
      permissionAllows: Object.values(normalizePermissionMap(permissions)).filter((decision) => decision === "allow").length
    }
  };

  return clone(review);
}

function findAllowlistEntry(adapter, artifact, policy) {
  return (policy?.allowlist ?? []).find((entry) => (
    entry.adapterId === adapter.id &&
    entry.version === adapter.version &&
    entry.digest === artifact.digest &&
    entry.runtimes?.includes(adapter.runtime)
  ));
}

function validatePermissions(requested, maximum) {
  const errors = [];
  const normalized = normalizePermissionMap(requested);
  for (const [family, decision] of Object.entries(normalized)) {
    const maxDecision = maximum[family] ?? "deny";
    if (decisionRank[decision] > decisionRank[maxDecision]) {
      errors.push(issue("adapter.permission-excess", `${family} requests ${decision}, exceeding policy maximum ${maxDecision}.`));
    }
  }
  return errors;
}

function normalizePermissionMap(permissions) {
  const families = ["files", "network", "shell", "environment", "gpu", "containers", "externalProviders", "secrets", "sidecars", "browserData"];
  return Object.fromEntries(families.map((family) => {
    const decision = permissions?.[family] ?? "deny";
    return [family, Object.prototype.hasOwnProperty.call(decisionRank, decision) ? decision : "deny"];
  }));
}

function isDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function assertNoInlineSensitiveValues(value, path = "value") {
  if (value == null) return true;
  if (typeof value === "string") {
    if (inlineSensitivePattern.test(value)) {
      throw error("adapter.inline-secret", `${path} contains inline sensitive material.`);
    }
    return true;
  }
  if (typeof value !== "object") return true;
  for (const [key, nested] of Object.entries(value)) {
    assertNoInlineSensitiveValues(nested, `${path}.${key}`);
  }
  return true;
}

function failedReview(code, message) {
  return {
    schemaVersion: "agentique.adapterReview.v1",
    ok: false,
    adapter: { id: "", version: "", runtime: "", entrypoint: "" },
    artifact: { digest: "", sizeBytes: 0 },
    trust: { signature: "blocked", signer: "", provenance: "missing", revocation: "unknown", allowlisted: false },
    compatibility: { resourceType: "unknown", platforms: [], resourceTypes: [] },
    permissions: normalizePermissionMap({}),
    errors: [issue(code, message)],
    summary: { blockingErrors: 1, runtime: "unknown", permissionAsks: 0, permissionAllows: 0 }
  };
}

function issue(code, message) {
  return { code, message: redactText(message) };
}

function error(code, message) {
  const next = /** @type {Error & {code?: string}} */ (new Error(message));
  next.code = code;
  return next;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
