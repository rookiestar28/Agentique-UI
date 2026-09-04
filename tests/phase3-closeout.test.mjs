import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

test("controlled execution foundation closeout validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-phase3-closeout.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.ok(result.checked.includes("phase3-closeout.md"));
});

test("full validation includes the controlled execution closeout gate", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(packageJson.scripts.validate, /validate:phase3/u);
});
