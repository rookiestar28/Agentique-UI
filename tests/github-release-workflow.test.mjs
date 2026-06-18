import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  readGithubReleaseWorkflowInputs,
  validateGithubReleaseWorkflowGate
} from "../src/core/github-release-workflow-gate.mjs";

test("GitHub release workflow gate validates draft release structure", () => {
  const result = validateGithubReleaseWorkflowGate(readGithubReleaseWorkflowInputs());

  assert.equal(result.ok, true);
  assert.equal(result.publicationAllowed, false);
  assert.equal(result.status, "configured");
  assert.ok(result.summary.runners.includes("windows-latest"));
  assert.ok(result.summary.runners.includes("macos-14"));
  assert.ok(result.summary.runners.includes("ubuntu-22.04"));
  assert.deepEqual(result.summary.evidence, [
    "full-validation",
    "checksums",
    "sbom",
    "cargo-metadata",
    "artifact-attestation",
    "draft-release"
  ]);
});

test("GitHub release workflow remains manual and draft-only", () => {
  const workflow = fs.readFileSync(".github/workflows/draft-release.yml", "utf8");

  assert.match(workflow, /workflow_dispatch/u);
  assert.match(workflow, /--draft/u);
  assert.doesNotMatch(workflow, /pull_request_target/u);
  assert.doesNotMatch(workflow, /schedule:/u);
});

test("GitHub release workflow includes validation checksums SBOM and provenance", () => {
  const workflow = fs.readFileSync(".github/workflows/draft-release.yml", "utf8");

  for (const phrase of ["npm run validate", "npm sbom --json", "cargo metadata", "Get-FileHash", "actions/attest-build-provenance"]) {
    assert.match(workflow, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("GitHub release workflow rejects unreviewed action owners", () => {
  const inputs = readGithubReleaseWorkflowInputs();
  const result = validateGithubReleaseWorkflowGate({
    ...inputs,
    workflowText: `${inputs.workflowText}\n      - uses: unknown/action@v1\n`
  });

  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.code === "workflow.unreviewed-action"));
});
