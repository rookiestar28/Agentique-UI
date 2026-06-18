import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("session surface exposes local run draft lifecycle", () => {
  const app = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  for (const phrase of [
    "Local run draft",
    "Local session summary",
    "Preview validation dry-run handoff log artifact cleanup timeline",
    "Local-only session record",
    "No cloud session is required",
    "failure records stay redacted"
  ]) {
    assert.match(app, new RegExp(phrase));
  }
});

test("session CSS uses bounded timeline rows", () => {
  const css = readStyleSourceBundle();
  assert.match(css, /\.session-ledger/u);
  assert.match(css, /\.session-timeline/u);
  assert.match(css, /grid-template-columns: 96px minmax\(0, 1fr\)/u);
});
