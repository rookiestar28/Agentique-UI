# Agent Protocol Bridge Contract

Status: Agentique-owned, capability-scoped protocol and host-disposition contract. This contract
does not load extension code, adopt a runtime package, start a sidecar, expose generic process
access, or add a network transport.

## Protocol Operations

The exact ordered operation vocabulary is `initialize`, `permission`, `prepare`, `start`,
`cancel`, `event`, `artifact`, and `cleanup`. Every envelope binds an opaque bridge session and
message identity, a contiguous sequence, and the complete product/session/resource/run address.
Identical replay is idempotent. Conflicting duplicates, sequence gaps, address drift, invalid
transitions, unknown fields, and post-cleanup messages fail the session closed.

## Trust and Permission Boundary

Initialize accepts only a Signed extension descriptor with an allowlisted signer, verified
SHA-256 digest, accepted review, current revocation state, compatible Agentique UI host, in-sync
source, exact Capability scope, and every generic authority set to false.

Permission evidence is product-issued, current, non-revoked, and bound to the extension, bridge
session, complete run address, and one exact declared capability. Explicit permission is required
for every capability; signature alone never grants start authority.

## Host-Owned Dispatch

Prepare, start, cancel, event observation, and cleanup produce semantic Host-owned dispatch
receipts selected by Agentique from the current operation and state. Extension input cannot name a
native command, executable, script, argument, working directory, environment variable, transport,
network endpoint, package, or provider. The native boundary remains exactly 16 fixed commands and
the default capability remains exactly two event permissions.

Generic authority denied means shell, process selection, subprocess selection, package lifecycle,
ambient environment, browser data, broad filesystem, broad network, containers, external
providers, and sidecars all remain false.

## Events, Artifacts, and Cleanup

Event messages reuse the accepted run protocol and preserve complete addressing, contiguous event
sequence, canonical duplicate behavior, and the first result/cancel/error terminal. Result events
cannot reference artifacts the bridge session has not already accepted.

Artifact receipts contain only opaque ids, SHA-256 digests, bounded byte counts, bounded status,
and mandatory redacted/path-neutral truth. Cleanup can complete only after a run terminal and only
when the receipt is redacted, path-neutral, and reports zero orphan processes and zero remaining
handles. These receipts do not fabricate native execution, external completion, or durable product
projection.

## Package and Environment Boundary

No package bridge adopted: the accepted `NO_ADOPT` result remains authoritative, so no Heddle
runtime, run-client, sidecar, HTTP/SSE bridge, package lifecycle, or Heddle-owned public type is
introduced. Windows is the authoritative repository validation environment for this contract. The
item adds no OS-specific runtime behavior; no Linux item run is claimed, and macOS remains unverified
and unsupported.

## Non-Claims

This contract is not evidence of dynamic extension execution, MCP server operation, WASM/WASI,
containers, provider access, hosted or universal runtime support, production readiness,
publication, release, deployment, installer, updater, or live-host state.
