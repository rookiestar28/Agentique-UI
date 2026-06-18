# Workflow Scheduler Contract

This contract defines a deterministic scheduler for Agentique Workflow IR.

## Scope

- Schedules only allowlisted node families.
- Supports deterministic topological order for DAGs.
- Supports branch and merge dependencies.
- Produces deterministic node results, events, outputs, artifacts, and cleanup receipts.
- Routes unsupported or execution-risk nodes to a visible blocked or handoff state.

## Non-goals

- No arbitrary workflow runtime.
- No generic shell execution.
- No subprocess launch.
- No network access.
- No file writes.
- No browser data access.
- No downloaded workflow execution.

## Allowlisted node families

The scheduler may execute only low-risk `input`, `transform`, `viewer`, and `handoff` nodes that have no inline credentials. High-risk, credentialed, unsupported, or execution-risk nodes must not execute in the scheduler.

## Block and handoff behavior

Strict mode fails before execution when unsupported or execution-risk nodes are present. Handoff mode records handoff reasons for those nodes and executes only nodes whose dependencies remain executable.

## Lifecycle

The scheduler records deterministic events for started, retry, succeeded, failed, skipped, and canceled states. Retries are bounded, and retries remain deterministic, while failure propagation skips dependent nodes when their inbound dependencies fail. A cancellation marks the selected node and later nodes as canceled and records a cleanup receipt.

## Artifact mapping

Each successful node maps declared outputs to relative output and artifact descriptors. The artifact mapping is path-neutral and redacted. The scheduler does not write artifact bytes.

## Security requirements

- Unsupported nodes must block or route to handoff with visible reason.
- Credentialed and high-risk nodes are blocked by default.
- No local absolute paths, raw credentials, browser data, network URLs, or commands are produced.
- Cleanup receipt must be deterministic and idempotent.
