# Native Runner Command Boundary

Status: narrow native execution boundary for the supported fixed local Python and Node runner lanes.

The supported runtime claim covers the fixed native Python and Node adapters on Windows and Linux only.
The native DAG scheduler may orchestrate only those fixed adapters through distinct pre-approved attempts or checkpointed approval interrupts.
The macOS process-group source branch is unverified and does not establish macOS support.

Agentique UI exposes a narrow Tauri command surface for supported local-run work. These commands accept opaque ids and return boundary receipts. They do not accept raw local paths, scripts, shell arguments, environment variables, or package lifecycle instructions.

## Approved Commands

- `agentique_runner_prepare`
- `agentique_runner_approval_proposal`
- `agentique_runner_decide_approval`
- `agentique_runner_start`
- `agentique_runner_revoke_permission`
- `agentique_runner_cancel`
- `agentique_runner_status`
- `agentique_runner_logs`
- `agentique_runner_artifacts`
- `agentique_runner_cleanup`
- `agentique_runner_checkpoint_history`
- `agentique_runner_time_travel_prepare`
- `agentique_scheduler_start`
- `agentique_scheduler_status`
- `agentique_scheduler_cancel`
- `agentique_scheduler_resume`

The four scheduler commands accept only opaque workflow/resource/session identities and a bounded
graph of fixed-adapter attempt identities. They do not create approvals or grants. Before the first
launch, native code validates the complete graph and every normal attempt against an existing
explicit decision and unconsumed one-use grant. An approval-interrupt instead pauses before launch
and resume binds its checkpoint, decision, and one-use grant. See
[Native DAG Scheduler](native-dag-scheduler.md) and
[Native Approval Interrupt](native-approval-interrupt.md).

The two checkpoint time-travel commands expose at most eight validated metadata-only working-set
generations and can atomically materialize one selected immutable generation into a distinct
same-resource/session target scope. They create no run, proposal, grant, coordinator, process, or
external effect. An ordinary prepare must subsequently capture the target and create a fresh
lineage-bound approval proposal; start rechecks that target before consuming a fresh one-use grant.
A failed staging cleanup is marked cleanup-required and cannot enter approval preparation. See
[Native Checkpoint Time Travel](native-checkpoint-time-travel.md).

`agentique_runner_prepare` creates a native-owned pending run record and exact, path-neutral approval proposal for one selected fixed local Python or Node adapter lane. Prepare returns the opaque proposal id but no permission grant. `agentique_runner_approval_proposal` exposes the pending proposal, including the exact capability summary and canonical digest, without exposing credential values. Only `agentique_runner_decide_approval` can record an explicit user approve or deny decision; an approval mints the one-time native permission grant.

The fixed lane is backed by a native-resolved fixed adapter manifest. The same reviewed identity binds the runtime, support mode, version, digest, signer, supported platforms, minimal permission profile and ceiling, 30-second timeout, native process-tree cleanup policy, and path-neutral executable reference. React supplies only opaque ids; it does not supply manifest overrides, executable paths, adapter digests, signatures, runtime names, support modes, permission ceilings, timeouts, cleanup policies, cwd, args, env, shell, script, or command-line text. Native receipts expose only bounded redacted manifest fields, including a digest prefix rather than the full digest.

`agentique_runner_start` is part of the approved command surface. It can launch only the matching fixed local Python or Node adapter lane after the caller returns the native-owned proposal id, the exact fixed minimal permission profile id, and the matching opaque `permissionGrantId`. The native layer rechecks the proposal, exact scope, canonical digest, explicit decision, fixed manifest, and one-time grant before launch. An echoed proposal, approval, or grant identifier is non-authorizing evidence by itself. The native runner then resolves the repo-local adapter script itself, sends JSON stdin, captures JSON stdout and stderr, uses a minimal environment, writes bounded redacted run folder evidence, and returns a path-neutral native-controlled adapter execution receipt.

`agentique_runner_revoke_permission` accepts the same opaque exact run address and fixed adapter/profile boundary plus the exact grant id. Before start it monotonically revokes the grant and keeps launch blocked. During a run it validates the consumed grant, claims cancellation terminal intent, and signals only the matching retained native handle. Revocation emits bounded redacted evidence and cannot supply a PID, process path, target list, environment, or generic terminate authority.

On Windows, each live fixed-adapter run owns a private unnamed Job Object configured for kill-on-close. Native code assigns the fixed Python or Node child before sending its framed workload request. On Linux builds, native code creates a dedicated positive process group in the child before `exec`, verifies that the spawned child owns that group, and retains the group identity only in native memory. The equivalent macOS source branch exists but is unverified and unsupported. Cancel, timeout, live revocation, supervision failure, and natural parent exit pass through the platform containment primitive before terminal settlement. A cleanup receipt may report `processTreeCleanup=true` and `orphanCount=0` only after a Windows accounting query reports no active processes or a Linux signal-zero probe reports that the owned group no longer exists. The fixed regression lanes include real Python and Node descendants rather than direct-child-only simulations.

Cleanup recovery receipts use `agentique.nativeRunnerCleanupRecovery.v2`. When an application restart has discarded the live Job Object or process-group owner, the receipt reports cleanup as unverified, leaves `orphanCount` null, and keeps the run `cleanup-required`. Repeating cleanup is idempotent but does not emit `cleanup.completed` or fabricate a zero-orphan result. Durable cross-restart supervisor recovery remains a separate acceptance boundary. Platform support claims still require the corresponding platform runtime evidence; source-level cross-platform code or evidence from another operating system is not a substitute.

The native runner records a compact restart-durable native event ledger for the fixed lane. Prepare, start, status, logs, and artifact receipts can replay bounded, redacted, path-neutral native event summaries for approval, launch, captured output, run-folder write, artifact evidence readback, and terminal success or failure. Each immutable sequence record is committed below the native-owned projection run root before in-memory or WebView publication. Restore validates the exact address, schema, boundary flags, sequence, event identity, timestamp, payload safety, file type, and size; invalid evidence fails closed and never replays an external effect. Browser descriptor-only sample timelines remain separate from native replay evidence and must not be labeled as live native transport.

`agentique_runner_artifacts` is part of the approved command surface only for readback of the native-owned fixed-lane run folder after start has materialized it. It does not accept a file path from React. The native layer reads only the known run-folder files for the scoped run record and returns native-backed artifact evidence with viewer metadata, cleanup receipt metadata, failure state, bounded redacted log previews, output/artifact metadata, and a reproducibility digest.

## Boundary Rules

- every request uses `resourceId`, `sessionId`, and `runId`;
- fixed-lane transition requests may also use opaque `adapterId`, `approvalId`, `permissionProfileId`, and `permissionGrantId`;
- adapter manifest identity is resolved by native code and stored with the pending run record;
- the manifest permission ceiling, timeout, and cleanup policy must exactly match the native grant,
  fixed execution timeout, and required process-tree cleanup enforcement;
- prepare never issues a permission grant; native permission grant identity is issued only after an explicit approved decision, scoped to the same proposal digest/run/adapter/manifest/profile, and consumed on first successful start;
- native artifact evidence is read back from the native-owned run folder by run id only, never by a caller-supplied path;
- ids are opaque and must not be raw paths or command lines;
- fixed native Python and Node launch uses only native-owned helpers and repo-local script paths;
- generic shell access remains blocked;
- the default capability grants only Tauri event listen and unlisten;
- frontend code may invoke only approved runner commands;
- native code must not include shell plugins, package lifecycle commands, or generic process-spawn APIs outside the fixed helper.

## Failure Behavior

Unsafe ids, unknown adapter ids, missing/unsigned/tampered/revoked/incompatible adapter manifests, wrong runtime, wrong support mode, unsafe executable references, unknown run ids, missing approvals, stale approvals, missing/wrong/revoked/expired native-owned permission grants, revoked adapters, broad permission profiles, unapproved commands, broad native permissions, shell plugin dependencies, process-spawn bypasses, invalid adapter stdout, non-zero adapter exit, or generic frontend invokes must fail validation before a release or runtime claim.

Prepare and non-start boundary receipts still report no process spawn. A successful start receipt may report the fixed helper launch, but it must not expose the resolved interpreter path, local absolute run folder, raw logs, secrets, browser data, ambient environment, shell text, or package lifecycle output. Native permission grant receipts are redacted, bounded, and path-neutral local authorization records; they do not grant OS, browser, vault, network, shell, or filesystem authority by themselves. Native artifact evidence is native-backed for the fixed lane but remains a redacted viewer/history readback summary, not a generic filesystem browser or execution grant. Native event replay is limited to small bounded summaries; cancel/orphan cleanup remains a separate gate.
