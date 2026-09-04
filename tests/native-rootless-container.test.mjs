import assert from "node:assert/strict";
import test from "node:test";

import { createNativeAsyncRunClient } from "../src/core/native-async-run-client.mjs";
import {
  buildFixedContainerRunArgs,
  buildMinimalRootlessEnvironment,
  reviewNativeRootlessContainer,
  reviewRootlessRuntimeProbe,
  sampleNativeRootlessContainer
} from "../src/core/native-rootless-container.mjs";

const address = Object.freeze({
  productScopeId: "workspace.local",
  sessionId: "session.container-test",
  resourceId: "resource.container-test",
  runId: "run.container-test"
});

const dockerInfo = Object.freeze({
  OSType: "linux",
  CgroupVersion: "2",
  SecurityOptions: Object.freeze(["name=seccomp,profile=builtin", "name=cgroupns", "name=rootless"]),
  DockerRootDir: "/home/runner/.local/share/docker"
});

const podmanInfo = Object.freeze({
  host: Object.freeze({
    cgroupVersion: "v2",
    remoteSocket: Object.freeze({ path: "/run/user/1000/podman/podman.sock" }),
    security: Object.freeze({ rootless: true, seccompEnabled: true })
  }),
  store: Object.freeze({ graphRoot: "/home/runner/.local/share/containers/storage" })
});

test("fixed rootless container contract is exact and keeps unsupported platforms honest", () => {
  const result = reviewNativeRootlessContainer(sampleNativeRootlessContainer);

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.summary, {
    adapterId: "adapter.local-container",
    permissionProfileId: "permission.local-container.rootless",
    imageDigest: "sha256:b18992999dbe963a45a8a4da40ac2b1975be1a776d939d098c647482bcad5cba",
    mounts: 0,
    environmentEntries: 0,
    nativeCommands: 16,
    tauriCapabilities: 2,
    linuxHostProof: "pending",
    windowsExecution: false,
    macosVerified: false
  });
  assert.deepEqual(sampleNativeRootlessContainer.image.configuredEnvironment, [
    "PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "LANG=C.UTF-8",
    "GPG_KEY=A035C8C19219BA821ECEA86B64E628F8D684696D",
    "PYTHON_VERSION=3.11.15",
    "PYTHON_SHA256=272179ddd9a2e41a0fc8e42e33dfbdca0b3711aa5abf372d3f2d51543d09b625"
  ]);
});

test("Docker and Podman probes require explicit rootless Linux evidence", () => {
  assert.equal(
    reviewRootlessRuntimeProbe({
      runtime: "docker",
      executable: "/usr/bin/docker",
      uid: 1000,
      socketPath: "/run/user/1000/docker.sock",
      info: dockerInfo
    }).ok,
    true
  );
  assert.equal(
    reviewRootlessRuntimeProbe({
      runtime: "podman",
      executable: "/usr/bin/podman",
      uid: 1000,
      socketPath: "/run/user/1000/podman/podman.sock",
      info: podmanInfo
    }).ok,
    true
  );

  const mutations = [
    (value) => value.info.SecurityOptions.pop(),
    (value) => (value.info.OSType = "windows"),
    (value) => (value.info.CgroupVersion = "1"),
    (value) => (value.socketPath = "tcp://127.0.0.1:2375"),
    (value) => (value.executable = "/usr/local/bin/docker"),
    (value) => (value.uid = 0),
    (value) => (value.info.DockerRootDir = "/var/lib/docker")
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone({
      runtime: "docker",
      executable: "/usr/bin/docker",
      uid: 1000,
      socketPath: "/run/user/1000/docker.sock",
      info: dockerInfo
    });
    mutate(candidate);
    assert.equal(reviewRootlessRuntimeProbe(candidate).ok, false);
  }
});

test("the native-owned launch vector cannot widen image command or containment", () => {
  const args = buildFixedContainerRunArgs({ runtime: "docker", containerName: "agentique-0123456789abcdef" });
  assert.deepEqual(args, [
    "run",
    "--rm",
    "--pull=never",
    "--name=agentique-0123456789abcdef",
    "--label=com.agentique.fixed-rootless=true",
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--user=65532:65532",
    "--ipc=private",
    "--cgroupns=private",
    "--memory=64m",
    "--memory-swap=64m",
    "--cpus=0.5",
    "--pids-limit=32",
    "--workdir=/workspace",
    "sha256:7e666cfcc7bd4c47b26b7a5ec0116d80e9bc5415ea06c0dc0bd117a50e9fa6c6",
    "python",
    "--version"
  ]);
  assert.equal(
    args.some((arg) => /mount|volume|publish|device|privileged|env=/u.test(arg)),
    false
  );
  const podmanArgs = buildFixedContainerRunArgs({ runtime: "podman", containerName: "agentique-0123456789abcdef" });
  assert.equal(podmanArgs.includes("--pid=private"), true);
  assert.equal(args.includes("--pid=private"), false);
  assert.throws(
    () => buildFixedContainerRunArgs({ runtime: "docker", containerName: "unsafe/name" }),
    (error) => error.code === "native-container.name"
  );
  assert.throws(
    () => buildFixedContainerRunArgs({ runtime: "nerdctl", containerName: "agentique-0123456789abcdef" }),
    (error) => error.code === "native-container.runtime"
  );
});

test("minimal runtime environment contains only the validated user runtime socket", () => {
  assert.deepEqual(
    buildMinimalRootlessEnvironment({ runtime: "docker", uid: 1000 }),
    Object.freeze({
      XDG_RUNTIME_DIR: "/run/user/1000",
      DOCKER_HOST: "unix:///run/user/1000/docker.sock"
    })
  );
  assert.deepEqual(
    buildMinimalRootlessEnvironment({ runtime: "podman", uid: 1000 }),
    Object.freeze({
      XDG_RUNTIME_DIR: "/run/user/1000",
      CONTAINER_HOST: "unix:///run/user/1000/podman/podman.sock"
    })
  );
  assert.throws(
    () => buildMinimalRootlessEnvironment({ runtime: "docker", uid: 0 }),
    (error) => error.code === "native-container.uid"
  );
});

test("contract mutations fail closed before runtime execution", () => {
  const mutations = [
    (value) => (value.image.reference = "python:latest"),
    (value) => (value.image.pullPolicy = "missing"),
    (value) => value.command.push("-c"),
    (value) => value.mounts.push("/host:/workspace"),
    (value) => value.environment.push("TOKEN"),
    (value) => (value.sandbox.network = "bridge"),
    (value) => (value.sandbox.readOnlyRoot = false),
    (value) => value.sandbox.capabilities.push("NET_ADMIN"),
    (value) => (value.sandbox.noNewPrivileges = false),
    (value) => (value.sandbox.user = "0:0"),
    (value) => (value.resources.memoryBytes = 128 * 1024 * 1024),
    (value) => value.requestFields.push("image"),
    (value) => value.nativeCommands.push("agentique_container_run"),
    (value) => value.tauriCapabilities.push("shell:allow-execute"),
    (value) => (value.platforms.macos.verified = true),
    (value) => (value.claims.genericContainers = true)
  ];

  for (const mutate of mutations) {
    const candidate = structuredClone(sampleNativeRootlessContainer);
    mutate(candidate);
    assert.equal(reviewNativeRootlessContainer(candidate).ok, false);
  }
});

test("renderer request selects only the fixed container adapter and permission ids", async () => {
  const calls = [];
  const client = createNativeAsyncRunClient({
    address,
    adapterId: "adapter.local-container",
    invokeNative: async (command, args) => {
      calls.push({ command, args });
      return { state: "pending-approval" };
    },
    listenNative: async () => () => {}
  });

  await client.prepare();
  assert.equal(calls[0].command, "agentique_runner_prepare");
  assert.deepEqual(calls[0].args.request, {
    resourceId: address.resourceId,
    sessionId: address.sessionId,
    runId: address.runId,
    commandId: `command.prepare-${address.runId}`,
    adapterId: "adapter.local-container",
    approvalId: null,
    permissionProfileId: "permission.local-container.rootless",
    permissionGrantId: null
  });
  assert.doesNotMatch(JSON.stringify(calls), /runtimePath|socketPath|image|entrypoint|arguments|environment|mounts|network|resources|capabilities/iu);
});
