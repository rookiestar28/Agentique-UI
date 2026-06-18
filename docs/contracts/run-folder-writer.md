# Run Folder Writer

Status: deterministic local file writer for validated supported-local-only run manifests.

Agentique UI writes run evidence only after a run folder manifest has passed validation. The writer materializes a bounded run folder under a safe relative root and records cleanup using an idempotent cleanup receipt.

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

## Safety Rules

- writer roots must be safe relative paths;
- every write target must stay inside the writer root;
- path traversal, local absolute paths, and unsafe filenames fail before write;
- logs, artifacts, outputs, metadata, failure state, and receipts must pass redaction checks;
- oversized logs, outputs, and artifacts fail before write;
- cleanup only removes the run folder logs, outputs, and artifacts directories;
- cleanup is idempotent and receipt based.

## Boundary

This contract does not itself execute adapters, stream live logs, call arbitrary native filesystem commands, or claim production runtime readiness. Supported runner lanes must feed stdout, stderr, outputs, artifacts, and failure state through the same writer.

For the fixed native Python lane, native artifact evidence readback is native-backed only after start has materialized the run folder. The readback surface returns artifact evidence for known run-folder files: `run.json`, logs, outputs, artifacts, viewer metadata, failure state, write receipt, cleanup receipt, and reproducibility digest. It is a product viewer/history binding, not a generic file browser; React must not supply read paths, and receipts must stay bounded, redacted, and path-neutral.
