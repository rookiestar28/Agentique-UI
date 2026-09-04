# macOS Signing And Notarization Gate

Status: skipped, unverified, and unsupported by current owner direction.

Agentique UI does not build or validate macOS packages in the current supported distribution scope. The retained policy describes requirements that would apply only after a future explicit scope change. No current app/DMG, Developer ID, notarization, stapling, or quarantine-launch result exists.

## Build Entry

```powershell
npm run tauri:build:macos
```

The build command targets app and DMG artifacts. Real distribution output must be created on macOS. Generated artifacts must stay out of Git and must be represented in release evidence only by path-neutral artifact names, SHA-256 digests, signing status, notarization status, stapling status, and smoke summaries.

## Signing And Notarization Policy

Public macOS distribution requires:

- Developer ID Application signing,
- codesign verification,
- Gatekeeper assessment,
- notarization acceptance,
- stapled notarization ticket,
- checksum record for every artifact,
- redacted smoke-test evidence.

Ad-hoc or unsigned artifacts are for local smoke only. They must not be described as public, trusted, stable, or production-ready.

## Quarantine Launch Smoke

macOS smoke evidence must cover:

- quarantine-aware launch,
- version check,
- uninstall or app removal,
- cleanup of local state,
- redacted logs.

The release gate is validated with:

```powershell
npm run validate:release-macos
```

Release automation may use:

```powershell
npm run validate:release-macos -- --require-ready
```

The `--require-ready` mode fails when app/DMG artifacts, Developer ID signature, notarization, stapling, or smoke evidence is missing.
