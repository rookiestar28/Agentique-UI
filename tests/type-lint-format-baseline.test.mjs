import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  collectTypeLintFormatBaselineReport,
  controlledCheckJsFiles,
  requiredNodeEngine,
  requiredToolVersions,
  validateTypeLintFormatBaseline
} from "../src/core/type-lint-format-baseline.mjs";

test("type lint format baseline contract is complete", () => {
  const report = collectTypeLintFormatBaselineReport();
  const validation = validateTypeLintFormatBaseline(report);

  assert.equal(validation.status, "passed");
  assert.equal(report.node.engine, requiredNodeEngine);
  assert.equal(report.configs.checkJs.include.length, controlledCheckJsFiles.length);
  assert.ok(controlledCheckJsFiles.includes("src/core/active-native-event-transport.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/artifact-receipt-binding.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/runtime-prerequisite-readiness.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/multi-lane-execution-readiness.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/adapter-registry.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/python-node-adapter-pack-expansion.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/repo-local-task-runner-lane.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/external-agent-client-pack-expansion.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/mcp-bridge-readiness-descriptor.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/wasm-wasi-sandbox-gate.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/rootless-container-preflight-gate.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/browser-automation-consent-gate.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/local-vault-secrets-ux.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/diagnostics-support-bundle.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/function-expansion-closeout.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/executable-capability-closeout-pack.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/durable-run-ledger.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/watchdog-heartbeat-supervisor.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/human-approval-resume-rerun-ux.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/permission-center-policy-diff.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/library-update-lifecycle.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/native-runner-boundary.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/native-runner-cleanup-recovery.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-native-runner-boundary.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-native-runner-cleanup-recovery.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/release-docs-gate.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/runner-revocation-cancel-controls.mjs"));
  assert.ok(controlledCheckJsFiles.includes("src/core/source-first-executable-capability.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-active-native-event-transport.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-artifact-receipt-binding.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-runtime-prerequisite-readiness.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-multi-lane-execution-readiness.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-adapter-registry-manifest-trust-policy.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-python-node-adapter-pack-expansion.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-repo-local-task-runner-lane.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-external-agent-client-pack-expansion.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-mcp-bridge-readiness-descriptor.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-wasm-wasi-sandbox-gate.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-rootless-container-preflight-gate.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-browser-automation-consent-gate.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-local-vault-secrets-ux.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-diagnostics-support-bundle.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-function-expansion-closeout.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-executable-capability-closeout-pack.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-durable-run-ledger.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-watchdog-heartbeat-supervisor.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-human-approval-resume-rerun-ux.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-permission-center-policy-diff.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-library-update-lifecycle.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-runner-revocation-cancel-controls.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/validate-release-docs.mjs"));
  assert.ok(controlledCheckJsFiles.includes("scripts/check-source-first-executable-capability.mjs"));

  for (const [name, version] of Object.entries(requiredToolVersions)) {
    assert.equal(report.tools[name].lockedVersion, version);
  }
});

test("type lint format validator is wired as a runnable package gate", () => {
  const output = execFileSync(process.execPath, ["scripts/check-type-lint-format-baseline.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);

  assert.equal(result.status, "passed");
  assert.equal(result.summary.controlledCheckJsFiles, controlledCheckJsFiles.length);
});
