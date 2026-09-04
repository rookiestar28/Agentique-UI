# Run Folder Writer

Status: deterministic local file writer for validated supported-local-only run manifests.

Agentique UI writes run evidence only after a run folder manifest has passed validation. Each real
producer serializes and security-scans the complete bounded candidate in a same-parent staging
directory, writes a versioned SHA-256 integrity receipt last, verifies the staged inventory, and
uses one atomic directory rename to publish the final safe relative root. A failure before rename
leaves no final folder and removes the exact staging directory.

## Folder Contents

Each written run folder contains:

- `run.json` with relative paths and reproducibility digest;
- bounded stdout and stderr logs;
- outputs;
- artifacts;
- viewer metadata;
- failure state;
- write receipt;
- cleanup receipt after cleanup.

The write receipt is the commit marker. It binds the exact run id and path-neutral root, sorted
unique immutable payload refs, per-file byte counts and SHA-256 content digests, total bounds,
redaction state, and reproducibility digest. The receipt excludes itself and declares the cleanup
receipt as a fixed mutable ref so an idempotent cleanup transition cannot masquerade as immutable
payload tampering.

## Safety Rules

- writer roots must be safe relative paths;
- every write target must stay inside the writer root;
- path traversal, local absolute paths, and unsafe filenames fail before write;
- logs, artifacts, outputs, metadata, failure state, and receipts must pass redaction checks;
- oversized logs, outputs, and artifacts fail before write;
- secret/token, browser-cookie, vault, local-path, private-planning, and private-reference material
  blocks final persistence;
- existing final folders are never merged or overwritten; only a fully validated exact committed
  repeat is idempotent;
- cleanup only removes the run folder logs, outputs, and artifacts directories;
- cleanup validates the committed contract before mutation and is idempotent and receipt based;
- missing, extra, malformed, linked, oversized, unsafe, or digest-mismatched evidence fails closed
  before viewer readback or cleanup.

## Boundary

This contract does not itself execute adapters, stream live logs, call arbitrary native filesystem commands, or claim production runtime readiness. Supported runner lanes must feed stdout, stderr, outputs, artifacts, and failure state through the same writer.

For the fixed native Python lane, native artifact evidence readback is native-backed only after
start has atomically materialized the committed run folder. Readback validates the commit receipt,
exact run/adapter/manifest/status identity, regular-file/link safety, complete inventory, byte
bounds, SHA-256 digests, and unsafe-content boundary before parsing viewer evidence. The surface
returns artifact evidence for known run-folder files: `run.json`, logs, outputs, artifacts, viewer
metadata, failure state, write receipt, cleanup receipt, and reproducibility digest. It is a product
viewer/history binding, not a generic file browser; React must not supply read paths, and receipts
must stay bounded, redacted, path-neutral, and fail closed.
