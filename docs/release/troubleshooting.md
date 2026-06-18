# Troubleshooting

Status: development and release-gate troubleshooting only.

## Validation Fails

Run:

```powershell
npm run validate
```

The validation output identifies the failing gate. Fix the first root-cause failure, then rerun the failed command and the full validation gate.

## Local App Window Does Not Open

For source-checkout use, the default manual launch path is:

```powershell
npm run dev:app
```

If a browser is installed but not selected automatically, request it explicitly:

```powershell
npm run dev:app -- --browser=chrome
npm run dev:app -- --browser=edge
npm run dev:app -- --browser=brave
npm run dev:app -- --browser=vivaldi
npm run dev:app -- --browser=firefox
```

When the dev server is already running, use `npm run open:app` instead. The raw `npm run dev` server is for automation, screenshots, or browser debugging and does not by itself open the standard app-style window.

## Installer Is Missing

No released installer is currently published. Platform installer artifacts are generated only by release build paths and remain blocked until signing and smoke evidence exist.

## Updater Is Missing

No signed updater is currently published. Update checks remain blocked until updater key custody, endpoint, manifest, signature, download, no-update, bad-signature, and rollback evidence exist.

## Platform Trust Warnings

Unsigned or newly signed artifacts can trigger platform trust warnings. Do not treat warnings as acceptable for a public release. Public release claims require verified platform trust evidence.

## Logs

Logs attached to issues or release evidence must be redacted. Remove credentials, tokens, private paths, browser storage, signing material, and user-specific workspace data.
