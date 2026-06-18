# External Runtime Bridge Guard Contract

Status: guarded preflight only. This contract does not start a bridge or external runtime.

## Purpose

External runtime bridges are high-risk because they can connect Agentique UI to user-owned runtimes such as workflow tools, local clients, or provider adapters. A bridge can only be considered for launch after a fail-closed review proves explicit user intent, loopback-only networking, per-launch auth, safe descriptors, permission grants, shutdown, and cleanup.

## Approval Requirements

- Source must be explicit user action.
- Deep links, public readback, and descriptor viewing cannot start or authorize a bridge.
- Network mode must be localhost-only.
- Bind host must be `127.0.0.1` or `localhost`.
- Auth must be per-launch token auth, referenced ephemerally and never emitted as raw material.
- Descriptor payload must be free of secrets, local paths, commands, private markers, and non-loopback hidden network targets.
- Permission preflight must pass for bridge network and external provider requirements.
- Shutdown must be user-visible and bounded.
- Cleanup must require a receipt and path-free cleanup scope.

## Output

The guard returns `agentique.externalRuntimeBridgeGuard.v1` with:

- `approvedForLaunch`
- `startsBridge: false`
- sanitized network summary
- payload safety summary
- permission preflight summary
- shutdown and cleanup readiness
- redacted errors

`startsBridge` remains false because the guard is a review gate, not a process launcher.

## Non-Claims

This contract does not provide a production desktop runtime, universal workflow runtime, installer, updater, external runtime daemon, bridge process, browser-cookie access, ambient environment access, generic shell execution, or hosted execution.
