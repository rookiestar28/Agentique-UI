# Native Runner Command Boundary

Status: narrow native execution boundary for the supported fixed local Python runner lane.

Agentique UI exposes a narrow Tauri command surface for supported local-run work. These commands accept opaque ids and return boundary receipts. They do not accept raw local paths, scripts, shell arguments, environment variables, or package lifecycle instructions.

## Approved Commands

- `agentique_runner_prepare`
- `agentique_runner_start`
- `agentique_runner_cancel`
- `agentique_runner_status`
- `agentique_runner_logs`
- `agentique_runner_artifacts`
- `agentique_runner_cleanup`

`agentique_runner_prepare` creates a native-owned pending run record for one fixed local Python adapter lane. The native layer returns an opaque approval id and a native-owned permission grant receipt for that pending record.

The fixed lane is backed by a native-resolved fixed adapter manifest. React supplies only opaque ids; it does not supply executable paths, adapter digests, signatures, runtime names, support modes, cwd, args, env, shell, script, or command-line text. Native receipts include a redacted manifest receipt with manifest id, adapter id, runtime, support mode, digest prefix, signature status, and a path-neutral executable reference.

`agentique_runner_start` is part of the approved command surface. It can launch only the matching fixed local Python adapter lane after the caller returns the native-owned approval id, the fixed minimal permission profile id, and the matching opaque `permissionGrantId`. The native layer rechecks the fixed manifest, validates and consumes the native-owned permission grant before launch, resolves the repo-local adapter script itself, sends JSON stdin, captures JSON stdout and stderr, uses a minimal environment, writes bounded redacted run folder evidence, and returns a path-neutral native-controlled Python execution receipt.

The native runner records a compact native event ledger for the fixed lane. Prepare, start, status, logs, and artifact receipts can replay bounded, redacted, path-neutral native event summaries for approval, launch, captured output, run-folder write, artifact evidence readback, and terminal success or failure. Browser descriptor-only sample timelines remain separate from native replay evidence and must not be labeled as live native transport.

`agentique_runner_artifacts` is part of the approved command surface only for readback of the native-owned fixed-lane run folder after start has materialized it. It does not accept a file path from React. The native layer reads only the known run-folder files for the scoped run record and returns native-backed artifact evidence with viewer metadata, cleanup receipt metadata, failure state, bounded redacted log previews, output/artifact metadata, and a reproducibility digest.

## Boundary Rules

- every request uses `resourceId`, `sessionId`, and `runId`;
- fixed-lane transition requests may also use opaque `adapterId`, `approvalId`, `permissionProfileId`, and `permissionGrantId`;
- adapter manifest identity is resolved by native code and stored with the pending run record;
- native permission grant identity is issued by native code, scoped to the same run/adapter/manifest/profile, and consumed on first successful start;
- native artifact evidence is read back from the native-owned run folder by run id only, never by a caller-supplied path;
- ids are opaque and must not be raw paths or command lines;
- fixed native Python launch uses only the native-owned helper and repo-local script path;
- generic shell access remains blocked;
- the default capability remains empty;
- frontend code may invoke only approved runner commands;
- native code must not include shell plugins, package lifecycle commands, or generic process-spawn APIs outside the fixed helper.

## Failure Behavior

Unsafe ids, unknown adapter ids, missing/unsigned/tampered/revoked/incompatible adapter manifests, wrong runtime, wrong support mode, unsafe executable references, unknown run ids, missing approvals, stale approvals, missing/wrong/revoked/expired native-owned permission grants, revoked adapters, broad permission profiles, unapproved commands, broad native permissions, shell plugin dependencies, process-spawn bypasses, invalid adapter stdout, non-zero adapter exit, or generic frontend invokes must fail validation before a release or runtime claim.

Prepare and non-start boundary receipts still report no process spawn. A successful start receipt may report the fixed helper launch, but it must not expose the resolved interpreter path, local absolute run folder, raw logs, secrets, browser data, ambient environment, shell text, or package lifecycle output. Native permission grant receipts are redacted, bounded, and path-neutral local authorization records; they do not grant OS, browser, vault, network, shell, or filesystem authority by themselves. Native artifact evidence is native-backed for the fixed lane but remains a redacted viewer/history readback summary, not a generic filesystem browser or execution grant. Native event replay is limited to small bounded summaries; cancel/orphan cleanup remains a separate gate.
