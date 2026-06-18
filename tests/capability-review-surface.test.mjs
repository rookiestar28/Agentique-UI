import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("capability review surface exposes default-deny decisions", () => {
  const app = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  for (const phrase of [
    "Permission review",
    "Capability manifest",
    "Capability review summary",
    "Default-deny capability decisions",
    "Revocation ready",
    "Review only",
    "no native permission is granted"
  ]) {
    assert.match(app, new RegExp(phrase));
  }
});

test("capability review CSS provides bounded rows and decision pills", () => {
  const css = readStyleSourceBundle();
  assert.match(css, /\.capability-list/u);
  assert.match(css, /\.capability-row/u);
  assert.match(css, /\.decision-pill/u);
  assert.match(css, /overflow-wrap: anywhere/u);
});
