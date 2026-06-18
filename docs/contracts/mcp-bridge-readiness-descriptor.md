# MCP Bridge Readiness Descriptor Contract

Status: descriptor review only. This contract does not start an MCP server, connect to an MCP server, install tools, call tools, read resources, run prompts, or provide a production desktop runtime.

Agentique UI treats MCP bridge setup as a high-risk local integration because servers can expose tools, resources, prompts, filesystem access, network access, credentials, and user workspace context. A future bridge lane can only move beyond descriptor review after explicit user action, server trust, capability listing, permission grants, credential references, audit receipts, shutdown behavior, cleanup, and public claim boundaries are proven.

## Required Descriptor Review

The MCP bridge readiness descriptor requires:

- explicit user action before any bridge can be considered;
- server identity, transport mode, scope, trust state, and revocation state;
- tool, resource, and prompt listing metadata only;
- vault-reference-only credential posture;
- loopback-only local bridge intent where networking is declared;
- denied authority evidence for filesystem, shell, package lifecycle, browser data, ambient environment, non-loopback network, and external-provider automation;
- permission-grant preflight for declared local bridge, credential reference, audit, and artifact-retention needs;
- bounded audit receipts, shutdown readiness, cleanup readiness, and redacted error summaries.

## Blocked Declarations

The descriptor blocks:

- automatic MCP server install or plugin install;
- package lifecycle hooks, build scripts, dependency installs, or generated binary execution;
- tool calls, resource reads, prompt execution, or remote-server connection attempts;
- raw credential material, browser data, cookies, tokens, storage state, local absolute paths, private workspace files, or ambient environment forwarding;
- non-loopback hidden network targets, shell commands, generic process execution, container starts, image pulls, WebAssembly execution, or browser automation;
- claims of MCP bridge launch, hosted runtime, universal runtime, signed installer, updater, or production desktop runtime publication.

## Output

The review output is deterministic and redacted. A successful review returns descriptor readiness while keeping `startsBridge: false`, `callsTools: false`, `readsResources: false`, and `runsPrompts: false`. A blocked review returns explicit error codes for the failed descriptor gate.

## Non-Goals

This contract does not install MCP servers, start bridge processes, connect to local or remote servers, call tools, read resources, run prompts, expose Tauri commands, persist credentials, publish release artifacts, or automate external providers.
