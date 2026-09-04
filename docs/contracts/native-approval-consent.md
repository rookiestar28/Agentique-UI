# Native Approval And Consent Contract

Agentique user consent, not possession of an identifier, is the only authority that can permit a
native runtime effect. Policy remains owned by the native host and presentation remains owned by
the Agentique UI. An external runtime may request an approval proposal, but it cannot select the
policy result, hide capabilities, mint a grant, or control the decision presentation.

Prepare creates a bounded pending proposal and no permission grant. The UI obtains the proposal
through the native proposal command and displays its complete run address, adapter/runtime and
manifest identity, action, logical targets, risk, capability ceiling, distribution mode, abort path,
and expiry. The native decision command accepts only an explicit approve or deny action from an
identified local actor and binds it to the exact canonical proposal digest.

Approval creates a native-process-owned, one-time grant. Start rechecks the complete address,
proposal and decision, actor, adapter/runtime, manifest digest, permission profile, action, targets,
risk, capability ceiling, bundled distribution mode, abort path, expiry, revocation, and prior use.
Any mismatch or drift blocks before effect. Denied, expired, revoked, consumed, missing, and replayed
decisions cannot authorize start.

Native process restart intentionally discards pending proposals, decisions, and grants. Legacy
approval or permission identifiers are non-authorizing evidence and are never reconstructed into a
current decision. This fail-closed session lifetime avoids silently migrating identifier echo into
user consent.

Capability targets are logical, bounded references. Wildcards, traversal, local paths, hidden file
targets, non-loopback network grants, ambient environment access, generic shell/process commands,
browser data, credential values, and secret-like material are forbidden. A credential name may be
shown when necessary for an informed decision, but its value never enters proposal, decision,
event, log, or audit evidence.

The current reference lane adopts no external runtime package. The runtime-request adapter only
translates a request into an Agentique-owned pending proposal and starts no provider, model, tool,
MCP server, sidecar, package lifecycle, or production operation.
