# Python Adapter Runner Contract

This contract defines the first native-controlled Python adapter execution path for Agentique UI.

## Scope

- Executes one repo-local sample Python adapter.
- Requires the adapter to be signed and allowlisted by the runner capability review.
- Requires permission preflight to pass before process launch.
- Supports only locally runnable resources and the fixed Python adapter runtime.
- Writes run folder evidence through the run folder writer.

## Non-goals

- No arbitrary command text.
- No generic shell execution.
- No package installation or package lifecycle scripts.
- No automatic execution of downloaded resources.
- No ambient environment forwarding.
- No browser data access.

## Launch boundary

The runner must fail before launch when adapter evidence is unsigned, tampered, revoked, unsupported, or not allowlisted. The web layer never starts the process directly; the boundary models the native runner command and keeps the adapter path fixed in repository code.

## Environment boundary

The adapter receives a minimal environment containing only Agentique runner metadata and OS startup keys required by the platform. The runner must not forward non-empty `PATH`, user profile paths, cloud credentials, package tokens, or full process environment state.

## IO and artifact contract

The adapter receives JSON stdin and returns JSON stdout. The runner captures stdout and stderr, redacts sensitive markers, and writes run metadata, logs, outputs, artifacts, failure state, viewer metadata, and write receipts through the run folder writer.

## Lifecycle

Timeout and cancellation paths terminate the child process, mark the run as failed or canceled, and write a cleanup receipt. Cleanup must be idempotent and scoped to the run folder.

## Security requirements

- Signed and allowlisted adapter only.
- Permission grants are evaluated before launch.
- Unsafe adapter state must fail before launch.
- Logs and result summaries are redacted before persistence.
- No local absolute paths or raw secrets are written to evidence.
- Cleanup receipt must exist for timeout and cancellation paths.
