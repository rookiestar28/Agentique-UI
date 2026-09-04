# Native Checkpoint Time Travel

The desktop runner exposes bounded metadata for at most eight validated immutable working-set
generations. History includes only opaque run identity, digest, counts, sizes, current authority,
and safe relative references. It never returns checkpoint content, an absolute path, a process,
an environment value, a credential, or a general filesystem handle. The digest ordering is
deterministic but is not presented as trusted wall-clock chronology.

## Branch preparation

Retry, resume, and replay are fixed lineage labels for one operation: validate an exact source
generation and atomically materialize it into a distinct native-owned target run scope in the same
resource and session. The source generation remains immutable. A branch-ready receipt confirms
only that local state was prepared; it creates no run record, approval, permission grant,
coordinator, process, provider request, terminal result, or external effect.

Ordinary native prepare must run next. It validates the lineage marker, captures the restored
target state, and binds the source and target generation digests into a new approval proposal.
Any later fixed-adapter start requires that fresh explicit approval and a fresh one-use permission
grant. Start rechecks the target generation before grant consumption or launch. A prior source
approval or grant is evidence only and is never copied.

## Failure and recovery boundary

Unknown schema, malformed JSON, active or cleanup-uncertain source state, cross-resource/session
target, reused run id, missing generation, corrupt content, unsafe link/path/content, limit
overflow, lineage drift, or target collision fails closed. Complete source validation precedes
target publication. Target content appears only by same-directory atomic rename, so a crash leaves
either a complete non-authorizing branch-ready root or unreachable staging. A staging rollback
that cannot remove its exact native-owned directory persists a bounded cleanup-required marker;
ordinary prepare rejects that marker, so partial state cannot acquire run, proposal, grant, or
launch authority. Time travel never replays an external effect.

Checkpoint content remains bounded local application data and is not encrypted at rest. The UI
must disclose that limitation and must not present this feature as a general backup, repository
reset, content browser, automatic replay, cloud sync, or production recovery guarantee. Windows is
the verified item environment; Linux behavior is not claimed here, and macOS remains unverified.
