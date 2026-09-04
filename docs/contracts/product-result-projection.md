# Durable Product Result Projection

The desktop fixed-adapter lane commits a bounded product-facing result projection before it
publishes a terminal lifecycle event. The native runtime owns the storage root, run address,
candidate digest, staging generation, and authoritative pointer. The renderer cannot provide a
filesystem path or substitute its memory-backed ledger as native durability.

## Commit protocol

Each run owns `projections/<runId>`. Native code copies only fixed allowlisted, already-redacted
run metadata and product artifacts into a unique staging generation. Every source is a bounded
regular file; links and Windows reparse points are rejected. A versioned manifest is written and
synced, the generation is renamed to `generations/<candidateDigest>`, and a synced temporary
`current.json` pointer is renamed last. Only that current pointer makes a terminal generation
authoritative.

Terminal lifecycle publication is ordered after the pointer commit. A projection error converts
the candidate to one safe failed terminal and keeps unprojected output quarantined. A committed
terminal remains authoritative if WebView delivery fails and is returned by status resynchronization.

The exact resource, session, and run address plus terminal-candidate digest form the idempotency
key. Repeating the same candidate returns the committed generation; a different terminal candidate
for the same run fails closed.

## Recovery classifications

Startup and status reconciliation classify durable state as completed, cleanup-required, partial,
corrupt, unsupported, orphaned, or missing. A surviving active marker or staging generation is not
success. It becomes cleanup-required without reissuing an unknown model, tool, provider, or process
effect. Corrupt and unsupported pointers or manifests also block terminal success replay.

The renderer validates the projection receipt schema, exact address, digest, terminal state,
recovery classification, redaction flag, and confined relative references before displaying the
durable-result state.

## Durability matrix

The authoritative current pointer, committed terminal metadata, validated product artifacts,
recovery classification, and bounded restart-durable event-evidence ledger survive process death.
Process handles, listeners, in-memory event buffers, and staging authority do not. Restart recovery
never recreates an unknown external effect.

Retention is bounded to 25 native projection runs. Product projection inputs are bounded to 2 MiB
per allowlisted file and exclude logs, arbitrary paths, environment data, credentials, browser
data, private planning material, and reference-repository content.

## Migration and rollback

The reference migration accepts only explicit bounded version 0 or version 1 renderer-ledger
exports. It never imports browser storage automatically. Unsupported input fails closed and the
original export remains available to the caller for rollback.

Rollback stops new projection writes and uses a read-only version 1 compatibility reader. It does
not delete committed generations, infer success from partial data, or promote the browser-memory
ledger to native authority.
