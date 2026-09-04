# Permission Grants And Audit Enforcement

Status: per-run permission preflight contract, not OS permission execution.

Agentique UI must not start a local run until every required grant is explicit, current, scoped to the run, and audit-visible. Grants are local review records. They are not secret values and do not grant browser data, ambient environment, generic shell, hidden filesystem, or hidden network access.

## Grant Families

- `files`
- `network`
- `envVault`
- `subprocess`
- `containers`
- `gpu`
- `externalProviders`
- `artifactRetention`

## Required Behavior

- grants are per-run and cannot be reused across run ids;
- missing, revoked, expired, or insufficient grants block start preflight;
- file grants require visible workspace-scoped references;
- network grants require explicit loopback targets for local runner start;
- environment access must use vault references rather than ambient environment values;
- subprocess grants are adapter-scoped and never generic shell grants;
- container grants require rootless preflight scope;
- browser data and browser sessions are unsupported;
- every grant, revoke, deny, and start-preflight result creates a redacted audit event.

## Audit Boundary

Audit exports may include family, action, decision, grant id, and redacted target. They must not include secret values, vault reference names, bearer tokens, local absolute paths, browser session data, or hidden workspace paths.

## Runner Preflight UX

Graph and Run workspaces expose the runner permission preflight as review evidence before start. Approving scoped grants records local review grants for the active run; revoking a grant immediately blocks start again; blocked grant samples demonstrate expired, wrong-run, hidden-file, hidden-network, ambient environment, browser data, and generic shell failures. These controls do not grant native permissions.

## Native Runner Binding

For the fixed native Python lane, prepare creates only a native-owned pending approval proposal and issues no permission grant. The user-visible proposal presents the exact capability scope and canonical digest. Only an explicit approve decision can mint a native-owned permission grant receipt; deny mints none. Start must return the matching opaque `permissionGrantId` together with the native-owned proposal id and fixed minimal profile id. The native layer rechecks the current decision and digest, and the grant is scoped to the same proposal, run, resource, session, adapter, manifest, permission profile, decision actor, and decision record. It is consumed on first successful start. Missing, denied, wrong-run, mismatched, revoked, expired, or replayed native grants block before process launch. Legacy or echoed approval and grant identifiers are evidence only and never authorize an effect.

The active desktop product path may revoke only that exact opaque native grant. A pre-start revoke is monotonic and leaves start blocked. An in-run revoke validates the consumed grant against the complete run and proposal scope, claims the existing cancellation terminal intent, and signals the exact retained handle; it does not create generic process or permission mutation authority. Canonical live or restart-durable replay keeps the visible revoked, canceling, and canceled evidence synchronized.

Native grant receipts are local authorization records, not OS permission grants. They must remain redacted and path-neutral, and must not include raw permission JSON, local paths, hidden file targets, unexpected network hosts, ambient environment values, vault reference names, browser data, generic shell commands, package lifecycle output, or secrets.

## Failure Behavior

Unsafe or incomplete permission state keeps the run blocked before native start. Runner start must consume the preflight decision instead of bypassing it.
