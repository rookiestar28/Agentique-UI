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

test("launch closeout document preserves release evidence boundary", () => {
  const text = fs.readFileSync("docs/validation/launch-readiness-closeout.md", "utf8");
  for (const phrase of [
    "release remains evidence-gated",
    "Workflow graph editor contract",
    "External runtime handoff contract",
    "Agent-client handoff contract",
    "Adapter registry contract",
    "Distribution readiness gate",
    "Production desktop runtime",
    "npm run validate"
  ]) {
    assert.match(text, new RegExp(escapeRegExp(phrase), "u"));
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
