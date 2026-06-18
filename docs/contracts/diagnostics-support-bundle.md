# Diagnostics Support Bundle Contract

This contract describes the diagnostics support bundle review surface. It is a descriptor-only export contract for support review, not an archive writer, uploader, support ticket integration, telemetry channel, or raw evidence collector.

## Accepted Posture

- The bundle contains bounded metadata only.
- Environment evidence is limited to version and status facts.
- Validation evidence is limited to stage, command, status, and count summaries.
- Run evidence is limited to run ids, event ids, queue states, and cleanup receipts.
- Policy evidence is limited to permission families, diffs, stale grant counts, and denied decisions.
- Adapter evidence is limited to trust status, generated-adapter drift, digest summaries, profile/mode support, and host compatibility summaries.
- Credential evidence is reference-only and never includes raw values.
- Artifact evidence is descriptor-only and never includes raw artifact bytes, raw logs, raw screenshots, browser data, cookies, tokens, signed URLs, storage state, environment snapshots, or local absolute paths.
- Public-safe errors are redacted and bounded.

## Explicit Non-Claims

- This contract does not write, upload, or open a support ticket.
- This contract does not create a zip or archive.
- This contract does not collect process environment variables, home directories, user names, browser data, cookies, tokens, storage state, screenshots, traces, local files, raw logs, or raw artifact bytes.
- This contract does not add native filesystem, network upload, shell, Tauri invoke, package lifecycle, container start, image pull, or external-provider automation authority.
- This contract does not prove a signed installer, updater publication, production desktop runtime, or generic workflow execution path.
