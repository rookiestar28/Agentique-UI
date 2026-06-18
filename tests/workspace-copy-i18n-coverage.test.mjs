import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const workspaceSources = [
  ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n"),
  fs.readFileSync("src/workspaces/PreviewHandoffWorkspaces.tsx", "utf8"),
  ["src/workspaces/GraphWorkspace.tsx", "src/workspaces/GraphWorkspaceModel.ts"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n"),
  [
    "src/workspaces/TrustRunSettingsWorkspaces.tsx",
    "src/workspaces/TrustRunSettingsTypes.ts",
    "src/workspaces/VerifyWorkspace.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/AdapterRegistryTrustPanel.tsx",
    "src/workspaces/SettingsWorkspace.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n")
].join("\n");

test("workspace copy coverage validator is wired into validation", () => {
  assert.match(String(packageJson.scripts?.["validate:i18n-workspace-copy"] ?? ""), /check-i18n-workspace-copy\.mjs/u);
  assert.match(String(packageJson.scripts?.validate ?? ""), /validate:i18n-workspace-copy/u);
  assert.equal(fs.existsSync("scripts/check-i18n-workspace-copy.mjs"), true);
  assert.equal(fs.existsSync("src/i18n/workspace-copy-boundary.mjs"), true);
});

test("workspace copy boundary documents untranslated literal categories", async () => {
  const { workspaceCopyBoundary } = await import("../src/i18n/workspace-copy-boundary.mjs");
  assert.equal(Array.isArray(workspaceCopyBoundary.files), true);
  assert.equal(workspaceCopyBoundary.files.length >= 4, true);

  const categories = new Set(workspaceCopyBoundary.files.flatMap((entry) => entry.literals.map((literal) => literal.category)));
  for (const category of ["runtime-evidence", "sample-data", "technical-token", "imported-content"]) {
    assert.equal(categories.has(category), true, `missing category ${category}`);
  }
});

test("workspace page-level copy is catalog-backed", () => {
  for (const messageId of [
    "workspace.library.caption",
    "workspace.library.title",
    "workspace.import.caption",
    "workspace.import.title",
    "workspace.preview.caption",
    "workspace.preview.note",
    "workspace.handoff.caption",
    "workspace.handoff.descriptorReview",
    "workspace.graph.caption",
    "workspace.graph.title",
    "workspace.graph.canvasLabel",
    "workspace.verify.caption",
    "workspace.verify.title",
    "workspace.run.caption",
    "workspace.run.title"
  ]) {
    assert.match(workspaceSources, new RegExp(`t\\("${escapeRegExp(messageId)}"`, "u"));
  }
});

test("workspace copy coverage validator passes the current source contract", () => {
  const output = execFileSync(process.execPath, ["scripts/check-i18n-workspace-copy.mjs"], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.status, "passed");
  assert.equal(report.checkedFiles >= 4, true);
  assert.equal(report.catalogBacked > 0, true);
  assert.equal(report.documentedUntranslated > 0, true);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
