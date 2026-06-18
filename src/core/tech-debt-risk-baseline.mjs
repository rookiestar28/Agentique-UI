import fs from "node:fs";
import path from "node:path";
import { reviewBuildPayloadBudget } from "./build-payload-budget.mjs";
import { reviewI18nCatalogLoading } from "./i18n-catalog-loading.mjs";
import { reviewLiveDataBoundary } from "./live-data-boundary.mjs";
import { readNativeRunnerSidecarGateInputs, reviewNativeRunnerSidecarGate } from "./native-runner-sidecar-gate.mjs";
import { readStyleSourceBundle, reviewStyleSourceBoundary } from "./style-source-boundary.mjs";
import { reviewTypeLintFormatBaseline } from "./type-lint-format-baseline.mjs";
import { hasValidationCommand, reviewValidationStageReporting } from "./validation-stage-reporting.mjs";
import { reviewWorkspaceFileBudgets } from "./workspace-file-budgets.mjs";

export const techDebtRiskBaselineSchemaVersion = "agentique.techDebtRiskBaseline.v1";

const sourceExtensions = new Set([".css", ".js", ".mjs", ".ts", ".tsx", ".json"]);
const ignoredDirs = new Set([".git", ".tmp", "dist", "node_modules", "target"]);

const requiredRiskCodes = [
  "app-shell-centralized",
  "workspace-large-files",
  "hash-route-adapter-gap",
  "global-css-monolith",
  "single-i18n-catalog",
  "build-payload-large",
  "validation-surface-large",
  "lint-format-baseline-missing",
  "js-checkjs-disabled",
  "release-gate-spec-code-drift",
  "runner-native-execution-gated",
  "sample-live-data-boundary"
];

const requiredCorrectionCodes = ["all-workspaces-render-at-once", "run-graph-entirely-nonfunctional", "data-layer-static-only", "mandatory-state-router-image-dependencies"];

export function collectTechDebtRiskBaseline({ root = process.cwd() } = {}) {
  const repoRoot = path.resolve(root);
  const packageJson = readJsonIfExists(repoRoot, "package.json") ?? {};
  const tsconfig = readJsonIfExists(repoRoot, "tsconfig.json") ?? {};
  const finalReadinessSpec = readJsonIfExists(repoRoot, "release/final-readiness.spec.json") ?? {};
  const finalReleaseGateSource = readTextIfExists(repoRoot, "src/core/final-release-gate.mjs");
  const appSource = readTextIfExists(repoRoot, "src/App.tsx");
  const navigationRouteSource = readTextIfExists(repoRoot, "src/app-state/navigation-route.mjs");
  const navigationRouteHookSource = readTextIfExists(repoRoot, "src/app-state/useNavigationRoute.ts");
  const styleManifestSource = readTextIfExists(repoRoot, "src/styles.css");
  const stylesSource = readStyleSourceBundle({ root: repoRoot });
  const i18nSource = readTextIfExists(repoRoot, "src/i18n/index.mjs");

  const sourceFiles = collectSourceFiles(repoRoot);
  const measurements = {
    sourceInventory: buildSourceInventory(repoRoot, sourceFiles),
    appShell: buildAppShellFacts(appSource),
    routing: buildRoutingFacts(appSource, navigationRouteSource, navigationRouteHookSource),
    styles: buildStyleFacts(styleManifestSource, stylesSource),
    i18n: buildI18nFacts(repoRoot, "src/i18n/index.mjs", i18nSource),
    buildPayload: buildPayloadFacts(repoRoot),
    buildPayloadBudget: buildBuildPayloadBudgetFacts(repoRoot),
    i18nCatalogLoading: buildI18nCatalogLoadingFacts(repoRoot),
    typeLintFormatBaseline: buildTypeLintFormatBaselineFacts(repoRoot),
    validationStageReporting: buildValidationStageReportingFacts(repoRoot),
    packageScripts: buildPackageScriptFacts(packageJson),
    tooling: buildToolingFacts(packageJson, tsconfig),
    releaseGate: buildReleaseGateFacts(repoRoot, finalReadinessSpec, finalReleaseGateSource, packageJson),
    runnerBoundary: buildRunnerBoundaryFacts(repoRoot),
    nativeRunnerSidecarGate: buildNativeRunnerSidecarGateFacts(repoRoot),
    dataBoundary: buildDataBoundaryFacts(repoRoot),
    liveDataBoundary: buildLiveDataBoundaryFacts(repoRoot),
    styleSourceBoundary: buildStyleSourceBoundaryFacts(repoRoot),
    workspaceFileBudgets: buildWorkspaceFileBudgetFacts(repoRoot),
    recommendationsInput: buildRecommendationsInputFacts(repoRoot)
  };
  const routeAndStateDecompositionReady =
    measurements.routing.routeAdapterModule && measurements.routing.hashChangeListener && measurements.routing.appUsesRouteHook && measurements.appShell.useStateReferences === 0;
  const workspaceFileSplitReady = measurements.workspaceFileBudgets.ok;
  const cssLayoutHardeningReady = measurements.styleSourceBoundary.ok;
  const assetBuildPayloadReady = measurements.buildPayloadBudget.measured && measurements.buildPayloadBudget.ok;
  const i18nCatalogLoadingReady = measurements.i18nCatalogLoading.ok;
  const typeLintFormatBaselineReady = measurements.typeLintFormatBaseline.ok;
  const validationStageReportingReady = measurements.validationStageReporting.ok;
  const liveDataBoundaryReady = measurements.liveDataBoundary.ok;
  const nativeRunnerSidecarGateReady = measurements.nativeRunnerSidecarGate.ok;
  const releaseUpdaterSupplyChainCloseoutReady =
    measurements.releaseGate.requiredGateDrift.length === 0 &&
    measurements.releaseGate.docsGatePresent &&
    measurements.releaseGate.releaseDocsSpecPresent &&
    measurements.releaseGate.hasReleaseDocsScript &&
    measurements.releaseGate.validateIncludesReleaseDocs &&
    measurements.releaseGate.workflowSupplyChainEvidenceReady &&
    measurements.releaseGate.publicSafeWorkflowRunIdRequired &&
    measurements.releaseGate.publicationClaimsFalse &&
    measurements.releaseGate.publicationAllowedRequiresReady;

  return {
    schemaVersion: techDebtRiskBaselineSchemaVersion,
    posture: {
      publicSafe: true,
      publicDocsContractTestsAdded: false,
      dependencyAdoption: "optional-after-local-extraction",
      releaseClaimsExpanded: false,
      nativeExecutionExpanded: false
    },
    measurements,
    riskRegister: buildRiskRegister(measurements),
    claimCorrections: buildClaimCorrections(),
    followUpOrder: [
      ...(routeAndStateDecompositionReady ? [] : ["state-and-route-decomposition"]),
      ...(workspaceFileSplitReady ? [] : ["workspace-file-split"]),
      ...(cssLayoutHardeningReady ? [] : ["css-layout-hardening"]),
      ...(assetBuildPayloadReady ? [] : ["asset-build-payload"]),
      ...(i18nCatalogLoadingReady ? [] : ["i18n-catalog-loading"]),
      ...(typeLintFormatBaselineReady ? [] : ["type-lint-format-baseline"]),
      ...(validationStageReportingReady ? [] : ["validation-stage-reporting"]),
      ...(liveDataBoundaryReady ? [] : ["live-data-boundary"]),
      ...(nativeRunnerSidecarGateReady ? [] : ["native-runner-sidecar-gate"]),
      ...(releaseUpdaterSupplyChainCloseoutReady ? [] : ["release-updater-supply-chain-closeout"])
    ]
  };
}

export function validateTechDebtRiskBaseline(baseline) {
  const failures = [];
  if (baseline?.schemaVersion !== techDebtRiskBaselineSchemaVersion) {
    failures.push(issue("schema-version", "Unsupported technical debt baseline schema version."));
  }

  const riskCodes = new Set((baseline?.riskRegister ?? []).map((risk) => risk.code));
  for (const requiredCode of requiredRiskCodes) {
    if (!riskCodes.has(requiredCode)) {
      failures.push(issue("missing-risk-code", `Baseline is missing required risk code: ${requiredCode}.`));
    }
  }

  const correctionByCode = new Map((baseline?.claimCorrections ?? []).map((correction) => [correction.code, correction]));
  for (const requiredCode of requiredCorrectionCodes) {
    if (!correctionByCode.has(requiredCode)) {
      failures.push(issue("missing-claim-correction", `Baseline is missing claim correction: ${requiredCode}.`));
    }
  }

  requireCorrection(correctionByCode, "all-workspaces-render-at-once", "unsupported", failures);
  requireCorrection(correctionByCode, "run-graph-entirely-nonfunctional", "unsupported", failures);
  requireCorrection(correctionByCode, "mandatory-state-router-image-dependencies", "unsupported", failures);
  requireCorrection(correctionByCode, "data-layer-static-only", "partial", failures);

  if (baseline?.posture?.publicDocsContractTestsAdded !== false) {
    failures.push(issue("public-docs-contract", "Technical debt baseline must not add public documentation wording contracts."));
  }
  if (baseline?.posture?.releaseClaimsExpanded !== false) {
    failures.push(issue("release-claim-expanded", "Technical debt baseline must not expand release claims."));
  }
  if (baseline?.posture?.nativeExecutionExpanded !== false) {
    failures.push(issue("native-execution-expanded", "Technical debt baseline must not expand native execution."));
  }
  if (baseline?.measurements?.appShell?.conditionalWorkspaceRender !== true) {
    failures.push(issue("conditional-render-fact", "Baseline must record that workspaces are conditionally rendered."));
  }
  if (baseline?.measurements?.routing?.routeAdapterModule !== true) {
    failures.push(issue("route-adapter-fact", "Baseline must detect the typed navigation route adapter."));
  }
  if (baseline?.measurements?.routing?.hashChangeListener !== true) {
    failures.push(issue("hashchange-fact", "Baseline must detect hashchange synchronization coverage."));
  }
  if ((baseline?.measurements?.releaseGate?.requiredGateDrift ?? []).length !== 0) {
    failures.push(issue("release-gate-drift", "Baseline must detect that release gate spec/code drift has been resolved."));
  }
  if (baseline?.measurements?.releaseGate?.docsGatePresent !== true) {
    failures.push(issue("release-docs-gate", "Baseline must detect the final release docs gate."));
  }
  if (baseline?.measurements?.releaseGate?.releaseDocsSpecPresent !== true) {
    failures.push(issue("release-docs-spec", "Baseline must detect the release docs readiness spec."));
  }
  if (baseline?.measurements?.releaseGate?.validateIncludesReleaseDocs !== true) {
    failures.push(issue("release-docs-validation", "Baseline must detect release docs validation in the staged command chain."));
  }
  if (baseline?.measurements?.releaseGate?.workflowSupplyChainEvidenceReady !== true) {
    failures.push(issue("release-supply-chain-evidence", "Baseline must detect required workflow supply-chain evidence families."));
  }
  if (baseline?.measurements?.releaseGate?.publicationClaimsFalse !== true) {
    failures.push(issue("release-publication-claims", "Baseline must keep unsupported publication claims false."));
  }
  if (baseline?.measurements?.workspaceFileBudgets?.ok !== true) {
    failures.push(issue("workspace-file-budgets", "Baseline must detect passing workspace file budget validation."));
  }
  if (baseline?.measurements?.styleSourceBoundary?.ok !== true) {
    failures.push(issue("style-source-boundary", "Baseline must detect passing style source boundary validation."));
  }
  if (baseline?.measurements?.buildPayloadBudget?.measured === true && baseline.measurements.buildPayloadBudget.ok !== true) {
    failures.push(issue("build-payload-budget", "Measured build payload artifacts must satisfy the build payload budget gate."));
  }
  if (baseline?.measurements?.i18nCatalogLoading?.ok !== true) {
    failures.push(issue("i18n-catalog-loading", "Baseline must detect passing i18n catalog loading validation."));
  }
  if (baseline?.measurements?.typeLintFormatBaseline?.ok !== true) {
    failures.push(issue("type-lint-format-baseline", "Baseline must detect passing type/lint/format validation."));
  }
  if (baseline?.measurements?.validationStageReporting?.ok !== true) {
    failures.push(issue("validation-stage-reporting", "Baseline must detect passing validation stage reporting."));
  }
  if (baseline?.measurements?.liveDataBoundary?.ok !== true) {
    failures.push(issue("live-data-boundary", "Baseline must detect passing live data boundary validation."));
  }
  if (baseline?.measurements?.nativeRunnerSidecarGate?.ok !== true) {
    failures.push(issue("native-runner-sidecar-gate", "Baseline must detect passing native runner sidecar gate validation."));
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    summary: {
      risks: baseline?.riskRegister?.length ?? 0,
      corrections: baseline?.claimCorrections?.length ?? 0,
      followUps: baseline?.followUpOrder?.length ?? 0
    }
  };
}

export function formatTechDebtRiskBaselineReport(baseline, validation) {
  return {
    status: validation.ok ? "passed" : "failed",
    schemaVersion: baseline.schemaVersion,
    summary: validation.summary,
    facts: {
      largestFiles: baseline.measurements.sourceInventory.largestFiles.slice(0, 8),
      appShell: baseline.measurements.appShell,
      routing: baseline.measurements.routing,
      styles: baseline.measurements.styles,
      i18n: baseline.measurements.i18n,
      buildPayload: baseline.measurements.buildPayload.summary,
      buildPayloadBudget: baseline.measurements.buildPayloadBudget,
      i18nCatalogLoading: baseline.measurements.i18nCatalogLoading,
      typeLintFormatBaseline: baseline.measurements.typeLintFormatBaseline,
      validationStageReporting: baseline.measurements.validationStageReporting,
      liveDataBoundary: baseline.measurements.liveDataBoundary,
      nativeRunnerSidecarGate: baseline.measurements.nativeRunnerSidecarGate,
      packageScripts: baseline.measurements.packageScripts,
      tooling: baseline.measurements.tooling,
      styleSourceBoundary: baseline.measurements.styleSourceBoundary,
      workspaceFileBudgets: baseline.measurements.workspaceFileBudgets,
      releaseGate: baseline.measurements.releaseGate
    },
    riskRegister: baseline.riskRegister,
    claimCorrections: baseline.claimCorrections,
    failures: validation.failures
  };
}

function buildSourceInventory(repoRoot, sourceFiles) {
  const files = sourceFiles
    .map((filePath) => {
      const text = fs.readFileSync(filePath, "utf8");
      return {
        path: relativePath(repoRoot, filePath),
        lines: countLines(text),
        bytes: fs.statSync(filePath).size
      };
    })
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));

  return {
    filesMeasured: files.length,
    largestFiles: files.slice(0, 20),
    filesOver500Lines: files.filter((file) => file.lines > 500).map((file) => file.path),
    filesOver1000Lines: files.filter((file) => file.lines > 1000).map((file) => file.path)
  };
}

function buildAppShellFacts(appSource) {
  return {
    lines: countLines(appSource),
    useStateReferences: countMatches(appSource, /\buseState\b/gu),
    useMemoReferences: countMatches(appSource, /\buseMemo\b/gu),
    useCallbackReferences: countMatches(appSource, /\buseCallback\b/gu),
    staticWorkspaceImports: countMatches(appSource, /import\s+(?!type)[^;]+from "\.\/workspaces\//gu),
    lazyWorkspaceImports: countMatches(appSource, /\blazy\s*\(\s*\(\)\s*=>\s*import\("\.\/workspaces\/routes\//gu),
    conditionalWorkspaceRender:
      (/activeNav === ["']graph["']/u.test(appSource) && /activeNav === ["']run["']/u.test(appSource) && /\?\s*\(/u.test(appSource)) ||
      (/function renderActiveWorkspace/u.test(appSource) && /case "graph"/u.test(appSource) && /case "run"/u.test(appSource))
  };
}

function buildRoutingFacts(appSource, navigationRouteSource, navigationRouteHookSource) {
  const routingSource = `${appSource}\n${navigationRouteSource}\n${navigationRouteHookSource}`;
  return {
    readsInitialHash: /window\.location/u.test(routingSource) && /readNavigationHash/u.test(routingSource),
    writesHashWithReplaceState: /replaceState/u.test(routingSource) && /writeNavigationHash/u.test(routingSource),
    hashChangeListener: /hashchange/u.test(navigationRouteHookSource),
    typedNavigationKey: /NavigationKey/u.test(routingSource),
    structuredRouteParams: /normalizeNavigationKey|readNavigationHash|createNavigationHash/u.test(routingSource),
    routeAdapterModule: /navigationRouteSchemaVersion/u.test(navigationRouteSource),
    appUsesRouteHook: /useNavigationRoute\(\)/u.test(appSource)
  };
}

function buildStyleFacts(manifestSource, bundleSource) {
  return {
    path: "style-source-bundle",
    manifestPath: "src/styles.css",
    manifestLines: countLines(manifestSource),
    lines: countLines(bundleSource),
    bytes: Buffer.byteLength(bundleSource, "utf8")
  };
}

function buildI18nFacts(repoRoot, relPath, text) {
  const facts = buildFileFacts(repoRoot, relPath, text);
  return {
    ...facts,
    localeCodes: extractLocaleCodes(text),
    inlineCatalogModule: facts.bytes > 50000 && facts.lines > 1000
  };
}

function buildFileFacts(repoRoot, relPath, text) {
  const filePath = path.join(repoRoot, relPath);
  return {
    path: relPath,
    exists: fs.existsSync(filePath),
    lines: countLines(text),
    bytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
  };
}

function buildPayloadFacts(repoRoot) {
  const assetsDir = path.join(repoRoot, "dist/assets");
  if (!fs.existsSync(assetsDir)) {
    return {
      measured: false,
      reason: "dist assets are not present before build",
      assets: [],
      summary: {
        largestJavaScriptBytes: 0,
        largestSourceMapBytes: 0,
        largestImageBytes: 0,
        largestCssBytes: 0
      }
    };
  }

  const assets = fs
    .readdirSync(assetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const assetPath = path.join(assetsDir, entry.name);
      return {
        name: entry.name,
        bytes: fs.statSync(assetPath).size,
        kind: assetKind(entry.name)
      };
    })
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));

  return {
    measured: true,
    assets,
    summary: {
      largestJavaScriptBytes: maxBytes(assets, "javascript"),
      largestSourceMapBytes: maxBytes(assets, "sourcemap"),
      largestImageBytes: maxBytes(assets, "image"),
      largestCssBytes: maxBytes(assets, "css")
    }
  };
}

function buildPackageScriptFacts(packageJson) {
  const scripts = packageJson.scripts ?? {};
  const names = Object.keys(scripts);
  return {
    totalScripts: names.length,
    validateScripts: names.filter((name) => name.startsWith("validate")).length,
    hasBuildPayloadBudgetScript: Boolean(scripts["validate:build-payload-budget"]),
    validateIncludesBuildPayloadBudget: hasValidationCommand("npm run validate:build-payload-budget"),
    hasTechDebtRiskBaselineScript: Boolean(scripts["validate:tech-debt-risk-baseline"]),
    validateIncludesTechDebtRiskBaseline: hasValidationCommand("npm run validate:tech-debt-risk-baseline"),
    hasTypeLintFormatScript: Boolean(scripts["validate:type-lint-format"]),
    validateIncludesTypeLintFormat: hasValidationCommand("npm run validate:type-lint-format"),
    validateIncludesLint: hasValidationCommand("npm run lint"),
    validateIncludesFormatCheck: hasValidationCommand("npm run format:check"),
    validateIncludesCheckJs: hasValidationCommand("npm run typecheck:js"),
    hasLiveDataBoundaryScript: Boolean(scripts["validate:live-data-boundary"]),
    validateIncludesLiveDataBoundary: hasValidationCommand("npm run validate:live-data-boundary"),
    hasNativeRunnerSidecarGateScript: Boolean(scripts["validate:native-runner-sidecar-gate"]),
    validateIncludesNativeRunnerSidecarGate: hasValidationCommand("npm run validate:native-runner-sidecar-gate"),
    hasReleaseDocsScript: Boolean(scripts["validate:release-docs"]),
    validateIncludesReleaseDocs: hasValidationCommand("npm run validate:release-docs")
  };
}

function buildToolingFacts(packageJson, tsconfig) {
  const allDependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {})
  };
  return {
    nodeEngine: packageJson.engines?.node ?? "",
    allowJs: tsconfig.compilerOptions?.allowJs === true,
    checkJs: tsconfig.compilerOptions?.checkJs === true,
    strict: tsconfig.compilerOptions?.strict === true,
    eslintConfigured: hasDependency(allDependencies, "eslint"),
    prettierConfigured: hasDependency(allDependencies, "prettier"),
    typescriptEslintConfigured: hasDependency(allDependencies, "typescript-eslint"),
    nodeTypesConfigured: hasDependency(allDependencies, "@types/node"),
    stylelintConfigured: hasDependency(allDependencies, "stylelint")
  };
}

function buildReleaseGateFacts(repoRoot, spec, finalReleaseGateSource, packageJson) {
  const requiredGates = Array.isArray(spec.requiredGates) ? spec.requiredGates : [];
  const normalizedGates = [...finalReleaseGateSource.matchAll(/normalizeGate\("([^"]+)"/gu)].map((match) => match[1]);
  const requiredGateDrift = requiredGates.filter((gate) => !normalizedGates.includes(gate));
  const githubReleaseSpec = readJsonIfExists(repoRoot, "release/github-release-workflow.spec.json") ?? {};
  const releaseDocsSpec = readJsonIfExists(repoRoot, "release/release-docs.spec.json") ?? {};
  const workflowEvidence = Array.isArray(githubReleaseSpec.requiredEvidence) ? githubReleaseSpec.requiredEvidence : [];
  const requiredSupplyChainEvidence = ["checksums", "sbom", "cargo-metadata", "artifact-attestation", "draft-release"];
  return {
    requiredGates,
    normalizedGates,
    requiredGateDrift,
    docsGatePresent: normalizedGates.includes("docs"),
    releaseDocsSpecPresent: releaseDocsSpec.schemaVersion === "agentique.releaseDocsGate.v1",
    hasReleaseDocsScript: Boolean(packageJson?.scripts?.["validate:release-docs"]),
    validateIncludesReleaseDocs: hasValidationCommand("npm run validate:release-docs"),
    workflowEvidence,
    requiredSupplyChainEvidence,
    workflowSupplyChainEvidenceReady: requiredSupplyChainEvidence.every((evidence) => workflowEvidence.includes(evidence)),
    publicSafeWorkflowRunIdRequired: spec?.decisionPolicy?.requirePublicSafeWorkflowRunIdForGo === true,
    publicationClaimsFalse: Object.values(spec?.publicationClaims ?? {}).every((value) => value === false),
    publicationAllowedRequiresReady: /publicationAllowed:\s*ready/u.test(finalReleaseGateSource)
  };
}

function buildRunnerBoundaryFacts(repoRoot) {
  const boundarySource = readTextIfExists(repoRoot, "src/core/native-runner-boundary.mjs");
  const rustSource = readTextIfExists(repoRoot, "src-tauri/src/lib.rs");
  const capabilitySource = readTextIfExists(repoRoot, "src-tauri/capabilities/default.json");
  return {
    nativeRunnerBoundaryPresent: boundarySource.length > 0,
    startReturnsSpawnFalse: /will_spawn_process:\s*false/u.test(rustSource),
    shellPermissionsEmpty: !/shell:allow-(execute|spawn)/u.test(capabilitySource),
    fixedLaneTransitionGated: /native-controlled-ready/u.test(rustSource) && /fixed-lane-transition/u.test(rustSource)
  };
}

function buildDataBoundaryFacts(repoRoot) {
  const routeDir = path.join(repoRoot, "src/workspaces/routes");
  const routeSource = fs.existsSync(routeDir)
    ? fs
        .readdirSync(routeDir)
        .filter((name) => /\.(?:ts|tsx)$/u.test(name))
        .map((name) => readTextIfExists(repoRoot, `src/workspaces/routes/${name}`))
        .join("\n")
    : "";
  return {
    companionReadbackClientPresent: fs.existsSync(path.join(repoRoot, "src/core/companion-readback-adapter.mjs")),
    companionDownloadAcquisitionPresent: fs.existsSync(path.join(repoRoot, "src/core/companion-download-acquisition.mjs")),
    externalIntakeScannerPresent: fs.existsSync(path.join(repoRoot, "src/core/companion-external-intake-scanner.mjs")),
    sampleDataStillPresent: `${readTextIfExists(repoRoot, "src/App.tsx")}\n${routeSource}`.includes("sample")
  };
}

function buildBuildPayloadBudgetFacts(repoRoot) {
  const { report, validation } = reviewBuildPayloadBudget({ root: repoRoot });
  return {
    measured: report.measured,
    ok: validation.ok,
    failures: validation.failures,
    sourceMapPolicy: report.sourceMapPolicy,
    budgets: report.budgets,
    summary: validation.summary
  };
}

function buildI18nCatalogLoadingFacts(repoRoot) {
  const { report, validation } = reviewI18nCatalogLoading({ root: repoRoot });
  return {
    ok: validation.ok,
    failures: validation.failures,
    summary: validation.summary,
    centralIndex: report.centralIndex,
    catalogFiles: report.catalogFiles.map((file) => ({
      locale: file.locale,
      path: file.path,
      exists: file.exists,
      bytes: file.bytes,
      lines: file.lines
    })),
    provider: report.provider
  };
}

function buildTypeLintFormatBaselineFacts(repoRoot) {
  const { report, validation } = reviewTypeLintFormatBaseline({ root: repoRoot });
  return {
    ok: validation.ok,
    failures: validation.failures,
    summary: validation.summary,
    node: report.node,
    scripts: {
      lint: report.scripts.lint.length > 0,
      formatCheck: report.scripts.formatCheck.length > 0,
      typecheckJs: report.scripts.typecheckJs.length > 0,
      validateTypeLintFormat: report.scripts.validateTypeLintFormat.length > 0
    },
    configs: {
      eslint: report.configs.eslint.exists,
      prettier: report.configs.prettier.exists,
      prettierIgnore: report.configs.prettier.ignoreExists,
      checkJs: report.configs.checkJs.checkJs,
      controlledCheckJsFiles: report.configs.checkJs.controlledFiles.length
    }
  };
}

function buildValidationStageReportingFacts(repoRoot) {
  const { report, validation } = reviewValidationStageReporting({ root: repoRoot });
  return {
    ok: validation.ok,
    failures: validation.failures,
    summary: validation.summary,
    validateScript: report.packageScripts.validate,
    validateStageReportingScript: report.packageScripts.validateStageReporting,
    stages: report.stages.map((stage) => ({
      id: stage.id,
      commandCount: stage.commandCount
    }))
  };
}

function buildLiveDataBoundaryFacts(repoRoot) {
  const { report, validation } = reviewLiveDataBoundary({ root: repoRoot });
  return {
    ok: validation.ok,
    failures: validation.failures,
    summary: validation.summary,
    productionCredentialsRequired: report.productionCredentialsRequired,
    networkDuringValidation: report.networkDuringValidation,
    mutationDuringValidation: report.mutationDuringValidation,
    providerKinds: report.providers.map((provider) => provider.kind),
    visibleStates: report.visibleStates.map((state) => state.state),
    validateScript: report.packageScripts.validateLiveDataBoundary,
    validateIncludesLiveDataBoundary: report.packageScripts.validateIncludesLiveDataBoundary,
    uiBindings: report.uiBindings
  };
}

function buildNativeRunnerSidecarGateFacts(repoRoot) {
  const { report, validation } = reviewNativeRunnerSidecarGate(readNativeRunnerSidecarGateInputs(repoRoot));
  return {
    ok: validation.ok,
    failures: validation.failures,
    summary: validation.summary,
    currentTauriState: {
      externalBinCount: report.currentTauriState.externalBinCount,
      shellPermissionGrants: report.currentTauriState.shellPermissionGrants.length,
      shellPluginPresent: report.currentTauriState.shellPluginPresent
    },
    nativeStart: report.nativeStart,
    prerequisiteGates: {
      signedAdapter: report.prerequisiteGates.signedAdapter.ok,
      permissionPreflight: report.prerequisiteGates.permissionPreflight.ok,
      runFolder: report.prerequisiteGates.runFolder.ok,
      logRedaction: report.prerequisiteGates.logRedaction.required && report.prerequisiteGates.logRedaction.errorsRedacted,
      platformCompatibility: report.prerequisiteGates.platformCompatibility.ok
    },
    sidecars: report.sidecarReadiness.sidecars.map((sidecar) => ({
      id: sidecar.id,
      runtime: sidecar.runtime,
      configured: sidecar.configured,
      permissionGranted: sidecar.permissionGranted
    })),
    validateScript: report.packageScripts.validateNativeRunnerSidecarGate,
    validateIncludesNativeRunnerSidecarGate: report.packageScripts.validateIncludesNativeRunnerSidecarGate
  };
}

function buildStyleSourceBoundaryFacts(repoRoot) {
  const report = reviewStyleSourceBoundary({ root: repoRoot });
  return {
    ok: report.ok,
    status: report.status,
    failures: report.failures,
    manifest: report.manifest,
    shards: report.shards,
    bundle: {
      lines: report.bundle.lines,
      stylelintDependencyStatus: report.bundle.stylelintDependencyStatus
    }
  };
}

function buildWorkspaceFileBudgetFacts(repoRoot) {
  const { report, validation } = reviewWorkspaceFileBudgets({ root: repoRoot });
  return {
    ok: validation.ok,
    failures: validation.failures,
    summary: validation.summary,
    budgetedFiles: report.files.map((file) => ({
      path: file.path,
      lines: file.lines,
      maxLines: file.maxLines,
      role: file.role
    }))
  };
}

function buildRecommendationsInputFacts(repoRoot) {
  const relPath = "IMPROVEMENT_RECOMMENDATIONS.md";
  const fullPath = path.join(repoRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    return {
      present: false,
      trackedAsInput: false
    };
  }
  const text = fs.readFileSync(fullPath, "utf8");
  return {
    present: true,
    trackedAsInput: false,
    lines: countLines(text),
    mentionsInternalRefactor: /internal refactor/iu.test(text)
  };
}

function buildRiskRegister(measurements) {
  const risks = [];
  risks.push(
    risk("app-shell-centralized", "high", measurements.appShell.staticWorkspaceImports === 0 && measurements.appShell.lazyWorkspaceImports >= 4 ? "mitigated" : "follow-up", {
      evidence: `App shell has ${measurements.appShell.lines} lines, ${measurements.appShell.useStateReferences} state references, ${measurements.appShell.staticWorkspaceImports} static workspace imports, and ${measurements.appShell.lazyWorkspaceImports} lazy workspace route imports.`
    })
  );
  risks.push(
    risk("workspace-large-files", "high", "follow-up", {
      evidence: `${measurements.sourceInventory.filesOver500Lines.length} source files exceed 500 lines.`
    })
  );
  risks.push(
    risk("hash-route-adapter-gap", "medium", measurements.routing.routeAdapterModule && measurements.routing.hashChangeListener ? "mitigated" : "follow-up", {
      evidence: measurements.routing.hashChangeListener
        ? "Typed route adapter and hash change listener are present."
        : "Hash is read and written, but no hash change listener is present."
    })
  );
  risks.push(
    risk("global-css-monolith", "medium", measurements.styleSourceBoundary.ok ? "mitigated" : "follow-up", {
      evidence: measurements.styleSourceBoundary.ok
        ? `CSS source bundle has ${measurements.styles.lines} lines across ${measurements.styleSourceBoundary.shards.length} budgeted shards; manifest has ${measurements.styles.manifestLines} lines.`
        : `CSS source bundle has ${measurements.styles.lines} lines and the style source boundary is failing.`
    })
  );
  risks.push(
    risk("single-i18n-catalog", "medium", measurements.i18nCatalogLoading.ok ? "mitigated" : "follow-up", {
      evidence: measurements.i18nCatalogLoading.ok
        ? `I18n facade has ${measurements.i18nCatalogLoading.centralIndex.lines} lines and ${measurements.i18nCatalogLoading.catalogFiles.length} split locale catalog modules.`
        : `I18n catalog module has ${measurements.i18n.lines} lines and ${measurements.i18n.localeCodes.length} locale codes.`
    })
  );
  risks.push(
    risk("build-payload-large", "medium", measurements.buildPayloadBudget.measured && measurements.buildPayloadBudget.ok ? "mitigated" : "follow-up", {
      evidence: measurements.buildPayloadBudget.measured
        ? `Largest JS ${measurements.buildPayloadBudget.summary.largestJavaScriptBytes} bytes, largest image ${measurements.buildPayloadBudget.summary.largestImageBytes} bytes, largest source map ${measurements.buildPayloadBudget.summary.largestSourceMapBytes} bytes.`
        : "Build payload is not measured until dist assets exist."
    })
  );
  risks.push(
    risk("validation-surface-large", "medium", measurements.validationStageReporting.ok ? "mitigated" : "follow-up", {
      evidence: measurements.validationStageReporting.ok
        ? `${measurements.validationStageReporting.summary.commands} validation commands are grouped into ${measurements.validationStageReporting.summary.stages} staged gates.`
        : `${measurements.packageScripts.validateScripts} validation scripts are configured without a passing staged manifest.`
    })
  );
  risks.push(
    risk("lint-format-baseline-missing", "medium", measurements.typeLintFormatBaseline.ok ? "mitigated" : "follow-up", {
      evidence: measurements.typeLintFormatBaseline.ok
        ? `ESLint/Prettier baseline is configured and validates ${measurements.typeLintFormatBaseline.configs.controlledCheckJsFiles} scoped JS files.`
        : `ESLint=${measurements.tooling.eslintConfigured}, Prettier=${measurements.tooling.prettierConfigured}, Stylelint=${measurements.tooling.stylelintConfigured}.`
    })
  );
  risks.push(
    risk("js-checkjs-disabled", "medium", measurements.typeLintFormatBaseline.ok ? "mitigated" : "follow-up", {
      evidence: measurements.typeLintFormatBaseline.ok
        ? `Scoped checkJs baseline validates ${measurements.typeLintFormatBaseline.configs.controlledCheckJsFiles} high-risk JavaScript files with Node types.`
        : `allowJs=${measurements.tooling.allowJs}, checkJs=${measurements.tooling.checkJs}.`
    })
  );
  risks.push(
    risk("release-gate-spec-code-drift", "high", measurements.releaseGate.requiredGateDrift.length === 0 ? "mitigated" : "follow-up", {
      evidence:
        measurements.releaseGate.requiredGateDrift.length > 0
          ? `Spec/code drift: ${measurements.releaseGate.requiredGateDrift.join(", ")}.`
          : "Release gate spec and normalized gates are aligned; installer and updater publication remain blocked until real artifact evidence exists."
    })
  );
  risks.push(
    risk("runner-native-execution-gated", "high", "guarded", {
      evidence: measurements.nativeRunnerSidecarGate.ok
        ? `Native runner start is fixed-lane native Python execution gated with ${measurements.nativeRunnerSidecarGate.currentTauriState.externalBinCount} configured sidecars and ${measurements.nativeRunnerSidecarGate.currentTauriState.shellPermissionGrants} shell grants.`
        : measurements.runnerBoundary.startReturnsSpawnFalse
          ? "Native runner start remains no-spawn, but sidecar transition gate needs review."
          : "Native runner boundary needs review."
    })
  );
  risks.push(
    risk("sample-live-data-boundary", "medium", measurements.liveDataBoundary.ok ? "mitigated" : "follow-up", {
      evidence: measurements.liveDataBoundary.ok
        ? `Live data boundary covers ${measurements.liveDataBoundary.providerKinds.length} provider kinds and ${measurements.liveDataBoundary.visibleStates.length} visible states without production credentials.`
        : `Readback=${measurements.dataBoundary.companionReadbackClientPresent}, download=${measurements.dataBoundary.companionDownloadAcquisitionPresent}, sample data=${measurements.dataBoundary.sampleDataStillPresent}.`
    })
  );
  return risks;
}

function buildClaimCorrections() {
  return [
    {
      code: "all-workspaces-render-at-once",
      claimStatus: "unsupported",
      correctedFact: "Workspace components are conditionally rendered by the active navigation key, while app-shell state and derivations remain centralized."
    },
    {
      code: "run-graph-entirely-nonfunctional",
      claimStatus: "unsupported",
      correctedFact: "Run and Graph have deterministic scheduler, permission, handoff, evidence, and canvas behavior; native process execution remains separately gated."
    },
    {
      code: "data-layer-static-only",
      claimStatus: "partial",
      correctedFact: "Sample data remains visible, but read-only companion readback, safe acquisition, and browser-local scanner adapters already exist."
    },
    {
      code: "mandatory-state-router-image-dependencies",
      claimStatus: "unsupported",
      correctedFact: "State, routing, and image tooling dependencies are optional and require item-level justification after local extraction and measurement."
    }
  ];
}

function risk(code, severity, status, { evidence }) {
  return { code, severity, status, evidence };
}

function requireCorrection(correctionByCode, code, expectedStatus, failures) {
  const correction = correctionByCode.get(code);
  if (!correction) return;
  if (correction.claimStatus !== expectedStatus) {
    failures.push(issue("claim-correction-status", `${code} must be classified as ${expectedStatus}.`));
  }
}

function issue(code, message) {
  return { code, message };
}

function collectSourceFiles(repoRoot) {
  const result = [];
  walk(repoRoot, result);
  return result;
}

function walk(dir, result) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, result);
    } else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      result.push(fullPath);
    }
  }
}

function readJsonIfExists(repoRoot, relPath) {
  const text = readTextIfExists(repoRoot, relPath);
  if (!text) return null;
  return JSON.parse(text);
}

function readTextIfExists(repoRoot, relPath) {
  const filePath = path.join(repoRoot, relPath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function relativePath(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}

function countLines(text) {
  if (!text) return 0;
  return text.split(/\r?\n/u).length - (text.endsWith("\n") ? 1 : 0);
}

function countMatches(text, pattern) {
  return [...String(text).matchAll(pattern)].length;
}

function extractLocaleCodes(text) {
  const localeArray = text.match(/localeCodes\s*=\s*\[([\s\S]*?)\]/u)?.[1] ?? "";
  const fromArray = [...localeArray.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
  const fromCatalogKeys = [...text.matchAll(/["']?\b(en|zh-Hans|zh-Hant|ja|ko|de|fr|it|es|ru)["']?\s*:/gu)].map((match) => match[1]).filter(Boolean);
  return [...fromArray, ...fromCatalogKeys].filter((value, index, array) => array.indexOf(value) === index);
}

function assetKind(name) {
  if (/\.js$/u.test(name)) return "javascript";
  if (/\.js\.map$/u.test(name)) return "sourcemap";
  if (/\.css$/u.test(name)) return "css";
  if (/\.(png|jpg|jpeg|webp|avif|gif|svg)$/iu.test(name)) return "image";
  return "other";
}

function maxBytes(assets, kind) {
  return Math.max(0, ...assets.filter((asset) => asset.kind === kind).map((asset) => asset.bytes));
}

function hasDependency(dependencies, name) {
  return Object.prototype.hasOwnProperty.call(dependencies, name);
}
