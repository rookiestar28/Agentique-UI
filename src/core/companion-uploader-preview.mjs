export const companionUploaderPreviewVersion = "agentique.companionUploaderPreview.v1";

const SOURCE_PACKAGE = "@agentique.io/uploader";
const SOURCE_VERSION = "0.2.1-source";
const DRAFT_KINDS = new Set(["card", "manifest"]);
const PATCH_MODES = new Set(["patch", "delta"]);
const PATCH_OPS = new Set(["add", "replace", "remove"]);
const FULL_SNAPSHOT_PATHS = new Set(["/", "/manifest", "/resource", "/package", "/registryTrust"]);
const INTERNAL_MARKERS = Object.freeze(["." + "planning", "reference" + "/docs", "reference" + "\\docs"]);
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/gu,
  /\bsk-[A-Za-z0-9_-]{20,}\b/gu,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/gu,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/giu
];
const WINDOWS_PATH_PATTERN = new RegExp("[A-Za-z]:\\\\[^\\s\"'<>]+", "gu");
const POSIX_PATH_PATTERN = new RegExp(`/(?:${["home", "Users", "mnt"].join("|")})/[^\\s"'<>]+`, "gu");
const UNSAFE_TEXT_PATTERNS = Object.freeze([
  ["draft-overclaim-approval", /\bapproved\b/iu],
  ["draft-overclaim-certification", /\bcertifi(?:ed|cation)\b/iu],
  ["draft-overclaim-malware", /\bmalware[- ]?free\b/iu],
  ["draft-overclaim-hosted-execution", /\bhosted[- ]execution\b/iu],
  ["draft-overclaim-scan-pass", /\bscan(?:ned)?[- ]pass(?:ed)?\b/iu],
  ["draft-overclaim-publication", /\b(?:published|listed)\b/iu],
  ["draft-secret-like-text", /\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b/iu],
  ["draft-presigned-url-label", /\b(?:x-amz-signature|x-amz-credential|awsaccesskeyid|signature=|sig=)\b/iu],
  ["draft-local-path", /(?:[A-Za-z]:\\|\/(?:home|users|mnt)\/)/iu],
  ["draft-storage-key", /\b(?:storage[_-]?key|object[_-]?key)\b/iu]
]);

export const sampleCompanionUploaderPreviewInput = Object.freeze({
  boundary: {
    packageName: SOURCE_PACKAGE,
    version: "0.2.1",
    submissionMode: "review-only",
    liveUploadAvailable: false
  },
  uploadPlan: {
    ok: true,
    code: "upload.plan.ready",
    reviewOnly: true,
    noExecution: true,
    package: {
      name: "valid-starter",
      formatVersion: "1.0"
    },
    checkpoints: {
      readyForReviewSubmit: true,
      missing: [],
      packageContextReady: true,
      reasons: []
    },
    evidence: {
      inventoryDigest: `sha256:${"a".repeat(64)}`,
      findingCount: 0,
      findings: []
    }
  },
  importPlan: {
    ok: true,
    code: "upload.import_plan.ready",
    reviewOnly: true,
    dryRunOnly: true,
    noExecution: true,
    detected: {
      sourceEcosystem: "dify",
      sourceFormat: "yaml",
      parseStatus: "parsed",
      parseConfidence: "high",
      noExecution: true,
      outputDigestPresent: true
    },
    graph: {
      sanitized: true,
      nodeCount: 2,
      edgeCount: 1,
      capabilityCount: 1,
      sourceFileCount: 1
    },
    compatibility: {
      status: "compatible",
      reasonCount: 1
    },
    evidence: {
      inventoryDigest: `sha256:${"a".repeat(64)}`,
      findingCount: 0,
      findings: []
    }
  },
  variantPlan: {
    ok: true,
    code: "upload.variant_plan.ready",
    reviewOnly: true,
    dryRunOnly: true,
    noExecution: true,
    compatibility: {
      status: "compatible",
      reasonCount: 1
    },
    variants: [
      {
        platformId: "codex-skill",
        artifactKind: "skill",
        state: "available",
        validationState: "not-run",
        downloadAvailability: "source-only",
        reasons: ["source-only"],
        reasonCount: 1,
        readyForDownload: false
      }
    ],
    evidence: {
      inventoryDigest: `sha256:${"a".repeat(64)}`,
      findingCount: 0,
      findings: []
    }
  },
  agentNativePlan: {
    ok: true,
    code: "upload.agent_native_plan.ready",
    reviewOnly: true,
    dryRunOnly: true,
    noExecution: true,
    namespace: {
      namespaceId: "agentique.examples",
      resourceCoordinate: "agentique.examples/source-reviewer",
      version: "1.0.0"
    },
    provenanceTrust: {
      evidenceTier: "signed-source",
      evidenceState: "declared",
      digestPresent: true,
      nonCertifying: true
    },
    installGuidance: [
      {
        targetId: "codex",
        state: "source-only",
        artifactKind: "skill",
        noExecution: true,
        requiresManualReview: true,
        readyForLocalReview: true
      }
    ],
    privateMcpBoundary: {
      visibility: "public-metadata-only",
      credentialHandling: "not-required",
      toolResponseIsolation: true
    },
    resolverIntent: {
      intentKindCount: 2,
      ambiguityHandling: "fail-closed"
    },
    evidence: {
      inventoryDigest: `sha256:${"a".repeat(64)}`,
      findingCount: 0,
      findings: []
    }
  },
  draft: {
    ok: true,
    code: "upload.draft.ready",
    reviewOnly: true,
    draftOnly: true,
    submitted: false,
    requiresUserConfirmation: true,
    requiresServerValidationBeforeSubmit: true,
    draft: {
      kind: "manifest",
      summary: "Draft-only manifest suggestion prepared for local review."
    }
  },
  patchDelta: {
    ok: true,
    code: "upload.patch_delta.ready",
    reviewOnly: true,
    partialUpdateOnly: true,
    submitted: false,
    requiresUserConfirmation: true,
    requiresServerValidationBeforeSubmit: true,
    patchDelta: {
      mode: "patch",
      operationCount: 1,
      operations: [
        {
          op: "replace",
          path: "/summary",
          valueSummary: "Updates public summary only."
        }
      ]
    }
  }
});

export const sampleUnsafeCompanionUploaderPreviewInput = Object.freeze({
  ...sampleCompanionUploaderPreviewInput,
  boundary: {
    packageName: SOURCE_PACKAGE,
    version: "0.2.1",
    submissionMode: "review-only",
    liveUploadAvailable: true
  },
  draft: {
    ok: true,
    code: "upload.draft.ready",
    reviewOnly: true,
    draftOnly: true,
    submitted: false,
    requiresUserConfirmation: true,
    requiresServerValidationBeforeSubmit: true,
    draft: {
      kind: "card",
      summary: "This draft is approved for hosted execution."
    }
  },
  patchDelta: {
    ok: true,
    code: "upload.patch_delta.ready",
    reviewOnly: true,
    partialUpdateOnly: true,
    submitted: false,
    requiresUserConfirmation: true,
    requiresServerValidationBeforeSubmit: true,
    patchDelta: {
      mode: "patch",
      operationCount: 1,
      operations: [
        {
          op: "replace",
          path: "/manifest",
          valueSummary: "Replaces a complete manifest snapshot."
        }
      ]
    }
  }
});

export function createCompanionUploaderPreview(input = sampleCompanionUploaderPreviewInput, options = {}) {
  const source = isRecord(input) ? input : {};
  const findings = [];
  const boundary = normalizeBoundary(source.boundary, findings);
  const uploadPlan = normalizeUploadPlan(source.uploadPlan, findings);
  const importPlan = normalizeImportPlan(source.importPlan, findings);
  const variantPlan = normalizeVariantPlan(source.variantPlan, findings);
  const agentNativePlan = normalizeAgentNativePlan(source.agentNativePlan, findings);
  const draft = normalizeDraft(source.draft, findings);
  const patchDelta = normalizePatchDelta(source.patchDelta, findings);
  const noActions = createNoActionBoundary();
  const noExecution = createNoExecutionBoundary();
  const noOverclaim = createNoOverclaimBoundary();

  const ok =
    findings.length === 0 &&
    boundary.reviewOnly === true &&
    boundary.liveUploadAvailable === false &&
    uploadPlan.ok &&
    importPlan.ok &&
    variantPlan.ok &&
    agentNativePlan.ok &&
    draft.ok &&
    patchDelta.ok;

  return deepFreeze({
    schemaVersion: companionUploaderPreviewVersion,
    sourcePackage: SOURCE_PACKAGE,
    sourceVersion: SOURCE_VERSION,
    sourceSurface: "review-only-uploader-preview",
    operationMode: "local-review-preview",
    ok,
    decision: ok ? "accepted" : "blocked",
    checkedAt: safeIso(options.checkedAt ?? "2026-06-13T00:20:00.000Z"),
    boundary,
    plans: {
      upload: uploadPlan,
      import: importPlan,
      variant: variantPlan,
      agentNative: agentNativePlan
    },
    draft,
    patchDelta,
    evidence: {
      findingCount: findings.length,
      findings
    },
    previewRows: createPreviewRows({ ok, boundary, uploadPlan, importPlan, variantPlan, agentNativePlan, draft, patchDelta, findings }),
    noActions,
    noExecution,
    noOverclaim
  });
}

export function createCompanionUploaderPreviewFailure(input = {}, options = {}) {
  return createCompanionUploaderPreview(
    {
      ...sampleUnsafeCompanionUploaderPreviewInput,
      ...input
    },
    options
  );
}

export function assertReviewOnlyUploaderPreview(preview) {
  const issues = [];
  if (preview?.boundary?.submissionMode !== "review-only") {
    issues.push("boundary_submission_mode");
  }
  if (preview?.boundary?.liveUploadAvailable !== false) {
    issues.push("boundary_live_upload");
  }
  for (const key of ["submit", "publish", "approve", "moderate", "registryRelease", "packagePublication", "statusPolling", "authenticatedUpload"]) {
    if (preview?.noActions?.[key] !== false) {
      issues.push(`action_flag:${key}`);
    }
  }
  for (const key of ["packageLifecycleScripts", "dependencyInstall", "builds", "tests", "workflowActions", "dockerBuilds", "arbitraryCode"]) {
    if (preview?.noExecution?.[key] !== false) {
      issues.push(`execution_flag:${key}`);
    }
  }
  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues };
}

function normalizeBoundary(boundary, findings) {
  const value = isRecord(boundary) ? boundary : {};
  const submissionMode = safeString(value.submissionMode);
  const liveUploadAvailable = value.liveUploadAvailable === true;
  if (submissionMode !== "review-only") {
    findings.push(issue("uploader.boundary-submission-mode", "Uploader preview must be review-only.", "boundary.submissionMode"));
  }
  if (liveUploadAvailable !== false) {
    findings.push(issue("uploader.live-upload-disabled", "Live upload must remain disabled in Agentique UI.", "boundary.liveUploadAvailable"));
  }
  return {
    packageName: safeString(value.packageName ?? SOURCE_PACKAGE),
    sourceVersion: safeString(value.version ?? "0.2.1"),
    submissionMode,
    liveUploadAvailable,
    reviewOnly: submissionMode === "review-only"
  };
}

function normalizeUploadPlan(plan, findings) {
  const value = isRecord(plan) ? plan : {};
  const planFindings = normalizeFindings(value.evidence?.findings);
  findings.push(...planFindings);
  if (value.reviewOnly !== true) {
    findings.push(issue("upload-plan.review-only-missing", "Upload plan must be review-only.", "uploadPlan.reviewOnly"));
  }
  if (value.noExecution !== true) {
    findings.push(issue("upload-plan.no-execution-missing", "Upload plan must not execute package code.", "uploadPlan.noExecution"));
  }
  if (value.ok !== true) {
    findings.push(issue("upload-plan.review-required", "Upload plan requires review before preview acceptance.", "uploadPlan.ok"));
  }
  return {
    ok: value.ok === true && value.reviewOnly === true && value.noExecution === true && planFindings.length === 0,
    code: safeString(value.code),
    reviewOnly: value.reviewOnly === true,
    noExecution: value.noExecution === true,
    packageName: safeString(value.package?.name),
    formatVersion: safeString(value.package?.formatVersion),
    readyForReviewSubmit: value.checkpoints?.readyForReviewSubmit === true,
    packageContextReady: value.checkpoints?.packageContextReady === true,
    missingCheckpoints: safeStringArray(value.checkpoints?.missing),
    inventoryDigest: safeInventoryDigest(value.evidence?.inventoryDigest),
    findingCount: numberOrZero(value.evidence?.findingCount) + planFindings.length
  };
}

function normalizeImportPlan(plan, findings) {
  const value = isRecord(plan) ? plan : {};
  const planFindings = normalizeFindings(value.evidence?.findings);
  findings.push(...planFindings);
  if (value.reviewOnly !== true || value.dryRunOnly !== true || value.noExecution !== true) {
    findings.push(issue("import-plan.boundary-missing", "Import plan must be review-only dry-run evidence without execution.", "importPlan"));
  }
  if (!isRecord(value.detected)) {
    findings.push(issue("import-plan-parser-evidence-missing", "Parser evidence is required before import planning can be ready.", "importPlan.detected"));
  }
  return {
    ok: value.ok === true && value.reviewOnly === true && value.dryRunOnly === true && value.noExecution === true && isRecord(value.detected) && planFindings.length === 0,
    code: safeString(value.code),
    reviewOnly: value.reviewOnly === true,
    dryRunOnly: value.dryRunOnly === true,
    noExecution: value.noExecution === true,
    sourceEcosystem: safeString(value.detected?.sourceEcosystem),
    sourceFormat: safeString(value.detected?.sourceFormat),
    parseStatus: safeString(value.detected?.parseStatus),
    graphSanitized: value.graph?.sanitized === true,
    graphNodeCount: numberOrZero(value.graph?.nodeCount),
    compatibilityStatus: safeString(value.compatibility?.status),
    findingCount: numberOrZero(value.evidence?.findingCount) + planFindings.length
  };
}

function normalizeVariantPlan(plan, findings) {
  const value = isRecord(plan) ? plan : {};
  const planFindings = normalizeFindings(value.evidence?.findings);
  const variants = Array.isArray(value.variants) ? value.variants.filter(isRecord) : [];
  findings.push(...planFindings);
  if (value.reviewOnly !== true || value.dryRunOnly !== true || value.noExecution !== true) {
    findings.push(issue("variant-plan.boundary-missing", "Variant plan must be review-only dry-run evidence without execution.", "variantPlan"));
  }
  if (variants.length === 0) {
    findings.push(issue("variant-plan-variants-missing", "Platform variant metadata is required before variant planning can be ready.", "variantPlan.variants"));
  }
  const variantSummaries = variants.map((variant, index) => {
    if (variant.downloadAvailability === "source-only" && variant.readyForDownload === true) {
      findings.push(issue("variant-plan-download-overclaim", "Source-only variant output is not platform download readiness.", `variantPlan.variants.${index}`));
    }
    return {
      platformId: safeString(variant.platformId),
      artifactKind: safeString(variant.artifactKind),
      state: safeString(variant.state),
      validationState: safeString(variant.validationState),
      downloadAvailability: safeString(variant.downloadAvailability),
      readyForDownload: variant.readyForDownload === true,
      reasons: safeStringArray(variant.reasons),
      reasonCount: numberOrZero(variant.reasonCount)
    };
  });
  return {
    ok: value.ok === true && value.reviewOnly === true && value.dryRunOnly === true && value.noExecution === true && variants.length > 0 && planFindings.length === 0,
    code: safeString(value.code),
    reviewOnly: value.reviewOnly === true,
    dryRunOnly: value.dryRunOnly === true,
    noExecution: value.noExecution === true,
    compatibilityStatus: safeString(value.compatibility?.status),
    variants: variantSummaries,
    sourceOnlyCount: variantSummaries.filter((variant) => variant.downloadAvailability === "source-only").length,
    readyForDownloadCount: variantSummaries.filter((variant) => variant.readyForDownload).length,
    findingCount: numberOrZero(value.evidence?.findingCount) + planFindings.length
  };
}

function normalizeAgentNativePlan(plan, findings) {
  const value = isRecord(plan) ? plan : {};
  const planFindings = normalizeFindings(value.evidence?.findings);
  const installGuidance = Array.isArray(value.installGuidance) ? value.installGuidance.filter(isRecord) : [];
  findings.push(...planFindings);
  if (value.reviewOnly !== true || value.dryRunOnly !== true || value.noExecution !== true) {
    findings.push(issue("agent-native-plan.boundary-missing", "Agent-native plan must be review-only dry-run evidence without execution.", "agentNativePlan"));
  }
  if (!isRecord(value.namespace)) {
    findings.push(issue("agent-native-plan-namespace-missing", "Agent-native namespace metadata is required before dry-run planning can be ready.", "agentNativePlan.namespace"));
  }
  if (installGuidance.length === 0) {
    findings.push(issue("agent-native-plan-install-guidance-missing", "Agent-native install guidance is required before dry-run planning can be ready.", "agentNativePlan.installGuidance"));
  }
  const guidance = installGuidance.map((target, index) => {
    if (target.noExecution !== true || target.requiresManualReview !== true) {
      findings.push(issue("agent-native-guidance-boundary", "Agent-native guidance must require manual review and no execution.", `agentNativePlan.installGuidance.${index}`));
    }
    return {
      targetId: safeString(target.targetId),
      state: safeString(target.state),
      artifactKind: safeString(target.artifactKind),
      noExecution: target.noExecution === true,
      requiresManualReview: target.requiresManualReview === true,
      readyForLocalReview: target.readyForLocalReview === true
    };
  });
  return {
    ok: value.ok === true && value.reviewOnly === true && value.dryRunOnly === true && value.noExecution === true && isRecord(value.namespace) && guidance.length > 0 && planFindings.length === 0,
    code: safeString(value.code),
    reviewOnly: value.reviewOnly === true,
    dryRunOnly: value.dryRunOnly === true,
    noExecution: value.noExecution === true,
    namespaceId: safeString(value.namespace?.namespaceId),
    resourceCoordinate: safeString(value.namespace?.resourceCoordinate),
    evidenceTier: safeString(value.provenanceTrust?.evidenceTier),
    nonCertifying: value.provenanceTrust?.nonCertifying === true,
    installGuidance: guidance,
    privateVisibility: safeString(value.privateMcpBoundary?.visibility),
    credentialHandling: safeString(value.privateMcpBoundary?.credentialHandling),
    ambiguityHandling: safeString(value.resolverIntent?.ambiguityHandling),
    findingCount: numberOrZero(value.evidence?.findingCount) + planFindings.length
  };
}

function normalizeDraft(draftInput, findings) {
  const value = isRecord(draftInput) ? draftInput : {};
  const draft = isRecord(value.draft) ? value.draft : {};
  const kind = safeString(draft.kind);
  const summary = safeString(draft.summary);
  const issues = collectUnsafeTextIssues([["draft.summary", summary]]);
  findings.push(...issues);
  if (value.reviewOnly !== true || value.draftOnly !== true || value.submitted !== false) {
    findings.push(issue("draft.boundary-missing", "Generated draft must be review-only, draft-only, and not submitted.", "draft"));
  }
  if (!DRAFT_KINDS.has(kind)) {
    findings.push(issue("draft.invalid-kind", "Generated draft kind must be card or manifest.", "draft.kind"));
  }
  if (value.requiresUserConfirmation !== true || value.requiresServerValidationBeforeSubmit !== true) {
    findings.push(issue("draft.confirmation-required", "Generated draft requires user confirmation and server validation before submit.", "draft"));
  }
  return {
    ok:
      value.ok === true &&
      value.reviewOnly === true &&
      value.draftOnly === true &&
      value.submitted === false &&
      DRAFT_KINDS.has(kind) &&
      value.requiresUserConfirmation === true &&
      value.requiresServerValidationBeforeSubmit === true &&
      issues.length === 0,
    code: safeString(value.code),
    reviewOnly: value.reviewOnly === true,
    draftOnly: value.draftOnly === true,
    submitted: value.submitted === true,
    requiresUserConfirmation: value.requiresUserConfirmation === true,
    requiresServerValidationBeforeSubmit: value.requiresServerValidationBeforeSubmit === true,
    kind,
    summary: issues.length === 0 ? summary : "[blocked:unsafe-draft]",
    issueCount: issues.length
  };
}

function normalizePatchDelta(patchInput, findings) {
  const value = isRecord(patchInput) ? patchInput : {};
  const patchDelta = isRecord(value.patchDelta) ? value.patchDelta : {};
  const issues = [];
  const mode = safeString(patchDelta.mode);
  if (!PATCH_MODES.has(mode)) {
    issues.push(issue("patch-delta-mode-invalid", "Patch/delta mode must be patch or delta.", "patchDelta.mode"));
  }
  const operations = Array.isArray(patchDelta.operations) ? patchDelta.operations : [];
  if (operations.length === 0) {
    issues.push(issue("patch-delta-operations-required", "Patch/delta operations are required.", "patchDelta.operations"));
  }
  const safeOperations = operations.map((operation, index) => {
    const location = `patchDelta.operations.${index}`;
    if (!isRecord(operation)) {
      issues.push(issue("patch-delta-operation-invalid", "Patch/delta operation must be an object.", location));
      return null;
    }
    const op = safeString(operation.op);
    const operationPath = safeString(operation.path);
    const valueSummary = safeString(operation.valueSummary);
    if (!PATCH_OPS.has(op)) {
      issues.push(issue("patch-delta-op-invalid", "Patch/delta op must be add, replace, or remove.", `${location}.op`));
    }
    if (!operationPath || !/^\/[A-Za-z0-9_/-]+$/u.test(operationPath)) {
      issues.push(issue("patch-delta-path-invalid", "Patch/delta path is invalid.", `${location}.path`));
    } else if (FULL_SNAPSHOT_PATHS.has(operationPath)) {
      issues.push(issue("patch-delta-full-snapshot-forbidden", "Patch/delta metadata cannot replace a full snapshot.", `${location}.path`));
    }
    const unsafe = collectUnsafeTextIssues(valueSummary ? [[`${location}.valueSummary`, valueSummary]] : []);
    issues.push(...unsafe);
    if (!PATCH_OPS.has(op) || !operationPath || FULL_SNAPSHOT_PATHS.has(operationPath) || unsafe.length > 0) {
      return null;
    }
    return {
      op,
      path: operationPath,
      ...(valueSummary ? { valueSummary } : {})
    };
  }).filter(Boolean);

  findings.push(...issues);
  if (value.reviewOnly !== true || value.partialUpdateOnly !== true || value.submitted !== false) {
    findings.push(issue("patch-delta.boundary-missing", "Patch/delta output must be review-only, partial-update-only, and not submitted.", "patchDelta"));
  }
  if (value.requiresUserConfirmation !== true || value.requiresServerValidationBeforeSubmit !== true) {
    findings.push(issue("patch-delta.confirmation-required", "Patch/delta output requires user confirmation and server validation before submit.", "patchDelta"));
  }

  return {
    ok:
      value.ok === true &&
      value.reviewOnly === true &&
      value.partialUpdateOnly === true &&
      value.submitted === false &&
      value.requiresUserConfirmation === true &&
      value.requiresServerValidationBeforeSubmit === true &&
      issues.length === 0,
    code: safeString(value.code),
    reviewOnly: value.reviewOnly === true,
    partialUpdateOnly: value.partialUpdateOnly === true,
    submitted: value.submitted === true,
    requiresUserConfirmation: value.requiresUserConfirmation === true,
    requiresServerValidationBeforeSubmit: value.requiresServerValidationBeforeSubmit === true,
    mode,
    operationCount: safeOperations.length,
    operations: safeOperations,
    issueCount: issues.length
  };
}

function createPreviewRows({ ok, boundary, uploadPlan, importPlan, variantPlan, agentNativePlan, draft, patchDelta, findings }) {
  return deepFreeze([
    row("Uploader boundary", boundary.reviewOnly && boundary.liveUploadAvailable === false ? "review-only" : "blocked", `submissionMode=${boundary.submissionMode}; liveUploadAvailable=${boundary.liveUploadAvailable}`),
    row("Upload plan preview", uploadPlan.ok ? "ready" : "review-required", uploadPlan.code ?? "upload.plan.unavailable"),
    row("Import plan preview", importPlan.ok ? "ready" : "review-required", importPlan.sourceEcosystem ? `${importPlan.sourceEcosystem}/${importPlan.sourceFormat}` : "Parser evidence unavailable."),
    row("Variant plan preview", variantPlan.ok ? "ready" : "review-required", `${variantPlan.sourceOnlyCount} source-only variant(s); ${variantPlan.readyForDownloadCount} download-ready variant(s).`),
    row("Agent-native plan preview", agentNativePlan.ok ? "ready" : "review-required", agentNativePlan.installGuidance.length > 0 ? `${agentNativePlan.installGuidance.length} local review target(s).` : "Install guidance unavailable."),
    row("Draft preview", draft.ok ? "draft-only" : "blocked", draft.summary ?? "Generated draft unavailable."),
    row("Patch/delta preview", patchDelta.ok ? "partial-update-only" : "blocked", `${patchDelta.operationCount} operation(s).`),
    row("No submit action", "pass", "No submit, publish, approve, moderation, registry release, package publication, authenticated upload, or status action is exposed."),
    row("No execution", "pass", "No package lifecycle, dependency install, build, package test, workflow, Docker, MCP, framework loader, or arbitrary code execution."),
    row("Preview decision", ok ? "accepted" : "blocked", ok ? "Local review-only preview is accepted." : firstFindingMessage(findings))
  ]);
}

function normalizeFindings(findings) {
  if (!Array.isArray(findings)) {
    return [];
  }
  return findings.map((finding) => issue(safeFindingCode(finding?.code), safeString(finding?.message ?? "Uploader preview finding requires review."), safeString(finding?.location ?? "evidence")));
}

function collectUnsafeTextIssues(entries) {
  const issues = [];
  for (const [location, value] of entries) {
    if (typeof value !== "string") {
      continue;
    }
    if (value.includes("[redacted:path]")) {
      issues.push(issue("draft-local-path", "Draft text contains [redacted:path] material.", location));
    }
    if (value.includes("[redacted:secret]")) {
      issues.push(issue("draft-secret-like-text", "Draft text contains [redacted:secret] material.", location));
    }
    for (const marker of INTERNAL_MARKERS) {
      if (value.toLowerCase().includes(marker.toLowerCase())) {
        issues.push(issue("draft-internal-marker", "Draft text contains [redacted:internal] marker material.", location));
      }
    }
    for (const pattern of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(value)) {
        issues.push(issue("draft-secret-like-text", "Draft text contains [redacted:secret] material.", location));
      }
    }
    for (const [code, pattern] of UNSAFE_TEXT_PATTERNS) {
      if (pattern.test(value)) {
        const message = code === "draft-local-path"
          ? "Draft text contains [redacted:path] material."
          : code === "draft-secret-like-text" || code === "draft-presigned-url-label" || code === "draft-storage-key"
            ? "Draft text contains [redacted:secret] material."
            : "Draft text contains unsafe public-language material.";
        issues.push(issue(code, message, location));
      }
    }
  }
  return issues;
}

function safeInventoryDigest(value) {
  const text = safeString(value);
  return /^sha256:[a-f0-9]{64}$/u.test(text ?? "") ? text : null;
}

function safeFindingCode(value) {
  const text = safeString(value ?? "uploader-preview.unknown");
  return /^[a-z0-9_.-]+$/u.test(text ?? "") ? text : "uploader-preview.unknown";
}

function safeStringArray(value) {
  return Array.isArray(value) ? value.map(safeString).filter(Boolean) : [];
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function createNoActionBoundary() {
  return {
    submit: false,
    publish: false,
    approve: false,
    moderate: false,
    registryRelease: false,
    packagePublication: false,
    statusPolling: false,
    authenticatedUpload: false
  };
}

function createNoExecutionBoundary() {
  return {
    packageLifecycleScripts: false,
    dependencyInstall: false,
    builds: false,
    tests: false,
    workflowActions: false,
    dockerBuilds: false,
    mcpServers: false,
    frameworkLoaders: false,
    arbitraryCode: false
  };
}

function createNoOverclaimBoundary() {
  return {
    publicationApproval: false,
    moderationOutcome: false,
    safetyCertification: false,
    platformDownloadReadiness: false,
    directInstallClaim: false,
    hostedRuntime: false,
    universalRuntime: false
  };
}

function row(label, status, detail) {
  return Object.freeze({
    label,
    status,
    detail: safeString(detail)
  });
}

function issue(code, message, location) {
  return Object.freeze({
    code: safeFindingCode(code),
    message: safeString(message),
    location: safeString(location)
  });
}

function firstFindingMessage(findings) {
  return findings[0]?.message ?? "Uploader preview requires review.";
}

function safeIso(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function safeString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  let text = String(value);
  text = text.replace(WINDOWS_PATH_PATTERN, "[redacted:path]");
  text = text.replace(POSIX_PATH_PATTERN, "[redacted:path]");
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[redacted:secret]");
  }
  return text.trim();
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
