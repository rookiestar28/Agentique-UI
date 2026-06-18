import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildPayloadBudgets,
  buildPayloadBudgetSchemaVersion,
  collectBuildPayloadReport,
  validateBuildPayloadReport
} from "../src/core/build-payload-budget.mjs";

test("build payload budget validates current dist artifacts when present", () => {
  const report = collectBuildPayloadReport();
  const validation = validateBuildPayloadReport(report);

  if (!report.measured) {
    assert.equal(validation.ok, false);
    assert.ok(validation.failures.some((failure) => failure.code === "dist-assets-missing"));
    return;
  }

  assert.equal(validation.ok, true, JSON.stringify(validation.failures));
  assert.equal(report.sourceMapPolicy.explicit, true);
  assert.equal(report.sourceMapPolicy.localInspection, true);
  assert.equal(report.sourceMapPolicy.sourcemapBoundToPolicy, true);
  assert.ok(report.summary.javascriptFiles >= buildPayloadBudgets.minJavaScriptChunks);
  assert.ok(report.summary.largestJavaScriptBytes <= buildPayloadBudgets.largestJavaScriptBytes);
  assert.ok(report.summary.largestImageBytes <= buildPayloadBudgets.largestImageBytes);
});

test("build payload validator fails closed on oversized assets", () => {
  const oversized = {
    schemaVersion: buildPayloadBudgetSchemaVersion,
    measured: true,
    distAssetsPath: "dist/assets",
    budgets: { ...buildPayloadBudgets },
    sourceMapPolicy: {
      explicit: true,
      localInspection: true,
      sourcemapBoundToPolicy: true
    },
    files: [
      { name: "index.js", path: "dist/assets/index.js", bytes: buildPayloadBudgets.largestJavaScriptBytes + 1, kind: "javascript" },
      { name: "logo-large.png", path: "dist/assets/logo-large.png", bytes: buildPayloadBudgets.largestImageBytes + 1, kind: "image" },
      { name: "index.css", path: "dist/assets/index.css", bytes: buildPayloadBudgets.largestCssBytes, kind: "css" },
      { name: "index.js.map", path: "dist/assets/index.js.map", bytes: buildPayloadBudgets.largestSourceMapBytes, kind: "sourcemap" }
    ],
    summary: {
      totalBytes: 1,
      javascriptFiles: 1,
      cssFiles: 1,
      imageFiles: 1,
      sourcemapFiles: 1,
      largestJavaScriptBytes: buildPayloadBudgets.largestJavaScriptBytes + 1,
      largestImageBytes: buildPayloadBudgets.largestImageBytes + 1,
      largestCssBytes: buildPayloadBudgets.largestCssBytes,
      largestSourceMapBytes: buildPayloadBudgets.largestSourceMapBytes
    }
  };
  const validation = validateBuildPayloadReport(oversized);

  assert.equal(validation.ok, false);
  assert.ok(validation.failures.some((failure) => failure.code === "javascript-chunk-count"));
  assert.ok(validation.failures.some((failure) => failure.code === "largest-javascript"));
  assert.ok(validation.failures.some((failure) => failure.code === "largest-image"));
  assert.ok(validation.failures.some((failure) => failure.code === "legacy-logo-image"));
});

test("build payload budget is wired into package validation after build", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const validateScript = String(packageJson.scripts?.validate ?? "");
  assert.ok(String(packageJson.scripts?.["validate:build-payload-budget"] ?? "").includes("check-build-payload-budget.mjs"));
  assert.ok(validateScript.includes("npm run build && npm run validate:build-payload-budget && npm test"));
});
