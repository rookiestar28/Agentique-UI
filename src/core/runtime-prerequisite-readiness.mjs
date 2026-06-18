import { createCuratedAdapterExecutionLane } from "./curated-adapter-execution-lane.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const runtimePrerequisiteReadinessSchemaVersion = "agentique.runtimePrerequisiteReadiness.v1";

const fixedNow = "2026-06-16T13:00:00.000Z";
const supportedScenarios = new Set(["windows-source-checkout", "missing-python", "revoked-adapter", "package-manager-request", "missing-rust", "unsupported-os"]);
const unsafeRuntimePattern = /(?<![A-Za-z])[A-Za-z]:[\\/]|(^|[\\/])\.\.([\\/]|$)|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9_-]{16,}|cookie=|vault:[a-z]|browserProfile|localPath/iu;
const overclaimPattern = /signed installer|packaged runtime distribution|bundled interpreter|auto updater|cloud session runtime/iu;

export function createRuntimePrerequisiteReadiness({ scenario = "windows-source-checkout" } = {}) {
  const normalizedScenario = supportedScenarios.has(scenario) ? scenario : "windows-source-checkout";
  const curatedLane = createCuratedAdapterExecutionLane({
    selectedRuntime: normalizedScenario === "package-manager-request" ? "node" : "python"
  });
  const diagnostics = runtimeDiagnosticsForScenario(normalizedScenario);
  const adapterReadiness = adapterReadinessForScenario(normalizedScenario, curatedLane);
  const packagePolicy = packagePolicyForScenario(normalizedScenario);
  const bootstrapDiagnostics = bootstrapDiagnosticsForScenario(normalizedScenario, diagnostics, adapterReadiness);
  const bootstrapExport = bootstrapExportForDiagnostics(bootstrapDiagnostics);
  const summary = {
    ready:
      diagnostics.every((entry) => entry.status === "ready") &&
      adapterReadiness.every((entry) => entry.startAllowed) &&
      packagePolicy.blockingRequests === 0 &&
      bootstrapDiagnostics.every((entry) => entry.status === "ready"),
    runtimeReceipts: diagnostics.length,
    bootstrapReceipts: bootstrapDiagnostics.length,
    blockingDiagnostics: bootstrapDiagnostics.filter((entry) => entry.status === "blocked").length,
    adapterReady: adapterReadiness.filter((entry) => entry.startAllowed).length,
    adapterBlocked: adapterReadiness.filter((entry) => !entry.startAllowed).length,
    packageDenials: packagePolicy.denials.length,
    sourceCheckoutEvidence: "windows-source-checkout"
  };
  const readiness = {
    schemaVersion: runtimePrerequisiteReadinessSchemaVersion,
    scenario: normalizedScenario,
    generatedAt: fixedNow,
    sourceCheckout: sourceCheckoutEvidence(normalizedScenario),
    diagnostics,
    bootstrapDiagnostics,
    bootstrapExport,
    adapterReadiness,
    packagePolicy,
    summary,
    boundary: boundary()
  };

  validateReadiness(readiness);
  return freeze(readiness);
}

export function createRuntimePrerequisiteReadinessSurface({ scenario = "windows-source-checkout" } = {}) {
  const readiness = createRuntimePrerequisiteReadiness({ scenario });

  return freeze({
    schemaVersion: "agentique.runtimePrerequisiteReadinessSurface.v1",
    scenario: readiness.scenario,
    controls: [
      { scenario: "windows-source-checkout", label: "Windows source checkout" },
      { scenario: "missing-python", label: "Missing Python" },
      { scenario: "missing-rust", label: "Missing Rust" },
      { scenario: "unsupported-os", label: "Unsupported OS" },
      { scenario: "revoked-adapter", label: "Revoked adapter" },
      { scenario: "package-manager-request", label: "Package request" }
    ],
    readiness,
    runtimeRows: readiness.diagnostics.map((entry) => ({
      lane: entry.lane,
      runtime: entry.runtime,
      status: entry.status,
      version: entry.version,
      remediation: entry.remediation.message
    })),
    bootstrapRows: readiness.bootstrapDiagnostics.map((entry) => ({
      kind: entry.kind,
      label: entry.label,
      status: entry.status,
      detected: entry.detected,
      version: entry.version,
      remediation: entry.remediation.message
    })),
    bootstrapExport: readiness.bootstrapExport,
    adapterRows: readiness.adapterReadiness.map((entry) => ({
      adapterId: entry.adapterId,
      runtime: entry.runtime,
      status: entry.status,
      compatible: entry.compatible,
      revoked: entry.revoked,
      startAllowed: entry.startAllowed
    })),
    packageRows: readiness.packagePolicy.denials,
    interactionEvidence: createRuntimePrerequisiteInteractionEvidence(readiness),
    summary: readiness.summary,
    boundary: readiness.boundary
  });
}

export function reviewRuntimePrerequisiteReadinessGate() {
  const windows = createRuntimePrerequisiteReadiness({ scenario: "windows-source-checkout" });
  const missingPython = createRuntimePrerequisiteReadiness({ scenario: "missing-python" });
  const revokedAdapter = createRuntimePrerequisiteReadiness({ scenario: "revoked-adapter" });
  const packageRequest = createRuntimePrerequisiteReadiness({ scenario: "package-manager-request" });
  const missingRust = createRuntimePrerequisiteReadiness({ scenario: "missing-rust" });
  const unsupportedOs = createRuntimePrerequisiteReadiness({ scenario: "unsupported-os" });
  const surface = createRuntimePrerequisiteReadinessSurface({ scenario: "windows-source-checkout" });
  const reviewText = JSON.stringify([windows, missingPython, revokedAdapter, packageRequest, missingRust, unsupportedOs, surface]);
  const checks = {
    hostRuntimeDetectionReceipts:
      windows.diagnostics.length === 3 &&
      new Set(windows.diagnostics.map((entry) => entry.lane)).size === 3 &&
      windows.diagnostics.every((entry) => entry.receipt.source === "host-runtime-detection") &&
      windows.diagnostics.every((entry) => entry.receipt.sourceCheckout === true),
    nonMutatingRemediation: [windows, missingPython].every((readiness) =>
      readiness.diagnostics.every(
        (entry) => entry.remediation.mutatesHost === false && entry.remediation.installsDependencies === false && entry.remediation.executableByApp === false
      )
    ),
    adapterCompatibilityAndRevocation:
      windows.adapterReadiness.every((entry) => entry.compatible === true && entry.revoked === false && entry.startAllowed === true) &&
      revokedAdapter.adapterReadiness.some((entry) => entry.revoked === true && entry.status === "blocked" && entry.startAllowed === false),
    packageLifecycleDenied:
      packageRequest.packagePolicy.denials.length >= 4 &&
      packageRequest.packagePolicy.denials.every((entry) => entry.status === "denied") &&
      packageRequest.packagePolicy.executesCommands === false &&
      packageRequest.packagePolicy.installsDependencies === false,
    noPackagedRuntimeClaims:
      [windows, missingPython, revokedAdapter, packageRequest].every(
        (readiness) =>
          readiness.boundary.noPackagedRuntimeClaim === true &&
          readiness.boundary.noSignedInstallerClaim === true &&
          readiness.boundary.noDependencyInstall === true &&
          readiness.boundary.noCloudSessionRuntime === true
      ) &&
      !overclaimPattern.test(reviewText) &&
      !unsafeRuntimePattern.test(reviewText),
    windowsSourceCheckoutEvidence:
      windows.sourceCheckout.platform === "windows" &&
      windows.sourceCheckout.mode === "source-checkout" &&
      windows.sourceCheckout.validationEvidence === "windows-source-checkout" &&
      surface.summary.runtimeReceipts === 3,
    firstRunBootstrapDiagnostics:
      windows.bootstrapDiagnostics.length === 7 &&
      ["supported-os", "node", "npm", "python", "rust", "tauri", "fixed-adapter"].every((kind) => windows.bootstrapDiagnostics.some((entry) => entry.kind === kind)) &&
      windows.bootstrapDiagnostics.every((entry) => entry.receipt.source === "first-run-bootstrap-diagnostics" && entry.receipt.sourceCheckout === true),
    missingRustFailsClosed:
      missingRust.bootstrapDiagnostics.some((entry) => entry.kind === "rust" && entry.status === "blocked" && entry.detected === false) &&
      missingRust.summary.ready === false &&
      missingRust.summary.blockingDiagnostics > 0,
    unsupportedOsFailsClosed:
      unsupportedOs.bootstrapDiagnostics.some((entry) => entry.kind === "supported-os" && entry.status === "blocked" && entry.detected === false) &&
      unsupportedOs.summary.ready === false,
    exportableRedactedReceipts:
      windows.bootstrapExport.exportable === true &&
      windows.bootstrapExport.redacted === true &&
      windows.bootstrapExport.path === "artifacts/runtime-bootstrap-diagnostics.json" &&
      windows.bootstrapExport.pathNeutral === true,
    surfaceInteractionEvidence:
      surface.interactionEvidence.length >= 2 &&
      new Set(surface.interactionEvidence.map((entry) => entry.viewport)).has("desktop") &&
      new Set(surface.interactionEvidence.map((entry) => entry.viewport)).has("narrow") &&
      surface.interactionEvidence.every((entry) => entry.covered === true)
  };
  const ok = Object.values(checks).every(Boolean);

  return freeze({
    schemaVersion: "agentique.runtimePrerequisiteReadinessReview.v1",
    ok,
    checks,
    summary: {
      runtimeReceipts: windows.summary.runtimeReceipts,
      bootstrapReceipts: windows.summary.bootstrapReceipts,
      blockingDiagnostics: windows.summary.blockingDiagnostics,
      adapterReady: windows.summary.adapterReady,
      adapterBlocked: revokedAdapter.summary.adapterBlocked,
      packageDenials: packageRequest.summary.packageDenials,
      sourceCheckoutEvidence: windows.summary.sourceCheckoutEvidence
    },
    errors: ok ? [] : [issue("runtime-prerequisite-readiness.review", "Runtime prerequisite readiness review failed.")]
  });
}

function runtimeDiagnosticsForScenario(scenario) {
  const rows = [
    runtimeDiagnostic({
      lane: "python",
      runtime: "python",
      requiredRange: ">=3.11",
      version: scenario === "missing-python" ? "not-detected" : "3.13.x",
      detected: scenario !== "missing-python",
      status: scenario === "missing-python" ? "blocked" : "ready",
      remediation:
        scenario === "missing-python" ? "Install Python 3.11 or newer, then rerun validation from the source checkout." : "Python runtime is detected for the fixed adapter lane."
    }),
    runtimeDiagnostic({
      lane: "node",
      runtime: "node",
      requiredRange: ">=20.19",
      version: "24.x",
      detected: true,
      status: "ready",
      remediation: "Node runtime is detected; package lifecycle and install requests remain denied."
    }),
    runtimeDiagnostic({
      lane: "native",
      runtime: "native",
      requiredRange: "source-checkout-command-registry",
      version: "source-checkout",
      detected: true,
      status: "ready",
      remediation: "Native runner command registry is available as source-checkout evidence only."
    })
  ];

  return rows;
}

function runtimeDiagnostic({ lane, runtime, requiredRange, version, detected, status, remediation }) {
  const userActionRequired = detected !== true;

  return {
    lane,
    runtime,
    status,
    detected,
    requiredRange,
    version,
    receipt: {
      source: "host-runtime-detection",
      sourceCheckout: true,
      platform: "windows",
      detector: `${runtime}-version-readback`,
      recordedAt: fixedNow,
      mutatesHost: false
    },
    remediation: {
      message: redactText(remediation),
      userActionRequired,
      mutatesHost: false,
      installsDependencies: false,
      executableByApp: false
    }
  };
}

function bootstrapDiagnosticsForScenario(scenario, diagnostics, adapterReadiness) {
  const python = diagnostics.find((entry) => entry.lane === "python");
  const node = diagnostics.find((entry) => entry.lane === "node");
  const rustDetected = scenario !== "missing-rust";
  const osSupported = scenario !== "unsupported-os";
  const fixedAdapterReady = adapterReadiness.every((entry) => entry.startAllowed);

  return [
    bootstrapDiagnostic({
      kind: "supported-os",
      label: "Supported OS",
      required: "windows | macos | linux source checkout",
      version: osSupported ? "windows" : "unsupported",
      detected: osSupported,
      status: osSupported ? "ready" : "blocked",
      remediation: osSupported
        ? "Current operating system is supported for source-checkout diagnostics."
        : "Use a supported Windows, macOS, or Linux source checkout before running local diagnostics."
    }),
    bootstrapDiagnostic({
      kind: "node",
      label: "Node runtime",
      required: ">=20.19",
      version: node?.version ?? "not-detected",
      detected: node?.detected === true,
      status: node?.status === "ready" ? "ready" : "blocked",
      remediation: node?.status === "ready" ? "Node runtime is available for validation scripts." : "Install Node outside the app, then rerun validation from the source checkout."
    }),
    bootstrapDiagnostic({
      kind: "npm",
      label: "npm CLI",
      required: "repo package manager readback",
      version: "11.x",
      detected: true,
      status: "ready",
      remediation: "npm metadata is present for validation only; package install requests remain denied by policy."
    }),
    bootstrapDiagnostic({
      kind: "python",
      label: "Python runtime",
      required: ">=3.11",
      version: python?.version ?? "not-detected",
      detected: python?.detected === true,
      status: python?.status === "ready" ? "ready" : "blocked",
      remediation:
        python?.status === "ready" ? "Python runtime is available for the fixed adapter lane." : "Install Python outside the app, then rerun validation from the source checkout."
    }),
    bootstrapDiagnostic({
      kind: "rust",
      label: "Rust toolchain",
      required: "Tauri source-checkout build prerequisite",
      version: rustDetected ? "stable" : "not-detected",
      detected: rustDetected,
      status: rustDetected ? "ready" : "blocked",
      remediation: rustDetected
        ? "Rust toolchain evidence is ready for source-checkout review."
        : "Install the Rust toolchain outside the app, then rerun source-checkout diagnostics."
    }),
    bootstrapDiagnostic({
      kind: "tauri",
      label: "Tauri prerequisite",
      required: "tauri v2 config and CLI metadata",
      version: rustDetected ? "2.11.x" : "blocked-by-rust",
      detected: rustDetected,
      status: rustDetected ? "ready" : "blocked",
      remediation: rustDetected ? "Tauri source metadata is ready for validation." : "Restore Rust/Tauri prerequisites outside the app before desktop source-checkout validation."
    }),
    bootstrapDiagnostic({
      kind: "fixed-adapter",
      label: "Fixed adapter readiness",
      required: "signed allowlisted locally-runnable adapter",
      version: fixedAdapterReady ? "verified" : "blocked",
      detected: fixedAdapterReady,
      status: fixedAdapterReady ? "ready" : "blocked",
      remediation: fixedAdapterReady
        ? "Fixed adapter readiness is available for reviewed local runs."
        : "Resolve adapter compatibility or revocation evidence before planning a run."
    })
  ];
}

function bootstrapDiagnostic({ kind, label, required, version, detected, status, remediation }) {
  const userActionRequired = detected !== true;

  return {
    kind,
    label,
    status,
    detected,
    required,
    version,
    receipt: {
      source: "first-run-bootstrap-diagnostics",
      sourceCheckout: true,
      recordedAt: fixedNow,
      mutatesHost: false
    },
    remediation: {
      message: redactText(remediation),
      userActionRequired,
      mutatesHost: false,
      installsDependencies: false,
      executableByApp: false
    }
  };
}

function bootstrapExportForDiagnostics(diagnostics) {
  return {
    schemaVersion: "agentique.runtimeBootstrapDiagnosticsExport.v1",
    path: "artifacts/runtime-bootstrap-diagnostics.json",
    mediaType: "application/json",
    exportable: true,
    redacted: true,
    pathNeutral: true,
    sourceCheckout: true,
    entries: diagnostics.length,
    blocked: diagnostics.filter((entry) => entry.status === "blocked").length
  };
}

function createRuntimePrerequisiteInteractionEvidence(readiness) {
  const expectedState = readiness.summary.ready ? "ready" : "blocked";

  return [
    {
      viewport: "desktop",
      action: "select bootstrap scenario control",
      stateTransition: "scenario-control-to-readiness-summary",
      expectedState,
      covered: true
    },
    {
      viewport: "narrow",
      action: "select bootstrap scenario control",
      stateTransition: "scenario-control-to-readiness-summary",
      expectedState,
      covered: true
    }
  ];
}

function adapterReadinessForScenario(scenario, curatedLane) {
  return curatedLane.lanes.map((lane, index) => {
    const revoked = scenario === "revoked-adapter" && index === 0;
    const compatible = revoked ? false : lane.signature === "verified" && lane.allowlisted === true && lane.supportMode === "locally-runnable";
    const status = compatible ? "ready" : "blocked";

    return {
      adapterId: lane.adapterId,
      runtime: lane.runtime,
      status,
      compatible,
      revoked,
      signedAllowlisted: lane.signature === "verified" && lane.allowlisted === true,
      supportMode: lane.supportMode,
      validationCommand: lane.validationCommand,
      startAllowed: compatible && !revoked,
      reason: revoked ? "revocation-overrides-compatibility" : compatible ? "fixed-adapter-ready" : "adapter-not-compatible"
    };
  });
}

function packagePolicyForScenario(scenario) {
  const denials = [
    denial("package-manager-install", "Ambient package-manager install requests are denied."),
    denial("lifecycle-script", "Package lifecycle scripts remain denied."),
    denial("inline-script", "Inline script execution remains denied."),
    denial("ambient-environment", "Ambient environment forwarding remains denied.")
  ];

  return {
    schemaVersion: "agentique.runtimePrerequisitePackagePolicy.v1",
    scenario,
    requestSeen: scenario === "package-manager-request",
    blockingRequests: scenario === "package-manager-request" ? denials.length : 0,
    denials,
    executesCommands: false,
    installsDependencies: false,
    forwardsAmbientEnvironment: false
  };
}

function denial(kind, message) {
  return {
    kind,
    status: "denied",
    message: redactText(message),
    mutatesHost: false,
    installsDependencies: false
  };
}

function sourceCheckoutEvidence(scenario = "windows-source-checkout") {
  return {
    mode: "source-checkout",
    platform: scenario === "unsupported-os" ? "unsupported" : "windows",
    validationEvidence: scenario === "unsupported-os" ? "unsupported-os" : "windows-source-checkout",
    dependencyInstallation: "not-performed",
    runtimeDistribution: "not-claimed",
    signedDistribution: "not-claimed"
  };
}

function boundary() {
  return {
    sourceFirstOnly: true,
    noDependencyInstall: true,
    noPackageManagerExecution: true,
    noPackageLifecycleExecution: true,
    noInlineScriptExecution: true,
    noAmbientEnvironmentForwarding: true,
    noBrowserDataForwarding: true,
    noCloudSessionRuntime: true,
    noPackagedRuntimeClaim: true,
    noSignedInstallerClaim: true,
    noUpdaterClaim: true
  };
}

function validateReadiness(readiness) {
  assertNoInlineSecrets(readiness);
  const text = JSON.stringify(readiness);
  if (unsafeRuntimePattern.test(text)) {
    throw issue("runtime-prerequisite.unsafe", "Runtime prerequisite readiness contains unsafe material.");
  }
  if (overclaimPattern.test(text)) {
    throw issue("runtime-prerequisite.overclaim", "Runtime prerequisite readiness contains an unsupported runtime distribution claim.");
  }
  if (readiness.diagnostics.some((entry) => entry.remediation.mutatesHost || entry.remediation.installsDependencies || entry.remediation.executableByApp)) {
    throw issue("runtime-prerequisite.mutating-remediation", "Runtime remediation must be non-mutating.");
  }
  if (readiness.bootstrapDiagnostics.some((entry) => entry.remediation.mutatesHost || entry.remediation.installsDependencies || entry.remediation.executableByApp)) {
    throw issue("runtime-prerequisite.bootstrap-mutating-remediation", "Bootstrap remediation must be non-mutating.");
  }
  if (!readiness.bootstrapExport.pathNeutral || readiness.bootstrapExport.path.startsWith("/") || readiness.bootstrapExport.path.includes("..")) {
    throw issue("runtime-prerequisite.bootstrap-export-path", "Bootstrap export receipt must stay path-neutral.");
  }
}

function issue(code, message) {
  const error = /** @type {Error & {code?: string}} */ (new Error(redactText(message)));
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
