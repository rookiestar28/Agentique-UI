import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("import and verification surfaces expose proof states", () => {
  const app = [
    fs.readFileSync("src/App.tsx", "utf8"),
    fs.readFileSync("src/workspaces/routes/LibraryWorkspaceAndImportWorkspaceRoute.tsx", "utf8")
  ].join("\n");
  const importState = fs.readFileSync("src/app-state/useImportWorkspaceState.ts", "utf8");
  const importWorkspace = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  const trustWorkspace = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  for (const label of [
    "Scoped origin",
    "Cleanup state",
    "Rejected before download",
    "Validator import proof",
    "Manifest/schema",
    "No-execution validator",
    "Acquisition bridge",
    "Destination boundary",
    "No-overwrite default",
    "Atomic write",
    "Byte/digest proof",
    "Cleanup receipt",
    "Install boundary",
    "Uploader boundary",
    "submissionMode",
    "liveUploadAvailable",
    "Upload plan preview",
    "Import plan preview",
    "Variant plan preview",
    "Agent-native plan preview",
    "Draft preview",
    "Patch/delta preview",
    "No submit action",
    "workspace.import.externalIntakeLabel",
    "workspace.import.runStaticScan",
    "Load blocked sample",
    "External intake decision",
    "External intake schema",
    "Selected intake files",
    "Intake limits",
    "Intake license state",
    "Intake findings",
    "No-execution intake",
    "No-upload intake",
    "Redacted findings"
  ]) {
    assert.match(importWorkspace, new RegExp(label));
  }
  assert.match(app, /createCompanionDownloadAcquisitionPlan/u);
  assert.match(app, /createCompanionArtifactAcquisitionProof/u);
  assert.match(app, /createCompanionUploaderPreview/u);
  assert.match(importState, /scanExternalIntakeFiles/u);
  for (const label of [
    "Digest proof",
    "Provenance signer",
    "Permission posture",
    "Loading state",
    "Empty state"
  ]) {
    assert.match(trustWorkspace, new RegExp(label));
  }
});

test("proof surfaces use responsive grids without unsafe rendering", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const css = readStyleSourceBundle();
  assert.doesNotMatch(app, /dangerouslySetInnerHTML/u);
  assert.match(css, /\.proof-ledger/u);
  assert.match(css, /\.trust-summary/u);
  assert.match(css, /overflow-wrap: anywhere/u);
});
