# Evidence Redaction Boundary

This contract governs public-safe evidence emitted by renderer and native execution surfaces.

## Invariants

- **Redact before authority.** Plaintext tokens, credentials, private paths, browser or vault
  material, private roadmap references, and raw process commands are redacted before an event,
  receipt, run folder, registry, projection, checkpoint, evaluation, export, or support artifact
  becomes authoritative.
- **Encoded input fails closed.** Percent-encoded, base64-encoded, nested serialized, malformed, or
  over-limit evidence is rejected before export or persistence when it decodes to forbidden
  material.
- **Metadata provenance only.** Checked-in PNG evidence is bound to an exact path, byte count,
  digest, valid chunk structure, and safe textual metadata. This inventory does not perform OCR and
  makes no claim about pixel-content recognition.
- **No runtime authority.** Redaction labels and evidence descriptors never grant filesystem,
  process, network, provider, browser, credential, release, or deployment authority.

## Producer Coverage

The required matrix covers logs, events, the durable registry, run folders, product projections,
working-set checkpoints, evaluations, receipts, session exports, diagnostics support artifacts,
browser screenshot descriptors, and the public scan. Producer-specific guards remain defense in
depth; the shared policy supplies the cross-producer minimum.

## Privacy and Failure Behavior

Tests use only bounded synthetic strings assembled at runtime. They do not inspect real profiles,
cookies, browser storage, vault contents, environment credentials, user files, or external systems.
When inspection cannot prove an encoded or binary input safe, the operation fails without replacing
the previously committed authority.
