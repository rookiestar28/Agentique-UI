import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("config draft surface exposes typed renderer and redacted export", () => {
  const app = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  for (const phrase of [
    "settings.config.caption",
    "settings.config.heading",
    "settings.config.draftLabel",
    "settings.config.resetDraft",
    "settings.config.importDraft",
    "settings.config.exportRedactedDraft",
    "Config diff and redaction",
    "settings.config.invalidSchemaTitle"
  ]) {
    assert.match(app, new RegExp(phrase));
  }
});

test("config draft CSS uses bounded responsive fields", () => {
  const css = readStyleSourceBundle();
  assert.match(css, /\.config-fields/u);
  assert.match(css, /\.config-field/u);
  assert.match(css, /\.config-actions/u);
  assert.match(css, /overflow-wrap: anywhere/u);
});
