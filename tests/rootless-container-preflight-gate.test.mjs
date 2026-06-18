import assert from "node:assert/strict";
import test from "node:test";
import {
  assertContainerPolicySafe,
  createRootlessContainerPreflightReview,
  reviewRootlessContainerPreflightGate,
  sampleRootlessContainerPermissionStore,
  sampleRootlessContainerPreflightRequest
} from "../src/core/rootless-container-preflight-gate.mjs";
import { revokePermissionGrant } from "../src/core/permission-grants.mjs";

test("complete rootless container contract is preflight-ready without starting a container", () => {
  const review = createRootlessContainerPreflightReview(sampleRootlessContainerPreflightRequest);

  assert.equal(review.ok, true);
  assert.equal(review.status, "preflight-ready");
  assert.equal(review.startsContainer, false);
  assert.equal(review.executionDecision, "preflight-only-no-container-start");
  assert.equal(review.host.runtime, "podman");
  assert.equal(review.host.rootless, true);
  assert.equal(review.image.signature, "verified");
  assert.equal(review.filesystem.readOnlyRootFilesystem, true);
  assert.equal(review.network.mode, "none");
  assert.equal(review.permissions.status, "allowed");
  assert.equal(review.cleanup.status, "ready");
});

test("rootful daemon and missing platform smoke evidence fail closed", () => {
  const review = createRootlessContainerPreflightReview({
    ...sampleRootlessContainerPreflightRequest,
    host: {
      ...sampleRootlessContainerPreflightRequest.host,
      rootless: false,
      daemonMode: "rootful",
      socketScope: "system",
      platformSmoke: { status: "missing", checks: ["rootless-info"] }
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "container.rootless-required"));
  assert.ok(review.errors.some((error) => error.code === "container.socket-scope"));
  assert.ok(review.errors.some((error) => error.code === "container.platform-smoke"));
});

test("image trust requires digest signature provenance sbom and active status", () => {
  const review = createRootlessContainerPreflightReview({
    ...sampleRootlessContainerPreflightRequest,
    image: {
      reference: "ghcr.io/agentique/adapter-rootless:latest",
      digest: "not-a-digest",
      signature: "missing",
      signer: "unknown",
      provenance: "",
      sbom: false,
      revocation: "revoked"
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "container.image-digest"));
  assert.ok(review.errors.some((error) => error.code === "container.image-signature"));
  assert.ok(review.errors.some((error) => error.code === "container.image-provenance"));
  assert.ok(review.errors.some((error) => error.code === "container.image-revocation"));
});

test("privileged mode daemon socket and broad host volumes are rejected", () => {
  const review = createRootlessContainerPreflightReview({
    ...sampleRootlessContainerPreflightRequest,
    filesystem: {
      readOnlyRootFilesystem: false,
      privileged: true,
      daemonSocketMounted: true,
      capabilitiesDrop: [],
      volumes: [
        { source: "/var/run/docker.sock", target: "/var/run/docker.sock", mode: "rw" },
        { source: ["C", ":\\host\\data"].join(""), target: "/", mode: "rw" }
      ]
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "container.readonly-root"));
  assert.ok(review.errors.some((error) => error.code === "container.privileged"));
  assert.ok(review.errors.some((error) => error.code === "container.daemon-socket"));
  assert.ok(review.errors.some((error) => error.code === "container.capabilities"));
  assert.ok(review.errors.some((error) => error.code === "container.volume-source"));
  assert.ok(review.errors.some((error) => error.code === "container.volume-target"));
});

test("host networking and public port publishing are rejected", () => {
  const review = createRootlessContainerPreflightReview({
    ...sampleRootlessContainerPreflightRequest,
    network: {
      mode: "host",
      publish: [{ host: "0.0.0.0", port: 8080, containerPort: 8080 }]
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "container.network-mode"));
  assert.ok(review.errors.some((error) => error.code === "container.network-loopback"));
});

test("resource limits cleanup and cleanup receipt are mandatory", () => {
  const review = createRootlessContainerPreflightReview({
    ...sampleRootlessContainerPreflightRequest,
    resources: {
      memoryBytes: 0,
      cpus: 8,
      pidsLimit: 0,
      timeoutMs: 999999999
    },
    cleanup: {
      removeContainer: false,
      removeAnonymousVolumes: false,
      receiptRequired: false,
      timeoutMs: 999999999
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "container.memory-limit"));
  assert.ok(review.errors.some((error) => error.code === "container.cpu-limit"));
  assert.ok(review.errors.some((error) => error.code === "container.pids-limit"));
  assert.ok(review.errors.some((error) => error.code === "container.timeout"));
  assert.ok(review.errors.some((error) => error.code === "container.cleanup-required"));
  assert.ok(review.errors.some((error) => error.code === "container.cleanup-timeout"));
});

test("permission preflight must pass before container preflight readiness", () => {
  const revoked = revokePermissionGrant(sampleRootlessContainerPermissionStore, "grant.container.runtime", { now: "2026-06-12T00:00:00.000Z" });
  const review = createRootlessContainerPreflightReview({
    ...sampleRootlessContainerPreflightRequest,
    permissionStore: revoked.store
  });

  assert.equal(review.ok, false);
  assert.equal(review.permissions.status, "blocked");
  assert.ok(review.errors.some((error) => error.code === "container.permission-preflight"));
});

test("container execution production and privileged host claims are rejected", () => {
  const review = createRootlessContainerPreflightReview({
    ...sampleRootlessContainerPreflightRequest,
    lane: { ...sampleRootlessContainerPreflightRequest.lane, startsContainer: true },
    claims: {
      containerExecutionAvailable: true,
      productionDesktopRuntime: true,
      installerUpdater: true,
      automaticExecution: true,
      privilegedHostAccess: true,
      universalContainerRuntime: true
    }
  });

  assert.equal(review.ok, false);
  assert.equal(review.startsContainer, false);
  assert.ok(review.errors.some((error) => error.code === "container.start-disabled"));
  assert.ok(review.errors.some((error) => error.code === "container.unsupported-claim"));
});

test("container policy helper accepts bounded policy and rejects host network", () => {
  assert.equal(assertContainerPolicySafe(sampleRootlessContainerPreflightRequest), true);

  assert.throws(
    () =>
      assertContainerPolicySafe({
        ...sampleRootlessContainerPreflightRequest,
        network: { mode: "host", publish: [] }
      }),
    /network must be none or loopback-only/u
  );
});

test("rootless container preflight review proves approved and blocked lanes", () => {
  const summary = reviewRootlessContainerPreflightGate();

  assert.equal(summary.ok, true);
  assert.equal(summary.approvedStatus, "preflight-ready");
  assert.equal(summary.startsContainer, false);
  assert.equal(summary.rootfulBlocked, true);
  assert.equal(summary.untrustedImageBlocked, true);
  assert.equal(summary.broadVolumeBlocked, true);
  assert.equal(summary.hostNetworkBlocked, true);
});
