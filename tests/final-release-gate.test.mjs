import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { readFinalReleaseInputs, validateFinalReleaseGate } from "../src/core/final-release-gate.mjs";

test("final release gate reports No-Go while release evidence is incomplete", () => {
  const result = validateFinalReleaseGate(readFinalReleaseInputs());

  assert.equal(result.ok, true);
  assert.equal(result.ready, false);
  assert.equal(result.publicationAllowed, false);
  assert.equal(result.decision, "no-go");
  assert.ok(result.summary.blockedGates >= 4);
  assert.deepEqual(result.summary.missingRequiredGates, []);
  assert.deepEqual(result.summary.unexpectedGates, []);
  assert.ok(result.gates.some((gate) => gate.name === "updater" && gate.ready === false));
  assert.ok(result.gates.some((gate) => gate.name === "smoke" && gate.ready === false));
  assert.ok(result.gates.some((gate) => gate.name === "docs" && gate.ready === true));
  assert.ok(result.summary.supplyChainEvidence.includes("sbom"));
  assert.ok(result.summary.supplyChainEvidence.includes("artifact-attestation"));
});

test("final release gate require-ready mode fails closed", () => {
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/validate-release-final.mjs", "--require-ready"], { encoding: "utf8" }),
    (error) => error.status === 1 && /"decision": "no-go"/u.test(error.stderr)
  );
});
