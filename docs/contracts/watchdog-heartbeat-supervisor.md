# Watchdog Heartbeat Supervisor

This contract defines the source-first local runner watchdog surface for native-owned fixed adapter lanes.

## Required Behaviors

- heartbeat receipt cadence is bounded and native-owned
- timeout budget enforcement produces cleanup-required evidence when elapsed time exceeds the budget
- graceful cancel escalation records the expired grace window before forced cleanup
- forced cleanup evidence proves process-tree cleanup without exposing process identifiers
- terminal idempotency keeps repeated terminal receipts stable
- zero tested-platform orphan evidence is required for reviewed scenarios

## Boundary

The supervisor is not a generic process manager. It does not use a shell plugin, package lifecycle execution, browser data, ambient environment forwarding, signed installer state, packaged runtime state, or cloud session state. Receipts use relative descriptor paths only and must remain redacted.

## Evidence Shape

Heartbeat, timeout, cancel, cleanup, and terminal receipts expose schema versions, scenario state, bounded timing, cleanup state, relative receipt references, and redaction flags. Raw process identifiers, absolute local paths, environment values, cookies, tokens, bearer values, vault references, and browser profile data are forbidden.

## Non-Claims

The watchdog surface is local source-first evidence for development checkout validation. It is not an installer, updater, production packaged runtime, cloud supervisor, browser automation bridge, or cross-platform process management framework.
