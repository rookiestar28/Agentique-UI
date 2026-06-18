import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

test("visual redesign validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-visual-redesign.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
});

test("visual evidence references desktop and mobile captures", () => {
  const text = fs.readFileSync("docs/validation/visual-regression-evidence.md", "utf8");
  assert.match(text, /Desktop viewport/u);
  assert.match(text, /Mobile viewport/u);
  assert.match(text, /automatic arbitrary-resource execution capability/u);
});
