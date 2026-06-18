import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  expectedStyleImports,
  readStyleSourceBundle,
  reviewStyleSourceBoundary,
  validateStyleSourceBoundary
} from "../src/core/style-source-boundary.mjs";

test("style source boundary splits the CSS monolith into budgeted shards", () => {
  const report = reviewStyleSourceBoundary();

  assert.equal(report.ok, true, JSON.stringify(report.failures));
  assert.deepEqual(report.manifest.imports, expectedStyleImports);
  assert.ok(report.manifest.lines <= report.manifest.maxLines);
  assert.equal(report.shards.length, expectedStyleImports.length);
  for (const shard of report.shards) {
    assert.ok(shard.lines <= shard.maxLines, `${shard.path} exceeds ${shard.maxLines} lines`);
  }
  assert.ok(report.bundle.lines >= 3000);
  assert.equal(report.bundle.stylelintDependencyStatus, "deferred-to-lint-baseline");
});

test("style source bundle preserves layout and responsive anchors", () => {
  const css = readStyleSourceBundle();

  for (const anchor of [
    ".workspace-page",
    ".workspace-section",
    ".workflow-canvas",
    ".runner-control-panel",
    "focus-visible",
    "prefers-reduced-motion: reduce",
    "@media (max-width: 840px)",
    "overflow-wrap: anywhere",
    "text-overflow: ellipsis",
    "min-height: 44px"
  ]) {
    assert.match(css, new RegExp(escapeRegExp(anchor), "u"), `missing CSS anchor: ${anchor}`);
  }
});

test("style source boundary fails closed on monolith regression", () => {
  const report = reviewStyleSourceBoundary();
  const invalid = {
    ...report,
    manifest: {
      ...report.manifest,
      lines: report.manifest.maxLines + 1
    }
  };
  const validation = validateStyleSourceBoundary(invalid);

  assert.equal(validation.ok, false);
  assert.ok(validation.failures.some((failure) => failure.code === "manifest-lines"));
});

test("style source boundary is wired into package validation", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

  assert.equal(packageJson.scripts["validate:style-source-boundary"], "node scripts/check-style-source-boundary.mjs");
  assert.match(packageJson.scripts.validate, /validate:style-source-boundary/u);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
