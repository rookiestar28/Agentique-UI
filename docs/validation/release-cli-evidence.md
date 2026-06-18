# Release CLI Evidence

Status: partial CLI evidence collected, publication remains No-Go.

Date: 2026-06-11

This note records public-safe release evidence gathered from command-line checks. It is not a release approval. Installer, updater, macOS, and global smoke gates remain blocked until every platform has signed artifacts, updater metadata, clean-environment smoke results, and provenance evidence.

## Windows

Build command:

```powershell
npm run tauri:build:windows
```

Artifacts:

| Target | Artifact | SHA-256 | Signature |
| --- | --- | --- | --- |
| NSIS | `Agentique UI_0.1.0_x64-setup.exe` | `4d7c4008a97585d807bb8b5c44d2a6b07fe502b56be046267768964e87fe88a4` | NotSigned |
| MSI | `Agentique UI_0.1.0_x64_en-US.msi` | `633931fa795566fb906fd0f8bbf58c65845dbd8af018835df17237d0256b56c2` | NotSigned |

Local smoke summary:

- Silent install exit code: `0`
- Product version: `0.1.0`
- Launch observed: yes
- Silent uninstall exit code: `0`
- Cleanup complete: yes
- Logs redacted: yes

Blockers:

- Windows artifacts are unsigned.
- Trusted timestamp evidence is missing.
- Public Windows release still requires verified code-signing certificate evidence.

## Linux

Build command:

```bash
npm run tauri:build:linux
```

Environment:

| Check | Result |
| --- | --- |
| Baseline | Ubuntu 22.04 |
| Node.js | `v20.20.2` |
| Rust | `rustc 1.96.0` |
| WebKitGTK | `2.50.4` |
| GLIBC | `2.35` |

Artifacts:

| Target | Artifact | SHA-256 |
| --- | --- | --- |
| deb | `Agentique UI_0.1.0_amd64.deb` | `35f390d8b7e46f12f34b481572b1fa7a26cd21882ca08f7b3ac6898a632384f3` |
| rpm | `Agentique UI-0.1.0-1.x86_64.rpm` | `50568d1f1af577191047f6bce1a73c592c0f5e56994fc924f225a356f0759ae1` |
| AppImage | `Agentique UI_0.1.0_amd64.AppImage` | `a9d88de4df067f55a8c4ba98e309106570b5d1e9f637729b0d3202a0b00f064c` |

Package metadata:

- deb package: `agentique-ui`
- deb version: `0.1.0`
- deb architecture: `amd64`
- deb dependencies: `libwebkit2gtk-4.1-0`, `libgtk-3-0`
- rpm package: `agentique-ui`
- rpm version: `0.1.0`
- rpm architecture: `x86_64`
- desktop entry validation: passed

Local smoke summary:

- deb install exit code: `0`
- Installed binary found: yes
- GUI launch observed through WSLg: yes
- deb uninstall complete: yes
- AppImage launch observed through WSLg: yes
- Temp log cleanup complete: yes
- Logs redacted: yes

Blockers:

- This is WSL-based local evidence, not a clean runner or VM release smoke record.
- Global release smoke still needs update behavior evidence.
- Linux updater publication remains blocked until the signed AppImage update path is connected to release metadata.

## Updater

Local updater signing preparation:

- Updater signing key pair generated outside the repository.
- Signing key password stored outside the repository using user-scoped encrypted storage.
- Signature files generated for available Windows and Linux artifacts.

Generated signature files:

| Artifact | Signature file |
| --- | --- |
| `Agentique UI_0.1.0_x64-setup.exe` | `Agentique UI_0.1.0_x64-setup.exe.sig` |
| `Agentique UI_0.1.0_x64_en-US.msi` | `Agentique UI_0.1.0_x64_en-US.msi.sig` |
| `Agentique UI_0.1.0_amd64.deb` | `Agentique UI_0.1.0_amd64.deb.sig` |
| `Agentique UI-0.1.0-1.x86_64.rpm` | `Agentique UI-0.1.0-1.x86_64.rpm.sig` |
| `Agentique UI_0.1.0_amd64.AppImage` | `Agentique UI_0.1.0_amd64.AppImage.sig` |

Blockers:

- Updater artifacts remain disabled in Tauri config.
- No public updater endpoint is configured.
- No release `latest.json` is published.
- No macOS updater artifact exists.
- Update version evidence must be newer than the current package version.
- Bad-signature, no-update, and rollback behavior tests are still missing.

## macOS

macOS evidence was not collected in this environment.

Required blockers remain:

- app and DMG artifacts,
- Developer ID signing,
- notarization acceptance,
- stapled ticket,
- quarantine launch smoke,
- install, version, uninstall, cleanup, and redacted log evidence.

## Validation

Full repository validation after evidence collection:

```powershell
npm run validate
```

Result:

- 219 tests passed.
- Public-boundary scan passed across 169 checked files.
- Final release gate remains `No-Go` with Windows, macOS, Linux, updater, and global smoke gates blocked.
