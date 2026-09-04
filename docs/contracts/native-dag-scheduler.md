# Native DAG Scheduler Contract

## Supported boundary

The desktop runtime owns one deterministic local DAG scheduler for the fixed native Python and
Node adapters. A workflow is admitted only when every executable node is allowlisted and every
initial run or retry has a distinct pre-approved attempt with an existing explicit approval and
unconsumed one-use permission grant.

The supported source-validation environments are Windows and Linux. macOS remains unverified and
is not a supported scheduler environment.

## Admission

The renderer may submit only bounded opaque workflow, resource, session, node, dependency, run,
adapter, approval, permission-profile, and grant identities. It cannot submit an executable,
runtime path, script, arguments, command line, environment, package-manager action, shell,
network/provider target, or generic subprocess configuration.

Before any process starts, native admission verifies:

- 1 to 32 unique nodes and no more than 64 dependency edges;
- fixed-adapter node type only;
- no missing, duplicate, self, or cyclic dependencies;
- a stable topological order with node-id tie breaking;
- at most two retries and exactly one distinct attempt identity per initial run or retry;
- unique run and grant identities across the complete graph; and
- every attempt's pending native run, fixed manifest/profile, explicit approval, and active
  unconsumed grant.

Unknown and handoff-only nodes remain blocked before effects. Handoff review data never becomes a
native launch instruction.

## Execution and retry

The scheduler executes one node at a time in the frozen stable topological order. Every attempt
enters the existing native runner, which remains responsible for fixed executable resolution,
minimal environment, bounded JSON protocol, process-tree supervision, events, logs, artifacts,
projection, checkpoint, and cleanup evidence.

A failed or timed-out attempt may retry only when cleanup is verified with zero orphans and the
next distinct pre-approved attempt is available. A consumed grant is never reused. Cancellation,
revocation, coordinator loss, cleanup uncertainty, persistence failure, or an invariant failure
forbids automatic retry.

A failed dependency causes its descendants to be marked skipped. Independent eligible nodes may
continue in the frozen order, but any failed or skipped node makes workflow success impossible.

## Persistence and recovery

Native code writes a versioned, bounded, redacted, path-neutral snapshot after every transition.
Each snapshot is written and synced under a native-owned root, then committed by same-directory
atomic rename as an immutable sequence file. Adapter output remains in the existing per-run
evidence and is not copied into workflow state.

Status reads the latest contiguous durable sequence. If the process restarts and a persisted
non-terminal workflow has no exact in-process coordinator, recovery records `cleanup-required`.
It never reconstructs launch authority, resumes the graph, or replays an uncertain effect.

## Cancellation and terminal truth

Cancel first claims scheduler cancellation, persists that transition, and signals the exact active
native run when one exists. No later node may launch. Remaining queued work becomes canceled.

Workflow terminals are `succeeded`, `failed`, `canceled`, or `cleanup-required`. `succeeded` is
valid only when every node is durably `succeeded`. Node failure, dependency skip, scheduler error,
persistence error, or cleanup uncertainty can never be reported as workflow success.

## Non-claims

This contract does not establish parallel or distributed scheduling, approval interrupts/resume,
dynamic graph mutation, remote workers, generic commands, arbitrary plugins, network/provider
effects, publication, deployment, installer/updater, production readiness, or macOS support.
