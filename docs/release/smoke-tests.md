# Release Smoke Tests

Status: configured smoke automation, execution blocked until signed artifacts and updater evidence exist.

Agentique UI release smoke is designed for clean or disposable environments. Normal repository validation checks the smoke plan and scripts, but it does not install or uninstall the app on a developer machine.

## Required Checks

Every platform smoke run must verify:

- artifact presence,
- signature or platform trust status,
- install,
- launch,
- version,
- update,
- uninstall,
- cleanup,
- redacted logs.

## Platform Scripts

The public script entry points are:

- `scripts/release-smoke-windows.ps1`
- `scripts/release-smoke-macos.sh`
- `scripts/release-smoke-linux.sh`

Each script fails closed when required artifacts are missing. Update checks require a signed updater manifest. Smoke logs must be redacted before they are attached to release evidence.

## Evidence Policy

Release smoke evidence must be path-neutral and must not include raw local paths, credentials, private signing material, raw logs, or machine-specific user profile data. A public release remains blocked until smoke evidence covers install, launch, version, update, uninstall, cleanup, and redacted logs for Windows, macOS, and Linux.

The release smoke gate is validated with:

```powershell
npm run validate:release-smoke
```

Release automation may use:

```powershell
npm run validate:release-smoke -- --require-ready
```

The `--require-ready` mode fails when any platform smoke evidence is missing.
