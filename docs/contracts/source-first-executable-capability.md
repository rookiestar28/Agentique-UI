# Source-First Executable Capability

Status: source-first local workspace posture accepted; executable capability strengthening rows accepted for supported-local-only scope; release and production runtime claims remain parked.

Agentique UI is a source-first local workspace. It can describe, verify, preview, and run only supported local resources through capability-gated flows. The accepted runtime scope is `supported-local-only`.

This contract is the posture boundary for the completed executable capability strengthening work. It does not publish a signed desktop app, signed installer, updater channel, or production desktop runtime.

## Accepted Vocabulary

- `source-first local workspace`: users run Agentique UI from source checkout or local development flows unless a separate release gate later approves distribution.
- `supported-local-only`: local runs require a supported resource, allowlisted adapter, scoped user grant, bounded logs, bounded artifacts, and cleanup evidence.
- `capability-gated local run`: every executable family needs an explicit gate before UI wording can claim support.
- `descriptor-only handoff`: external agent-client or runtime handoff may be prepared as a descriptor, but it must not start automatically.
- `parked release claim`: distribution claims stay blocked until a separate release gate has evidence.

## Capability Matrix

The accepted strengthening sequence is native event transport, revocation and cancel controls, durable run ledger, watchdog heartbeat, artifact receipt, runtime prerequisite diagnostics, external agent-client handoff, multi-lane execution readiness, and closeout validation and claim sync. These accepted rows remain source-first and supported-local-only.

| Capability                          | Current state | Acceptance boundary                                                                                                                                        |
| ----------------------------------- | ------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source-first posture boundary       |      Accepted | Current source-checkout workspace scope, supported-local-only vocabulary, and no-overclaim checks are explicit.                                            |
| Active native event transport       |      Accepted | Native event transport uses versioned bounded payloads, redaction, ordered ids, listener cleanup, and replay fallback for supported local runs.            |
| User revocation and cancel controls |      Accepted | Revoke, cancel, and forced-stop actions have native enforcement receipts, stale-grant denial, and cleanup-aware retry boundaries.                           |
| Durable run ledger                  |      Accepted | Restart replay has a versioned local ledger, corruption fallback, bounded retention, and redacted export evidence.                                         |
| Watchdog heartbeat                  |      Accepted | Heartbeat, timeout, cleanup escalation, and orphan checks have native-owned evidence on tested local lanes.                                                |
| Artifact receipt                    |      Accepted | Artifact viewer binding records run identity, digest, size, MIME policy, retention, cleanup state, and preview-safe behavior.                              |
| Runtime prerequisite                |      Accepted | Runtime diagnostics are non-mutating and do not install packages or run package lifecycle hooks.                                                           |
| External agent-client handoff       |      Accepted | External handoff descriptors require explicit user action and safe destinations without credentials or browser cookie forwarding.                           |
| Multi-lane execution readiness      |      Accepted | Additional adapter families remain disabled by default until lane-specific sandbox, permission, watchdog, artifact, license, and signature gates pass.     |
| Closeout validation and claim sync  |      Accepted | Public-safe validation, no-secret scans, source-first docs, interaction evidence, status sync, and blocked release claims are mapped in the closeout pack.  |

## Parked Release Claims

The following claims remain parked:

- signed desktop app;
- signed installer publication;
- updater publication;
- production desktop runtime.

The following runtime claims remain false:

- hosted runtime;
- universal workflow runtime;
- generic shell;
- automatic downloaded workflow execution;
- browser data access;
- ambient environment access;
- package lifecycle execution.

## Public Safety

Public evidence for this contract must be path-neutral and secret-free. It must not expose private planning material, local absolute paths, tokens, cookies, credentials, raw logs, or unredacted artifacts.

Passing this closeout pack does not publish a released desktop build, installer, updater, or production runtime. It means the source-first supported-local-only boundary is current, testable, and synchronized with the executable capability closeout pack.
