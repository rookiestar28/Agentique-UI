# Native Rootless Container Adapter

The optional container lane is a Linux-native fixed adapter. It is not a generic container UI,
runtime manager, or packaging dependency. Windows validation proves that the lane must fail closed
without container creation; Windows container execution is not supported. macOS validation is
skipped and remains unverified and unsupported.

## Fixed authority

- Adapter: `adapter.local-container`
- Permission profile: `permission.local-container.rootless`
- Runtime preference: `/usr/bin/podman`, then `/usr/bin/docker`
- Image: one pre-provisioned Python image whose trusted source digest is bound to an exact local
  content ID; execution uses only that fixed ID so offline provisioning needs no registry alias
- Command: `python --version`; expected output: `Python 3.11.15`
- Renderer input: the existing run address, adapter, approval, and permission identifiers only

The native process clears the environment and constructs only the validated user runtime directory
and socket variable. It requires explicit machine-readable rootless, Linux, seccomp, cgroup v2,
user-scoped socket, and user-scoped storage evidence. An accessible rootful daemon is rejected.
The fixed image contributes exactly five public, digest-bound configuration values: its PATH,
locale, Python release signing key, Python version, and Python source digest. Native admission
rejects missing, additional, reordered, or changed image configuration, while host- and
caller-injected container environment entries remain forbidden.

## Containment and lifecycle

Every run uses no network, a read-only root, no Linux capabilities, no-new-privileges, uid/gid
`65532:65532`, private PID/IPC/cgroup namespaces, no mounts, devices, ports, or container
host- or caller-injected environment entries, and fixed CPU, memory, swap, PID, output, and timeout limits. Podman receives
its explicit private-PID flag; Docker uses its private-PID default because Docker rejects that
Podman spelling. The runtime uses `--pull=never` and an opaque native-owned name and label. All
terminal paths inspect and remove the exact container and require a zero-residual result.

The product does not install, start, pull, build, import, or log in to any runtime, daemon, image,
or registry. It does not mutate contexts or socket configuration. Missing, rootful, malformed,
ambiguous, untrusted, or residual state is a no-effect failure or `cleanup-required`; it is never
reported as success.

## Evidence boundary

Successful evidence is written through the existing atomic native run folder as
`outputs/container-result.json` and `artifacts/container-result.json`, then read back, checkpointed,
and projected before terminal publication. Runtime paths and ambient values are not persisted.

Repository tests and Windows fail-closed checks do not prove Linux rootless execution. Acceptance
still requires a real rootless Docker or Podman smoke using the exact image plus verified cleanup;
mock and rootful runs do not satisfy that gate.
