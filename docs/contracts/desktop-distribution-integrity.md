# Desktop Distribution Integrity

Agentique UI validates one strict offline distribution envelope for Windows and Linux. The
repository-side verifier binds every expected package to its platform, target, path-neutral
filename, exact byte length, SHA-256 digest, release version, channel, and signing-key identifier.
It verifies one detached Ed25519 signature per artifact and another over the complete canonical
manifest.

The required package set is exactly Windows x86_64 NSIS/MSI and Linux x86_64 deb/rpm/AppImage.
macOS packaging and environment validation are skipped; macOS remains unverified and unsupported.

## Trust Boundary

The verifier accepts only a public key, a signed plain-data envelope, observed artifact hashes and
lengths, the selected channel, current version, current time, and an explicit rollback flag. It
does not accept a private key, filesystem path, command, credential, endpoint, downloader,
installer, package manager, renderer authority, or publication decision.

Tests generate an ephemeral test key in memory. No test private key is written to the repository,
logs, artifacts, browser state, or Tauri state. Passing those tests proves cryptographic and policy
behavior only; it does not establish production signing, trusted publisher identity, public update
availability, or a released desktop runtime.

## Fail-Closed Policy

Verification rejects unknown fields, unstable JSON values, malformed keys or signatures, key-id
substitution, missing/extra/duplicate targets, unsafe filenames, hash or length drift, unsupported
platforms, wrong channels, future or expired manifests, invalid versions, and rollback-floor
violations. Equal versions return `no-update`. A downgrade requires an explicit rollback decision
and must remain at or above the signed rollback floor.

The receipt contains only bounded status, version, channel, public key id, canonical manifest hash,
counts, and explicit false production/publication fields. Raw keys, signatures, local paths, and
artifact content never appear in the receipt.

## Production Boundary

Updater artifact generation, a production updater public key, and a production endpoint remain
disabled until the release owner supplies externally held real production signing material and
authorizes release work. Local unsigned packages and test-key signatures remain non-publishable.
Real production signing, supported-platform clean install/update/uninstall smoke, provenance,
rollback, review, and explicit publication authorization are separate requirements.
