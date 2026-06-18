import assert from "node:assert/strict";
import test from "node:test";
import {
  collectLiveDataBoundaryReport,
  normalizeDataSourceState,
  requiredLiveDataProviderKinds,
  requiredVisibleDataSourceStates,
  validateLiveDataBoundaryReport
} from "../src/core/live-data-boundary.mjs";

test("live data boundary separates sample readback download scanner and future providers", () => {
  const report = collectLiveDataBoundaryReport();
  const validation = validateLiveDataBoundaryReport(report);

  assert.equal(validation.status, "passed", JSON.stringify(validation.failures));
  assert.equal(report.productionCredentialsRequired, false);
  assert.equal(report.networkDuringValidation, false);
  assert.equal(report.mutationDuringValidation, false);

  const providerKinds = report.providers.map((provider) => provider.kind);
  for (const kind of requiredLiveDataProviderKinds) {
    assert.ok(providerKinds.includes(kind), `missing provider kind: ${kind}`);
  }
  assert.ok(report.providers.every((provider) => provider.injectable === true));
});

test("visible data-source states provide UI labels for sample live-stale unavailable and rate-limited states", () => {
  const states = new Map(requiredVisibleDataSourceStates.map((state) => [state, normalizeDataSourceState(state)]));

  assert.equal(states.get("sample").visibleLabel, "Sample fixture");
  assert.equal(states.get("live-current").visibleLabel, "Live current");
  assert.equal(states.get("live-stale").visibleLabel, "Live stale");
  assert.equal(states.get("unavailable").visibleLabel, "Unavailable");
  assert.equal(states.get("rate-limited").visibleLabel, "Rate limited");
  assert.equal(normalizeDataSourceState("variant-available").state, "live-current");
  assert.equal(normalizeDataSourceState("stale").state, "live-stale");
  assert.equal(normalizeDataSourceState({ code: "rate-limited" }).state, "rate-limited");
  assert.equal(normalizeDataSourceState("fixture").state, "sample");
});

test("companion readback provider stays read-only HTTPS-or-loopback and credential-free", () => {
  const report = collectLiveDataBoundaryReport();
  const readback = provider(report, "companion-readback");

  assert.equal(readback.liveCapable, true);
  assert.equal(readback.boundary.readOnly, true);
  assert.equal(readback.boundary.getOnly, true);
  assert.equal(readback.boundary.credentialForwarding, false);
  assert.equal(readback.boundary.authRequired, false);
  assert.equal(readback.boundary.authBearingMutation, false);
  assert.equal(readback.boundary.mutationSurfaceOk, true);
  assert.deepEqual(readback.evidence.readOnlySurface, { ok: true, issues: [] });
  assert.equal(readback.boundary.endpointPolicy.acceptsHttps, true);
  assert.equal(readback.boundary.endpointPolicy.acceptsLoopbackHttp, true);
  assert.equal(readback.boundary.endpointPolicy.rejectsPublicHttp, true);
  assert.equal(readback.evidence.badgeStates.stale, "Status stale");
  assert.equal(readback.evidence.badgeStates.unavailable, "Status unavailable");
  assert.equal(readback.evidence.badgeStates.rateLimited, "Rate limited");
});

test("download acquisition provider remains metadata proof only with no install or execution", () => {
  const report = collectLiveDataBoundaryReport();
  const download = provider(report, "download-acquisition");

  assert.equal(download.enabled, true);
  assert.equal(download.boundary.userSelectedDestination, true);
  assert.equal(download.boundary.noOverwriteDefault, true);
  assert.equal(download.boundary.rootBounded, true);
  assert.equal(download.boundary.atomicWrite, true);
  assert.equal(download.boundary.integrityRequired, true);
  assert.equal(download.boundary.ticketedPostOrSafePublicUrl, true);
  assert.equal(download.boundary.sensitiveUrlRejected, true);
  assert.equal(download.boundary.noInstall, true);
  assert.equal(download.boundary.noExecution, true);
  assert.equal(download.boundary.authBearingMutation, false);
  assert.equal(download.evidence.ticketMethod, "POST");
  assert.equal(download.evidence.byteFetchMethod, "GET");
});

test("external intake scanner provider remains browser-local and non-networked", () => {
  const report = collectLiveDataBoundaryReport();
  const scanner = provider(report, "external-intake-scanner");

  assert.equal(scanner.enabled, true);
  assert.equal(scanner.liveCapable, false);
  assert.equal(scanner.boundary.localOnly, true);
  assert.equal(scanner.boundary.advisoryOnly, true);
  assert.equal(scanner.boundary.noNetwork, true);
  assert.equal(scanner.boundary.noClone, true);
  assert.equal(scanner.boundary.noFetch, true);
  assert.equal(scanner.boundary.noUpload, true);
  assert.equal(scanner.boundary.noInstall, true);
  assert.equal(scanner.boundary.noExecution, true);
  assert.equal(scanner.boundary.authBearingMutation, false);
});

test("future live provider remains explicitly gated and disabled by default", () => {
  const report = collectLiveDataBoundaryReport();
  const future = provider(report, "future-live-provider");

  assert.equal(future.enabled, false);
  assert.equal(future.liveCapable, true);
  assert.equal(future.state.state, "unavailable");
  assert.equal(future.boundary.requiresExplicitProviderImplementation, true);
  assert.equal(future.boundary.requiresTauriCapabilityGate, true);
  assert.equal(future.boundary.allowedBaseUrlPolicy, "https-or-loopback");
  assert.equal(future.boundary.credentialForwarding, false);
  assert.equal(future.boundary.authBearingMutation, false);
});

test("boundary report rejects weakened providers and missing validation wiring", () => {
  const report = collectLiveDataBoundaryReport();
  const weakened = {
    ...report,
    packageScripts: {
      ...report.packageScripts,
      validateIncludesLiveDataBoundary: false
    },
    providers: report.providers.map((entry) =>
      entry.kind === "companion-readback"
        ? {
            ...entry,
            boundary: {
              ...entry.boundary,
              credentialForwarding: true
            }
          }
        : entry
    )
  };
  const validation = validateLiveDataBoundaryReport(weakened);

  assert.equal(validation.ok, false);
  assert.ok(validation.failures.some((failure) => failure.code === "readback-credentials"));
  assert.ok(validation.failures.some((failure) => failure.code === "validation-stage"));
});

test("workspace source remains bound to readback download and scanner surfaces", () => {
  const report = collectLiveDataBoundaryReport();
  assert.equal(report.uiBindings.routeCreatesReadbackReview, true);
  assert.equal(report.uiBindings.routeCreatesDownloadPlan, true);
  assert.equal(report.uiBindings.routeCreatesDownloadProof, true);
  assert.equal(report.uiBindings.importStateUsesScanner, true);
  assert.equal(report.uiBindings.libraryShowsCompanionReadback, true);
  assert.equal(report.uiBindings.libraryShowsDownloadProof, true);
  assert.equal(report.uiBindings.importShowsReadOnlyClient, true);
  assert.equal(report.uiBindings.importShowsExternalIntakeDecision, true);
  assert.equal(report.uiBindings.importShowsNoExecutionIntake, true);
  assert.equal(report.uiBindings.importShowsSampleButtons, true);
});

function provider(report, kind) {
  const entry = report.providers.find((candidate) => candidate.kind === kind);
  assert.ok(entry, `missing provider kind: ${kind}`);
  return entry;
}
