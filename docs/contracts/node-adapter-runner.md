# Node Adapter Runner Contract

This contract defines the controlled Node-family adapter execution path for Agentique UI.

## Scope

- Executes one repo-local packaged adapter script.
- Requires the adapter to be signed and allowlisted by the runner capability review.
- Requires Node package policy review before process launch.
- Requires permission preflight before process launch.
- Supports only locally runnable resources and the fixed Node adapter runtime.
- Writes run folder evidence through the run folder writer.

## Non-goals

- No arbitrary command text.
- No generic shell execution.
- No package manager invocation.
- No dependency installation.
- No package lifecycle scripts.
- No inline scripts.
- No automatic execution of downloaded resources.
- No ambient environment forwarding.

## Launch boundary

The runner must fail before launch when adapter evidence is unsigned, tampered, revoked, unsupported, or not allowlisted. It must also fail before launch when package policy requests a package manager, install step, lifecycle scripts, inline scripts, broad subprocess access, or allow-all equivalent behavior.

## Environment boundary

The adapter receives a minimal environment containing only Agentique runner metadata and OS startup keys required by the platform. The runner must not forward non-empty `PATH`, user profile paths, cloud credentials, package tokens, package config paths, or full process environment state.

## IO and artifact contract

The adapter receives JSON on stdin and returns JSON on stdout. The runner captures stdout and stderr, redacts sensitive markers, and writes run metadata, logs, outputs, artifacts, failure state, viewer metadata, and write receipts through the run folder writer.

## Lifecycle

Cancellation paths terminate the child process, mark the run as canceled, and write a cleanup receipt. Cleanup must be idempotent and scoped to the run folder.

## Security requirements

- Signed and allowlisted packaged adapter only.
- Package manager, install, lifecycle scripts, inline scripts, broad subprocess, and allow-all equivalent policies are blocked.
- Permission grants are evaluated before launch.
- Unsafe adapter or package policy state must fail before launch.
- Logs and result summaries are redacted before persistence.
- No local absolute paths or raw secrets are written to evidence.
- Cleanup receipt must exist for cancellation paths.
