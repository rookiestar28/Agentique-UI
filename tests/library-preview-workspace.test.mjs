import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readStyleSourceBundle } from "../src/core/style-source-boundary.mjs";

test("library workspace exposes versioned proof badges", () => {
  const workspace = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  for (const label of [
    "workspace.library.proofSummary",
    "versioned record",
    "installState.status",
    "digest-code",
    "badge success",
    "resource-browser",
    "resource-detail",
    "Acquisition proof",
    "Acquisition target"
  ]) {
    assert.match(workspace, new RegExp(label));
  }
});

test("safe preview workspace remains static inspection only", () => {
  const workspace = fs.readFileSync("src/workspaces/PreviewHandoffWorkspaces.tsx", "utf8");
  const catalog = fs.readFileSync("src/i18n/catalogs/en.mjs", "utf8");
  for (const label of ["workspace.preview.note", "workspace.preview.staticFileTree"]) {
    assert.match(workspace, new RegExp(label));
  }
  for (const phrase of ["no resource code", "media bytes", "local paths"]) {
    assert.match(catalog, new RegExp(phrase));
  }
  assert.doesNotMatch(workspace, /dangerouslySetInnerHTML/u);
});

test("library and preview CSS constrain overflow on small screens", () => {
  const css = readStyleSourceBundle();
  assert.match(css, /\.table-scroll/u);
  assert.match(css, /overflow-x: auto/u);
  assert.match(css, /\.resource-browser/u);
  assert.match(css, /\.resource-detail/u);
  assert.match(css, /\.preview-workspace/u);
  assert.match(css, /text-overflow: ellipsis/u);
});
