import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  nativeRunnerSidecarContract,
  readNativeRunnerSidecarGateInputs,
  reviewNativeRunnerSidecarGate,
  validateNativeRunnerSidecarGateReport
} from "../src/core/native-runner-sidecar-gate.mjs";

test("native runner sidecar gate validation passes for the current fixed native Python execution state", () => {
  const output = execFileSync(process.execPath, ["scripts/check-native-runner-sidecar-gate.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);

  assert.equal(result.status, "passed");
  assert.equal(result.currentTauriState.externalBinCount, 0);
  assert.equal(result.currentTauriState.shellPermissionGrants, 0);
  assert.equal(result.currentTauriState.shellPluginPresent, false);
  assert.equal(result.nativeStart.transitionGateReady, true);
  assert.equal(result.nativeStart.fixedPythonExecution, true);
  assert.equal(result.sidecars.length, 1);
  assert.equal(
    result.sidecars.every((sidecar) => sidecar.configured === false && sidecar.permissionGranted === false),
    true
  );
});

test("sidecar contract specifies the fixed Python lane, gates, args validators, platforms, and native execution state", () => {
  assert.equal(nativeRunnerSidecarContract.command, "agentique_runner_start");
  assert.equal(nativeRunnerSidecarContract.executionState, "native-controlled-fixed-python-execution");
  assert.deepEqual(
    nativeRunnerSidecarContract.sidecars.map((sidecar) => sidecar.externalBin),
    ["binaries/agentique-adapter-local-python"]
  );
  for (const sidecar of nativeRunnerSidecarContract.sidecars) {
    assert.equal(sidecar.adapterId, "adapter.local-python");
    assert.equal(
      sidecar.args.some((arg) => typeof arg === "object" && typeof arg.validator === "string"),
      true
    );
    assert.deepEqual(sidecar.platforms, ["windows", "macos", "linux"]);
  }
  for (const gate of [
    "signed-adapter",
    "permission-preflight",
    "workspace-boundary",
    "platform-compatibility",
    "run-folder-boundary",
    "log-redaction",
    "cleanup-receipt",
    "transition-receipt"
  ]) {
    assert.ok(nativeRunnerSidecarContract.requiredGates.includes(gate));
  }
});

test("sidecar gate rejects enabled externalBin sidecars before explicit review", () => {
  const input = readNativeRunnerSidecarGateInputs();
  const review = reviewNativeRunnerSidecarGate({
    ...input,
    tauriConfig: {
      ...input.tauriConfig,
      bundle: {
        ...input.tauriConfig.bundle,
        externalBin: ["binaries/agentique-adapter-local-python"]
      }
    }
  });

  assert.equal(review.validation.ok, false);
  assertFailure(review.validation, "sidecar.external-bin-enabled");
  assertFailure(review.validation, "sidecar.execution-enabled");
});

test("sidecar gate rejects shell grants with unapproved names, missing sidecar scope, and allow-all args", () => {
  const input = readNativeRunnerSidecarGateInputs();
  const defaultCapability = input.capabilityFiles.find((file) => file.path.endsWith("default.json"));
  const mutatedCapability = {
    ...defaultCapability,
    json: {
      ...defaultCapability.json,
      permissions: [
        {
          identifier: "shell:allow-execute",
          allow: [
            {
              name: "cmd",
              sidecar: false,
              args: true
            }
          ]
        }
      ]
    },
    text: ""
  };
  const review = reviewNativeRunnerSidecarGate({
    ...input,
    capabilityFiles: input.capabilityFiles.map((file) => (file.path === defaultCapability.path ? mutatedCapability : file))
  });

  assert.equal(review.validation.ok, false);
  assertFailure(review.validation, "sidecar.permission-shell-current");
  assertFailure(review.validation, "sidecar.permission-missing-sidecar");
  assertFailure(review.validation, "sidecar.permission-unapproved-name");
  assertFailure(review.validation, "sidecar.permission-allow-all-args");
  assertFailure(review.validation, "sidecar.shell-permission-enabled");
});

test("sidecar gate rejects shell plugin enablement and package lifecycle command text", () => {
  const input = readNativeRunnerSidecarGateInputs();
  const review = reviewNativeRunnerSidecarGate({
    ...input,
    cargoToml: `${input.cargoToml}\ntauri-plugin-shell = "2"`,
    rustSource: `${input.rustSource}\nfn unsafe_install() { let _ = "npm install"; }`
  });

  assert.equal(review.validation.ok, false);
  assertFailure(review.validation, "sidecar.shell-plugin-source");
  assertFailure(review.validation, "sidecar.shell-plugin-enabled");
  assertFailure(review.validation, "sidecar.package-lifecycle");
});

test("sidecar gate rejects native start receipts that are no longer fixed-lane native Python execution", () => {
  const input = readNativeRunnerSidecarGateInputs();
  const review = reviewNativeRunnerSidecarGate({
    ...input,
    rustSource: input.rustSource.replaceAll("execute_fixed_python_adapter", "execute_unapproved_adapter").replaceAll("succeeded", "blocked")
  });

  assert.equal(review.validation.ok, false);
  assertFailure(review.validation, "sidecar.transition-receipt");
});

test("sidecar gate rejects weakened sidecar contract shape", () => {
  const input = readNativeRunnerSidecarGateInputs();
  const weakenedContract = clone(nativeRunnerSidecarContract);
  weakenedContract.executionState = "enabled";
  weakenedContract.sidecars[0].args = true;
  weakenedContract.sidecars[0].externalBin = "../unsafe";
  const review = reviewNativeRunnerSidecarGate({
    ...input,
    sidecarContract: weakenedContract
  });

  assert.equal(review.validation.ok, false);
  assertFailure(review.validation, "sidecar.contract-state");
  assertFailure(review.validation, "sidecar.contract-allow-all-args");
  assertFailure(review.validation, "sidecar.contract-name");
  assertFailure(review.validation, "sidecar.contract-path");
});

test("sidecar report validator rejects missing package validation wiring", () => {
  const input = readNativeRunnerSidecarGateInputs();
  const { report } = reviewNativeRunnerSidecarGate(input);
  const validation = validateNativeRunnerSidecarGateReport({
    ...report,
    packageScripts: {
      validateNativeRunnerSidecarGate: "",
      validateIncludesNativeRunnerSidecarGate: false
    }
  });

  assert.equal(validation.ok, false);
  assertFailure(validation, "sidecar.package-script");
  assertFailure(validation, "sidecar.validate-chain");
});

function assertFailure(validation, code) {
  assert.ok(
    validation.failures.some((failure) => failure.code === code),
    `missing failure ${code}`
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
