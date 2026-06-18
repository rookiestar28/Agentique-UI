# WASM/WASI Sandbox Gate Contract

Status: guarded preflight only. This contract does not execute WebAssembly and does not provide a production desktop runtime.

Agentique UI treats WASM/WASI adapters as local code execution. A future WASM lane can only move beyond preflight after sandbox limits, capability mapping, permission grants, artifact handling, cleanup, and public claim boundaries are proven.

## Required Preflight

The sandbox gate requires:

- execution remains disabled until runtime evidence is accepted;
- memory, time, stdout, stderr, artifact count, and artifact byte limits;
- fuel or equivalent deterministic instruction metering;
- workspace-scoped file declarations only;
- disabled or loopback-only network declarations;
- empty environment or vault-reference-only environment declarations;
- deterministic or disabled clocks;
- seeded or disabled random source;
- subprocess, shell, and browser data access denied;
- artifact redaction, bounded output paths, cleanup, and cleanup receipts;
- permission-grant preflight for the declared files, loopback network, vault references, adapter preflight, and artifact retention.

## Blocked Declarations

The gate blocks:

- broad host filesystem access;
- path traversal, home directory, drive-root, or raw local path material;
- public network access;
- ambient environment forwarding;
- raw credential material;
- host clocks or host random source;
- subprocess or shell declarations;
- browser data access;
- claims that WASM execution, a universal runtime, installer, updater, automatic execution, or production desktop runtime is available.

## Output

The review output is deterministic and redacted. A successful review returns `preflight-ready` while keeping `enabledForExecution: false`. A blocked review returns explicit error codes for the failed sandbox gate.

## Non-Goals

This contract does not instantiate a WASM module, compile WebAssembly, call a native runtime, expose a Tauri command, start a sidecar, install dependencies, or publish release artifacts.
