import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertExternalHandoffNonExecution, createExternalHandoffDescriptors } from "../src/core/external-handoff-descriptors.mjs";
import { assertExternalRuntimeDescriptorSafe } from "../src/core/external-runtime-adapter.mjs";
import { createExternalBridgeReview, sampleExternalBridgeRequest } from "../src/core/external-runtime-bridge-guard.mjs";
import { createExternalRuntimeHandoff } from "../src/core/external-runtime-adapter.mjs";
import { reviewNativeRunnerBoundary } from "../src/core/native-runner-boundary.mjs";
import { sampleWorkflowIr } from "../src/core/workflow-ir.mjs";

test("external handoff receipts use one exact non-execution classification", () => {
  const handoff = createExternalHandoffDescriptors();
  const descriptor = handoff.descriptors[0];

  assert.equal(handoff.executionClass, "external-user-owned-handoff");
  assert.equal(handoff.bridgeBoundary.launchAuthorized, false);
  assert.equal(descriptor.descriptor.executionClass, "external-user-owned-handoff");
  assert.equal(descriptor.descriptor.nativeSchedulerAdmission, false);
  assert.equal(descriptor.completion.completedByApp, false);
  assert.equal(descriptor.completion.externalExecutionStatus, "not-executed");
});

test("runtime descriptor and bridge review never grant current launch authority", () => {
  const runtime = createExternalRuntimeHandoff(sampleWorkflowIr, "n8n", {
    createdAt: "2026-06-11T00:20:00.000Z"
  });
  const bridge = createExternalBridgeReview(sampleExternalBridgeRequest);

  assert.equal(runtime.execution.executionClass, "external-user-owned-handoff");
  assert.equal(runtime.execution.nativeSchedulerAdmission, false);
  assert.equal(runtime.execution.completedByApp, false);
  assert.equal(bridge.ok, true);
  assert.equal(bridge.status, "preflight-ready");
  assert.equal(bridge.approvedForLaunch, false);
  assert.equal(bridge.launchAuthorized, false);
  assert.equal(bridge.separateBridgeAcceptanceRequired, true);
  assert.ok(bridge.userActions.every((action) => !/\blaunch\b/iu.test(action)));
});

test("native command and capability boundaries remain unchanged and external-free", () => {
  const review = reviewNativeRunnerBoundary({
    rustSource: fs.readFileSync("src-tauri/src/lib.rs", "utf8"),
    capability: JSON.parse(fs.readFileSync("src-tauri/capabilities/default.json", "utf8")),
    cargoToml: fs.readFileSync("src-tauri/Cargo.toml", "utf8"),
    frontendSources: []
  });
  const commands = review.commands.allowed;

  assert.equal(review.ok, true);
  assert.equal(commands.length, 16);
  assert.equal(
    commands.some((command) => /external|bridge|handoff/iu.test(command)),
    false
  );
  assert.equal(review.permissions.defaultCapabilityPermissions, 2);
});

test("product copy distinguishes supported local execution from inert external handoff", () => {
  const source = fs.readFileSync("src/workspaces/ExternalHandoffPanel.tsx", "utf8");

  assert.match(source, /Not executed by Agentique UI/u);
  assert.match(source, /User-owned destination/u);
  assert.match(source, /Separate bridge acceptance required/u);
  assert.doesNotMatch(source, /onClick|invoke\(/u);
});

test("contradictory and widened non-execution receipts fail closed", () => {
  const handoff = structuredClone(createExternalHandoffDescriptors());
  handoff.descriptors[0].completion.completedByApp = true;
  assert.throws(() => assertExternalHandoffNonExecution(handoff), /contradictory execution or completion/u);

  const widened = structuredClone(createExternalHandoffDescriptors());
  widened.descriptors[0].descriptor.command = "blocked";
  assert.throws(() => assertExternalHandoffNonExecution(widened), /missing or unknown fields/u);

  const runtime = structuredClone(createExternalRuntimeHandoff(sampleWorkflowIr, "n8n"));
  runtime.execution.launchAuthorized = true;
  assert.throws(() => assertExternalRuntimeDescriptorSafe(runtime), /inert, uncompleted, and separately gated/u);
});
