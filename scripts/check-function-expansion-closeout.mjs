#!/usr/bin/env node
import fs from "node:fs";
import { createFunctionExpansionCloseoutReview, reviewFunctionExpansionCloseoutGate } from "../src/core/function-expansion-closeout.mjs";

const failures = [];
const moduleText = readText("src/core/function-expansion-closeout.mjs");
const tests = readText("tests/function-expansion-closeout.test.mjs");
const surfaceTests = readText("tests/function-expansion-closeout-surface.test.mjs");
const docs = readText("docs/validation/function-expansion-closeout.md");
const panel = readText("src/workspaces/FunctionExpansionCloseoutPanel.tsx");
const runWorkspace = readText("src/workspaces/RunWorkspace.tsx");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const packageJson = JSON.parse(readText("package.json"));
const review = createFunctionExpansionCloseoutReview();
const gate = reviewFunctionExpansionCloseoutGate();
const privatePlanMarker = ["\\.", "planning"].join("");
const privateReferenceDocsMarker = ["reference", "\\/", "docs"].join("");
const unsafePublicMarkerPattern = new RegExp(`\\bR\\d{4}\\b|${privatePlanMarker}|${privateReferenceDocsMarker}|[A-Za-z]:[\\\\/]`, "u");

requireIncludes(
  moduleText,
  [
    "agentique.functionExpansionCloseout.v1",
    "function-expansion-roadmap-filing",
    "diagnostics-support-bundle",
    "portable-profile-taxonomy",
    "generated-adapter-drift-status",
    "graph-block-ir-readback",
    "credential-reference-boundary",
    "externalProviderAutomation",
    "assertFunctionExpansionCloseoutSafe"
  ],
  "function expansion closeout module"
);

requireIncludes(
  tests,
  [
    "function expansion closeout accepts the completed local-only chain",
    "feature family rows are accepted and use path-neutral evidence",
    "portability drift and profile requirements are mapped",
    "graph block run workspace and credential requirements are mapped",
    "validation evidence and claim sync are required",
    "release runtime and automation claims remain blocked",
    "public safety rejects internal markers and unsafe evidence refs",
    "function expansion closeout gate proves accepted and blocked paths"
  ],
  "function expansion closeout tests"
);

requireIncludes(
  surfaceTests,
  [
    "run surface exposes function expansion closeout evidence",
    "function expansion closeout surfaces avoid runtime effects",
    "Function expansion closeout",
    "Claim sync review",
    "No-Go claims"
  ],
  "function expansion closeout surface tests"
);

requireIncludes(
  docs,
  [
    "Function Expansion Closeout",
    "source-first supported-local-only",
    "Portability, drift, and profile mapping",
    "Graph, block, and runtime handoff mapping",
    "No-Go claims",
    "Passing this closeout does not publish"
  ],
  "function expansion closeout docs"
);

requireIncludes(
  panel,
  ["Function expansion closeout", "Claim sync review", "Accepted evidence families", "Portability drift profile mapping", "Graph block runtime handoff", "No-Go claims"],
  "function expansion closeout panel"
);

requireIncludes(runWorkspace, ["FunctionExpansionCloseoutPanel", "functionExpansionCloseout"], "Run workspace function expansion closeout wiring");
requireIncludes(
  route,
  ["createFunctionExpansionCloseoutReview", "reviewFunctionExpansionCloseoutGate", "functionExpansionCloseout"],
  "Run route function expansion closeout wiring"
);
requireIncludes(types, ["functionExpansionCloseout: AnyRecord"], "workspace props");

const closeoutSurface = [panel, runWorkspace, route, types].join("\n");
const forbiddenRuntime =
  /@tauri-apps\/plugin-fs|@tauri-apps\/plugin-store|@tauri-apps\/plugin-sql|@tauri-apps\/plugin-stronghold|node:fs|writeFile|appendFile|createWriteStream|readFile|process\.env|localStorage\s*[.:]|document\.cookie|storageState\s*[:(]|fetch\(|WebSocket\(|invoke\(|Command\.create|new\s+Command/u;
if (forbiddenRuntime.test(closeoutSurface)) {
  failures.push("function expansion closeout surfaces must stay review-only and avoid file, network, native, env, cookie, or browser-state APIs");
}

if (!review.ok || review.status !== "accepted" || review.summary.acceptedFeatureFamilies !== 19 || review.summary.noGoClaimsBlocked !== true) {
  failures.push("function expansion closeout review must accept the completed local-only chain and keep no-go claims blocked");
}

if (
  !gate.ok ||
  !gate.missingFeatureBlocked ||
  !gate.missingPortabilityBlocked ||
  !gate.missingGraphBlockBlocked ||
  !gate.validationEvidenceBlocked ||
  !gate.overclaimBlocked ||
  !gate.unsafeReferenceBlocked
) {
  failures.push("function expansion closeout gate must prove missing rows, validation gaps, overclaims, and unsafe refs are blocked");
}

if (!String(packageJson.scripts?.["validate:function-expansion-closeout"] ?? "").includes("check-function-expansion-closeout.mjs")) {
  failures.push("package scripts must define validate:function-expansion-closeout");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:function-expansion-closeout")) {
  failures.push("validate script must include validate:function-expansion-closeout");
}

if (unsafePublicMarkerPattern.test(docs)) {
  failures.push("public function expansion closeout doc must not contain internal markers or local paths");
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
        "src/core/function-expansion-closeout.mjs",
        "tests/function-expansion-closeout.test.mjs",
        "tests/function-expansion-closeout-surface.test.mjs",
        "src/workspaces/FunctionExpansionCloseoutPanel.tsx",
        "src/workspaces/RunWorkspace.tsx",
        "docs/validation/function-expansion-closeout.md"
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
