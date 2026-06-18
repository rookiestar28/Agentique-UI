import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertExecutionValidationPackSafe,
  createExecutionValidationPack,
  executionValidationPackSchemaVersion,
  reviewExecutionValidationPackGate
} from "../src/core/execution-validation-pack.mjs";

const requiredFlowIds = [
  "success",
  "blocked",
  "permission-required",
  "canceled",
  "timed-out",
  "cleanup",
  "rerun",
  "handoff",
  "human-approval"
];

test("execution validation pack covers every release demo flow", () => {
  const pack = createExecutionValidationPack();
  const flowIds = new Set(pack.demoFlows.map((entry) => entry.id));

  assert.equal(pack.schemaVersion, executionValidationPackSchemaVersion);
  for (const flowId of requiredFlowIds) {
    assert.equal(flowIds.has(flowId), true, flowId);
  }
  assert.deepEqual(pack.summary.adapterRuntimes, ["node", "python"]);
  assert.equal(pack.demoResources.adapters.some((entry) => entry.metadata.runtime === "python"), true);
  assert.equal(pack.demoResources.adapters.some((entry) => entry.metadata.runtime === "node"), true);
});

test("visual and interaction evidence references Graph and Run execution artifacts", () => {
  const pack = createExecutionValidationPack();
  const artifactPaths = pack.visualEvidence.map((entry) => entry.path);
  const interactionIds = new Set(pack.interactionEvidence.map((entry) => entry.id));

  assert.ok(artifactPaths.includes("docs/validation/artifacts/runner-ui-graph-desktop.png"));
  assert.ok(artifactPaths.includes("docs/validation/artifacts/runner-ui-run-mobile.png"));
  for (const artifact of artifactPaths) {
    assert.equal(fs.existsSync(artifact), true, artifact);
    assert.equal(fs.statSync(artifact).size >= 1000, true, artifact);
  }
  assert.equal(interactionIds.has("graph-run-controls"), true);
  assert.equal(interactionIds.has("run-evidence-browser"), true);
  assert.equal(interactionIds.has("permission-review"), true);
  assert.equal(interactionIds.has("human-approval"), true);
});

test("gate evidence aggregates execution-layer validators without runtime claims", () => {
  const pack = createExecutionValidationPack();
  const gateIds = new Set(pack.gateEvidence.map((entry) => entry.id));

  for (const gateId of [
    "workflow-scheduler",
    "graph-run-plan",
    "workflow-runner-session",
    "runner-event-stream",
    "runner-permission-preflight",
    "run-history-evidence",
    "human-approval-interrupt",
    "external-handoff-descriptors",
    "source-roundtrip-handoff",
    "curated-adapter-execution-lane",
    "external-runtime-bridge-guard",
    "graph-run-execution-ui"
  ]) {
    assert.equal(gateIds.has(gateId), true, gateId);
  }
  assert.equal(pack.gateEvidence.every((entry) => entry.ok), true);
  assert.equal(pack.boundary.noBridgeStart, true);
  assert.equal(pack.boundary.noRuntimeStart, true);
  assert.equal(Object.values(pack.forbiddenClaims).every((value) => value === false), true);
});

test("execution validation pack safety rejects secrets paths commands internal markers and executable claims", () => {
  const unsafeValues = [
    { value: `sk-${"a".repeat(20)}` },
    { path: ["C:", "Users", "example"].join("\\") },
    { action: "npm run unsafe" },
    { boundary: { startsBridge: true } },
    { claim: { productionDesktopRuntime: true } },
    { internal: [[".", "planning"].join("")] },
    { internal: [["reference", "docs"].join("/")] },
    { internal: [["AUI", "EXEC"].join("-")] },
    { internal: [["road", "map"].join("")] }
  ];

  for (const unsafe of unsafeValues) {
    assert.throws(
      () => assertExecutionValidationPackSafe(unsafe),
      (error) => [
        "vault.inline-secret",
        "execution-validation-pack.unsafe-path",
        "execution-validation-pack.command-text",
        "execution-validation-pack.executable-claim",
        "execution-validation-pack.private-marker"
      ].includes(error.code)
    );
  }
});

test("execution validation pack review gate passes", () => {
  const review = reviewExecutionValidationPackGate();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.checks.requiredFlowsCovered, true);
  assert.equal(review.checks.requiredGatesCovered, true);
  assert.equal(review.checks.visualEvidenceReady, true);
  assert.equal(review.checks.validationHooked, true);
});
