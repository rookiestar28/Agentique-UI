# External Runtime Handoff Non-Execution Contract

Status: descriptor-only, user-owned, and not executed by Agentique UI.

## Classification

Every external runtime handoff uses `external-user-owned-handoff`. Its receipt states that native
scheduler admission, launch authority, bridge/runtime start, network access, file writes, client
opening, and app-owned completion are false. `externalExecutionStatus` remains `not-executed`, and
a separate bridge acceptance is required before any future bridge work.

Completed fixed local predecessors may be shown as bounded partial evidence. They never prove that
an external node ran or that a destination accepted the handoff.

## Native Boundary

The native command allowlist remains exactly 16 commands. The default capability remains limited
to Tauri event listen and unlisten. No external-runtime, bridge, or handoff command is admitted.

## Data Safety

Receipt execution and completion sections use exact keys and reject missing, unknown, or
contradictory fields. Exported values remain path-neutral, secret-free, command-free, and free of
private planning or reference markers. The app does not forward credentials, cookies, ambient
environment, hidden URLs, scripts, arguments, or network authority.

## Product Meaning

The UI distinguishes supported fixed local execution from a non-executing external handoff:

- Not executed by Agentique UI.
- User-owned destination.
- Separate bridge acceptance required.

There is no action control that starts, connects to, opens, monitors, stops, or completes an
external runtime.

## Non-Claims

This contract is not bridge, provider, hosted, universal, production, release, deployment,
installer/updater, live-host, or macOS runtime evidence.
