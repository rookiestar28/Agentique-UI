import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

test("rebuilt workspace closeout validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-rebuilt-workspace-closeout.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.ok(result.checked.includes("docs/validation/rebuilt-workspace-closeout.md"));
});

test("rebuilt workspace closeout preserves public release boundary", () => {
  const text = fs.readFileSync("docs/validation/rebuilt-workspace-closeout.md", "utf8");
  assert.match(text, /Graph canvas/u);
  assert.match(text, /npm run validate/u);
  assert.match(text, /No installer, updater, production desktop runtime/u);
  assert.doesNotMatch(text, /\bsigned updater is available\b/iu);
  assert.doesNotMatch(text, /\bautomatic workflow execution is supported\b/iu);
});

test("full validation includes rebuilt workspace closeout gate", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(packageJson.scripts.validate, /validate:rebuilt-workspace-closeout/u);
  assert.match(packageJson.scripts["validate:rebuilt-workspace-closeout"], /check-rebuilt-workspace-closeout\.mjs/u);
});
