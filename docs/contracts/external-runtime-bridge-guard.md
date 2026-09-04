# External Runtime Bridge Guard Contract

Status: guarded preflight only. This contract does not start a bridge or external runtime.

## Purpose

External runtime bridges are high-risk because they can connect Agentique UI to user-owned runtimes such as workflow tools, local clients, or provider adapters. This guard provides inert preflight evidence only. A separate bridge acceptance must exist before any future implementation may request connection or launch authority.

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

- `status: preflight-ready` only when the inert review passes
- `approvedForLaunch: false`
- `launchAuthorized: false`
- `separateBridgeAcceptanceRequired: true`
- `startsBridge: false`
- sanitized network summary
- payload safety summary
- permission preflight summary
- shutdown and cleanup readiness
- redacted errors

`startsBridge` and `launchAuthorized` remain false because this guard is a review gate, not a process launcher. Preflight readiness is not launch approval, connection authority, bridge acceptance, or proof that a user-owned runtime was contacted.

## Non-Claims

This contract does not provide a production desktop runtime, universal workflow runtime, installer, updater, external runtime daemon, bridge process, browser-cookie access, ambient environment access, generic shell execution, or hosted execution.
