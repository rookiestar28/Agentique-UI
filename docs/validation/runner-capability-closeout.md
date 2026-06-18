# Runner Capability Closeout

Status: supported local-run scope accepted; production desktop runtime and release artifact claims remain blocked.

This closeout records the public Agentique UI runner capability boundary. The UI can present supported local-run behavior only when the resource, adapter, permission grants, run folder, workflow scheduler, and user-facing runner controls have accepted validation evidence.

## Accepted Local Runner Scope

The accepted scope is `supported-local-only`.

Covered capabilities:

- runner capability contract and no-overclaim gate;
- native command boundary;
- local run queue and state machine;
- permission grants, revocation, and audit checks;
- run folder writer, artifacts, logs, and cleanup receipts;
- signed Python adapter runner;
- signed Node adapter runner;
- allowlisted Workflow IR scheduler;
- Graph and Run workspace controls for approve, start, cancel, status, logs, and artifacts;
- external runtime bridge guard;
- WASM/WASI preflight gate;
- rootless container preflight gate;
- desktop runner evidence gate.

## Required Validation

The closeout requires the full local validation chain:

- contract validation;
- native runner boundary validation;
- local run state-machine validation;
- permission grant validation;
- run-folder writer validation;
- Python adapter runner validation;
- Node adapter runner validation;
- workflow scheduler validation;
- Graph and Run UI validation;
- external runtime bridge guard validation;
- WASM/WASI sandbox gate validation;
- rootless container preflight validation;
- desktop runner evidence gate validation;
- Node test suite;
- public-boundary scan.

## Release Boundary

The following claims remain blocked unless separate platform release gates pass:

- production desktop runtime;
- Windows installer publication;
- macOS installer publication;
- Linux package publication;
- signed updater channel;
- universal workflow runtime;
- hosted runtime;
- automatic execution of arbitrary downloaded resources.

Passing this closeout does not publish installers, run update channels, notarize artifacts, create package repositories, or make Agentique a hosted runtime provider.

## Public Safety

Public closeout evidence must be path-neutral and secret-free. Logs, screenshots, traces, exports, and docs must pass public-boundary and no-secret checks before they can support a local-runner claim.
