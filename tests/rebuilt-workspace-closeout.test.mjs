import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("full validation includes rebuilt workspace closeout gate", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(packageJson.scripts.validate, /validate:rebuilt-workspace-closeout/u);
  assert.match(packageJson.scripts["validate:rebuilt-workspace-closeout"], /check-rebuilt-workspace-closeout\.mjs/u);
});
