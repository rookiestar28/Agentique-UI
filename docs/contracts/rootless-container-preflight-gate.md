# Rootless Container Preflight Gate Contract

Status: guarded preflight only. This contract does not start Docker or Podman containers and does not provide a production desktop runtime.

Agentique UI treats container adapters as high-risk local execution. A future container lane can only move beyond preflight after rootless runtime evidence, trusted image evidence, filesystem boundaries, network policy, resource limits, cleanup, permissions, and public claim boundaries are proven.

## Required Preflight

The container gate requires:

- container start remains disabled until runtime evidence is accepted;
- supported Docker or Podman runtime;
- rootless mode, user namespace, user-scoped runtime socket, seccomp, no-new-privileges, and cgroup evidence;
- platform smoke checks for rootless info, user namespace, network policy, and cleanup dry-run;
- immutable image digest, verified trusted signature, provenance, SBOM evidence, and active revocation status;
- read-only root filesystem;
- all Linux capabilities dropped by default;
- workspace-scoped volumes only;
- no daemon socket mount;
- disabled or loopback-only network policy;
- bounded memory, CPU, PID, and timeout limits;
- container cleanup, anonymous-volume cleanup, and cleanup receipt;
- permission-grant preflight for files, adapter preflight, rootless container scope, and artifact retention.

## Blocked Declarations

The gate blocks:

- rootful daemon mode;
- system-scoped runtime sockets;
- missing or failed platform smoke evidence;
- image tags without immutable digest;
- unsigned, untrusted, non-provenance, non-SBOM, or revoked images;
- privileged containers;
- writable root filesystems;
- host daemon socket mounts;
- host, public, or broad volume mounts;
- host networking or public port publishing;
- missing resource limits;
- missing cleanup or cleanup receipt;
- claims that container execution, installer, updater, automatic execution, privileged host access, universal runtime, or production desktop runtime is available.

## Output

The review output is deterministic and redacted. A successful review returns `preflight-ready` while keeping `startsContainer: false`. A blocked review returns explicit error codes for the failed container gate.

## Non-Goals

This contract does not install Docker or Podman, pull images, build images, run containers, execute compose files, expose a Tauri command, start a sidecar, or publish release artifacts.
