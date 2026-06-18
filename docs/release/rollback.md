# Rollback

Status: rollback policy defined, no active updater channel yet.

Agentique UI release rollback is evidence-gated. A public release must have a rollback path before publication.

## Release Rollback

If a draft or public release fails verification:

- keep or return the release to draft when possible,
- remove or replace unsafe artifacts,
- replace or revoke update metadata,
- publish corrected checksums and release notes,
- record the public-safe reason and replacement version,
- rerun release validation and smoke gates.

## Updater Rollback

No signed updater channel is published yet. Future updater rollback must prove that a bad `latest.json`, bad signature, no-update state, and replacement manifest path behave safely before the updater gate can pass.

## User State

Rollback instructions must not require deleting user data without a separate backup and confirmation path. Cleanup steps should target only generated app cache, logs, and release smoke state unless a security advisory requires stronger action.
