# Controlled Execution Foundation Closeout

Status: accepted foundation, not a released native runtime

This closeout records the controlled execution foundation now present in Agentique UI. It adds deterministic contracts for trusted adapter packs, Python and Node sidecar launch planning, permission decisions, run-folder manifests, cleanup, reproducibility, and public validation.

## Delivered Scope

- Adapter pack trust policy: signed manifest review, digest and signer checks, compatibility matrix, permission ceiling, provenance, update policy, revocation status, and allowlist enforcement.
- Python sidecar launch plan: signed adapter dependency, scoped workspace references, localhost-only network, per-launch auth, health check, redacted stdout/stderr, graceful shutdown, and process-tree cleanup.
- Node sidecar package lifecycle boundary: signed packaged adapter binary only; ambient package managers, install steps, package lifecycle scripts, and inline scripts are blocked.
- Permission audit engine: allow, deny, ask, revocation, workspace path scopes, host/protocol allowlists, shell/environment/browser-data denial, GPU/container/external-provider prompts, and redacted audit events.
- Run folder manifest: predictable `run.json`, logs, outputs, artifacts, viewer metadata, cleanup state, versions, permission summary, failure state, side-effect list, and reproducibility digest.
- Run page readback: the public UI surfaces adapter review, Python launch plan, Node package policy, permission audit, and run-folder manifest summary.

## Security And Performance Checks

- No direct process spawn from the web layer.
- No direct shell command, child-process API, Tauri invoke, filesystem write API, WebSocket, XMLHttpRequest, or fetch call is introduced under `src/`.
- Side effects remain an explicit empty list in launch plans and run-folder manifests.
- Logs and failure messages are redacted before display or export.
- Revoked permissions override prior allow decisions.
- Unsafe paths, traversal, non-allowlisted hosts, ambient environment access, package lifecycle scripts, and missing cleanup fail closed.
- Run folder manifests use deterministic bounded data and do not write files from the web layer.

## Public Claim Boundary

This foundation does not introduce a released installer, updater, general-purpose native command backend, bundled sidecar binary, automatic arbitrary-resource execution, universal runtime, or ready-to-ship desktop runtime claim.

Future production-runtime claims require platform tests, installer/signing/update evidence, desktop runner SOP evidence, and another public claim review.

## Validation Evidence

The acceptance gate is:

```powershell
npm run validate
```

The gate includes contract validation, Tauri config validation, UI closeout checks, visual source checks, TypeScript, production build, Node tests, Phase 3 closeout validation, and public-boundary scanning.
