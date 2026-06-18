# Windows Installer Gate

Status: configured gate, publication blocked until installer evidence exists.

Agentique UI uses Tauri's Windows bundle targets for NSIS and MSI. The repository exposes a repeatable build entry point, but a public Windows release remains blocked until artifacts, signatures, timestamps, and install smoke evidence are complete.

## Build Entry

```powershell
npm run tauri:build:windows
```

The build command targets NSIS and MSI. Generated installer artifacts must stay out of Git and must be represented in release evidence only by path-neutral artifact names, SHA-256 digests, signature status, and smoke summaries.

## Signing Policy

Public Windows distribution requires:

- verified Authenticode signature,
- trusted timestamp verification,
- signer identity review,
- checksum record for every installer,
- redacted smoke-test evidence.

Unsigned artifacts are for local smoke only. They must not be described as public, trusted, stable, or production-ready.

## SmartScreen Caveat

Microsoft Defender SmartScreen can warn on unsigned or newly signed Windows installers until publisher reputation is established. This is a distribution trust issue, not a validation bypass. A public release still requires verified signature, timestamp, checksum, provenance, and smoke evidence.

## Smoke Requirements

Windows smoke evidence must cover:

- install,
- launch,
- version check,
- uninstall,
- cleanup of local state,
- redacted logs.

The release gate is validated with:

```powershell
npm run validate:release-windows
```

Release automation may use:

```powershell
npm run validate:release-windows -- --require-ready
```

The `--require-ready` mode fails when installer artifacts, signing, timestamp, or smoke evidence is missing.
