# Native Asynchronous Run Lifecycle

The desktop fixed-adapter lane owns an asynchronous coordinator for each exact full address:
`productScopeId`, `sessionId`, `resourceId`, and `runId`. Native admission rejects a second active
coordinator for the same scoped address while allowing distinct addresses to run independently.

## Execution and terminal ownership

Start returns `running` after the native process has been spawned and its concrete handle retained.
The renderer cannot supply a PID, executable, command path, arguments, environment values, timeout,
or alternate adapter. Cancel and the fixed native timeout claim terminal intent before the retained
handle is terminated and drained. A late completion cannot replace cancel or timeout, and the run
ledger publishes one authoritative terminal only.

Exact permission revocation uses the same coordinator fencing for a distinct authorization cause.
Before start it leaves the run blocked. During a run it revokes the consumed grant, claims canceled
terminal intent, and signals only the matching retained handle. The product action accepts no PID,
path, target list, process arguments, environment, or generic native command.

The native worker closes its one-request stdin frame, drains the child, records bounded redacted
output, writes fixed-lane evidence, and removes its coordinator entry. Tested cancellation and
timeout paths leave no retained coordinator or hidden background work.

## Product event binding

Rust emits sanitized lifecycle payloads on `agentique://native-runner-event`. The renderer uses the
official Tauri invoke/listen APIs, verifies the exact full address, converts native timestamps, and
passes events through the canonical run-protocol adapter and consumer. Live publication is
monotonic and may retain holes for diagnostic phases that are intentionally not published. The
complete durable replay must be contiguous; a replay gap, conflicting duplicate, unknown terminal,
or post-terminal event fails closed. Route teardown always invokes the Tauri listener teardown
function.

Status receipts provide bounded restart-durable event-evidence replay for resynchronization. The
native-owned immutable sequence records are committed before event publication and validated fail
closed after process-local state loss. This restores evidence and canonical UI state only; it is
not durable execution, process-handle recovery, or permission to replay an external effect.
Cleanup, artifact-read, replay bookkeeping, and other diagnostic events remain outside the
canonical lifecycle stream.

## Security and compatibility boundary

No PID, executable path, raw command, caller-selected argument, ambient environment value, secret,
or generic process capability enters the WebView contract. The only executable lane remains the
native-resolved fixed Python adapter with its existing manifest and minimal permission profile.
