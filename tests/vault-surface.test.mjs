import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("vault surface exposes reference-only redaction posture", () => {
  const app = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  for (const phrase of [
    "settings.vault.heading",
    "settings.vault.summaryLabel",
    "settings.vault.listLabel",
    "settings.vault.screenshotsRedacted",
    "settings.vault.exportsRedacted",
    "settings.vault.secretValuesTitle"
  ]) {
    assert.match(app, new RegExp(phrase));
  }
});

test("vault CSS uses bounded rows and summaries", () => {
  const css = readStyleSourceBundle();
  assert.match(css, /\.vault-summary/u);
  assert.match(css, /\.vault-list/u);
  assert.match(css, /\.vault-row/u);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) auto/u);
});
