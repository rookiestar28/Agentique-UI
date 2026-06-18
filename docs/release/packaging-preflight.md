# Release Packaging Preflight

Current decision: No-Go for public installer, signed updater, or production desktop runtime publication.

The release packaging preflight is an evidence matrix. It does not build installers, publish updater metadata, create signing material, upload artifacts, or approve a desktop release.

Required evidence families:

- Windows installer artifact evidence.
- macOS package, signing, notarization, and stapling evidence.
- Linux package evidence.
- Signing and notarization status.
- Updater metadata and signature evidence.
- SHA-256 checksums.
- SBOM and provenance evidence.
- Clean install, update, and uninstall smoke evidence.
- Rollback evidence.
- Public-boundary scan evidence.
- Owner review evidence.

Normal validation keeps the project in a blocked No-Go state until all evidence families are ready. Maintainers may run a strict release-readiness check with:

```sh
npm run validate:release-packaging-preflight -- --require-ready
```

That command must fail until every required evidence family is present and public-safe. Passing the normal preflight validation is not a release approval.
