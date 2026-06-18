# Runner Revocation Cancel Controls

This contract defines the source-first runner control surface for prepared local runs.

## Covered Flows

- Approve a scoped control sample while the prepared grant remains active.
- Show stale approval reuse denial before a native start is allowed.
- Show revoked grant start denial after post-prepare revocation.
- Show cancel vs forced-kill state distinction with separate receipt modes.
- Keep retry blocked until cleanup is resolved after a cleanup-required forced stop.
- Show redacted audit receipts for each user-visible control transition.

## Source-First Boundary

The control surface is evidence for local source-checkout workflows. It does not claim a signed desktop app, signed installer, updater, or production packaged runtime.

The gate remains fail-closed:

- no generic shell
- no process permission widening
- no package lifecycle execution
- no browser data access
- no ambient environment forwarding
- no absolute local path, secret, cookie, or credential content in receipts

## Receipt Model

Each state exposes a bounded native enforcement receipt summary:

- `start-denied` for revoked grants or consumed approvals
- `graceful-cancel` for user cancel with cleanup completed
- `forced-stop` for force kill with `cleanup-required`
- `cleanup-resolved` for cleanup resolution before retry

Audit receipt paths are workspace-relative sample identifiers such as `runs/run-ui-control-001/audit/grant-revoked.json`. They are not local filesystem paths and are redacted before display.
