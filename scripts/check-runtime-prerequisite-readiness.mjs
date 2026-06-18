#!/usr/bin/env node
import fs from "node:fs";
import { reviewRuntimePrerequisiteReadinessGate } from "../src/core/runtime-prerequisite-readiness.mjs";

const failures = [];
const review = reviewRuntimePrerequisiteReadinessGate();
const moduleText = readText("src/core/runtime-prerequisite-readiness.mjs");
const tests = readText("tests/runtime-prerequisite-readiness.test.mjs");
const contract = readText("docs/contracts/runtime-prerequisite-readiness.md");
const hook = readText("src/app-state/useRunnerWorkspaceState.ts");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const workspace = readText("src/workspaces/RunWorkspace.tsx");
const panel = readText("src/workspaces/RuntimePrerequisiteReadinessPanel.tsx");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message ?? error.code));
}

requireIncludes(
  moduleText,
  [
    "agentique.runtimePrerequisiteReadiness.v1",
    "createRuntimePrerequisiteReadiness",
    "createRuntimePrerequisiteReadinessSurface",
    "reviewRuntimePrerequisiteReadinessGate",
    "host-runtime-detection",
    "first-run-bootstrap-diagnostics",
    "bootstrapDiagnostics",
    "bootstrapExport",
    "missing-rust",
    "unsupported-os",
    "mutatesHost: false",
    "installsDependencies: false",
    "package-manager-install",
    "lifecycle-script",
    "inline-script",
    "ambient-environment",
    "noPackagedRuntimeClaim: true",
    "noSignedInstallerClaim: true"
  ],
  "runtime prerequisite readiness module"
);

requireIncludes(
  tests,
  [
    "host runtime detection receipts cover python node and native source-checkout lanes",
    "remediation messages are actionable and non-mutating",
    "adapter compatibility revocation checks fail closed",
    "package manager lifecycle inline and ambient requests are denied",
    "runtime prerequisite surface exposes scenario controls and no packaged runtime claims",
    "runtime prerequisite readiness gate proves diagnostics and no overclaiming",
    "first-run bootstrap diagnostics cover OS npm rust tauri and adapter readiness",
    "missing rust and unsupported OS bootstrap scenarios fail closed without automatic remediation",
    "runtime prerequisite surface exposes desktop and narrow bootstrap interaction evidence"
  ],
  "runtime prerequisite readiness tests"
);

requireIncludes(
  contract,
  [
    "Runtime Prerequisite Readiness",
    "host-runtime detection receipts",
    "non-mutating remediation",
    "adapter compatibility",
    "revocation",
    "First-Run Bootstrap Diagnostics",
    "Rust",
    "Tauri",
    "unsupported OS",
    "exportable",
    "package-manager install",
    "lifecycle script",
    "source-checkout"
  ],
  "runtime prerequisite readiness contract"
);

requireIncludes(
  hook,
  ["createRuntimePrerequisiteReadinessSurface", "runtimePrerequisiteReadinessSurface", "handleRuntimePrerequisiteScenario", "package-manager-request", "missing-rust"],
  "runner workspace state hook"
);
requireIncludes(route, ["runtimePrerequisiteReadinessSurface", "handleRuntimePrerequisiteScenario"], "graph/run workspace route");
requireIncludes(types, ["runtimePrerequisiteReadinessSurface", "onRuntimePrerequisiteScenario", "RuntimePrerequisiteScenario", "unsupported-os"], "run workspace prop types");
requireIncludes(workspace, ["RuntimePrerequisiteReadinessPanel", "runtimePrerequisiteReadinessSurface", "onRuntimePrerequisiteScenario"], "run workspace runtime readiness mount");
requireIncludes(
  panel,
  [
    "Runtime prerequisite readiness controls",
    "runtimePrerequisiteReadinessSurface",
    "runtimePrerequisiteReadinessSurface.controls.map",
    "onRuntimePrerequisiteScenario(control.scenario)",
    "First-run bootstrap diagnostics",
    "runtimePrerequisiteReadinessSurface.bootstrapRows",
    "runtimePrerequisiteReadinessSurface.bootstrapExport"
  ],
  "runtime prerequisite readiness panel"
);

if (!String(packageJson.scripts?.["validate:runtime-prerequisite-readiness"] ?? "").includes("check-runtime-prerequisite-readiness.mjs")) {
  failures.push("package scripts must define validate:runtime-prerequisite-readiness");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:runtime-prerequisite-readiness")) {
  failures.push("full validate script must include validate:runtime-prerequisite-readiness");
}

if (
  !review.checks.hostRuntimeDetectionReceipts ||
  !review.checks.nonMutatingRemediation ||
  !review.checks.adapterCompatibilityAndRevocation ||
  !review.checks.packageLifecycleDenied ||
  !review.checks.noPackagedRuntimeClaims ||
  !review.checks.windowsSourceCheckoutEvidence ||
  !review.checks.firstRunBootstrapDiagnostics ||
  !review.checks.missingRustFailsClosed ||
  !review.checks.unsupportedOsFailsClosed ||
  !review.checks.exportableRedactedReceipts ||
  !review.checks.surfaceInteractionEvidence
) {
  failures.push(
    "runtime prerequisite readiness gate must prove runtime diagnostics, bootstrap diagnostics, remediation, adapter readiness, package denials, no claims, source-checkout evidence, and interaction evidence"
  );
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: [
        "src/core/runtime-prerequisite-readiness.mjs",
        "tests/runtime-prerequisite-readiness.test.mjs",
        "docs/contracts/runtime-prerequisite-readiness.md",
        "src/app-state/useRunnerWorkspaceState.ts",
        "src/workspaces/RuntimePrerequisiteReadinessPanel.tsx",
        "package.json"
      ],
      summary: review.summary
    },
    null,
    2
  )
);

function readText(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}
