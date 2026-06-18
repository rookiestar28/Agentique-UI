# Local Run Queue And State Machine

Status: deterministic lifecycle contract, not process execution.

Agentique UI records local-run lifecycle changes as immutable state transitions. The state machine is intentionally separate from adapter execution, permission grants, and artifact writing so later runtime work cannot skip review, timeout, cancellation, failure, or cleanup obligations.

## States

- `queued`
- `preparing`
- `permission-blocked`
- `ready`
- `running`
- `canceling`
- `canceled`
- `succeeded`
- `failed`
- `cleanup-required`
- `cleaned`

## Required Metadata

Each run record contains opaque resource, session, and run ids; attempt and retry counters; timeout/deadline data; worker identity, readiness, and heartbeat; progress; cancellation data; cleanup status; recovery metadata; and a redacted event history.

## Transition Rules

- `queued` may move to `preparing`.
- `preparing` may move to `permission-blocked`, `ready`, or `failed`.
- `permission-blocked` may move to `ready` only after external grant review.
- `ready` may move to `running` or safe cancellation.
- `running` may heartbeat, report progress, succeed, fail, timeout, or enter `canceling`.
- `canceling` may move to `canceled`.
- `succeeded`, `failed`, and `canceled` may move to `cleanup-required`.
- `cleanup-required` may move to `cleaned`.

Any forbidden transition, such as `queued` directly to `running`, must fail without mutating the record.

## Recovery

After restart, a stale incomplete record is never treated as successful. Stale `running`, `canceling`, or `preparing` states recover to `cleanup-required` with failure evidence. A stale `ready` record can return to `queued` because no process was started.

## Boundary

This contract does not start processes, read logs, write artifacts, grant permissions, install packages, run shell commands, start containers, or claim production runtime readiness.
