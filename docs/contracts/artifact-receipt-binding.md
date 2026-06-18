# Artifact Receipt Binding

This contract defines source-first artifact receipt binding for the Run workspace evidence browser.

## Required Behaviors

- artifact receipts bind run identity, artifact id, digest, byte size, MIME policy, retention, and cleanup state
- safe previews are allowed only for approved low-risk viewer families
- risky viewer families remain metadata-only or sandbox-required
- path traversal, absolute local paths, sensitive query material, bearer values, cookies, vault references, browser data, and ambient environment values are rejected
- cleanup-required and cleaned states must change artifact availability without inventing raw byte access

## Viewer Policy

Approved preview families are limited to redacted static summaries such as JSON, text, CSV, and escaped Markdown. HTML-like active content is sandbox-required. PDF and media-like content are metadata-only until a separate sandbox and byte-read policy is accepted.

## Boundary

The artifact receipt viewer is not a filesystem browser. It does not expose raw artifact bytes, accept caller-supplied local paths, execute scripts, render active HTML inline, read browser data, forward ambient environment values, or claim packaged runtime support.

## Evidence Shape

Each receipt includes a relative artifact descriptor path, run id, artifact id, digest, size, MIME type, viewer policy, retention policy, cleanup receipt reference, and redaction status. Preview text is bounded and redacted. Stale cleanup-required artifacts remain visible as metadata evidence but not as safe inline previews.

## Non-Claims

This contract does not add arbitrary artifact opening, production desktop runtime support, signed installer support, updater support, cloud artifact sync, or a generic local file viewer.
