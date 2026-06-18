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

test("controlled execution closeout maps security and claim boundaries", () => {
  const text = fs.readFileSync("docs/validation/phase3-closeout.md", "utf8");
  for (const phrase of [
    "Adapter pack trust policy",
    "Python sidecar launch plan",
    "Node sidecar package lifecycle boundary",
    "Permission audit engine",
    "Run folder manifest",
    "No direct process spawn from the web layer",
    "does not introduce a released installer",
    "npm run validate"
  ]) {
    assert.match(text, new RegExp(escapeRegExp(phrase), "u"));
  }
});

test("full validation includes the controlled execution closeout gate", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(packageJson.scripts.validate, /validate:phase3/u);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
