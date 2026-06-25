# Companion Capability Boundary

Status: source-selection boundary for companion package integration.

Agentique UI may consume public companion package semantics when they improve local resource inspection, validation, acquisition, and review preparation. The desktop workspace does not absorb companion release ownership, registry publication, moderation, approval, or package-governance responsibilities.

## Source Packages

The first integration stage is scoped to these package surfaces:

- `@agentique.io/readback` for read-only public resource readback, canonical source-package download metadata normalization, trust state, parser-variant state, agent-native state, and badge projection.
- `@agentique.io/validator` for static package validation and no-execution local intake scanning.
- `@agentique.io/uploader` for review-only upload, import, variant, agent-native plan summaries, generated draft output, and patch preview output.
- `@agentique.io/action` as a CI reference only, not as desktop runtime code.

Each implementation must record the package name, package version, source revision, and consumed surface before a public release claim can change.

## Immediate Integration Scope

Agentique UI can integrate the following local utility capabilities first:

- read-only catalog and resource readback projection,
- trust, parser-variant, agent-native, and download proof badges,
- static package validation reports,
- safe download metadata review with canonical source-package readiness and user-selected artifact acquisition,
- review-only plan, draft, and patch preview,
- bounded local folder or repository intake scanning with no execution.

These capabilities should improve the local workspace without creating a live submission, approval, publication, or release pipeline.

## Deferred Capabilities

The following capabilities require separate evidence before they can be added:

- authenticated review submission,
- upload status polling,
- upload token storage,
- registry package publication,
- live upload availability,
- release governance execution,
- GitHub Action execution inside the desktop app,
- package-manager install or lifecycle execution,
- automatic publication,
- installer or updater publication,
- hosted runtime or universal workflow runtime behavior.

## Safety Rules

- Companion readback is read-only by default.
- Static package validation and intake scanning must not execute package scripts, workflow actions, installers, builds, tests, Dockerfiles, or generated binaries.
- Local file access must be user selected, scoped, capped, and redacted in reports.
- Download acquisition must require canonical `sourcePackage` readiness when present, safe destination, bounded redirects, expected size checks, digest checks, atomic writes, and cleanup evidence.
- Metadata-only, malformed, placeholder, source-index, schema-only, or review-only package metadata must remain blocked before any byte acquisition proof can pass.
- Review-plan and draft previews remain local preview artifacts and must not submit data.
- Browser cookies, browser storage, ambient environment variables, shell profiles, npm tokens, SSH keys, cloud credentials, and signing material must not be read or forwarded.

## Public Claim Boundary

Companion integration does not prove:

- review approval,
- public package publication,
- live upload availability,
- automatic execution of downloaded resources,
- generic shell access,
- released installer availability,
- signed updater availability,
- production desktop runtime availability,
- hosted execution,
- universal workflow execution.

Unsupported resources must still keep a safe path through catalog inspection, static validation, preview, export, or handoff.
