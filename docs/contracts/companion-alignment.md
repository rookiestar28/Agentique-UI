# Companion Schema Alignment

Agentique UI consumes public readback data from Agentique catalog and companion surfaces through a UI-facing compatibility contract.

Schema: `schemas/ui-companion-readback.schema.json`

Valid example: `examples/companion-readback.valid.json`

## Required Public Fields

- resource id, version, title, summary, and canonical URL,
- scoped ticket endpoint and maximum byte size,
- support modes and minimum complete UX,
- published digest and verification status,
- supported desktop platforms,
- schema references needed by Agentique UI.

## Excluded Private Fields

The UI-facing readback contract must not expose:

- private moderation notes,
- operator-only evidence,
- internal planning names,
- local absolute paths,
- credentials, tokens, cookies, private keys, or raw secret values,
- private API payloads,
- raw browser storage,
- unpublished infrastructure details.

## Ownership Boundary

This repository defines the UI-facing contract and fixtures. Catalog and companion systems may implement compatible readback endpoints later, but this Phase 0 contract does not claim that production endpoints already provide every field.

Schema changes should be versioned. Existing accepted fixtures should remain stable so compatibility drift is visible in tests.

## Read-Only Adapter Boundary

Agentique UI includes a local read-only companion readback adapter for public resource projections. The adapter is allowed to normalize public resource detail, download metadata, trust state, parser-variant state, agent-native state, and badge state for display in the local workspace.

When public `sourcePackage` metadata is present, the adapter treats it as authoritative for download availability. Legacy top-level availability cannot make metadata-only or malformed canonical source-package rows downloadable.

The adapter must not add upload submission, publication, approval, moderation, release governance, package publication, installer availability, updater availability, hosted runtime, universal runtime, or automatic execution behavior. Requests are GET-only, do not carry authorization headers, and must use HTTPS outside loopback development.

Private projection fields, prototype-pollution keys, sensitive download URLs, raw credentials, browser data, and local absolute paths are stripped or rejected before UI display.

## Validator Import Proof Boundary

Agentique UI includes a local report adapter for companion validator-style static package findings. It projects manifest/schema, package inventory, hash, path, secret, public-overclaim, parser-variant, and agent-native findings into import proof rows.

The adapter consumes validation report data only. It must not run package lifecycle scripts, install dependencies, build packages, run package tests, execute workflow actions, build Docker images, scan arbitrary folders, or execute candidate code.

Local validator proof is not platform approval, safety certification, moderation, publication, legal review, runtime compatibility proof, package release evidence, or platform download availability. Report fields that resemble local paths, internal planning paths, or secret material are redacted before display.

## Safe Download Acquisition Boundary

Agentique UI includes a local proof adapter for companion download metadata. The adapter turns public readback metadata into a bounded acquisition plan and a local acquisition proof.

The plan requires canonical `sourcePackage` readiness when that metadata is present: `DOWNLOADABLE` status, POST ticket endpoint, safe filename and content type, positive byte size, and SHA-256 digest. Metadata-only, malformed, placeholder, source-index, schema-only, review-only, review-guide, demo-only, or example-only public package labels stay blocked. The plan also requires a user-selected destination, no-overwrite by default, workspace-bounded path references, bounded redirect origins, max-byte limits, expected byte count, and SHA-256 digest metadata before acquisition can be considered locally ready. The proof requires matching byte count and digest evidence, atomic temp-write-to-final-rename evidence, cleanup receipt handling for failed or partial writes, and fail-closed findings for unsafe URLs, sensitive query material, traversal, unsafe filenames, oversize results, digest mismatch, size mismatch, and missing cleanup.

This proof surface must not install, extract, open, approve, certify, publish, release, or execute downloaded artifacts. It is not platform approval, safety certification, moderation approval, package publication evidence, direct-install evidence, hosted runtime availability, universal runtime compatibility, or a broad byte-transfer claim.

## Review-Only Uploader Preview Boundary

Agentique UI includes a local preview adapter for companion uploader-style plan, import-plan, variant-plan, agent-native-plan, generated draft, and patch/delta summaries.

The preview boundary must keep `submissionMode: review-only` and `liveUploadAvailable: false` visible. Import, variant, and agent-native previews are dry-run-only local evidence and must not execute source code, workflows, notebooks, package managers, Docker, MCP servers, tool calls, or framework loaders.

Generated draft previews must remain draft-only, not submitted, user-confirmed, and server-validated before any future submit path. Patch/delta previews must remain partial-update-only and cannot replace full manifest, resource, package, or registry snapshots.

Agentique UI must not expose submit, publish, approve, moderation, registry release, package publication, authenticated upload, upload status polling, installer, updater, hosted runtime, universal runtime, direct install, package execution, or platform download-readiness claims through this preview surface.

## Browser-Local External Intake Boundary

Agentique UI includes a browser-local external intake scanner for user-selected folders or files. The scanner produces advisory review evidence aligned with companion validator external intake semantics and keeps reports limited to relative paths, bounded prefixes, redacted secret findings, payload classifications, script/workflow/lifecycle findings, Git metadata findings, repository limits, and license policy signals.

The scanner must not clone, fetch, install, build, run tests, execute workflows, start Docker, extract archives, upload, publish, approve, moderate, certify, or provide legal review. It is not platform approval, safety certification, moderation status, runtime compatibility proof, package publication evidence, hosted runtime evidence, universal runtime evidence, or platform download availability.

Secret-like values, private absolute paths, credential URLs, and internal markers must be redacted or blocked before they appear in UI evidence. Truncated secret, dangerous-capability, and script/workflow inspections must fail closed rather than accepting a partially inspected candidate.
