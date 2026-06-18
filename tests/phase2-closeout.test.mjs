import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

test("local visual runner closeout validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-phase2-closeout.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.ok(result.checked.includes("phase2-closeout.md"));
});

test("local visual runner closeout maps outcome validation and visual limitation", () => {
  const text = fs.readFileSync("docs/validation/phase2-closeout.md", "utf8");
  for (const phrase of [
    "Capability permission review",
    "Typed configuration drafts",
    "Local secret references",
    "Workflow graph map",
    "Validate-only dry-run report",
    "Side effects remain empty",
    "Visual Evidence Limitation",
    "npm run validate"
  ]) {
    assert.match(text, new RegExp(escapeRegExp(phrase), "u"));
  }
});

test("local visual runner closeout does not claim runtime release capability", () => {
  const text = fs.readFileSync("docs/validation/phase2-closeout.md", "utf8");
  assert.match(text, /does not introduce a released installer/u);
  assert.match(text, /production desktop runtime/u);
  assert.match(text, /generic sidecar runtime/u);
  assert.doesNotMatch(text, /production-ready desktop runtime/iu);
});

test("full validation includes the local visual runner closeout gate", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(packageJson.scripts.validate, /validate:phase2/u);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
