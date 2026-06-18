import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("validate-only dry-run surface exposes failure report without execution claims", () => {
  const app = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  for (const phrase of [
    "Validate-only",
    "Dry-run report",
    "Schema Capability Compatibility Dependency Missing-secret Unsupported-node Artifact-contract",
    "Side effects remain empty",
    "Failures are redacted before display",
    "No adapter start, file write, network fetch, or shell command is performed"
  ]) {
    assert.match(app, new RegExp(phrase));
  }
});

test("dry-run CSS provides bounded status and failure layouts", () => {
  const css = readStyleSourceBundle();
  assert.match(css, /\.dry-run-state/u);
  assert.match(css, /\.dry-run-checks/u);
  assert.match(css, /\.dry-run-failures/u);
  assert.match(css, /grid-template-columns: repeat\(4/u);
});
