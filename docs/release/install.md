# Install And Update

Status: no released installer or updater yet.

Agentique UI does not currently publish a stable desktop installer. The repository contains release gates and draft release automation, but public installation remains blocked until signed artifacts, updater metadata, checksums, provenance, smoke tests, and maintainer review pass.

## Development Checkout

For source-checkout development, the app-style local browser window is the default manual interface:

```powershell
npm install
npm run dev:app
npm run validate
```

This starts the local Vite dev server and opens Agentique UI in the standard local app window. It is not a released desktop installer.

If the dev server is already running, open only the app window:

```powershell
npm run open:app
```

Use `npm run dev` only when a raw browser tab is needed for automation, screenshot capture, or debugging. Browser-specific app-window commands are listed in the README.

## Future Desktop Installers

Future public releases must provide:

- Windows NSIS/MSI artifacts with verified signature and timestamp evidence,
- macOS app/DMG artifacts with Developer ID signing, notarization, stapling, and quarantine launch evidence,
- Linux deb/rpm/AppImage artifacts with package metadata, dependency, and AppImage compatibility evidence,
- checksums,
- SBOM and provenance,
- clean-environment install/update/uninstall smoke evidence.

## Updates

No signed update channel is published yet. Updater metadata remains blocked until key custody, final release endpoint, signatures, `latest.json`, download checks, no-update behavior, bad-signature rejection, and rollback evidence pass.
