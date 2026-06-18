import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMultiLaneExecutionReadinessSafe,
  createMultiLaneExecutionReadinessMatrix,
  createMultiLaneExecutionReadinessSurface,
  reviewMultiLaneExecutionReadinessGate
} from "../src/core/multi-lane-execution-readiness.mjs";

test("readiness matrix includes deno wasm container and adapter-family lanes", () => {
  const matrix = createMultiLaneExecutionReadinessMatrix();
  const lanes = new Map(matrix.lanes.map((lane) => [lane.id, lane]));

  for (const laneId of ["fixed-python", "fixed-node", "deno", "wasm-wasi", "rootless-container", "browser-automation", "external-provider", "additional-adapter-family"]) {
    assert.ok(lanes.has(laneId), `${laneId} lane is present`);
  }

  assert.equal(lanes.get("wasm-wasi").status, "preflight-only");
  assert.equal(lanes.get("rootless-container").status, "preflight-only");
  assert.equal(lanes.get("deno").status, "future-gate-required");
  assert.equal(matrix.summary.futureLanesExecutionEnabled, 0);
});

test("future and unproven lanes remain disabled by default with blocker codes", () => {
  const matrix = createMultiLaneExecutionReadinessMatrix();

  for (const lane of matrix.lanes.filter((entry) => entry.category !== "accepted-fixed-lane")) {
    assert.equal(lane.executionEnabled, false, `${lane.id} execution stays disabled`);
    assert.ok(lane.blockers.length > 0, `${lane.id} has blocker evidence`);
    assert.ok(lane.promotion.requiredFutureGate, `${lane.id} requires a future gate`);
  }

  assert.deepEqual(matrix.boundary.sideEffects, {
    startsRuntime: false,
    startsContainer: false,
    pullsImage: false,
    installsPackages: false,
    runsPackageLifecycle: false,
    executesDownloadedWorkflow: false,
    opensBrowserAutomation: false,
    forwardsBrowserData: false,
    forwardsAmbientEnvironment: false,
    universalRuntime: false,
    productionDesktopRuntime: false,
    signedInstallerOrUpdater: false
  });
});

test("each lane records sandbox permission watchdog artifact license provenance and signature requirements", () => {
  const matrix = createMultiLaneExecutionReadinessMatrix();

  for (const lane of matrix.lanes) {
    for (const key of ["sandbox", "permission", "watchdog", "artifact", "license", "provenance", "adapterSignature"]) {
      assert.ok(lane.requirements[key], `${lane.id} records ${key} requirement`);
    }
    assert.ok(["satisfied", "required", "missing", "blocked"].includes(lane.requirements.adapterSignature.status));
  }

  const deno = matrix.lanes.find((lane) => lane.id === "deno");
  assert.equal(deno.requirements.sandbox.status, "required");
  assert.ok(deno.blockers.includes("deno-sandbox-gate-missing"));
});

test("unsupported lane claims and arbitrary downloaded workflow execution fail closed", () => {
  assert.throws(
    () =>
      createMultiLaneExecutionReadinessMatrix({
        laneOverrides: {
          deno: {
            executionEnabled: true,
            claims: ["deno execution available"]
          }
        }
      }),
    /must remain disabled/u
  );

  assert.throws(
    () =>
      assertMultiLaneExecutionReadinessSafe({
        claims: ["universal runtime", "generic shell", "browser cookie forwarding"]
      }),
    /unsafe execution/u
  );
});

test("surface exposes evidence-only matrix summary for run workspace", () => {
  const surface = createMultiLaneExecutionReadinessSurface();

  assert.equal(surface.schemaVersion, "agentique.multiLaneExecutionReadinessSurface.v1");
  assert.equal(surface.summary.executionEnabled, 2);
  assert.equal(surface.summary.futureLanesExecutionEnabled, 0);
  assert.ok(surface.laneRows.some((row) => row.id === "wasm-wasi" && row.status === "preflight-only"));
  assert.ok(surface.blockedRows.some((row) => row.id === "deno"));
  assert.equal(surface.boundary.sideEffects.startsContainer, false);
});

test("multi-lane readiness gate proves disabled future lanes and no overclaiming", () => {
  const review = reviewMultiLaneExecutionReadinessGate();

  assert.equal(review.ok, true);
  assert.equal(review.checks.requiredLaneCoverage, true);
  assert.equal(review.checks.futureLanesDisabled, true);
  assert.equal(review.checks.requirementCoverage, true);
  assert.equal(review.checks.unsupportedClaimsBlocked, true);
  assert.equal(review.checks.noArbitraryDownloadedWorkflowExecution, true);
  assert.equal(review.checks.surfaceEvidenceOnly, true);
});
