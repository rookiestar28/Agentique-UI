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

Supported local runs require explicit resource capability review, signed allowlisted adapters, scoped permission grants, Permission Center policy review, bounded logs/artifacts, run dashboard evidence, artifact workbench review, and cleanup evidence. Generic shell access, browser-data access, ambient environment forwarding, unsigned adapter execution, and automatic execution of arbitrary downloaded resources remain blocked.

The currently validated first-class workflow import formats are n8n, Dify, and LangGraph. Secondary workflow formats remain backlog/reference only and are not supported import options or execution targets.

## Readiness Gate Boundary

MCP bridge readiness, WASM/WASI sandbox review, rootless container review, and browser automation consent are guarded review or preflight gates only. They do not start bridges, execute WebAssembly, start containers, pull images, build images, launch browsers, attach browser profiles, import browser storage, or automate external providers.

Python and Node adapter lanes are limited to signed allowlisted adapter evidence. Repo-local task lane and external agent-client pack surfaces remain review and descriptor flows, not package lifecycle execution or automatic install flows.

## Vault And Diagnostics Boundary

Local vault UX stores references and metadata only in the current source scope. It must not read raw secret values into the web layer, import ambient environment values, collect browser data, export raw secrets, or include secret material in logs, artifacts, screenshots, or support evidence.

Diagnostics support bundle review is descriptor-only. It must remain bounded and redacted, and it must not collect raw logs, raw artifact bytes, browser data, cookies, tokens, signed URLs, environment snapshots, local absolute paths, or user workspace files.

## Release Security Boundary

A public desktop release requires signed platform artifacts, signed updater metadata, checksums, SBOM/provenance, clean-environment smoke evidence, and maintainer review. Until that evidence exists, installer and updater claims remain blocked.
