# Distribution Readiness Gate

Status: evidence-gated, bundle metadata active, no released installer, no published installer

This repository has Tauri bundle metadata active for release packaging validation. It does not yet publish a desktop installer, signed updater, release channel, or installable desktop runtime. Distribution readiness is treated as a validation contract that must pass before any public installable release claim.

## Required Evidence

Each platform must provide evidence for:

- Installer artifact digest.
- Verified code signature.
- Signed update metadata.
- Tested rollback plan.
- Vulnerability disclosure process.
- Release provenance.
- Install smoke test.
- Uninstall smoke test.
- Clean environment smoke test.

Supported platform gates:

- Windows
- macOS
- Linux

## Blocking Rules

Release readiness is blocked when:

- Tauri bundle metadata is missing or disabled.
- Updater artifacts remain disabled until signing key custody and manifest verification are complete.
- Any platform is missing required evidence.
- Signature evidence is present but not verified.
- Update metadata is present but not signed.
- Rollback evidence is present but not tested.
- Evidence contains local paths, secret material, or private planning references.

## Current Repository State

The current repository remains a local UI and release metadata baseline. The readiness gate intentionally reports blockers until real installer artifacts, signing evidence, updater metadata, rollback evidence, and clean-environment smoke results exist.

## Validation

The public validation path is:

```powershell
npm run validate
```

The gate must pass together with public-boundary scanning before any release-readiness record can be considered complete.
