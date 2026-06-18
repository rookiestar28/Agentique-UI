# Final Release Readiness

Current decision: No-Go for public installer or updater publication.

Agentique UI has public release infrastructure, validation gates, draft workflow structure, and public documentation. It still has no released installer, no signed updater, no complete platform signing evidence, no clean-environment smoke evidence, and no public-safe workflow run identifier for a completed draft release.

No signed update channel is published yet. The final gate therefore reports `publicationAllowed=false`.

## Gate Summary

Ready:

- release metadata,
- draft workflow structure,
- public release docs.

Blocked:

- Windows public trust evidence because generated local artifacts are unsigned and smoke evidence is missing,
- macOS build, Developer ID signing, notarization, stapling, and quarantine launch evidence,
- Linux package metadata, dependency, AppImage compatibility, and updater artifact evidence,
- updater key custody, public key, endpoint, signed artifacts, `latest.json`, download checks, and rollback evidence,
- clean-environment install/update/uninstall smoke evidence,
- public-safe GitHub workflow run identifier for final release review.

## Publication Rule

The source repository can be reviewed publicly, but desktop release publication remains No-Go until every platform, updater, smoke, docs, provenance, and public-boundary gate is ready.

Use:

```powershell
npm run validate:release-final
```

Release automation may use:

```powershell
npm run validate:release-final -- --require-ready
```

The `--require-ready` mode fails while any final gate remains blocked.
