import assert from "node:assert/strict";
import test from "node:test";
import {
  createRuntimePrerequisiteReadiness,
  createRuntimePrerequisiteReadinessSurface,
  reviewRuntimePrerequisiteReadinessGate,
  runtimePrerequisiteReadinessSchemaVersion
} from "../src/core/runtime-prerequisite-readiness.mjs";

test("host runtime detection receipts cover python node and native source-checkout lanes", () => {
  const readiness = createRuntimePrerequisiteReadiness({ scenario: "windows-source-checkout" });
  const diagnostics = new Map(readiness.diagnostics.map((entry) => [entry.lane, entry]));

  assert.equal(readiness.schemaVersion, runtimePrerequisiteReadinessSchemaVersion);
  assert.equal(readiness.sourceCheckout.mode, "source-checkout");
  assert.equal(diagnostics.get("python").runtime, "python");
  assert.equal(diagnostics.get("node").runtime, "node");
  assert.equal(diagnostics.get("native").runtime, "native");
  assert.equal(diagnostics.get("python").receipt.source, "host-runtime-detection");
  assert.equal(diagnostics.get("node").receipt.source, "host-runtime-detection");
  assert.equal(diagnostics.get("native").receipt.source, "host-runtime-detection");
  assert.equal(
    readiness.diagnostics.every((entry) => entry.remediation.mutatesHost === false),
    true
  );
  assert.equal(
    readiness.diagnostics.every((entry) => entry.remediation.installsDependencies === false),
    true
  );
  assert.doesNotMatch(JSON.stringify(readiness), /[A-Za-z]:[\\/]|bearer\s+|sk-[A-Za-z0-9_-]{16,}|cookie=|vault:/iu);
});

test("remediation messages are actionable and non-mutating", () => {
  const readiness = createRuntimePrerequisiteReadiness({ scenario: "missing-python" });
  const python = readiness.diagnostics.find((entry) => entry.lane === "python");

  assert.equal(python.status, "blocked");
  assert.equal(python.detected, false);
  assert.equal(python.remediation.userActionRequired, true);
  assert.equal(python.remediation.mutatesHost, false);
  assert.equal(python.remediation.installsDependencies, false);
  assert.equal(python.remediation.executableByApp, false);
  assert.match(python.remediation.message, /Install Python/u);
  assert.doesNotMatch(JSON.stringify(python.remediation), /npm install|pip install|winget|choco|brew|sudo/iu);
});

test("adapter compatibility revocation checks fail closed", () => {
  const readiness = createRuntimePrerequisiteReadiness({ scenario: "revoked-adapter" });
  const revoked = readiness.adapterReadiness.find((entry) => entry.revoked === true);

  assert.ok(revoked);
  assert.equal(revoked.status, "blocked");
  assert.equal(revoked.startAllowed, false);
  assert.equal(revoked.compatible, false);
  assert.equal(readiness.summary.adapterBlocked, 1);
  assert.equal(readiness.summary.ready, false);
});

test("package manager lifecycle inline and ambient requests are denied", () => {
  const readiness = createRuntimePrerequisiteReadiness({ scenario: "package-manager-request" });
  const denied = new Set(readiness.packagePolicy.denials.map((entry) => entry.kind));

  for (const kind of ["package-manager-install", "lifecycle-script", "inline-script", "ambient-environment"]) {
    assert.equal(denied.has(kind), true, kind);
  }
  assert.equal(
    readiness.packagePolicy.denials.every((entry) => entry.status === "denied"),
    true
  );
  assert.equal(readiness.packagePolicy.executesCommands, false);
  assert.equal(readiness.packagePolicy.installsDependencies, false);
});

test("runtime prerequisite surface exposes scenario controls and no packaged runtime claims", () => {
  const surface = createRuntimePrerequisiteReadinessSurface({ scenario: "windows-source-checkout" });

  assert.equal(surface.controls.length >= 4, true);
  assert.equal(surface.summary.runtimeReceipts, 3);
  assert.equal(surface.boundary.noPackagedRuntimeClaim, true);
  assert.equal(surface.boundary.noSignedInstallerClaim, true);
  assert.equal(surface.boundary.noDependencyInstall, true);
  assert.doesNotMatch(JSON.stringify(surface).toLowerCase(), /signed installer|packaged runtime distribution|bundled interpreter|auto updater/u);
});

test("runtime prerequisite readiness gate proves diagnostics and no overclaiming", () => {
  const review = reviewRuntimePrerequisiteReadinessGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.hostRuntimeDetectionReceipts, true);
  assert.equal(review.checks.nonMutatingRemediation, true);
  assert.equal(review.checks.adapterCompatibilityAndRevocation, true);
  assert.equal(review.checks.packageLifecycleDenied, true);
  assert.equal(review.checks.noPackagedRuntimeClaims, true);
  assert.equal(review.checks.windowsSourceCheckoutEvidence, true);
});

test("first-run bootstrap diagnostics cover OS npm rust tauri and adapter readiness", () => {
  const readiness = createRuntimePrerequisiteReadiness({ scenario: "windows-source-checkout" });
  const diagnostics = new Map(readiness.bootstrapDiagnostics.map((entry) => [entry.kind, entry]));

  for (const kind of ["supported-os", "node", "npm", "python", "rust", "tauri", "fixed-adapter"]) {
    assert.equal(diagnostics.has(kind), true, kind);
    assert.equal(diagnostics.get(kind).receipt.source, "first-run-bootstrap-diagnostics");
    assert.equal(diagnostics.get(kind).receipt.sourceCheckout, true);
    assert.equal(diagnostics.get(kind).remediation.mutatesHost, false);
    assert.equal(diagnostics.get(kind).remediation.installsDependencies, false);
    assert.equal(diagnostics.get(kind).remediation.executableByApp, false);
  }

  assert.equal(readiness.summary.bootstrapReceipts, 7);
  assert.equal(readiness.summary.blockingDiagnostics, 0);
  assert.equal(readiness.bootstrapExport.path, "artifacts/runtime-bootstrap-diagnostics.json");
  assert.equal(readiness.bootstrapExport.redacted, true);
  assert.equal(readiness.bootstrapExport.exportable, true);
  assert.doesNotMatch(JSON.stringify(readiness.bootstrapExport), /[A-Za-z]:[\\/]|bearer\s+|sk-[A-Za-z0-9_-]{16,}|cookie=|vault:/iu);
});

test("missing rust and unsupported OS bootstrap scenarios fail closed without automatic remediation", () => {
  const missingRust = createRuntimePrerequisiteReadiness({ scenario: "missing-rust" });
  const rust = missingRust.bootstrapDiagnostics.find((entry) => entry.kind === "rust");

  assert.equal(rust.status, "blocked");
  assert.equal(rust.detected, false);
  assert.equal(missingRust.summary.ready, false);
  assert.equal(missingRust.summary.blockingDiagnostics >= 1, true);
  assert.equal(rust.remediation.userActionRequired, true);
  assert.equal(rust.remediation.mutatesHost, false);
  assert.equal(rust.remediation.installsDependencies, false);
  assert.equal(rust.remediation.executableByApp, false);
  assert.doesNotMatch(JSON.stringify(missingRust), /rustup|cargo\s+install|npm install|pip install|winget|choco|brew|sudo|powershell\s+-/iu);

  const unsupportedOs = createRuntimePrerequisiteReadiness({ scenario: "unsupported-os" });
  const os = unsupportedOs.bootstrapDiagnostics.find((entry) => entry.kind === "supported-os");

  assert.equal(os.status, "blocked");
  assert.equal(os.detected, false);
  assert.equal(unsupportedOs.sourceCheckout.platform, "unsupported");
  assert.equal(unsupportedOs.summary.ready, false);
  assert.equal(unsupportedOs.packagePolicy.executesCommands, false);
  assert.equal(unsupportedOs.packagePolicy.installsDependencies, false);
});

test("runtime prerequisite surface exposes desktop and narrow bootstrap interaction evidence", () => {
  const surface = createRuntimePrerequisiteReadinessSurface({ scenario: "missing-rust" });
  const controls = new Set(surface.controls.map((entry) => entry.scenario));
  const viewports = new Set(surface.interactionEvidence.map((entry) => entry.viewport));

  assert.equal(controls.has("missing-rust"), true);
  assert.equal(controls.has("unsupported-os"), true);
  assert.equal(
    surface.bootstrapRows.some((entry) => entry.kind === "rust" && entry.status === "blocked"),
    true
  );
  assert.equal(surface.bootstrapExport.redacted, true);
  assert.equal(viewports.has("desktop"), true);
  assert.equal(viewports.has("narrow"), true);
  assert.equal(
    surface.interactionEvidence.every((entry) => entry.stateTransition === "scenario-control-to-readiness-summary" && entry.covered === true),
    true
  );
  const surfaceText = JSON.stringify(surface);
  for (const privateMarker of [["R", "2978"].join(""), [".", "planning"].join(""), ["ref", "erence/"].join("")]) {
    assert.equal(surfaceText.includes(privateMarker), false);
  }
  assert.doesNotMatch(surfaceText, /[A-Za-z]:[\\/]|bearer\s+|sk-[A-Za-z0-9_-]{16,}|cookie=|vault:/iu);
});
