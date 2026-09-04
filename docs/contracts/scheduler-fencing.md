# Scheduler Admission, Lease, And Fencing Contract

## Accepted scope

This contract defines the versioned, serializable reference state and atomic transitions that a
future durable host adapter must preserve. It does not start a scheduler, run a workflow, persist a
file, invoke a callback, or obtain process, network, browser, credential, or ambient-environment
authority.

Admission begins closed. Opening it requires explicit evidence that both the UIHED foundation and
the separately governed real workflow execution layer are accepted. The product review surface
fixes the latter evidence to false and therefore cannot open admission.

## Task and request state

Tasks use opaque task, workflow, namespace, and group ids. Registration defaults to paused. An
explicit user transition enables or pauses a task and writes bounded audit history. Request ids are
deduplicated for at-least-once delivery. A request after an active claim increments a later pending
generation instead of mutating the claimed generation.

## Claim, lease, and fence

Claim is one immutable state transition that checks admission, desired state, pending generation,
namespace/group capacity, lease bounds, and current ownership. Each successful claim receives a
monotonically increasing fence. Renew, checkpoint, settlement, and cancel require exact task,
generation, fence, and worker identity. A stale, expired, canceled, or superseded writer cannot
commit events, checkpoints, projection digests, or terminal state.

## Effects and recovery

Settlement requires a bounded idempotency key and a SHA-256 product-projection digest. Every task
uses `required` idempotency and `manual-review` uncertainty policy. Lease recovery marks uncertain
work `cleanup-required`; it never replays unknown effects automatically.

Restore validates the complete snapshot schema, identities, limits, collections, and the permanent
`schedulerStarted=false` invariant before returning authority. Unsupported or oversized state fails
closed.

## User control and non-claims

The Run workspace exposes keyboard-accessible scenario controls for startup-closed, prerequisite
review, claim, stale-writer rejection, cancel fencing, and rollback evidence. They mutate only the
local review model. They are not schedule enablement or autonomous execution controls.

This contract makes no durable host-adapter, real workflow execution, background service,
distributed queue, exactly-once, cron, installer, release, hosted, or production claim.
