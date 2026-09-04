# Support

Agentique UI is currently a public development repository, not a released desktop product.

## What To Include

For public support requests, include:

- platform and version,
- command, browser preference, or workflow being used,
- expected behavior,
- observed behavior,
- redacted logs or screenshots when needed.

Do not include credentials, tokens, signing material, private keys, personal access data, raw local paths, browser storage, or private workspace files.

## Current Support Boundary

Supported today:

- Supported local execution: fixed native Python and Node on Windows and Linux source-validation environments only.
- Supported native orchestration: deterministic fixed-adapter DAGs with pre-approved attempts or checkpointed human-approval interrupts on Windows and Linux only.
- macOS local execution is unverified and unsupported.
- The workflow scheduler model remains review-only evidence.
- source checkout,
- public validation scripts,
- contract and release-gate review,
- UI development and app-style local browser-window testing,
- supported-local-only runner validation, deterministic native DAG start/status/cancel/resume, Permission Center policy diff review, Run Dashboard and Queue Monitor review, Graph/Run control debugging, checkpointed human-approval interrupt review, Logs and Artifact Workbench review, and cleanup evidence review,
- adapter registry, fixed Python/Node native execution diagnostics, repo-local task lane, external agent-client descriptor, MCP readiness descriptor, WASM/WASI preflight, rootless container preflight, browser automation consent, local vault reference, and diagnostics support-bundle descriptor review,
- platform-specific validation evidence for one fixed Windows WebAssembly adapter and one optional fixed Linux rootless-container adapter, outside the supported-local product allowlist,
- capability-scoped agent handoff protocol review without extension loading, a sidecar, or a network bridge,
- first-class n8n, Dify, and LangGraph import validation plus source-preserving handoff evidence review.

Not supported yet:

- released installer installation,
- signed updater use,
- automatic execution of arbitrary downloaded resources,
- secondary workflow format import or execution support beyond internal backlog/reference material,
- production desktop runtime support,
- generic shell, browser-data automation, default browser profile access, or existing browser attachment,
- MCP bridge launch, generic or caller-supplied WASM/WASI execution, product-supported container execution, image pull/build/compose, or external-provider automation,
- support-bundle archive creation, upload, telemetry, support ticket integration, raw log collection, raw artifact collection, or environment snapshot collection,
- raw local secret storage, OAuth token exchange, or ambient environment import,
- support for unsigned third-party artifacts as trusted releases.

The repository verifies Windows/Linux distribution-integrity behavior with runtime-ephemeral test
keys. This does not replace real production signing or establish a released installer, signed
updater, or production desktop runtime. macOS packaging is skipped and remains unverified and
unsupported.
