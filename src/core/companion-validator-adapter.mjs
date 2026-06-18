export const companionValidatorAdapterVersion = "agentique.companionValidatorAdapter.v1";

const SOURCE_PACKAGE = "@agentique.io/validator";
const SOURCE_VERSION = "0.2.1-source";
const ALLOWED_COMMANDS = new Set(["validate", "upload-prep"]);

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/gu,
  /\bsk-[A-Za-z0-9_-]{20,}\b/gu,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/gu,
  /\bAKIA[0-9A-Z]{16}\b/gu,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/giu,
  /\b(?:api[_-]?(?:key|token)|secret|password|token)\b\s*[:=]\s*["'][^"']+["']/giu,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/giu,
  /\b[a-z][a-z0-9+.-]*:\/\/[^/\s"'<>:]+:[^@\s"'<>]+@[^\s"'<>]+/giu
];

const WINDOWS_PATH_PATTERN = new RegExp("[A-Za-z]:\\\\[^\\s\"'<>]+", "gu");
const POSIX_PATH_PATTERN = new RegExp(`/(?:${["home", "Users", "mnt"].join("|")})/[^\\s"'<>]+`, "gu");
const INTERNAL_PATH_PATTERN = new RegExp(
  [
    ["\\.", "planning"].join(""),
    ["\\.", "sessions"].join(""),
    ["reference", "docs"].join("[\\\\/]"),
    "REFERENCE"
  ].join("|"),
  "giu"
);

const CATEGORY_DEFINITIONS = Object.freeze([
  category("manifest-schema", "Manifest/schema", [
    "schema",
    "schema-loader",
    "json-read",
    "json-too-large",
    "contract-schema",
    "permission-risk-missing",
    "output-contract-missing"
  ]),
  category("hash-inventory", "Hash/inventory", [
    "hash-mismatch",
    "hash-without-file",
    "hash-read",
    "missing-file",
    "file-too-large"
  ]),
  category("path-lifecycle", "Path/lifecycle", [
    "invalid-path",
    "unsafe-path",
    "sensitive-path",
    "blocked-extension"
  ]),
  category("secret-redaction", "Secret/redaction", [
    "private-key",
    "openai-key",
    "github-token",
    "aws-access-key",
    "bearer-token",
    "assignment-secret",
    "database-url",
    "credential-url"
  ]),
  category("overclaim", "Overclaim gate", [
    "internal-path",
    "local-absolute-path",
    "private-directory",
    "unbounded-context",
    "strong-claim",
    "platform-managed-overclaim",
    "package-context-unsafe",
    "desired-state-fingerprint-missing",
    "scanner-policy-missing",
    "generated-draft-boundary",
    "patch-delta-ambiguous",
    "platform-variant-overclaim",
    "agent-native-platform-overclaim",
    "agent-native-overclaim"
  ]),
  category("parser-variant", "Parser variant", [
    "parser-evidence-review-required",
    "variant-unsupported",
    "variant-stale"
  ]),
  category("agent-native", "Agent-native", [
    "agent-native-trust-stale",
    "agent-native-unsupported-target",
    "agent-native-private-denied",
    "agent-native-resolver-ambiguity"
  ]),
  category("report", "Report shape", [
    "validator.report-malformed",
    "validator.command-unsupported"
  ])
]);

const CODE_TO_CATEGORY = new Map(
  CATEGORY_DEFINITIONS.flatMap((definition) => definition.codes.map((code) => [code, definition.id]))
);

export const sampleCompanionValidatorReport = Object.freeze({
  ok: true,
  command: "validate",
  packageDir: "valid-starter",
  manifest: {
    name: "valid-starter",
    formatVersion: "1.0",
    registryTrust: {
      packageContext: {
        packageName: "@example/valid-starter",
        version: "1.0.0",
        sourceUrl: "https://github.com/example/valid-starter",
        packageDigestPresent: true
      },
      desiredStateFingerprintPresent: true,
      scannerPolicyVersionExpectation: "platform-managed-readback",
      creatorCheckpointCount: 3,
      generatedDraft: { draftOnly: true, kind: "manifest" },
      patchDelta: { mode: "patch", operationCount: 1 }
    },
    parserVariant: {
      parserEvidence: {
        sourceEcosystem: "mcp",
        sourceFormat: "json",
        parseStatus: "parsed",
        parseConfidence: "high",
        sanitizerStatus: "passed",
        noExecution: true,
        outputDigestPresent: true
      },
      resourceGraphSummary: {
        sanitized: true,
        nodeCount: 2,
        edgeCount: 1,
        capabilityCount: 1,
        sourceFileCount: 1
      },
      compatibility: {
        status: "compatible",
        reasons: ["static-contract"],
        reasonCount: 1
      },
      platformVariants: [
        {
          platformId: "mcp",
          artifactKind: "metadata",
          state: "available",
          validationState: "not-run",
          downloadAvailability: "source-only",
          reasons: ["source-only"],
          reasonCount: 1
        }
      ]
    },
    agentNative: {
      namespace: {
        namespaceId: "agentique.examples",
        namespaceSlug: "agentique-examples",
        resourceCoordinate: "agentique.examples/source-reviewer",
        version: "1.0.0",
        latestPointerPresent: false
      },
      provenanceTrust: {
        evidenceTier: "signed-source",
        evidenceState: "declared",
        sourceKindCount: 3,
        digestPresent: true,
        nonCertifying: true,
        reasonCount: 1
      },
      installGuidance: [
        {
          targetId: "codex",
          state: "source-only",
          artifactKind: "skill",
          noExecution: true,
          requiresManualReview: true,
          reasonCount: 1
        }
      ],
      privateMcpBoundary: {
        visibility: "public-metadata-only",
        credentialHandling: "omitted",
        toolResponseIsolation: true,
        reasonCount: 1
      },
      resolverIntent: {
        intentKindCount: 1,
        ambiguityHandling: "fail-closed"
      }
    }
  },
  inventory: [
    { path: "README.md", sha256: "a".repeat(64), bytes: 512 },
    { path: "notes.md", sha256: "b".repeat(64), bytes: 256 }
  ],
  findings: []
});

export const sampleInvalidCompanionValidatorReport = Object.freeze({
  ok: false,
  command: "validate",
  packageDir: "invalid-starter",
  manifest: {
    name: "invalid-starter",
    formatVersion: "1.0",
    parserVariant: {
      parserEvidence: {
        sourceEcosystem: "langgraph",
        sourceFormat: "python",
        parseStatus: "partial",
        parseConfidence: "low",
        noExecution: true,
        outputDigestPresent: false
      },
      compatibility: {
        status: "partial",
        reasons: ["manual-review"],
        reasonCount: 1
      },
      platformVariants: [
        {
          platformId: "langgraph",
          artifactKind: "graph",
          state: "unsupported",
          validationState: "stale",
          downloadAvailability: "unavailable",
          reasons: ["code-first-static-only"],
          reasonCount: 1
        }
      ]
    },
    agentNative: {
      privateMcpBoundary: {
        visibility: "private-denied",
        credentialHandling: "omitted",
        toolResponseIsolation: true,
        reasonCount: 1
      },
      resolverIntent: {
        intentKindCount: 1,
        ambiguityHandling: "manual-review"
      }
    }
  },
  inventory: [],
  findings: [
    finding("hash-mismatch", "Package file hash does not match manifest.", "README.md"),
    finding("unsafe-path", "Package path must stay relative and cannot traverse directories.", "package.files"),
    finding("assignment-secret", "Secret-like value detected and redacted.", "manifest.notes"),
    finding("strong-claim", "Forbidden public-content term or path detected.", "manifest.summary"),
    finding("parser-evidence-review-required", "Parser evidence requires review before parser or variant availability claims.", "manifest.parserVariant.parserEvidence"),
    finding("agent-native-private-denied", "Private MCP boundary metadata declares private or organization-scoped visibility.", "manifest.agentNative.privateMcpBoundary")
  ]
});

export function normalizeCompanionValidatorReport(report, options = {}) {
  const findings = [];

  if (!isRecord(report)) {
    findings.push(finding("validator.report-malformed", "Validator report must be an object.", "report"));
    return createNormalizedReport({ report: {}, findings, options, malformed: true });
  }

  if (!ALLOWED_COMMANDS.has(report.command)) {
    findings.push(finding("validator.command-unsupported", "Validator command is not accepted for local import proof.", "report.command"));
  }

  if (report.ok !== true && report.ok !== false) {
    findings.push(finding("validator.report-malformed", "Validator report must include an explicit ok boolean.", "report.ok"));
  }

  if (!Array.isArray(report.findings)) {
    findings.push(finding("validator.report-malformed", "Validator report must include a findings array.", "report.findings"));
  } else {
    findings.push(...report.findings.map(normalizeFinding));
  }

  return createNormalizedReport({ report, findings, options, malformed: false });
}

export function createCompanionValidatorImportProof(report = sampleCompanionValidatorReport, options = {}) {
  const normalized = normalizeCompanionValidatorReport(report, options);
  const categories = summarizeCategories(normalized.findings);
  const proofRows = createProofRows({ normalized, categories });
  const noExecution = Object.freeze({
    packageLifecycleScripts: false,
    installs: false,
    builds: false,
    tests: false,
    workflowActions: false,
    dockerBuilds: false,
    arbitraryCode: false,
    sideEffects: Object.freeze([])
  });

  return deepFreeze({
    schemaVersion: companionValidatorAdapterVersion,
    sourcePackage: SOURCE_PACKAGE,
    sourceVersion: SOURCE_VERSION,
    sourceSurface: "static-validator-report",
    operationMode: "local-import-proof",
    ok: normalized.ok,
    decision: normalized.ok ? "accepted" : "blocked",
    summary: {
      findingCount: normalized.findings.length,
      blockingFindings: normalized.findings.length,
      inventoryFiles: normalized.inventory.length,
      inventoryBytes: normalized.inventory.reduce((sum, item) => sum + item.bytes, 0),
      parserVariantState: normalized.parserVariant.state,
      agentNativeState: normalized.agentNative.state
    },
    report: normalized,
    categories,
    proofRows,
    noExecution,
    noOverclaim: {
      platformApproval: false,
      safetyCertification: false,
      publicationApproval: false,
      runtimeCompatibilityGuarantee: false,
      platformDownloadAvailability: false
    }
  });
}

export function assertNoExecutionValidatorProof(proof) {
  const sideEffects = proof?.noExecution;
  const issues = [];
  for (const key of ["packageLifecycleScripts", "installs", "builds", "tests", "workflowActions", "dockerBuilds", "arbitraryCode"]) {
    if (sideEffects?.[key] !== false) {
      issues.push(`execution_flag:${key}`);
    }
  }
  if (!Array.isArray(sideEffects?.sideEffects) || sideEffects.sideEffects.length > 0) {
    issues.push("side_effects_present");
  }
  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues };
}

function createNormalizedReport({ report, findings, options }) {
  const manifest = isRecord(report.manifest) ? report.manifest : {};
  const inventory = Array.isArray(report.inventory) ? report.inventory.map(normalizeInventoryItem).filter(Boolean) : [];
  const ok = report.ok === true && findings.length === 0 && ALLOWED_COMMANDS.has(report.command);
  return deepFreeze({
    schemaVersion: companionValidatorAdapterVersion,
    sourcePackage: SOURCE_PACKAGE,
    command: safeString(report.command ?? "unknown"),
    ok,
    checkedAt: safeString(options.checkedAt ?? "2026-06-13T00:00:00.000Z"),
    package: {
      directory: safePackageDir(report.packageDir),
      name: safeString(manifest.name ?? null),
      formatVersion: safeString(manifest.formatVersion ?? null)
    },
    manifest: summarizeManifest(manifest),
    inventory,
    parserVariant: summarizeParserVariant(manifest.parserVariant),
    agentNative: summarizeAgentNative(manifest.agentNative),
    registryTrust: summarizeRegistryTrust(manifest.registryTrust),
    findings
  });
}

function normalizeFinding(value) {
  if (!isRecord(value)) {
    return finding("validator.report-malformed", "Validator finding must be an object.", "report.findings");
  }
  return finding(
    safeFindingCode(value.code),
    safeString(value.message ?? "Validator finding requires review."),
    safeString(value.location ?? "report")
  );
}

function summarizeCategories(findings) {
  const grouped = new Map(CATEGORY_DEFINITIONS.map((definition) => [definition.id, []]));
  for (const item of findings) {
    const categoryId = CODE_TO_CATEGORY.get(item.code) ?? "report";
    grouped.get(categoryId).push(item);
  }

  return Object.freeze(
    CATEGORY_DEFINITIONS.map((definition) => Object.freeze({
      id: definition.id,
      label: definition.label,
      status: grouped.get(definition.id).length === 0 ? "pass" : "blocked",
      findingCount: grouped.get(definition.id).length,
      findings: Object.freeze(grouped.get(definition.id))
    }))
  );
}

function createProofRows({ normalized, categories }) {
  const categoryRows = categories
    .filter((categoryItem) => categoryItem.id !== "report")
    .map((categoryItem) => ({
      label: categoryItem.label,
      status: categoryItem.status,
      detail: categoryItem.findingCount === 0
        ? "No local validator finding in this category."
        : `${categoryItem.findingCount} finding requires review before import.`
    }));

  return deepFreeze([
    {
      label: "Validator import proof",
      status: normalized.ok ? "accepted" : "blocked",
      detail: normalized.ok ? "Static validator report is locally acceptable." : "Static validator report blocks import."
    },
    ...categoryRows,
    {
      label: "No execution",
      status: "pass",
      detail: "No lifecycle, install, build, workflow, Docker, package test, or arbitrary code execution."
    }
  ]);
}

function summarizeManifest(manifest) {
  return Object.freeze({
    name: safeString(manifest.name ?? null),
    formatVersion: safeString(manifest.formatVersion ?? null)
  });
}

function summarizeRegistryTrust(registryTrust) {
  if (!isRecord(registryTrust)) {
    return Object.freeze({ state: "missing", packageContextReady: false, creatorCheckpointCount: 0 });
  }
  return Object.freeze({
    state: registryTrust.desiredStateFingerprintPresent === true ? "ready" : "review-required",
    packageContextReady: Boolean(registryTrust.packageContext?.packageDigestPresent),
    creatorCheckpointCount: numberOrZero(registryTrust.creatorCheckpointCount),
    generatedDraftKind: safeString(registryTrust.generatedDraft?.kind ?? null),
    patchOperationCount: numberOrZero(registryTrust.patchDelta?.operationCount)
  });
}

function summarizeParserVariant(parserVariant) {
  if (!isRecord(parserVariant)) {
    return Object.freeze({ state: "missing", sourceEcosystem: null, variantCount: 0, noExecution: false });
  }
  const evidence = isRecord(parserVariant.parserEvidence) ? parserVariant.parserEvidence : {};
  const variants = Array.isArray(parserVariant.platformVariants) ? parserVariant.platformVariants.filter(isRecord) : [];
  const reviewRequired =
    evidence.noExecution !== true ||
    ["partial", "unsupported", "blocked", "failed"].includes(normalizeStatus(evidence.parseStatus)) ||
    ["low", "unknown"].includes(normalizeStatus(evidence.parseConfidence)) ||
    variants.some((variant) => ["unsupported", "stale", "blocked"].includes(normalizeStatus(variant.state)));

  return Object.freeze({
    state: reviewRequired ? "review-required" : "ready",
    sourceEcosystem: safeString(evidence.sourceEcosystem ?? null),
    sourceFormat: safeString(evidence.sourceFormat ?? null),
    parseStatus: safeString(evidence.parseStatus ?? null),
    parseConfidence: safeString(evidence.parseConfidence ?? null),
    noExecution: evidence.noExecution === true,
    resourceGraphSanitized: parserVariant.resourceGraphSummary?.sanitized === true,
    compatibilityStatus: safeString(parserVariant.compatibility?.status ?? null),
    variantCount: variants.length
  });
}

function summarizeAgentNative(agentNative) {
  if (!isRecord(agentNative)) {
    return Object.freeze({ state: "missing", privateVisibility: null, installTargets: 0 });
  }
  const provenance = isRecord(agentNative.provenanceTrust) ? agentNative.provenanceTrust : {};
  const installGuidance = Array.isArray(agentNative.installGuidance) ? agentNative.installGuidance.filter(isRecord) : [];
  const privateBoundary = isRecord(agentNative.privateMcpBoundary) ? agentNative.privateMcpBoundary : {};
  const resolverIntent = isRecord(agentNative.resolverIntent) ? agentNative.resolverIntent : {};
  const reviewRequired =
    provenance.nonCertifying !== true ||
    ["missing", "stale", "invalid", "review-required"].includes(normalizeStatus(provenance.evidenceState)) ||
    installGuidance.some((target) => target.noExecution !== true || ["unsupported", "blocked", "stale"].includes(normalizeStatus(target.state))) ||
    privateBoundary.toolResponseIsolation !== true ||
    ["private-denied", "requires-organization-review"].includes(normalizeStatus(privateBoundary.visibility)) ||
    ["manual-review", "show-alternatives"].includes(normalizeStatus(resolverIntent.ambiguityHandling));

  return Object.freeze({
    state: reviewRequired ? "review-required" : "ready",
    namespaceId: safeString(agentNative.namespace?.namespaceId ?? null),
    provenanceEvidenceState: safeString(provenance.evidenceState ?? null),
    nonCertifying: provenance.nonCertifying === true,
    installTargets: installGuidance.length,
    privateVisibility: safeString(privateBoundary.visibility ?? null),
    toolResponseIsolation: privateBoundary.toolResponseIsolation === true,
    ambiguityHandling: safeString(resolverIntent.ambiguityHandling ?? null)
  });
}

function normalizeInventoryItem(item) {
  if (!isRecord(item)) {
    return null;
  }
  const path = safeRelativePath(item.path);
  if (!path) {
    return null;
  }
  return Object.freeze({
    path,
    sha256: /^[a-f0-9]{64}$/u.test(String(item.sha256 ?? "")) ? item.sha256 : null,
    bytes: numberOrZero(item.bytes)
  });
}

function safeFindingCode(value) {
  const code = String(value ?? "validator.unknown").trim().toLowerCase();
  return /^[a-z0-9_.-]+$/u.test(code) ? code : "validator.unknown";
}

function safePackageDir(value) {
  const text = safeString(value ?? "package");
  const parts = text.split(/[\\/]+/u).filter(Boolean);
  return safeRelativePath(parts.at(-1) ?? "package") ?? "package";
}

function safeRelativePath(value) {
  const text = safeString(value ?? "");
  if (!text || pathLooksUnsafe(text)) {
    return null;
  }
  return text;
}

function safeString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  let text = String(value);
  text = text.replace(WINDOWS_PATH_PATTERN, "[redacted:path]");
  text = text.replace(POSIX_PATH_PATTERN, "[redacted:path]");
  text = text.replace(INTERNAL_PATH_PATTERN, "[redacted:internal]");
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[redacted:secret]");
  }
  return text.trim();
}

function pathLooksUnsafe(value) {
  return pathIsAbsolute(value) || value.includes("\\") || value.split("/").includes("..") || INTERNAL_PATH_PATTERN.test(value);
}

function pathIsAbsolute(value) {
  return /^[A-Za-z]:/u.test(value) || value.startsWith("/");
}

function normalizeStatus(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/gu, "-")
    .replace(/\s+/gu, "-");
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function category(id, label, codes) {
  return Object.freeze({ id, label, codes: Object.freeze(codes) });
}

function finding(code, message, location) {
  return Object.freeze({
    code: safeFindingCode(code),
    message: safeString(message ?? "Validator finding requires review."),
    location: safeString(location ?? "report")
  });
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return value;
}
