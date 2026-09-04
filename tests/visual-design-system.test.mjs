import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("visual design system gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-visual-design-system.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
});
