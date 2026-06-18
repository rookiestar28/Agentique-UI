# Runner UI Execution Evidence

Scope: Agentique UI Graph and Run workspace execution controls.

## Evidence

- Desktop Graph viewport: `docs/validation/artifacts/runner-ui-graph-desktop.png`
- Narrow Run viewport: `docs/validation/artifacts/runner-ui-run-mobile.png`
- Playwright interaction evidence: accepted run-plan start, permission preflight, approve, revoke, blocked grant sample, rerun-after-grant, observe succeeded runner status, cancel active run, observe canceled runner status, and review retry/failure evidence surfaces.

## Acceptance Notes

- Start requires an accepted run plan and allowed permission preflight before the button is enabled; permission preflight, approve, revoke, blocked grant sample, rerun-after-grant, and redacted audit evidence stay visible in Graph and Run workspaces.
- Graph and Run workspaces expose start, cancel, status, log, and artifact controls tied to shared runner state.
- Graph and Run workspaces expose retry, failure propagation, skipped dependency, and cleanup receipt evidence.
- Graph and Run workspaces expose per-node streaming timeline evidence with stable event ids, dependency-chain evidence, adapter-lane event rows, cleanup stream rows, and a bounded redacted log preview.
- Graph and Run workspaces expose a human approval checkpoint where resume requires matching run id, checkpoint id, and pending interrupt id; rejection cancels without running the paused node, edited input is redacted, and descriptor-only handoff does not start an external runtime.
- Graph and Run workspaces expose external handoff descriptors for blocked and handoff-only nodes, link local partial evidence to the handoff requirement, and prove no bridge or external runtime is started. The expanded handoff evidence requires explicit user action for a user-owned client or export folder, constrains localhost and deep-link targets, records cleanup readiness, and proves unknown clients and unsafe payloads remain blocked.
- Import and Run workspaces expose source-preserving round-trip export evidence for n8n, Dify, and LangGraph samples, including source maps and loss-report entries, local executable subset counts, blocked nodes, external handoff needs, and the same no bridge or external runtime is started boundary.
- Run workspace exposes a run history and evidence browser for successful, failed, canceled, timed-out, cleanup-required, cleaned, and recovered runs. Cleanup actions are idempotent, rerun creates a new run id while preserving prior evidence, and all displayed evidence uses redacted descriptor paths.
- Run workspace exposes curated Python and Node adapter lane evidence with signed allowlisted pack status, permission asks, bounded run-folder artifacts, blocked pack samples, timeout/cancellation cleanup receipts, and adapter-scoped environment evidence. The React bundle displays validation-backed evidence and does not import Node-only adapter runner modules.
- Release-grade execution validation pack aggregates deterministic scheduler, Python and Node adapter lanes, blocked/handoff, permission, cancellation, timeout, cleanup, rerun, and human approval evidence while keeping bridge and external runtime startup disabled.
- Unsupported, high-risk, or permission-blocked states remain visible through blocked plan and handoff/blocked reason text.
- Screenshots contain no local absolute paths, raw credentials, cookies, or tokens.
- No production desktop runtime, installer, updater, hosted runtime, or universal runtime claim is made by this evidence.
