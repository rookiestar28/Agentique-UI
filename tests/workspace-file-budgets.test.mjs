import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  collectWorkspaceFileBudgetReport,
  reviewWorkspaceFileBudgets,
  validateWorkspaceFileBudgetReport,
  workspaceFileBudgets
} from "../src/core/workspace-file-budgets.mjs";

test("workspace file budgets pass for split workspace modules", () => {
  const { report, validation } = reviewWorkspaceFileBudgets();
  assert.equal(validation.ok, true, JSON.stringify(validation.failures));

  const files = new Map(report.files.map((file) => [file.path, file]));
  assert.ok(files.get("src/workspaces/TrustRunSettingsWorkspaces.tsx").lines <= 40);
  assert.ok(files.get("src/workspaces/LibraryImportWorkspaces.tsx").lines <= 40);
  assert.ok(files.get("src/workspaces/RunWorkspace.tsx").lines <= 950);
  assert.ok(files.get("src/workspaces/GraphWorkspace.tsx").lines <= 760);
  assert.ok(files.get("src/workspaces/ImportWorkspace.tsx").lines <= 540);
});

test("workspace budget validator fails closed on file growth", () => {
  const report = collectWorkspaceFileBudgetReport();
  const grown = {
    ...report,
    files: report.files.map((file) => (
      file.path === "src/workspaces/RunWorkspace.tsx"
        ? { ...file, lines: file.maxLines + 1 }
        : file
    ))
  };
  const validation = validateWorkspaceFileBudgetReport(grown);

  assert.equal(validation.ok, false);
  assert.ok(validation.failures.some((failure) => failure.code === "budget-exceeded"));
});

test("aggregate workspace files stay lightweight re-export shims", () => {
  const report = collectWorkspaceFileBudgetReport();
  for (const shim of report.aggregateShims) {
    assert.equal(shim.exists, true);
    assert.equal(shim.requiredPhrasesPresent, true);
    assert.deepEqual(shim.forbiddenPatternMatches, []);
  }
});

test("workspace budget validation is wired into the package validation chain", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.ok(String(packageJson.scripts?.["validate:workspace-file-budgets"] ?? "").includes("check-workspace-file-budgets.mjs"));
  assert.ok(String(packageJson.scripts?.validate ?? "").includes("validate:workspace-file-budgets"));
  assert.ok(workspaceFileBudgets.length >= 10);
});
