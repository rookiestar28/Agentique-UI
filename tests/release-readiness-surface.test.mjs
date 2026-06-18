import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("settings page exposes distribution readiness blockers", () => {
  const app = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  for (const phrase of [
    "settings.release.caption",
    "settings.release.heading",
    "settings.release.summaryLabel",
    "settings.release.blockersLabel",
    "settings.release.noInstallerClaimTitle",
    "settings.release.noInstallerClaimBody"
  ]) {
    assert.match(app, new RegExp(phrase));
  }
});
