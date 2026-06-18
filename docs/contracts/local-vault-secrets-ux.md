# Local Vault Secrets UX Contract

This contract describes the local vault/secrets UX evidence surface. It is a guarded reference-only review contract, not a native secret storage implementation.

## Accepted Posture

- Vault records contain opaque references and metadata only.
- OS keychain and Stronghold are reviewed but not integrated by this contract.
- Store-style persistence is metadata-only and must not hold raw secret values.
- Add, remove, rotate, missing, stale, and unlock-failed lifecycle states are represented through receipts and reference ids only.
- Previews, exports, logs, screenshots, and support bundles are redacted, bounded, and path-neutral.
- Screenshots are metadata-only screenshots for evidence purposes.
- There are no packaged secrets; ambient environment imports, browser data imports, cookies, storage state, local secret files, raw logs, and raw screenshots are denied.

## Explicit Non-Claims

- This contract does not implement native keychain storage.
- This contract does not implement Stronghold storage.
- This contract does not read secret values into the web layer.
- This contract does not perform OAuth token exchange, webhook execution, or external-provider automation.
- This contract does not package, export, log, screenshot, or forward raw secret values.
