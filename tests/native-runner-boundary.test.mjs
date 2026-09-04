import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { allowedNativeRunnerCommands, readNativeRunnerBoundaryInputs, reviewNativeRunnerBoundary } from "../src/core/native-runner-boundary.mjs";

test("native runner boundary validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-native-runner-boundary.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.deepEqual(result.commands, allowedNativeRunnerCommands);
  assert.equal(result.transitionGate.state, "fixed-lane-transition");
  assert.equal(result.transitionGate.approvedAdapterId, "adapter.local-python");
  assert.equal(result.transitionGate.willSpawnProcess, true);
  assert.equal(result.transitionGate.fixedNativePythonExecution, true);
});

test("native runner boundary accepts only approved command surface", () => {
  const review = reviewNativeRunnerBoundary(readNativeRunnerBoundaryInputs());
  assert.equal(review.ok, true);
  assert.deepEqual(review.commands.registered, allowedNativeRunnerCommands);
  assert.deepEqual(review.commands.declared, allowedNativeRunnerCommands);
  assert.equal(review.permissions.defaultCapabilityPermissions, 2);
  assert.equal(review.transitionGate.prepareCreatesPendingRecord, true);
  assert.equal(review.transitionGate.startAllowsApprovedFixedLane, true);
  assert.equal(review.transitionGate.consumesApproval, true);
  assert.equal(review.transitionGate.willSpawnProcess, true);
  assert.equal(review.transitionGate.fixedNativePythonExecution, true);
  assert.ok(review.commands.allowed.includes("agentique_runner_approval_proposal"));
  assert.ok(review.commands.allowed.includes("agentique_runner_decide_approval"));
  assert.ok(review.commands.allowed.includes("agentique_runner_revoke_permission"));
  assert.ok(review.commands.allowed.includes("agentique_scheduler_start"));
  assert.ok(review.commands.allowed.includes("agentique_scheduler_status"));
  assert.ok(review.commands.allowed.includes("agentique_scheduler_cancel"));
  assert.ok(review.commands.allowed.includes("agentique_scheduler_resume"));
});

test("native runner boundary requires the approved revocation command registration", () => {
  const input = readNativeRunnerBoundaryInputs();
  const review = reviewNativeRunnerBoundary({
    ...input,
    rustSource: input.rustSource.replace("            agentique_runner_revoke_permission,\n", "")
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "native.command-missing"));
});

test("native runner boundary requires a fixed-lane transition gate", () => {
  const input = readNativeRunnerBoundaryInputs();
  const review = reviewNativeRunnerBoundary({
    ...input,
    rustSource: input.rustSource
      .replaceAll("adapter.local-python", "adapter.unknown")
      .replaceAll("permission.local-python.minimal", "permission.shell.all")
      .replaceAll("succeeded", "blocked")
  });
  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "native.transition-gate"));
});

test("native runner boundary rejects unapproved command registration", () => {
  const input = readNativeRunnerBoundaryInputs();
  const rustSource = input.rustSource.replace(
    "agentique_scheduler_resume\n        ])",
    'agentique_scheduler_resume,\n            agentique_runner_shell\n        ])\n\n#[tauri::command]\nfn agentique_runner_shell(request: RunnerCommandRequest) -> Result<RunnerCommandReceipt, String> {\n    runner_boundary_receipt("agentique_runner_shell", "blocked", RUNNER_START_BLOCKED_REASON, request)\n}'
  );
  const review = reviewNativeRunnerBoundary({ ...input, rustSource });
  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "native.command-unapproved"));
});

test("native runner boundary rejects generic process spawn and shell plugin dependencies", () => {
  const input = readNativeRunnerBoundaryInputs();
  const rustSource = `${input.rustSource}\nfn unsafe_spawn(request: RunnerCommandRequest) { let _ = Command::new(request.command_id.unwrap()).spawn(); }`;
  const review = reviewNativeRunnerBoundary({
    ...input,
    rustSource,
    cargoToml: `${input.cargoToml}\ntauri-plugin-shell = "2"`
  });
  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "native.process-spawn"));
  assert.ok(review.errors.some((error) => error.code === "native.cargo-shell-plugin"));
});

test("native runner boundary rejects broad capabilities and unsafe request fields", () => {
  const input = readNativeRunnerBoundaryInputs();
  const rustSource = input.rustSource.replace("permission_profile_id: Option<String>,", "permission_profile_id: Option<String>,\n    cwd: String,");
  const review = reviewNativeRunnerBoundary({
    ...input,
    rustSource,
    capability: { ...input.capability, permissions: ["shell:allow-execute"] }
  });
  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "native.request-field-forbidden"));
  assert.ok(review.errors.some((error) => error.code === "native.permission-set"));
  assert.ok(review.errors.some((error) => error.code === "native.permission-broad"));
});

test("native runner boundary rejects unapproved frontend invoke usage", () => {
  const input = readNativeRunnerBoundaryInputs();
  const review = reviewNativeRunnerBoundary({
    ...input,
    frontendSources: [...input.frontendSources, { path: "src/workspaces/Unsafe.tsx", text: 'invoke("agentique_runner_shell")' }]
  });
  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "native.frontend-invoke"));
});
