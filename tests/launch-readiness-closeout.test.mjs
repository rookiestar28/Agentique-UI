import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

test("launch readiness closeout validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-launch-closeout.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.ok(result.checked.includes("launch-readiness-closeout.md"));
});

test("full validation includes launch readiness closeout gate", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(packageJson.scripts.validate, /validate:launch/u);
  assert.match(packageJson.scripts["validate:launch"], /check-launch-closeout\.mjs/u);
});
