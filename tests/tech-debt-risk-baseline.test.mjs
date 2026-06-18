import assert from "node:assert/strict";
import test from "node:test";
import { collectTechDebtRiskBaseline, validateTechDebtRiskBaseline } from "../src/core/tech-debt-risk-baseline.mjs";

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

test("technical debt risk baseline records measured current risks", () => {
  const baseline = collectTechDebtRiskBaseline();
  const validation = validateTechDebtRiskBaseline(baseline);
  assert.equal(validation.ok, true, JSON.stringify(validation.failures));

  const riskCodes = baseline.riskRegister.map((risk) => risk.code);
  for (const code of requiredRiskCodes) {
    assert.ok(riskCodes.includes(code), `missing risk code: ${code}`);
  }

  assert.ok(baseline.measurements.appShell.lines <= 120);
  assert.equal(baseline.measurements.appShell.staticWorkspaceImports, 0);
  assert.ok(baseline.measurements.appShell.lazyWorkspaceImports >= 5);
  assert.equal(baseline.measurements.appShell.conditionalWorkspaceRender, true);
  assert.equal(baseline.measurements.routing.routeAdapterModule, true);
  assert.equal(baseline.measurements.routing.appUsesRouteHook, true);
  assert.equal(baseline.measurements.routing.hashChangeListener, true);
  assert.ok(baseline.measurements.styles.lines >= 3000);
  assert.ok(baseline.measurements.styles.manifestLines <= 20);
  assert.ok(baseline.measurements.i18n.localeCodes.includes("zh-Hant"));
  assert.equal(baseline.measurements.i18n.inlineCatalogModule, false);
  assert.equal(baseline.measurements.i18nCatalogLoading.ok, true);
  assert.equal(baseline.measurements.i18nCatalogLoading.catalogFiles.length, 10);
  assert.ok(baseline.measurements.i18nCatalogLoading.centralIndex.bytes <= 12000);
  assert.equal(baseline.measurements.typeLintFormatBaseline.ok, true);
  assert.equal(baseline.measurements.typeLintFormatBaseline.node.matchesTooling, true);
  assert.equal(baseline.measurements.typeLintFormatBaseline.configs.controlledCheckJsFiles, 87);
  assert.equal(baseline.measurements.validationStageReporting.ok, true);
  assert.equal(baseline.measurements.validationStageReporting.summary.stages, 7);
  assert.equal(baseline.measurements.validationStageReporting.summary.commands, 97);
  assert.equal(baseline.measurements.liveDataBoundary.ok, true);
  assert.equal(baseline.measurements.liveDataBoundary.summary.providers, 5);
  assert.equal(baseline.measurements.liveDataBoundary.productionCredentialsRequired, false);
  assert.equal(baseline.measurements.liveDataBoundary.networkDuringValidation, false);
  assert.equal(baseline.measurements.liveDataBoundary.mutationDuringValidation, false);
  assert.deepEqual(baseline.measurements.liveDataBoundary.visibleStates, ["sample", "live-current", "live-stale", "unavailable", "rate-limited"]);
  assert.equal(baseline.measurements.nativeRunnerSidecarGate.ok, true);
  assert.equal(baseline.measurements.nativeRunnerSidecarGate.currentTauriState.externalBinCount, 0);
  assert.equal(baseline.measurements.nativeRunnerSidecarGate.currentTauriState.shellPermissionGrants, 0);
  assert.equal(baseline.measurements.nativeRunnerSidecarGate.currentTauriState.shellPluginPresent, false);
  assert.equal(baseline.measurements.nativeRunnerSidecarGate.nativeStart.transitionGateReady, true);
  assert.equal(baseline.measurements.nativeRunnerSidecarGate.nativeStart.approvedAdapterId, "adapter.local-python");
  assert.equal(baseline.measurements.nativeRunnerSidecarGate.nativeStart.fixedPythonExecution, true);
  assert.equal(baseline.measurements.nativeRunnerSidecarGate.prerequisiteGates.signedAdapter, true);
  assert.equal(baseline.measurements.nativeRunnerSidecarGate.prerequisiteGates.permissionPreflight, true);
  assert.equal(baseline.measurements.nativeRunnerSidecarGate.prerequisiteGates.runFolder, true);
  assert.equal(baseline.measurements.nativeRunnerSidecarGate.prerequisiteGates.logRedaction, true);
  assert.equal(baseline.measurements.nativeRunnerSidecarGate.prerequisiteGates.platformCompatibility, true);
  assert.ok(baseline.measurements.packageScripts.validateScripts >= 40);
  assert.equal(baseline.measurements.packageScripts.validateIncludesTypeLintFormat, true);
  assert.equal(baseline.measurements.packageScripts.validateIncludesLint, true);
  assert.equal(baseline.measurements.packageScripts.validateIncludesFormatCheck, true);
  assert.equal(baseline.measurements.packageScripts.validateIncludesCheckJs, true);
  assert.equal(baseline.measurements.packageScripts.hasLiveDataBoundaryScript, true);
  assert.equal(baseline.measurements.packageScripts.validateIncludesLiveDataBoundary, true);
  assert.equal(baseline.measurements.packageScripts.hasNativeRunnerSidecarGateScript, true);
  assert.equal(baseline.measurements.packageScripts.validateIncludesNativeRunnerSidecarGate, true);
  assert.equal(baseline.measurements.packageScripts.hasReleaseDocsScript, true);
  assert.equal(baseline.measurements.packageScripts.validateIncludesReleaseDocs, true);
  assert.equal(baseline.measurements.tooling.checkJs, false);
  assert.equal(baseline.measurements.tooling.typescriptEslintConfigured, true);
  assert.equal(baseline.measurements.tooling.nodeTypesConfigured, true);
  assert.equal(baseline.measurements.styleSourceBoundary.ok, true);
  assert.equal(baseline.measurements.workspaceFileBudgets.ok, true);
  if (baseline.measurements.buildPayloadBudget.measured) {
    assert.equal(baseline.measurements.buildPayloadBudget.ok, true);
    assert.equal(baseline.followUpOrder.includes("asset-build-payload"), false);
  }
  assert.equal(baseline.followUpOrder.includes("workspace-file-split"), false);
  assert.equal(baseline.followUpOrder.includes("css-layout-hardening"), false);
  assert.equal(baseline.followUpOrder.includes("i18n-catalog-loading"), false);
  assert.equal(baseline.followUpOrder.includes("type-lint-format-baseline"), false);
  assert.equal(baseline.followUpOrder.includes("validation-stage-reporting"), false);
  assert.equal(baseline.followUpOrder.includes("live-data-boundary"), false);
  assert.equal(baseline.followUpOrder.includes("native-runner-sidecar-gate"), false);
  assert.equal(baseline.followUpOrder.includes("release-updater-supply-chain-closeout"), false);
  assert.deepEqual(baseline.measurements.releaseGate.requiredGateDrift, []);
  assert.equal(baseline.measurements.releaseGate.docsGatePresent, true);
  assert.equal(baseline.measurements.releaseGate.releaseDocsSpecPresent, true);
  assert.equal(baseline.measurements.releaseGate.workflowSupplyChainEvidenceReady, true);
  assert.equal(baseline.measurements.releaseGate.publicSafeWorkflowRunIdRequired, true);
  assert.equal(baseline.measurements.releaseGate.publicationClaimsFalse, true);
});

test("baseline corrects unsupported improvement claims", () => {
  const baseline = collectTechDebtRiskBaseline();
  const corrections = new Map(baseline.claimCorrections.map((item) => [item.code, item]));

  assert.equal(corrections.get("all-workspaces-render-at-once").claimStatus, "unsupported");
  assert.equal(corrections.get("run-graph-entirely-nonfunctional").claimStatus, "unsupported");
  assert.equal(corrections.get("data-layer-static-only").claimStatus, "partial");
  assert.equal(corrections.get("mandatory-state-router-image-dependencies").claimStatus, "unsupported");
  assert.match(corrections.get("all-workspaces-render-at-once").correctedFact, /conditionally rendered/u);
  assert.match(corrections.get("run-graph-entirely-nonfunctional").correctedFact, /native process execution remains separately gated/u);
});

test("baseline validator rejects weakened claim corrections", () => {
  const baseline = collectTechDebtRiskBaseline();
  const weakened = {
    ...baseline,
    claimCorrections: baseline.claimCorrections.map((correction) => (correction.code === "all-workspaces-render-at-once" ? { ...correction, claimStatus: "accepted" } : correction))
  };
  const validation = validateTechDebtRiskBaseline(weakened);

  assert.equal(validation.ok, false);
  assert.ok(validation.failures.some((failure) => failure.code === "claim-correction-status"));
});

test("baseline is wired into the validation chain", () => {
  const baseline = collectTechDebtRiskBaseline();
  assert.equal(baseline.measurements.packageScripts.hasTechDebtRiskBaselineScript, true);
  assert.equal(baseline.measurements.packageScripts.validateIncludesTechDebtRiskBaseline, true);
  assert.equal(baseline.measurements.packageScripts.hasTypeLintFormatScript, true);
  assert.equal(baseline.measurements.packageScripts.validateIncludesTypeLintFormat, true);
  assert.equal(baseline.measurements.packageScripts.hasLiveDataBoundaryScript, true);
  assert.equal(baseline.measurements.packageScripts.validateIncludesLiveDataBoundary, true);
  assert.equal(baseline.measurements.packageScripts.hasNativeRunnerSidecarGateScript, true);
  assert.equal(baseline.measurements.packageScripts.validateIncludesNativeRunnerSidecarGate, true);
  assert.equal(baseline.measurements.packageScripts.hasReleaseDocsScript, true);
  assert.equal(baseline.measurements.packageScripts.validateIncludesReleaseDocs, true);
});
