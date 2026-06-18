# Desktop Runner Validation SOP

Status: Cross-platform local-runner acceptance gate

This SOP defines the minimum evidence required before Agentique UI can claim any local runner, sidecar, controlled execution, or installable desktop release.

## Baseline Command

Every change must pass:

```powershell
npm run validate
```

Runtime implementation work must add dedicated platform and interaction tests before any runnable claim.

## Cross-Platform Runner Acceptance Matrix

Local-runner acceptance requires evidence for all supported desktop platforms before any public local-run claim:

| Platform | Required Evidence |
|---|---|
| Windows | Local runner workflow, process cleanup, crash recovery, artifact redaction, no-secret scan, public-boundary scan, adapter signature check, and Playwright approve/start/cancel/artifact workflow evidence. |
| macOS | Local runner workflow, process cleanup, crash recovery, artifact redaction, no-secret scan, public-boundary scan, adapter signature check, and Playwright approve/start/cancel/artifact workflow evidence. |
| Linux | Local runner workflow, process cleanup, crash recovery, artifact redaction, no-secret scan, public-boundary scan, adapter signature check, and Playwright approve/start/cancel/artifact workflow evidence. |

Single-platform evidence is not enough for public local-runner acceptance. If a platform is intentionally unsupported, the public release notes and source docs must say so plainly and the validator must keep that platform out of the supported-platform claim.

## Required Runner Evidence Manifest

Every accepted runner evidence packet must contain:

- a command-log reference that is public-safe, path-neutral, and secret-free;
- local execution result for each supported platform;
- process-tree cleanup evidence with zero orphaned processes;
- crash recovery evidence showing the run returns to a recoverable state;
- artifact redaction evidence for logs, outputs, screenshots, traces, and exports;
- no-secret and public-boundary scan results;
- Playwright workflow coverage for permission approval, start, cancel, status/log view, and artifact view;
- adapter signature evidence for active Python and Node lanes;
- preflight-only evidence for WASM and rootless container lanes until those lanes gain separate runtime evidence;
- a release-claim boundary proving installer, updater, production desktop runtime, hosted runtime, automatic execution, and universal runtime claims are false.

The evidence packet must reference this SOP before a local-runner acceptance record can be closed.

## Required Evidence Categories

| Category | Required Evidence |
|---|---|
| No-execution baseline | Prove resources can be inspected, validated, visualized, or handed off without executing code. |
| File permissions | Denied paths, traversal attempts, symlinks, overwrite attempts, and revoked grants fail closed. |
| Network permissions | Non-allowlisted hosts, cleartext URLs, unexpected redirects, and permission revocation fail closed. |
| Shell/process | Shell is blocked by default; sidecars are not treated as generic shell access; arguments are escaped and audited. |
| Environment | Ambient environment variables are not forwarded; allowlisted variables require explicit user approval. |
| Secrets | Secret values remain in a local vault/keychain abstraction and are redacted from logs, screenshots, exports, crashes, and artifacts. |
| WebView/content | HTML, Markdown, Mermaid, PDF, image, video, JSON, CSV, and log viewers prevent XSS, local file disclosure, and path traversal. |
| Updates/signing | Update metadata and release artifacts are signed, verified, channel-scoped, and rollback-capable. |
| Sidecars | Adapter packs are signed, allowlisted, compatibility-checked, localhost-authenticated, health-checked, redacted, and cleaned up. |
| Containers/GPU | Prompts and policy define device, mount, network, and resource limits before use. |
| Logs/artifacts | Run folders include predictable manifests, cleanup state, redaction, digest metadata, and failure status. |
| Browser data | Cookie/session scraping is blocked and covered by regression tests. |
| Public boundary | Public artifacts contain no private planning identifiers, local paths, credentials, tokens, cookies, private keys, or private operator notes. |

## Acceptance Rule

A feature is not accepted until its targeted tests and the full repository validation gate pass. Partial validation cannot support public runnable claims.

For local-runner acceptance, validation must also pass the desktop runner evidence gate. Missing platform evidence, missing cleanup, missing crash recovery, missing artifact redaction, missing Playwright workflow coverage, missing adapter signature checks, unsafe evidence references, or unsupported release claims fail the gate.

## Incident And Rollback Evidence

For release-impacting failures, record:

- affected version,
- affected artifact digests,
- failed validation category,
- mitigation,
- rollback or revocation action,
- final passing validation,
- confirmation that no secrets were written to logs or public artifacts.

## Non-Claims

This SOP is a validation requirement. It does not itself implement a runner, sidecar, updater, installer, vault, permission UI, or sandbox.
