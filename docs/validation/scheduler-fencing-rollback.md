# Scheduler Fencing Rollback Evidence

Rollback first closes admission. Every active claim becomes `cleanup-required`, retains
`manual-review` uncertainty, and loses current task ownership. The resulting state has zero active
leases while task definitions, request identities, claim history, and audit history remain available
as read-only evidence.

Rollback does not delete a user location, replay an effect, settle a terminal result, activate a
task, or start a scheduler. A future host adapter must persist the complete returned snapshot
atomically before treating rollback as authoritative.

The targeted campaign proves that an earlier token cannot renew, checkpoint, settle, or cancel
after its fence becomes stale and that cancel/expiry/rollback cannot be overwritten by late success.
