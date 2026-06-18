import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("UI Lite closeout validation script passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-ui-lite-closeout.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.ok(result.checked.includes("ui-lite-closeout.md"));
});
