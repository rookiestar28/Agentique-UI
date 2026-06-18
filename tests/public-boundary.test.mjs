import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("public boundary scan passes for repository text files", () => {
  const output = execFileSync(process.execPath, ["scripts/check-public-boundary.mjs"], {
    encoding: "utf8"
  });
  const report = JSON.parse(output);
  assert.equal(report.status, "passed");
  assert.ok(report.checkedFiles > 0);
});
