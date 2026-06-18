import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { readNativeRunnerPythonExecutionInputs, reviewNativeRunnerPythonExecution } from "../src/core/native-runner-python-execution.mjs";

test("native runner Python execution validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-native-runner-python-execution.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.equal(result.execution.fixedAdapterId, "adapter.local-python");
  assert.equal(result.execution.runtime, "python");
  assert.equal(result.execution.launchesOnlyFixedHelper, true);
  assert.equal(result.execution.shellPluginPresent, false);
  assert.equal(result.execution.externalBinCount, 0);
});

test("native runner Python execution is fixed-helper only", () => {
  const review = reviewNativeRunnerPythonExecution();
  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.execution.nativeStartLaunches, true);
  assert.equal(review.execution.usesJsonStdinStdout, true);
  assert.equal(review.execution.minimalEnv, true);
  assert.equal(review.execution.writesRunFolder, true);
  assert.equal(review.execution.redactsLogs, true);
  assert.equal(review.execution.receiptPathNeutral, true);
});

test("native runner Python execution rejects generic process broadening", () => {
  const input = readNativeRunnerPythonExecutionInputs();
  const weakened = reviewNativeRunnerPythonExecution({
    ...input,
    rustSource: input.rustSource.replace("execute_fixed_python_adapter(", "Command::new(request.command_id.unwrap()).spawn();\nexecute_fixed_python_adapter(")
  });
  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-python.generic-process"));
});

test("native runner Python execution rejects request process fields", () => {
  const input = readNativeRunnerPythonExecutionInputs();
  const weakened = reviewNativeRunnerPythonExecution({
    ...input,
    rustSource: input.rustSource.replace("permission_profile_id: Option<String>,", "permission_profile_id: Option<String>,\n    executable_path: String,\n    env: Vec<String>,")
  });
  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-python.request-process-field"));
});

test("native runner Python execution stays independent from shell plugin and externalBin", () => {
  const input = readNativeRunnerPythonExecutionInputs();
  const weakened = reviewNativeRunnerPythonExecution({
    ...input,
    cargoToml: `${input.cargoToml}\ntauri-plugin-shell = "2"`,
    tauriConfig: {
      ...input.tauriConfig,
      bundle: {
        ...(input.tauriConfig.bundle ?? {}),
        externalBin: ["binaries/agentique-adapter-local-python"]
      }
    }
  });
  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-python.shell-plugin"));
  assert.ok(weakened.errors.some((error) => error.code === "native-python.external-bin"));
});
