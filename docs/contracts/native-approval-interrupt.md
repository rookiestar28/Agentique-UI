# Native Approval Interrupt Contract

## Boundary

The desktop native scheduler may pause one fixed Python or Node step for explicit human approval.
The pause is not execution and does not grant authority. The renderer cannot mint an approval,
decision, permission grant, checkpoint, executable, path, arguments, environment, script, package
operation, network action, provider action, or handoff execution.

## Admission and pause

An `approval-interrupt` node contains one native-prepared run, its pending proposal identity, a
fixed adapter/profile, and a native-issued interrupt identity. It has no permission grant and no
retry. The scheduler verifies the current pending proposal and its exact run, manifest, profile,
digest, scope, and expiry before graph admission and again when the node becomes ready.

Before the risky process can start, the scheduler captures the run's bounded native working set
and atomically persists `paused-approval`, `pending-approval`, the proposal digest, checkpoint
generation digest, interrupt identity, and expiry. Receipts are redacted and path-neutral; they do
not contain raw input, actor secrets, or executable configuration.

## Explicit decision and resume

Resume is an explicit user action. The request supplies only opaque workflow, node, run,
interrupt, proposal, decision, checkpoint, and optional one-use grant identities. Native state is
the authority: renderer strings never create or refresh approval.

An approved resume succeeds only when all identities match, the checkpoint still describes the
current working set, and the exact permission grant is active, unexpired, unrevoked, unconsumed,
and bound to the recorded decision. The accepted fixed native runner consumes the grant at launch.
A single atomic worker claim prevents concurrent or replayed resume from launching twice.

An explicit denial terminates the workflow without launch. Edited input, expired interrupt,
expired/revoked/consumed permission, stale or fabricated decision, mismatched scope/digest, or
persistence failure also fails closed before launch.

## Recovery and support

Resume is same-process only because the native approval store and live coordinator are not durable
execution authority. After coordinator loss or restart, a persisted paused workflow becomes
`cleanup-required`; it is never automatically resumed or replayed.

Windows is the authoritative tested environment and Linux may carry supplemental exact-candidate
evidence. macOS remains unverified and unsupported. This contract makes no hosted, universal,
production, installer/updater, publication, release, deployment, provider, or live-host claim.
