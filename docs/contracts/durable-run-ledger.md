# Durable Run Ledger

This contract defines the source-first durable run ledger for small local run summaries.

## Storage Decision

The accepted implementation is a versioned JSON ledger behind a small storage adapter. Browser hosts may back the adapter with origin-scoped local storage for bounded run summaries. Larger structured databases remain deferred until there is a separate bundle-size, migration, and corruption review.

This contract has no signed installer dependency, no packaged runtime dependency, and no cloud session dependency.

## Required Behaviors

- restart replay after a new app instance reads the same stored snapshot
- schema migration from legacy snapshots with rollback metadata
- corruption fallback that does not replay stale success
- bounded retention by run count
- bounded redacted export
- no raw absolute local paths, vault references, bearer values, cookies, API keys, browser data, or ambient environment values in exports

## Export Boundary

Exports include run id, terminal state, bounded redacted log summaries, artifact metadata, digest, and byte counts. Artifact paths are relative descriptor paths only. Raw logs, file contents, local folders, credentials, cookies, browser profile data, and cloud account state are not exported.

## Non-Claims

The ledger is source-first evidence for local workspace operation. It is not a signed desktop app, installer, updater, production packaged runtime, cloud replay, or cross-device synchronization feature.
