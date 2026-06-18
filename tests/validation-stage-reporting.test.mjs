import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  buildValidationFailureSummary,
  collectValidationStageReport,
  flattenValidationCommands,
  requiredValidationCommandFamilies,
  requiredValidationCommandTexts,
  validateValidationStageReport,
  validationStages
} from "../src/core/validation-stage-reporting.mjs";

test("validation stage reporting contract covers the full validation surface", () => {
  const report = collectValidationStageReport();
  const validation = validateValidationStageReport(report);

  assert.equal(validation.status, "passed", JSON.stringify(validation.failures));
  assert.equal(report.stages.length, validationStages.length);
  assert.equal(report.commands.length, requiredValidationCommandTexts.length);
  assert.match(report.packageScripts.validate, /^node scripts\/run-validate-staged\.mjs/u);
  assert.match(report.packageScripts.validateStageReporting, /check-validation-stage-reporting\.mjs/u);

  for (const commands of Object.values(requiredValidationCommandFamilies)) {
    for (const command of commands) {
      assert.ok(
        report.commands.some((entry) => entry.text === command),
        `missing required command: ${command}`
      );
    }
  }
});

test("validation stage order keeps tooling and build gates in deterministic sequence", () => {
  const commandTexts = flattenValidationCommands(validationStages).map((command) => command.text);

  assertCommandOrder(commandTexts, ["npm run validate:stage-reporting", "npm run lint", "npm run format:check", "npm run typecheck:js"]);
  assertCommandOrder(commandTexts, [
    "npm run validate:native-runner-adapter-manifest",
    "npm run validate:adapter-registry-manifest-trust-policy",
    "npm run validate:python-node-adapter-pack-expansion",
    "npm run validate:repo-local-task-runner-lane",
    "npm run validate:native-runner-python-execution"
  ]);
  assertCommandOrder(commandTexts, [
    "npm run validate:external-handoff-descriptors",
    "npm run validate:external-agent-client-pack-expansion",
    "npm run validate:mcp-bridge-readiness-descriptor",
    "npm run validate:multi-lane-execution-readiness"
  ]);
  assertCommandOrder(commandTexts, [
    "npm run validate:wasm-wasi-sandbox-gate",
    "npm run validate:rootless-container-preflight-gate",
    "npm run validate:browser-automation-consent-gate",
    "npm run validate:local-vault-secrets-ux",
    "npm run validate:diagnostics-support-bundle",
    "npm run validate:function-expansion-closeout"
  ]);
  assertCommandOrder(commandTexts, ["npm run typecheck", "npm run build", "npm run validate:build-payload-budget", "npm test", "npm run validate:public"]);
  assertCommandOrder(commandTexts, [
    "npm run validate:release-workflow",
    "npm run validate:release-docs",
    "npm run validate:release-packaging-preflight",
    "npm run validate:release-smoke"
  ]);
  assertCommandOrder(commandTexts, ["npm run validate:release-smoke", "npm run validate:rebuilt-workspace-closeout", "npm run validate:release-final"]);
});

test("validation runner can list the staged plan without executing gates", () => {
  const output = execFileSync(process.execPath, ["scripts/run-validate-staged.mjs", "--list"], { encoding: "utf8" });
  const listed = JSON.parse(output);

  assert.equal(listed.status, "listed");
  assert.equal(listed.stages.length, validationStages.length);
  assert.ok(listed.stages.some((stage) => stage.id === "tooling-baseline" && stage.commands.includes("npm run validate:stage-reporting")));
});

test("validation failure summary exposes stage and command metadata", () => {
  const stage = validationStages.find((entry) => entry.id === "tooling-baseline");
  const command = stage.commands.find((entry) => entry.text === "npm run lint");
  const summary = buildValidationFailureSummary({ stage, command, exitCode: 7, durationMs: 1234 });

  assert.equal(summary.status, "failed");
  assert.equal(summary.failed.stageId, "tooling-baseline");
  assert.equal(summary.failed.stageLabel, "Tooling Baseline");
  assert.equal(summary.failed.commandId, "npm-run-lint");
  assert.equal(summary.failed.commandText, "npm run lint");
  assert.equal(summary.failed.exitCode, 7);
  assert.equal(summary.durationMs, 1234);
});

function assertCommandOrder(commandTexts, expectedOrder) {
  let previousIndex = -1;
  for (const command of expectedOrder) {
    const index = commandTexts.indexOf(command);
    assert.notEqual(index, -1, `missing command: ${command}`);
    assert.ok(index > previousIndex, `${command} must run after the previous ordered command`);
    previousIndex = index;
  }
}
