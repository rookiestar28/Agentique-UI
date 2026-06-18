# Linux Package Gate

Status: configured gate, publication blocked until Linux package evidence exists.

Agentique UI uses Tauri's Linux deb, rpm, and AppImage bundle targets. A public Linux release requires package metadata verification, dependency compatibility evidence, AppImage launch smoke, checksums, provenance, and cleanup evidence from a Linux runner.

## Build Entry

```powershell
npm run tauri:build:linux
```

The build command targets deb, rpm, and AppImage artifacts. Real distribution output must be created on Linux. Generated artifacts must stay out of Git and must be represented in release evidence only by path-neutral artifact names, SHA-256 digests, package metadata status, dependency status, and smoke summaries.

## Baseline Policy

Linux validation must record a conservative baseline such as Ubuntu 22.04 or Debian 12. The gate requires WebKitGTK and GLib compatibility evidence because Tauri desktop behavior can vary across distro and runtime library versions.

## Package Metadata

Release evidence must verify:

- package name,
- version,
- architecture,
- dependencies,
- desktop entry metadata,
- checksums for every package artifact.

## AppImage Compatibility And Updater Policy

AppImage is the first Linux updater artifact until deb or rpm update behavior is separately proven. AppImage smoke must cover launch, WebKitGTK compatibility, GLib compatibility, sandbox warning review, uninstall or removal, cleanup, and redacted logs.

The release gate is validated with:

```powershell
npm run validate:release-linux
```

Release automation may use:

```powershell
npm run validate:release-linux -- --require-ready
```

The `--require-ready` mode fails when package artifacts, metadata, dependency checks, AppImage compatibility, updater artifact selection, or smoke evidence is missing.
