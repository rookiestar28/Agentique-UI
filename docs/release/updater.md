# Updater Gate

Status: configured gate, publication blocked until signing key custody and release endpoint evidence exists.

Agentique UI uses an evidence-gated updater policy. Updater artifacts and static `latest.json` publication must not be enabled until the release owner has finalized key custody, release URL, platform signatures, download verification, and rollback behavior.

## Current Configuration

`createUpdaterArtifacts` stays disabled until updater signing is configured. The app also does not configure a public updater key or endpoint yet. This prevents a development repository from accidentally publishing update metadata ahead of signing and rollback evidence.

## Key Custody

Updater private signing keys must remain outside Git, logs, build artifacts, screenshots, and public evidence. Public release evidence may record only:

- external key custody status,
- public key configuration status,
- endpoint configuration status,
- `.sig` artifact names,
- platform download/signature/version check results.

## Manifest Shape

The release gate validates a static `latest.json` shape with:

- release version,
- release notes,
- publication timestamp,
- platform entries,
- HTTPS URL per platform,
- signature per platform.

All platform entries present in the manifest must be complete. Missing signatures or non-HTTPS URLs block publication.

## Failure Behavior

Updater publication requires tests for:

- bad-signature update rejection,
- no-update no-op behavior,
- rollback by replacing or revoking the static manifest,
- download and version checks for every platform.

The release gate is validated with:

```powershell
npm run validate:release-updater
```

Release automation may use:

```powershell
npm run validate:release-updater -- --require-ready
```

The `--require-ready` mode fails when updater artifacts, public key, endpoint, signatures, `latest.json`, download checks, or rollback evidence is missing.
