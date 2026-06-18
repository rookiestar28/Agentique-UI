# Runner Capability Contract

Status: contract for supported local-run readiness, not a general runtime claim.

Agentique UI can only present a local run as available when a resource has an accepted runner capability review. The review binds the resource support mode, signed adapter identity, permission decisions, artifact contract, lifecycle policy, and public claim boundaries.

## Local-Run Gate

A local run is available only when all of these are true:

- the resource support mode is `locally-runnable`;
- the runner mode is `local-run`;
- a signed, allowlisted, non-revoked adapter supports the resource mode;
- permissions are explicit and do not exceed the adapter review;
- generic shell and browser data access remain denied;
- logs and artifacts are bounded and redacted;
- timeout, graceful cancellation, and process-tree cleanup are defined;
- unsupported claims such as universal runtime, hosted runtime, automatic execution, ambient environment access, package lifecycle execution, installer, or updater are false.

## Non-Goals

This contract does not start a sidecar, execute workflow nodes, install packages, run lifecycle scripts, start containers, run WebAssembly, or bridge an external runtime. Those require separate implementation and validation evidence.

## Failure Behavior

If any required field is missing, unsafe, unsupported, or overclaims runtime availability, Agentique UI must keep the resource in a blocked or handoff state with a visible reason.
