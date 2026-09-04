# Native durable run registry

The native durable run registry is a strict, bounded, append-only transition ledger for the fixed
local adapter lane. It records the exact run address, fixed adapter/profile/manifest binding,
lifecycle state, and monotonically contiguous sequence under the native application storage root.

Each entry is written to a same-directory temporary file, synchronized, validated, and atomically
renamed to its immutable sequence name before the matching in-memory state, event, or command
receipt can be acknowledged.

Registry evidence does not authorize execution. It stores no approval identifier, grant,
credential, command, environment, process identifier, or absolute path. A recovered pending run
requires a new explicit authorization flow. A stale running or canceling run becomes
cleanup-required and never replays or resumes an unknown effect.

Terminal registry state is necessary but not sufficient for successful recovery. Success requires
a matching committed product projection and validated run-folder evidence. Corrupt, partial,
gapped, duplicated, oversized, linked, cross-address, unknown-state, or manifest-drifted registry
evidence fails closed and cannot present success.
