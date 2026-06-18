import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

test("visual design system gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-visual-design-system.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
});

test("visual design decision stays dependency-light", () => {
  const decision = fs.readFileSync("docs/decisions/visual-design-system.md", "utf8");
  assert.match(decision, /No new visual dependency is added/u);
  assert.match(decision, /automatic arbitrary-resource execution capability/u);
});
