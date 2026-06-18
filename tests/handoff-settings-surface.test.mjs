import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("handoff surface exposes review-only descriptor state", () => {
  const workspace = fs.readFileSync("src/workspaces/PreviewHandoffWorkspaces.tsx", "utf8");
  for (const label of [
    "workspace.handoff.descriptorReview",
    "Not executed",
    "Starts bridge",
    "Writes outside selection",
    "Reversible cleanup",
    "workspace.handoff.agentClientCaption",
    "workspace.handoff.agentClientTitle",
    "Agent client handoff summary",
    "Agent client action plan",
    "Local bridge stays disabled",
    "workspace.handoff.externalRuntimeCaption",
    "workspace.handoff.externalRuntimeTitle",
    "External runtime handoff summary",
    "External runtime compatibility report",
    "No external runtime execution"
  ]) {
    assert.match(workspace, new RegExp(label));
  }
});

test("settings surface exposes no-permission and fail-closed posture", () => {
  const app = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  for (const label of [
    "settings.permissionHeading",
    "settings.permissionPostureLabel",
    "settings.release.heading",
    "settings.vault.secretValuesTitle"
  ]) {
    assert.match(app, new RegExp(label));
  }
});

test("handoff and settings CSS use bounded grids", () => {
  const css = readStyleSourceBundle();
  assert.match(css, /\.descriptor-review/u);
  assert.match(css, /\.field-list/u);
  assert.match(css, /\.fail-closed/u);
  assert.match(css, /grid-template-columns: repeat\(2/u);
});
