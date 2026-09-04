# Run Protocol

`agentique.runProtocolEvent.v1` is the Agentique-owned authority for ordered run activity and
terminal delivery. It is transport-independent: native event listeners, receipt replay, and future
reviewed transports must convert into this contract instead of exposing implementation-specific
types to product consumers.

## Address And Authorization Boundary

Every event carries `agentique.runAddress.v1` with product scope, session, resource, and run
identifiers. A consumer or replay request checks all four identifiers. Possession of a run id alone
does not authorize event delivery or result readback.

## Ordering And Terminal Rules

- Sequences are positive safe integers and must be exactly `cursor + 1`.
- A repeated sequence is ignored only when its canonical SHA-256 digest is identical.
- A conflicting duplicate, gap, reorder, or malformed envelope fails the consumer closed.
- `result`, `cancelled`, and `error` are terminal. The first accepted terminal is authoritative; a
  second terminal or any later activity is rejected.
- Producer and consumer conformance are tested independently.

## Replay And Backpressure

The reference journal has a fixed event-count bound. It reports dropped-event count and the oldest
available sequence. A cursor older than retained history receives `resync-required`; the journal
never fabricates continuity. Consumers may then request an authoritative product snapshot through
a separately authorized readback path.

## Payload And Privacy Boundary

Event kinds use closed, bounded payloads. Text, arrays, total bytes, public error codes, and
cancellation reasons are limited. Raw absolute paths, traversal, credential-like material, browser
session data, and private working-document paths are rejected before publication.

User-facing `activity` is not a diagnostic log. Diagnostic detail uses
`agentique.runDiagnosticTrace.v1`, has separate retention and privacy handling, and cannot enter the
run protocol consumer.

## Existing Shape Mapping

The native runner shape `agentique.nativeRunnerEvent.v1` is supported only through an explicit
adapter:

| Native shape                 | Canonical shape  | Rule                                             |
| ---------------------------- | ---------------- | ------------------------------------------------ |
| non-terminal lifecycle event | `activity`       | Preserve sequence; require an explicit timestamp |
| `run.succeeded`              | `result`         | Terminal                                         |
| `run.cancelled`              | `cancelled`      | Terminal                                         |
| `run.failed`                 | `error`          | Terminal with allowlisted public error           |
| cleanup or diagnostic event  | diagnostic trace | Never reinterpret as post-terminal activity      |

Descriptor-only sample timelines remain samples and do not prove a live conforming transport.

## Capability Boundary And Rollback

The protocol performs no process, model, tool, network-listener, package-lifecycle, browser-data, or
ambient-secret access. Rollback removes the adapter and versioned contract while leaving historical
native receipts unchanged.
