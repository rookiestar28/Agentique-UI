#!/usr/bin/env node
import fs from "node:fs";
import { reviewArtifactReceiptBindingGate } from "../src/core/artifact-receipt-binding.mjs";

const failures = [];
const review = reviewArtifactReceiptBindingGate();
const moduleText = readText("src/core/artifact-receipt-binding.mjs");
const tests = readText("tests/artifact-receipt-binding.test.mjs");
const contract = readText("docs/contracts/artifact-receipt-binding.md");
const hook = readText("src/app-state/useRunnerWorkspaceState.ts");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const workspace = readText("src/workspaces/RunWorkspace.tsx");
const panel = readText("src/workspaces/ArtifactReceiptViewerPanel.tsx");
const packageJson = JSON.parse(readText("package.json"));

if (!review.ok) {
  failures.push(...review.errors.map((error) => error.message ?? error.code));
}

requireIncludes(
  moduleText,
  [
    "agentique.artifactReceiptBinding.v1",
    "createArtifactReceiptBinding",
    "createArtifactReceiptViewerSurface",
    "reviewArtifactReceiptBindingGate",
    "retain-until-cleanup",
    "sandbox-required",
    "metadata-only",
    "noGenericFilesystemBrowser: true",
    "noRawArtifactBytes: true",
    "noScriptExecution: true",
    "noBrowserDataAccess: true",
    "noAmbientEnvironmentForwarding: true"
  ],
  "artifact receipt binding module"
);

requireIncludes(
  tests,
  [
    "artifact receipts bind run identity digest size mime retention and cleanup",
    "approved low-risk viewer families render only safe redacted previews",
    "risky viewer families are metadata-only or sandbox-required",
    "artifact states cover success failure canceled and cleanup-required evidence",
    "artifact receipt binding rejects traversal local paths and sensitive material",
    "artifact receipt binding gate proves receipt policy and no capability widening"
  ],
  "artifact receipt binding tests"
);

requireIncludes(
  contract,
  ["Artifact Receipt Binding", "run identity", "digest", "MIME", "retention", "cleanup state", "safe previews", "metadata-only", "sandbox-required", "path traversal"],
  "artifact receipt binding contract"
);

requireIncludes(hook, ["createArtifactReceiptViewerSurface", "artifactReceiptViewerSurface", "handleArtifactReceiptScenario", "cleanup-required"], "runner workspace state hook");
requireIncludes(route, ["artifactReceiptViewerSurface", "handleArtifactReceiptScenario"], "graph/run workspace route");
requireIncludes(types, ["artifactReceiptViewerSurface", "onArtifactReceiptScenario", "ArtifactReceiptScenario"], "run workspace prop types");
requireIncludes(workspace, ["ArtifactReceiptViewerPanel", "artifactReceiptViewerSurface", "onArtifactReceiptScenario"], "run workspace artifact receipt mount");
requireIncludes(
  panel,
  ["Artifact receipt viewer controls", "artifactReceiptViewerSurface", "artifactReceiptViewerSurface.controls.map", "onArtifactReceiptScenario(control.scenario)"],
  "artifact receipt viewer panel"
);

if (!String(packageJson.scripts?.["validate:artifact-receipt-binding"] ?? "").includes("check-artifact-receipt-binding.mjs")) {
  failures.push("package scripts must define validate:artifact-receipt-binding");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:artifact-receipt-binding")) {
  failures.push("full validate script must include validate:artifact-receipt-binding");
}

if (
  !review.checks.runIdentityBound ||
  !review.checks.digestSizeMimeRetention ||
  !review.checks.safePreviewPolicy ||
  !review.checks.riskyFamiliesRestricted ||
  !review.checks.cleanupAwareStates ||
  !review.checks.unsafeReceiptsRejected ||
  !review.checks.noCapabilityWidening
) {
  failures.push("artifact receipt binding gate must prove run binding, digest/size/MIME/retention, viewer policy, cleanup states, unsafe rejection, and no capability widening");
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
        "src/core/artifact-receipt-binding.mjs",
        "tests/artifact-receipt-binding.test.mjs",
        "docs/contracts/artifact-receipt-binding.md",
        "src/app-state/useRunnerWorkspaceState.ts",
        "src/workspaces/ArtifactReceiptViewerPanel.tsx",
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
