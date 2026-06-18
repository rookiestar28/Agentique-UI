# Local Runner Threat Model

Status: supported-local-only boundary, no execution by default

Agentique UI handles resources from a public catalog and can present supported local-run behavior only after capability, adapter, permission, artifact, and cleanup gates pass. The app boundary remains no execution by default.

## Assets

- downloaded resource bytes,
- bundle manifests and verification results,
- local library index,
- local session drafts and artifacts,
- logs and failure reports,
- run-folder manifests, logs, outputs, artifacts, and cleanup receipts,
- user-selected folders,
- secret references and future local vault entries,
- updater metadata and release artifacts,
- sidecar adapter manifests,
- user trust decisions.

## Trust Boundaries

| Boundary | Risk |
|---|---|
| Website to desktop deep link | Spoofed or replayed import intent |
| Public API to local app | Tampered metadata or stale ticket |
| Downloaded bytes to local library | Digest/signature mismatch or partial import |
| WebView to Rust commands | Permission bypass or command injection |
| Local files | Path traversal, unintended overwrite, sensitive-file disclosure |
| Network | Unapproved host access, tracking, data exfiltration |
| Shell/process | Hidden command execution, process persistence, argument injection |
| Environment variables | Ambient secret exposure |
| Local secrets | Secret value leakage through logs, screenshots, exports, or crash reports |
| Sidecars | Unsigned adapter execution, localhost auth bypass, unclean shutdown |
| Containers and GPU | Overbroad host access, resource abuse, device exposure |
| Updates | Tampered update metadata, unsigned artifact, rollback failure |
| Browser data | Cookie or session scraping |
| Logs and artifacts | Private data leakage or unrecoverable cleanup state |

## Default Deny Rules

- No resource code execution by default.
- No shell execution by default.
- No ambient file access.
- No ambient network access.
- No ambient environment-variable forwarding.
- No browser-cookie or browser-storage scraping.
- No secret values in resource packages, logs, screenshots, exports, or public evidence.
- No unsigned or tampered adapter pack execution.
- No update installation without signature and provenance checks.

## Required Controls

- Parse all external inputs as untrusted.
- Validate every bundle, deep-link intent, ticket, digest, and support mode.
- Enforce file/network/shell/environment permissions in implementation, not only in documentation.
- Store secret values only through a local vault/keychain abstraction.
- Use redaction before logs, artifacts, screenshots, exports, and failure records are written.
- Track cleanup state for failed imports, failed validation, and failed future runs.
- Keep sidecars localhost-only with per-launch authentication, signed adapter packs, health checks, bounded directories, bounded environment, and process-tree cleanup.
- Record permission decisions and revocations in local audit state.
- Require signed allowlisted adapters, bounded run folders, timeout/cancellation behavior, and cleanup receipts before any supported local run.

## Non-Goals

This threat model does not approve arbitrary downloaded-resource execution, generic shell access, installer publication, updater publication, hosted execution, universal workflow runtime behavior, unsigned sidecars, broad container access, GPU access, or external provider automation. Those require implementation-specific tests and acceptance evidence beyond the supported-local-only runner boundary.
