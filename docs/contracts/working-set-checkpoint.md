# Bounded Working-Set Checkpoints

The desktop runner may checkpoint only the disposable working directory it creates for one exact
run scope. By itself this is a crash-recovery primitive, not a general backup, repository snapshot,
or external-effect replay system. The separate bounded
[Native Checkpoint Time Travel](native-checkpoint-time-travel.md) workflow may consume a validated
immutable generation only to prepare a distinct, non-executing target branch that requires fresh
approval.

## Native ownership and limits

The root is fixed under native application data at
`native-python-runner/working-sets/<scope>/active`. Renderer input cannot select, replace, or restore
a filesystem path. Capture accepts at most 64 regular files, 256 KiB per file, 2 MiB in total,
eight path segments, 180 Unicode scalar values per relative path, and a 64 KiB manifest. At most
eight committed generations are retained.

Symbolic links, Windows reparse points, hard links, devices, sockets, alternate streams, absolute
paths, traversal, portable case collisions, non-composed Unicode paths, reserved device names,
credential locations, environment files, browser or vault content, and private material fail
closed before authority changes. Receipts contain only bounded relative references, counts,
digests, flags, and safe errors.

## Capture authority

Files are enumerated in canonical relative-path order and are rechecked while read. Content and a
versioned manifest are written into a new immutable generation first. Only a successful
compare-and-swap rename of `current.json` makes that generation authoritative. A partial write,
corrupt generation, or CAS conflict cannot replace the previous pointer.

## Restore authority

Restore loads the authoritative pointer, validates manifest scope and version, enumerates the
complete generation, and checks every size and digest before invoking the native-private reset.
After reset, files are written into a sibling staging directory and activated by rename. A failure
before reset leaves the active root untouched. A failure after reset reports cleanup-required and
may retry only from the already validated immutable generation.

## Storage and effect boundary

Checkpoint payloads are local application data and are not encrypted at rest by this primitive.
Deployments requiring encrypted local state need a separate key-management design. Restore never
replays a model call, tool call, process launch, provider mutation, or any other external effect.

Rollback disables new capture and restore operations while leaving committed generations
read-only. It does not delete a user-selected directory because no user-selected directory is in
scope.
