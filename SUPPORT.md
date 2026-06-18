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

- source checkout,
- public validation scripts,
- contract and release-gate review,
- UI development and app-style local browser-window testing,
- supported-local-only runner validation, Permission Center policy diff review, Run Dashboard and Queue Monitor review, Graph/Run control debugging, human approval resume/rerun review, Logs and Artifact Workbench review, and cleanup evidence review,
- adapter registry, signed Python/Node adapter lane, repo-local task lane, external agent-client descriptor, MCP readiness descriptor, WASM/WASI preflight, rootless container preflight, browser automation consent, local vault reference, and diagnostics support-bundle descriptor review,
- first-class n8n, Dify, and LangGraph import validation plus source-preserving handoff evidence review.

Not supported yet:

- released installer installation,
- signed updater use,
- automatic execution of arbitrary downloaded resources,
- secondary workflow format import or execution support beyond backlog/reference documentation,
- production desktop runtime support,
- generic shell, browser-data automation, default browser profile access, or existing browser attachment,
- MCP bridge launch, WASM execution, container start, image pull/build/compose, or external-provider automation,
- support-bundle archive creation, upload, telemetry, support ticket integration, raw log collection, raw artifact collection, or environment snapshot collection,
- raw local secret storage, OAuth token exchange, or ambient environment import,
- support for unsigned third-party artifacts as trusted releases.
