#!/usr/bin/env node
import fs from "node:fs";
import { createDiagnosticsSupportBundleReview, reviewDiagnosticsSupportBundleGate } from "../src/core/diagnostics-support-bundle.mjs";

const failures = [];
const moduleText = readText("src/core/diagnostics-support-bundle.mjs");
const tests = readText("tests/diagnostics-support-bundle.test.mjs");
const surfaceTests = readText("tests/diagnostics-support-bundle-surface.test.mjs");
const docs = readText("docs/contracts/diagnostics-support-bundle.md");
const panel = readText("src/workspaces/DiagnosticsSupportBundlePanel.tsx");
const runWorkspace = readText("src/workspaces/RunWorkspace.tsx");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const packageJson = JSON.parse(readText("package.json"));
const review = createDiagnosticsSupportBundleReview();
const gate = reviewDiagnosticsSupportBundleGate();

requireIncludes(
  moduleText,
  [
    "agentique.diagnosticsSupportBundle.v1",
    "descriptor-only",
    "version-status-only",
    "raw-artifact-bytes",
    "storage-state",
    "runtime-overclaim",
    "assertDiagnosticsSupportBundleSafe"
  ],
  "diagnostics support bundle module"
);

requireIncludes(
  tests,
  [
    "diagnostics support bundle review exports bounded metadata only",
    "unsafe diagnostics materials fail closed",
    "credential references and artifact rows stay redacted",
    "support bundle gate proves unsafe samples are blocked"
  ],
  "diagnostics support bundle tests"
);

requireIncludes(
  surfaceTests,
  [
    "run surface exposes diagnostics support bundle evidence",
    "diagnostics support bundle surfaces avoid runtime effects",
    "Diagnostics support bundle",
    "Redacted support export",
    "Denied support materials",
    "Blocked unsafe support samples"
  ],
  "diagnostics support bundle surface tests"
);

requireIncludes(
  docs,
  ["Diagnostics Support Bundle Contract", "descriptor-only", "bounded metadata", "version and status facts", "does not write, upload, or open a support ticket"],
  "diagnostics support bundle docs"
);

requireIncludes(
  panel,
  [
    "Diagnostics support bundle",
    "Redacted support export",
    "Bundle contents",
    "Environment summary",
    "Validation summary",
    "Run and cleanup evidence",
    "Adapter drift and compatibility",
    "Credential reference summary",
    "Denied support materials",
    "Blocked unsafe support samples"
  ],
  "diagnostics support bundle panel"
);

requireIncludes(runWorkspace, ["DiagnosticsSupportBundlePanel", "diagnosticsSupportBundle"], "Run workspace diagnostics support bundle wiring");
requireIncludes(route, ["createDiagnosticsSupportBundleReview", "reviewDiagnosticsSupportBundleGate", "diagnosticsSupportBundle"], "Run route diagnostics support bundle wiring");
requireIncludes(types, ["diagnosticsSupportBundle: AnyRecord"], "workspace props");

const supportSurface = [panel, runWorkspace, route, types].join("\n");
const forbiddenRuntime =
  /@tauri-apps\/plugin-fs|@tauri-apps\/plugin-store|@tauri-apps\/plugin-sql|@tauri-apps\/plugin-stronghold|node:fs|writeFile|appendFile|createWriteStream|readFile|process\.env|localStorage\s*[.:]|document\.cookie|storageState\s*[:(]|fetch\(|WebSocket\(|invoke\(|Command\.create|new\s+Command/u;
if (forbiddenRuntime.test(supportSurface)) {
  failures.push("diagnostics support bundle surfaces must stay review-only and avoid file, network, native, env, cookie, or browser-state APIs");
}

if (!review.ok || review.status !== "ready" || review.identity.exportMode !== "descriptor-only" || review.identity.willUpload !== false) {
  failures.push("diagnostics support bundle review must produce a ready descriptor-only non-upload export");
}

if (!gate.ok || !gate.rawLogBlocked || !gate.rawArtifactBytesBlocked || !gate.unsafeEnvironmentBlocked || !gate.unsupportedAuthorityBlocked || !gate.internalMarkerBlocked) {
  failures.push("diagnostics support bundle gate must prove unsafe raw, local, authority, and internal-marker samples are blocked");
}

if (!String(packageJson.scripts?.["validate:diagnostics-support-bundle"] ?? "").includes("check-diagnostics-support-bundle.mjs")) {
  failures.push("package scripts must define validate:diagnostics-support-bundle");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:diagnostics-support-bundle")) {
  failures.push("validate script must include validate:diagnostics-support-bundle");
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
        "src/core/diagnostics-support-bundle.mjs",
        "tests/diagnostics-support-bundle.test.mjs",
        "tests/diagnostics-support-bundle-surface.test.mjs",
        "src/workspaces/DiagnosticsSupportBundlePanel.tsx",
        "src/workspaces/RunWorkspace.tsx",
        "docs/contracts/diagnostics-support-bundle.md"
      ],
      summary: gate.summary
    },
    null,
    2
  )
);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}
