# Security Policy

Agentique UI is a local-first desktop/workspace project. The current repository includes supported-local-only runner contracts and UI controls, but it does not publish a released installer, signed updater, hosted runtime, universal workflow runtime, or production desktop runtime.

## Supported Versions

No stable public installer is supported yet. Source review and development validation happen on the current development branch until a signed release is published.

## Reporting A Vulnerability

Use GitHub Security Advisories or the repository owner's private security reporting channel when available. Do not post credentials, signing material, private keys, tokens, local paths, crash dumps with secrets, or raw logs in public issues.

Public reports should include:

- affected version or commit,
- platform,
- high-level impact,
- reproduction summary without secrets,
- whether the issue affects source validation, packaging, updater metadata, local file access, adapter review, permission grants, run artifacts, or local-run controls.

## Local Runner Boundary

The supported execution lanes are the fixed native Python and Node adapters plus their deterministic native DAG scheduler on verified Windows and Linux environments only.

macOS is unverified and is not a supported local-execution platform.

Supported local runs require explicit resource capability review, signed allowlisted adapters, scoped permission grants, Permission Center policy review, bounded logs/artifacts, run dashboard evidence, artifact workbench review, and cleanup evidence. Generic shell access, browser-data access, ambient environment forwarding, unsigned adapter execution, and automatic execution of arbitrary downloaded resources remain blocked.

The currently validated first-class workflow import formats are n8n, Dify, and LangGraph. Secondary workflow formats remain backlog/reference only and are not supported import options or execution targets.

## Readiness Gate Boundary

MCP bridge readiness and browser automation consent remain guarded review surfaces only. They do not start bridges, launch browsers, attach browser profiles, import browser storage, or automate external providers. The WASM/WASI and rootless-container preflight reviews also remain non-executing and grant no runtime authority by themselves.

Separate native contracts validate two narrowly fixed adapters outside the supported-local product allowlist: one bundled no-import WebAssembly module on Windows and one pre-provisioned rootless-container command on Linux. They do not accept caller-selected modules, images, commands, paths, arguments, mounts, networks, or environment values; they do not pull or build images; and they do not establish generic WASM/WASI, container, macOS, production, or release support.

Scheduler models do not grant executable authority; only the fixed native DAG scheduler can launch attempts after native approval validation. A checkpointed approval interrupt pauses before spawn, then accepts only an exact native decision and one-use grant; denial, drift, expiry, revocation, replay, or coordinator loss launches nothing. That native scheduler accepts no executable, path, argument, script, environment, shell, or package action; each initial run or retry consumes its own explicit one-use grant. The earlier workflow scheduler model remains review-only. The fixed Node lane launches only its native-owned packaged helper: package managers, lifecycle scripts, inline scripts, broad subprocess, and automatic install remain blocked. Repo-local task lane and external agent-client pack surfaces remain review and descriptor flows.

## Vault And Diagnostics Boundary

Local vault UX stores references and metadata only in the current source scope. It must not read raw secret values into the web layer, import ambient environment values, collect browser data, export raw secrets, or include secret material in logs, artifacts, screenshots, or support evidence.

Diagnostics support bundle review is descriptor-only. It must remain bounded and redacted, and it must not collect raw logs, raw artifact bytes, browser data, cookies, tokens, signed URLs, environment snapshots, local absolute paths, or user workspace files.

## Release Security Boundary

A public desktop release requires real production signing for supported Windows and Linux artifacts, signed updater metadata, checksums, SBOM/provenance, clean-environment smoke evidence, and maintainer review. Until that evidence exists, installer, updater, and production runtime claims remain blocked. macOS packaging and environment validation are skipped and remain unverified and unsupported.
