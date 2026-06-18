import assert from "node:assert/strict";
import test from "node:test";
import {
  createValidateOnlyDryRun,
  dryRunCheckFamilies,
  sampleDryRunInput
} from "../src/core/validate-dry-run.mjs";

test("validate-only dry-run covers every required check family", () => {
  const report = createValidateOnlyDryRun(sampleDryRunInput);
  assert.equal(report.schemaVersion, "agentique.validateOnlyReport.v1");
  assert.equal(report.operationMode, "validate-only");
  assert.deepEqual(report.sideEffects, []);
  assert.deepEqual(report.checks.map((check) => check.family), dryRunCheckFamilies);
  assert.equal(report.summary.checks, dryRunCheckFamilies.length);
});

test("sample report fails closed for dependency secret and unsupported node blockers", () => {
  const report = createValidateOnlyDryRun(sampleDryRunInput);
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((failure) => failure.code === "dependency.missing"));
  assert.ok(report.failures.some((failure) => failure.code === "secret.missing"));
  assert.ok(report.failures.some((failure) => failure.code === "workflow.unsupported-node"));
  assert.match(JSON.stringify(report), /redacted:vault-reference/u);
  assert.doesNotMatch(JSON.stringify(report), /vault:webhookCredential/u);
});

test("dry-run passes when all validation-only requirements are satisfied", () => {
  const fixedWorkflow = {
    ...sampleDryRunInput.workflowIr,
    nodes: sampleDryRunInput.workflowIr.nodes.map((node) => (
      node.id === "provider-sync" ? { ...node, type: "handoff" } : node
    ))
  };
  const report = createValidateOnlyDryRun({
    ...sampleDryRunInput,
    workflowIr: fixedWorkflow,
    dependencyManifest: {
      required: ["adapter:provider-sync"],
      available: ["adapter:provider-sync"]
    },
    requiredVaultRefs: ["vault:providerCredential"]
  });

  assert.equal(report.ok, true);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.blockingFailures, 0);
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.sideEffects, []);
});

test("failure output redacts inline sensitive values before export", () => {
  const report = createValidateOnlyDryRun({
    ...sampleDryRunInput,
    dependencyManifest: {
      required: ["inline-secret-value"],
      available: []
    }
  });
  const serialized = JSON.stringify(report);
  assert.match(serialized, /redacted:inline-sensitive-material/u);
  assert.doesNotMatch(serialized, /inline-secret-value/u);
});
