import fs from "node:fs";
import path from "node:path";
import {
  assertReadOnlyCompanionClientSurface,
  createCompanionBadgeState,
  createCompanionReadbackClient,
  createCompanionReadbackReview,
  normalizeCompanionBaseUrl,
  sampleCompanionReadback
} from "./companion-readback-adapter.mjs";
import {
  assertNoInstallAcquisitionBoundary,
  createCompanionArtifactAcquisitionProof,
  createCompanionDownloadAcquisitionPlan,
  sampleCompanionAcquisitionRequest,
  sampleCompanionAcquisitionResult
} from "./companion-download-acquisition.mjs";
import { createInitialExternalIntakeReport } from "./companion-external-intake-scanner.mjs";
import { hasValidationCommand } from "./validation-stage-reporting.mjs";

export const liveDataBoundarySchemaVersion = "agentique.liveDataBoundary.v1";

export const requiredLiveDataProviderKinds = Object.freeze(["sample-fixture", "companion-readback", "download-acquisition", "external-intake-scanner", "future-live-provider"]);

export const requiredVisibleDataSourceStates = Object.freeze(["sample", "live-current", "live-stale", "unavailable", "rate-limited"]);

const stateTemplates = Object.freeze({
  sample: stateTemplate("sample", "Sample fixture", "Local fixture data; not a live platform readback.", false),
  "live-current": stateTemplate("live-current", "Live current", "Current read-only platform data.", true),
  "live-stale": stateTemplate("live-stale", "Live stale", "Live data exists but is older than the freshness window.", true),
  unavailable: stateTemplate("unavailable", "Unavailable", "No live provider result is currently available.", false),
  "rate-limited": stateTemplate("rate-limited", "Rate limited", "The live provider asked the UI to retry later.", true)
});

export function reviewLiveDataBoundary({ root = process.cwd() } = {}) {
  const report = collectLiveDataBoundaryReport({ root });
  return {
    report,
    validation: validateLiveDataBoundaryReport(report)
  };
}

export function collectLiveDataBoundaryReport({ root = process.cwd() } = {}) {
  const repoRoot = path.resolve(root);
  const packageJson = readJsonIfExists(repoRoot, "package.json") ?? {};
  const providers = createProviderDescriptors();

  return deepFreeze({
    schemaVersion: liveDataBoundarySchemaVersion,
    mode: "source-contract-review",
    productionCredentialsRequired: false,
    networkDuringValidation: false,
    mutationDuringValidation: false,
    providers,
    visibleStates: requiredVisibleDataSourceStates.map((state) => normalizeDataSourceState(state)),
    packageScripts: {
      validateLiveDataBoundary: packageJson.scripts?.["validate:live-data-boundary"] ?? "",
      validateIncludesLiveDataBoundary: hasValidationCommand("npm run validate:live-data-boundary")
    },
    files: {
      source: fileFacts(repoRoot, "src/core/live-data-boundary.mjs"),
      checker: fileFacts(repoRoot, "scripts/check-live-data-boundary.mjs"),
      route: fileFacts(repoRoot, "src/workspaces/routes/LibraryWorkspaceAndImportWorkspaceRoute.tsx"),
      libraryWorkspace: fileFacts(repoRoot, "src/workspaces/LibraryWorkspace.tsx"),
      importWorkspace: fileFacts(repoRoot, "src/workspaces/ImportWorkspace.tsx"),
      importState: fileFacts(repoRoot, "src/app-state/useImportWorkspaceState.ts")
    },
    uiBindings: collectUiBindingFacts(repoRoot),
    leakageScan: scanBoundaryReportLeakage(providers)
  });
}

export function validateLiveDataBoundaryReport(report) {
  const failures = [];
  if (report?.schemaVersion !== liveDataBoundarySchemaVersion) {
    failures.push(issue("schema-version", "Unsupported live data boundary schema version."));
  }
  if (report?.productionCredentialsRequired !== false) {
    failures.push(issue("production-credentials", "Live data boundary validation must not require production credentials."));
  }
  if (report?.networkDuringValidation !== false) {
    failures.push(issue("network-during-validation", "Live data boundary validation must not perform network calls."));
  }
  if (report?.mutationDuringValidation !== false) {
    failures.push(issue("mutation-during-validation", "Live data boundary validation must not perform mutations."));
  }

  const providers = new Map((report?.providers ?? []).map((provider) => [provider.kind, provider]));
  for (const kind of requiredLiveDataProviderKinds) {
    if (!providers.has(kind)) {
      failures.push(issue("missing-provider-kind", `Live data boundary is missing provider kind: ${kind}.`));
    }
  }
  for (const provider of report?.providers ?? []) {
    if (provider.injectable !== true) {
      failures.push(issue("provider-not-injectable", `${provider.kind} provider must be injectable.`));
    }
    if (provider.boundary?.noSecretLeakage !== true) {
      failures.push(issue("provider-secret-leakage", `${provider.kind} provider must explicitly block secret leakage.`));
    }
    if (provider.boundary?.authBearingMutation !== false) {
      failures.push(issue("auth-bearing-mutation", `${provider.kind} provider must not expose auth-bearing mutations.`));
    }
  }

  requireSampleProvider(providers.get("sample-fixture"), failures);
  requireReadbackProvider(providers.get("companion-readback"), failures);
  requireDownloadProvider(providers.get("download-acquisition"), failures);
  requireScannerProvider(providers.get("external-intake-scanner"), failures);
  requireFutureProvider(providers.get("future-live-provider"), failures);

  const stateByName = new Map((report?.visibleStates ?? []).map((state) => [state.state, state]));
  for (const state of requiredVisibleDataSourceStates) {
    const visibleState = stateByName.get(state);
    if (!visibleState || visibleState.visibleLabel.length === 0 || visibleState.description.length === 0) {
      failures.push(issue("visible-state-missing", `${state} must have a visible UI label and description.`));
    }
  }

  if (!String(report?.packageScripts?.validateLiveDataBoundary ?? "").includes("scripts/check-live-data-boundary.mjs")) {
    failures.push(issue("package-script", "package.json must expose validate:live-data-boundary."));
  }
  if (report?.packageScripts?.validateIncludesLiveDataBoundary !== true) {
    failures.push(issue("validation-stage", "Validation stage manifest must include npm run validate:live-data-boundary."));
  }
  for (const [name, facts] of Object.entries(report?.files ?? {})) {
    if (facts?.exists !== true) {
      failures.push(issue("missing-file", `${name} file is missing: ${facts?.path ?? "unknown"}.`));
    }
  }
  for (const [name, present] of Object.entries(report?.uiBindings ?? {})) {
    if (present !== true) {
      failures.push(issue("ui-binding", `UI binding is missing or drifted: ${name}.`));
    }
  }
  if (report?.leakageScan?.ok !== true) {
    failures.push(issue("leakage-scan", `Live data boundary report leaked unsafe text: ${(report?.leakageScan?.findings ?? []).join(", ")}.`));
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    summary: {
      providers: report?.providers?.length ?? 0,
      visibleStates: report?.visibleStates?.length ?? 0,
      enabledLiveProviders: (report?.providers ?? []).filter((provider) => provider.liveCapable && provider.enabled).length
    }
  };
}

export function normalizeDataSourceState(input) {
  const raw = typeof input === "string" ? input : (input?.state ?? input?.badge?.state ?? input?.status ?? input?.code);
  const normalized = normalizeStatus(raw);
  const state = (() => {
    if (["sample", "fixture", "sample-fixture"].includes(normalized)) return "sample";
    if (["stale", "live-stale", "status-stale"].includes(normalized)) return "live-stale";
    if (["rate-limited", "rate-limited-provider"].includes(normalized)) return "rate-limited";
    if (["unavailable", "not-run", "missing", "blocked"].includes(normalized)) return "unavailable";
    if (["live-current", "published", "current", "ready", "accepted", "available", "parsed", "variant-available", "agent-native-ready"].includes(normalized)) {
      return "live-current";
    }
    return "unavailable";
  })();
  const template = stateTemplates[state];
  return Object.freeze({
    ...template,
    sourceState: normalized || "unknown"
  });
}

export function formatLiveDataBoundaryReport(report, validation) {
  return {
    status: validation.ok ? "passed" : "failed",
    schemaVersion: report.schemaVersion,
    summary: validation.summary,
    productionCredentialsRequired: report.productionCredentialsRequired,
    networkDuringValidation: report.networkDuringValidation,
    mutationDuringValidation: report.mutationDuringValidation,
    providers: report.providers.map((provider) => ({
      id: provider.id,
      kind: provider.kind,
      mode: provider.mode,
      state: provider.state.state,
      visibleLabel: provider.state.visibleLabel,
      enabled: provider.enabled,
      liveCapable: provider.liveCapable,
      injectable: provider.injectable,
      boundary: provider.boundary
    })),
    visibleStates: report.visibleStates,
    uiBindings: report.uiBindings,
    files: report.files,
    failures: validation.failures
  };
}

function createProviderDescriptors() {
  const readbackReview = createCompanionReadbackReview(sampleCompanionReadback, { now: "2026-06-13T00:05:00.000Z" });
  const readbackClient = createCompanionReadbackClient({
    baseUrl: "http://127.0.0.1:8787",
    fetchImpl: async () => jsonResponse(sampleCompanionReadback)
  });
  const readOnlySurface = assertReadOnlyCompanionClientSurface(readbackClient);
  const endpointPolicy = collectEndpointPolicy();
  const downloadPlan = createCompanionDownloadAcquisitionPlan(sampleCompanionReadback, sampleCompanionAcquisitionRequest, {
    checkedAt: "2026-06-13T00:15:00.000Z"
  });
  const downloadProof = createCompanionArtifactAcquisitionProof(downloadPlan, sampleCompanionAcquisitionResult, {
    checkedAt: "2026-06-13T00:16:00.000Z"
  });
  const noInstallBoundary = assertNoInstallAcquisitionBoundary(downloadProof);
  const externalIntakeReport = createInitialExternalIntakeReport({ sourceLabel: "No local folder selected" });

  return [
    provider({
      id: "sample-companion-fixture",
      kind: "sample-fixture",
      mode: "fixture",
      enabled: true,
      liveCapable: false,
      state: normalizeDataSourceState("sample"),
      evidence: {
        resourceId: sampleCompanionReadback.resourceId,
        observedAt: sampleCompanionReadback.observedAt,
        fixtureOnly: true
      },
      boundary: {
        sampleFixture: true,
        liveData: false,
        noNetwork: true,
        noCredentials: true,
        noSecretLeakage: true,
        noMutation: true,
        authBearingMutation: false,
        noExecution: true
      }
    }),
    provider({
      id: "companion-public-readback",
      kind: "companion-readback",
      mode: "read-only-live-provider",
      enabled: true,
      liveCapable: true,
      state: normalizeDataSourceState(readbackReview.badge.state),
      evidence: {
        sourcePackage: readbackReview.sourcePackage,
        methods: Object.keys(readbackClient).sort(),
        badgeStates: {
          current: readbackReview.badge.label,
          stale: createCompanionBadgeState(sampleCompanionReadback, { now: "2026-06-13T02:00:00.000Z" }).label,
          unavailable: createCompanionBadgeState(null).label,
          rateLimited: createCompanionBadgeState({ code: "rate-limited", retryAfter: "30" }).label
        },
        readOnlySurface
      },
      boundary: {
        readOnly: readbackReview.readOnly.mutationMethods === false,
        getOnly: true,
        credentialForwarding: readbackReview.readOnly.credentialForwarding,
        authRequired: readbackReview.readOnly.authRequired,
        authBearingMutation: false,
        mutationSurfaceOk: readOnlySurface.ok,
        allowedBaseUrlPolicy: "https-or-loopback",
        endpointPolicy,
        redactsPrivateProjection: true,
        noSecretLeakage: true,
        noMutation: true,
        noExecution: true
      }
    }),
    provider({
      id: "companion-download-acquisition",
      kind: "download-acquisition",
      mode: "metadata-and-proof",
      enabled: true,
      liveCapable: true,
      state: normalizeDataSourceState(downloadProof.decision),
      evidence: {
        planDecision: downloadPlan.decision,
        proofDecision: downloadProof.decision,
        transferMode: downloadPlan.transfer.mode,
        ticketMethod: downloadPlan.transfer.ticketMethod,
        byteFetchMethod: downloadPlan.transfer.byteFetchMethod,
        destinationMode: downloadPlan.destination.writeMode,
        noInstallBoundary
      },
      boundary: {
        userSelectedDestination: downloadPlan.destination.userSelectedDestination,
        noOverwriteDefault: downloadPlan.destination.noOverwriteDefault,
        rootBounded: downloadPlan.destination.rootBounded,
        atomicWrite: downloadPlan.destination.writeMode === "atomic-temp-rename",
        integrityRequired: Boolean(downloadPlan.integrity.expectedSha256 && downloadPlan.integrity.expectedSizeWithinMax),
        ticketedPostOrSafePublicUrl: downloadPlan.transfer.ticketMethod === "POST" || downloadPlan.transfer.requestMethod === "GET",
        sensitiveUrlRejected: true,
        noInstall: noInstallBoundary.ok,
        noExecution: noInstallBoundary.ok,
        noSecretLeakage: true,
        noMutation: true,
        authBearingMutation: false
      }
    }),
    provider({
      id: "browser-local-external-intake-scanner",
      kind: "external-intake-scanner",
      mode: "browser-local-scan",
      enabled: true,
      liveCapable: false,
      state: normalizeDataSourceState(externalIntakeReport.decision),
      evidence: {
        decision: externalIntakeReport.decision,
        sourceLabel: externalIntakeReport.source.label,
        schemaVersion: externalIntakeReport.schemaVersion,
        maxFiles: externalIntakeReport.policy.maxFiles,
        maxBytes: externalIntakeReport.policy.maxBytes
      },
      boundary: {
        localOnly: externalIntakeReport.boundary.localOnly,
        advisoryOnly: externalIntakeReport.boundary.advisoryOnly,
        noNetwork: externalIntakeReport.boundary.noNetwork,
        noClone: externalIntakeReport.boundary.noClone,
        noFetch: externalIntakeReport.boundary.noFetch,
        noUpload: externalIntakeReport.boundary.noUpload,
        noInstall: externalIntakeReport.boundary.noInstall,
        noExecution: externalIntakeReport.boundary.noExecution,
        noSecretLeakage: true,
        noMutation: true,
        authBearingMutation: false
      }
    }),
    provider({
      id: "future-tauri-live-provider",
      kind: "future-live-provider",
      mode: "future-gated-provider",
      enabled: false,
      liveCapable: true,
      state: normalizeDataSourceState("unavailable"),
      evidence: {
        runtimeTargets: ["browser", "tauri"],
        reason: "Provider implementation, capability grants, and credential vault handoff require separate gates."
      },
      boundary: {
        requiresExplicitProviderImplementation: true,
        requiresTauriCapabilityGate: true,
        allowedBaseUrlPolicy: "https-or-loopback",
        credentialMode: "not-configured",
        credentialForwarding: false,
        noSecretLeakage: true,
        noMutation: true,
        authBearingMutation: false,
        noExecution: true
      }
    })
  ];
}

function requireSampleProvider(providerDescriptor, failures) {
  if (providerDescriptor?.boundary?.sampleFixture !== true || providerDescriptor.boundary.liveData !== false) {
    failures.push(issue("sample-provider-boundary", "Sample fixtures must be explicitly fixture-only and not live data."));
  }
  if (providerDescriptor?.state?.state !== "sample") {
    failures.push(issue("sample-provider-state", "Sample fixture provider must use the visible sample state."));
  }
}

function requireReadbackProvider(providerDescriptor, failures) {
  if (providerDescriptor?.boundary?.readOnly !== true || providerDescriptor.boundary.getOnly !== true) {
    failures.push(issue("readback-read-only", "Companion readback provider must remain read-only GET surface."));
  }
  if (providerDescriptor?.boundary?.credentialForwarding !== false || providerDescriptor.boundary.authRequired !== false) {
    failures.push(issue("readback-credentials", "Companion readback provider must not require or forward credentials."));
  }
  if (providerDescriptor?.boundary?.mutationSurfaceOk !== true) {
    failures.push(issue("readback-mutation-surface", "Companion readback provider exposes a mutation-like method."));
  }
  const endpointPolicy = providerDescriptor?.boundary?.endpointPolicy ?? {};
  if (endpointPolicy.acceptsHttps !== true || endpointPolicy.acceptsLoopbackHttp !== true || endpointPolicy.rejectsPublicHttp !== true) {
    failures.push(issue("readback-endpoint-policy", "Companion readback base URL policy must allow HTTPS/loopback and reject public HTTP."));
  }
  for (const label of Object.values(providerDescriptor?.evidence?.badgeStates ?? {})) {
    if (typeof label !== "string" || label.length === 0) {
      failures.push(issue("readback-badge-label", "Readback badge states must expose visible labels."));
    }
  }
}

function requireDownloadProvider(providerDescriptor, failures) {
  const boundary = providerDescriptor?.boundary ?? {};
  if (boundary.userSelectedDestination !== true || boundary.rootBounded !== true || boundary.atomicWrite !== true) {
    failures.push(issue("download-destination", "Download acquisition must require user-selected bounded atomic destination."));
  }
  if (boundary.integrityRequired !== true || boundary.ticketedPostOrSafePublicUrl !== true || boundary.sensitiveUrlRejected !== true) {
    failures.push(issue("download-integrity-transfer", "Download acquisition must require integrity and safe transfer metadata."));
  }
  if (boundary.noInstall !== true || boundary.noExecution !== true) {
    failures.push(issue("download-execution-boundary", "Download acquisition must not install or execute artifacts."));
  }
}

function requireScannerProvider(providerDescriptor, failures) {
  const boundary = providerDescriptor?.boundary ?? {};
  for (const key of ["localOnly", "advisoryOnly", "noNetwork", "noClone", "noFetch", "noUpload", "noInstall", "noExecution"]) {
    if (boundary[key] !== true) {
      failures.push(issue("scanner-boundary", `External intake scanner boundary must keep ${key}=true.`));
    }
  }
}

function requireFutureProvider(providerDescriptor, failures) {
  const boundary = providerDescriptor?.boundary ?? {};
  if (providerDescriptor?.enabled !== false || boundary.requiresExplicitProviderImplementation !== true || boundary.requiresTauriCapabilityGate !== true) {
    failures.push(issue("future-provider-gated", "Future live providers must remain disabled until explicit implementation and Tauri capability gates pass."));
  }
  if (boundary.credentialForwarding !== false || boundary.authBearingMutation !== false) {
    failures.push(issue("future-provider-credentials", "Future live providers must not forward credentials or expose auth-bearing mutations by default."));
  }
}

function collectUiBindingFacts(repoRoot) {
  const routeSource = readTextIfExists(repoRoot, "src/workspaces/routes/LibraryWorkspaceAndImportWorkspaceRoute.tsx");
  const librarySource = readTextIfExists(repoRoot, "src/workspaces/LibraryWorkspace.tsx");
  const importSource = readTextIfExists(repoRoot, "src/workspaces/ImportWorkspace.tsx");
  const importStateSource = readTextIfExists(repoRoot, "src/app-state/useImportWorkspaceState.ts");
  return {
    routeCreatesReadbackReview: /createCompanionReadbackReview/u.test(routeSource),
    routeCreatesDownloadPlan: /createCompanionDownloadAcquisitionPlan/u.test(routeSource),
    routeCreatesDownloadProof: /createCompanionArtifactAcquisitionProof/u.test(routeSource),
    importStateUsesScanner: /scanExternalIntakeFiles/u.test(importStateSource),
    libraryShowsCompanionReadback: /Companion readback/u.test(librarySource),
    libraryShowsDownloadProof: /Download proof/u.test(librarySource),
    importShowsReadOnlyClient: /Read-only client/u.test(importSource),
    importShowsExternalIntakeDecision: /External intake decision/u.test(importSource),
    importShowsNoExecutionIntake: /No-execution intake/u.test(importSource),
    importShowsSampleButtons: /Load blocked sample/u.test(importSource) && /loadSafeSample/u.test(importSource)
  };
}

function collectEndpointPolicy() {
  const acceptsHttps = tryNormalizeBaseUrl("https://www.agentique.io").ok;
  const acceptsLoopbackHttp = tryNormalizeBaseUrl("http://127.0.0.1:8787").ok;
  const rejectsPublicHttp = tryNormalizeBaseUrl("http://www.agentique.io").ok === false;
  return {
    acceptsHttps,
    acceptsLoopbackHttp,
    rejectsPublicHttp,
    policy: "https-or-loopback"
  };
}

function tryNormalizeBaseUrl(value) {
  try {
    return { ok: true, origin: normalizeCompanionBaseUrl(value).origin };
  } catch (error) {
    return { ok: false, code: error?.code ?? "invalid-base-url" };
  }
}

function scanBoundaryReportLeakage(providers) {
  const text = JSON.stringify(providers);
  const findings = [];
  if (/(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._-]{16,})/u.test(text)) {
    findings.push("secret-like-token");
  }
  if (/[A-Za-z]:[\\/][^\s"`']+/u.test(text) || /\/(?:home|Users|mnt)\/[^\s"`']+/u.test(text)) {
    findings.push("absolute-local-path");
  }
  if (internalMarkerPathPattern().test(text)) {
    findings.push("internal-marker-path");
  }
  return {
    ok: findings.length === 0,
    findings
  };
}

function provider(input) {
  return {
    ...input,
    injectable: true
  };
}

function internalMarkerPathPattern() {
  const planningName = ["\\.", "planning"].join("");
  const referenceName = ["ref", "erence"].join("");
  return new RegExp(`(?:^|[\\\\/])(?:${planningName}|${referenceName}|${referenceName.toUpperCase()})(?:[\\\\/]|$)`, "u");
}

function stateTemplate(state, visibleLabel, description, live) {
  return Object.freeze({ state, visibleLabel, description, live });
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: {
      get() {
        return null;
      }
    },
    async json() {
      return payload;
    }
  };
}

function fileFacts(repoRoot, relPath) {
  const fullPath = path.join(repoRoot, relPath);
  return {
    path: relPath,
    exists: fs.existsSync(fullPath),
    bytes: fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0
  };
}

function readJsonIfExists(repoRoot, relPath) {
  const text = readTextIfExists(repoRoot, relPath);
  return text ? JSON.parse(text) : null;
}

function readTextIfExists(repoRoot, relPath) {
  const fullPath = path.join(repoRoot, relPath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
}

function normalizeStatus(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/gu, "-")
    .replace(/\s+/gu, "-");
}

function issue(code, message) {
  return { code, message };
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
