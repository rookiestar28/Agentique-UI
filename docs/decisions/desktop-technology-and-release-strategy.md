# Desktop Technology And Release Strategy

Status: accepted for public release metadata

## Decision

Agentique UI uses Tauri v2, React, TypeScript, and Rust as the baseline for future desktop implementation.

The repository now carries a minimal Tauri source tree and active bundle metadata for release packaging validation. No installer, updater endpoint, signing key, release artifact, or runnable desktop binary is published by this decision.

## Stack Boundary

| Layer | Baseline |
|---|---|
| Desktop shell | Tauri v2 |
| Frontend | React and TypeScript |
| Local trust boundary | Rust commands and services |
| Contract validation | JSON Schema 2020-12 with Ajv in repository tests |
| Local data, future | SQLite or Rust-owned local store for non-secret state |
| Secrets, future | OS keychain or Stronghold-class local vault abstraction |

Electron remains a fallback only if future evidence shows Tauri cannot meet desktop compatibility, security, or distribution needs. A fallback requires a new public decision record before implementation.

## Security Model

Tauri capabilities, permissions, and scopes are treated as implementation controls, not as proof by themselves. Rust command implementations must enforce the requested file, network, shell, environment, sidecar, update, and artifact boundaries.

Future implementation must use narrow capabilities for each window or webview. Merging privileged and untrusted surfaces into the same capability boundary is not allowed without a reviewed security reason and tests.

## Release And Signing Gates

Agentique UI cannot be described as an installable production desktop runtime until all of these are defined and verified:

- Windows, macOS, and Linux build targets.
- Desktop code-signing owner and key custody policy.
- Update metadata format and signed update artifact verification.
- Release-channel policy for stable, beta, and local development builds.
- Rollback and downgrade behavior.
- Installer and uninstaller smoke evidence.
- Vulnerability disclosure and emergency revocation procedure.
- Build provenance evidence for released artifacts.

Signing keys and certificates must never be committed. Update signing private keys must remain outside repository history and validation artifacts.

## Provenance And Integrity

Future release artifacts must be tied to source revision, build workflow, artifact digest, signer identity, and release channel. Digest verification alone is not enough for a public release claim; signer and provenance policy must also be checked.

## Rollback

If a release fails verification after publication, the release owner must be able to:

- identify the affected version and artifact digests,
- revoke or replace updater metadata,
- publish a fixed build or rollback metadata,
- preserve an incident record without exposing secrets,
- confirm clean install and update recovery on supported platforms.

## Non-Claims

This decision does not create:

- an installable production desktop runtime,
- an installer,
- an updater endpoint,
- signing keys,
- release artifacts,
- a universal runtime runner,
- automatic arbitrary-resource execution.
