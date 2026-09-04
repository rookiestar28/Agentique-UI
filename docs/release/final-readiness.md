# Final Release Readiness

Current decision: No-Go for public installer or updater publication.

Agentique UI has Windows/Linux release infrastructure, validation gates, draft workflow structure, public documentation, and an offline cryptographic integrity verifier. It still has no released installer, no signed updater, no real production signing evidence, no clean-environment production smoke evidence, and no public-safe workflow run identifier for a completed draft release. Production runtime status remains blocked.

No signed update channel is published yet. The final gate therefore reports `publicationAllowed=false`.

## Gate Summary

Ready:

- release metadata,
- draft workflow structure,
- public release docs.

Blocked:

- Windows public trust evidence because generated local artifacts are unsigned and smoke evidence is missing,
- Linux package metadata, dependency, AppImage compatibility, and updater artifact evidence,
- updater key custody, public key, endpoint, signed artifacts, `latest.json`, download checks, and rollback evidence,
- clean-environment install/update/uninstall smoke evidence,
- public-safe GitHub workflow run identifier for final release review.

## Publication Rule

The source repository can be reviewed publicly, but Windows/Linux desktop release publication remains No-Go until every supported-platform, updater, smoke, docs, provenance, and public-boundary gate is ready. macOS packaging and environment validation are skipped and remain unverified and unsupported.

Use:

```powershell
npm run validate:release-final
```

Release automation may use:

```powershell
npm run validate:release-final -- --require-ready
```

The `--require-ready` mode fails while any final gate remains blocked.
