# Launch Readiness Closeout

Status: contract baseline accepted, release metadata active, release remains evidence-gated

This closeout maps the current Agentique UI public repository state after the local workflow, handoff, adapter registry, and distribution readiness contracts were added.

## Delivered Scope

- Workflow graph editor contract: typed Agentique Workflow IR edits, validation, diff, undo, redo, compatibility warnings, and redacted export/import.
- External runtime handoff contract: descriptor-only compatibility reports for user-owned external runtimes, unsupported-node blockers, and no universal runtime claim.
- Agent-client handoff contract: review-only handoff plans for agent clients, local folders, and local bridge descriptors with reversible cleanup.
- Adapter registry contract: local registry review, version matrix, signature metadata, revocation override, update decisions, rollback metadata, and deterministic migration.
- Distribution readiness gate: platform evidence requirements for installer artifacts, signatures, updater metadata, rollback, vulnerability disclosure, provenance, install smoke, uninstall smoke, and clean-environment smoke.
- Release metadata gate: Tauri bundle metadata is active, updater artifact generation remains disabled until signing is configured, and no public installer is published by this closeout.

## Latest Fact Alignment

Later validation added supported-local-only runner evidence, deterministic Graph/Run scheduler sessions, signed Python/Node adapter lane evidence, source-preserving handoff descriptors, and a release-grade execution validation pack. Those later gates narrow the local-run scope; they do not change this launch closeout into installer, updater, hosted runtime, universal runtime, generic shell, browser-data bridge, or production desktop runtime approval.

## Current Non-Claims

Agentique UI still does not ship:

- Released desktop installer.
- Signed updater or update channel.
- General-purpose native command backend outside the supported-local-only runner boundary.
- Unreviewed or ambient sidecar adapter execution outside signed allowlisted adapter lanes.
- Automatic execution of arbitrary downloaded resources.
- Universal workflow runtime.
- Production desktop runtime.

## Required Release Responsibilities

Before any installable release claim, maintainers must provide:

- Windows, macOS, and Linux installer evidence.
- Verified code signing and key custody evidence.
- Signed update metadata and rollback evidence.
- Vulnerability disclosure and revocation process.
- Release provenance and artifact digest records.
- Install, uninstall, and clean-environment smoke evidence.
- Public claim review confirming docs and UI match evidence.

## Validation

The closeout gate is:

```powershell
npm run validate
```

The gate includes launch closeout validation, public-boundary scanning, TypeScript, production build, and the full Node test suite.
