import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { readReleaseDocsInputs, validateReleaseDocsGate } from "../src/core/release-docs-gate.mjs";

test("release docs gate validates release-readiness posture without approving publication", () => {
  const result = validateReleaseDocsGate(readReleaseDocsInputs());

  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.ready, true, JSON.stringify(result.blockers));
  assert.equal(result.publicationAllowed, false);
  assert.equal(result.summary.docs, 6);
  assert.ok(result.summary.evidence.some((family) => family.id === "sbom" && family.matchedTerms.includes("SBOM")));
  assert.ok(result.summary.evidence.some((family) => family.id === "provenance-attestation"));
  assert.ok(result.summary.evidence.some((family) => family.id === "public-safe-workflow-run-id"));
});

test("release docs gate rejects private planning markers and local paths", () => {
  const inputs = readReleaseDocsInputs();
  const docPath = "docs/release/final-readiness.md";
  const result = validateReleaseDocsGate({
    ...inputs,
    docs: {
      ...inputs.docs,
      [docPath]: {
        path: docPath,
        text: `${inputs.docs[docPath].text}\nDo not publish ${"."}${"planning"}/internal.md or C:${"\\"}private${"\\"}path.`
      }
    }
  });

  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.code === "docs.private-marker"));
});

test("release docs gate rejects unsupported installer updater and runtime claims", () => {
  const inputs = readReleaseDocsInputs();
  const docPath = "docs/release/final-readiness.md";
  const result = validateReleaseDocsGate({
    ...inputs,
    docs: {
      ...inputs.docs,
      [docPath]: {
        path: docPath,
        text: `${inputs.docs[docPath].text}\nThe production desktop runtime is released.`
      }
    }
  });

  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((blocker) => blocker.code === "docs.unsupported-claim"));
});

test("release docs gate is available as a package validation script", () => {
  const output = execFileSync(process.execPath, ["scripts/validate-release-docs.mjs"], { encoding: "utf8" });
  const parsed = JSON.parse(output);

  assert.equal(parsed.status, "ready");
  assert.equal(parsed.ready, true);
});
