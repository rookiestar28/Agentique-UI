import assert from "node:assert/strict";
import test from "node:test";
import {
  createSidecarLaunchPlan,
  sampleNodeSidecarRequest,
  samplePythonSidecarRequest
} from "../src/core/sidecar-runner.mjs";

test("python sidecar launch plan requires signed allowlisted adapter and scoped runtime controls", () => {
  const plan = createSidecarLaunchPlan(samplePythonSidecarRequest);
  assert.equal(plan.ok, true);
  assert.equal(plan.runtime, "python");
  assert.equal(plan.requiresNativeBackend, true);
  assert.equal(plan.willSpawnProcessFromWebLayer, false);
  assert.deepEqual(plan.sideEffects, []);
  assert.equal(plan.network.auth, "per-launch-token");
  assert.equal(plan.summary.healthCheck, "required");
  assert.equal(plan.cleanup.processTreeCleanup, true);
  assert.deepEqual(plan.environment.variableNames, ["AGENTIQUE_MODE", "AGENTIQUE_RUN_ID"]);
});

test("python sidecar blocks when adapter review fails", () => {
  const plan = createSidecarLaunchPlan({
    ...samplePythonSidecarRequest,
    adapterPack: {
      ...samplePythonSidecarRequest.adapterPack,
      signature: { ...samplePythonSidecarRequest.adapterPack.signature, status: "missing" }
    }
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.errors.some((error) => error.code === "sidecar.adapter-blocked"));
});

test("python sidecar rejects public bind and non-localhost allowlist", () => {
  const plan = createSidecarLaunchPlan({
    ...samplePythonSidecarRequest,
    network: {
      ...samplePythonSidecarRequest.network,
      listenHost: "0.0.0.0",
      allowedHosts: ["example.com"]
    }
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.errors.some((error) => error.code === "sidecar.public-bind"));
  assert.ok(plan.errors.some((error) => error.code === "sidecar.host-allowlist"));
});

test("python sidecar blocks ambient environment forwarding", () => {
  const plan = createSidecarLaunchPlan({
    ...samplePythonSidecarRequest,
    environment: {
      ...samplePythonSidecarRequest.environment,
      forwardAmbient: true
    }
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.errors.some((error) => error.code === "sidecar.ambient-env"));
});

test("python sidecar rejects unscoped or traversal workspace references", () => {
  const plan = createSidecarLaunchPlan({
    ...samplePythonSidecarRequest,
    workspace: {
      ...samplePythonSidecarRequest.workspace,
      runRoot: "../outside",
      inputDirs: ["workspace:inputs/../secrets"]
    }
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.errors.some((error) => error.code === "sidecar.workspace-scope"));
});

test("python sidecar requires health checks, redacted logs, and process-tree cleanup", () => {
  const plan = createSidecarLaunchPlan({
    ...samplePythonSidecarRequest,
    healthCheck: { path: "", timeoutMs: 0, requiredBeforeReady: false },
    logging: { stdout: "raw", stderr: "redacted", maxBytes: 0 },
    shutdown: { graceful: "", timeoutMs: 0, processTreeCleanup: false }
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.errors.some((error) => error.code === "sidecar.health-check"));
  assert.ok(plan.errors.some((error) => error.code === "sidecar.log-redaction"));
  assert.ok(plan.errors.some((error) => error.code === "sidecar.cleanup"));
});

test("node sidecar launch plan blocks ambient package lifecycle execution", () => {
  const plan = createSidecarLaunchPlan(sampleNodeSidecarRequest);
  assert.equal(plan.ok, true);
  assert.equal(plan.runtime, "node");
  assert.equal(plan.packagePolicy.entryMode, "packaged-binary");
  assert.equal(plan.packagePolicy.packageManager, "blocked");
  assert.equal(plan.packagePolicy.installAllowed, false);
  assert.equal(plan.packagePolicy.lifecycleScripts, "blocked");
  assert.equal(plan.packagePolicy.inlineScripts, false);
});

test("node sidecar rejects package manager install lifecycle and inline script requests", () => {
  const plan = createSidecarLaunchPlan({
    ...sampleNodeSidecarRequest,
    packagePolicy: {
      entryMode: "source-folder",
      packageManager: "npm",
      installAllowed: true,
      lifecycleScripts: "enabled",
      inlineScripts: true
    }
  });
  assert.equal(plan.ok, false);
  for (const code of [
    "sidecar.node-entry-mode",
    "sidecar.node-package-manager",
    "sidecar.node-install",
    "sidecar.node-lifecycle",
    "sidecar.node-inline-script"
  ]) {
    assert.ok(plan.errors.some((error) => error.code === code), code);
  }
});
