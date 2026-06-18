# Runtime Prerequisite Readiness

This contract defines the source-checkout readiness gate for fixed local runtime lanes.

The gate records host-runtime detection receipts for Python, Node, and the native command registry. It does not install dependencies, run package managers, repair the host environment, or claim any runtime distribution.

## Readiness Receipts

- Python, Node, and native lanes each emit a deterministic host-runtime detection receipt.
- Remediation text is user-actionable and non-mutating remediation only.
- Missing runtimes block readiness until the user fixes the host setup outside the app.
- Receipts use source-checkout evidence and avoid local absolute paths or secret-like values.

## First-Run Bootstrap Diagnostics

- The first-run bootstrap diagnostics cover supported OS, Node, npm, Python, Rust, Tauri, and fixed adapter readiness.
- Unsupported OS and missing Rust/Tauri prerequisite scenarios fail closed before a run can be planned.
- The unsupported OS path remains a blocked source-checkout diagnostic state.
- Bootstrap receipts use `first-run-bootstrap-diagnostics` source-checkout evidence.
- Bootstrap export evidence is redacted, exportable, path-neutral, and recorded as `artifacts/runtime-bootstrap-diagnostics.json`.
- Desktop and narrow interaction evidence verifies that scenario controls transition the readiness summary to the expected ready or blocked state.

## Adapter Readiness

- Fixed adapters must be compatible with the selected lane.
- The adapter compatibility row is explicit before any start planning.
- Adapter compatibility requires a verified signature, allowlist membership, and locally runnable support mode.
- The revocation row is explicit and fail-closed.
- Revocation overrides compatibility and blocks start planning.
- Readiness does not execute untrusted or downloaded workflow code.

## Package Policy

- Package-manager install requests are denied.
- The package-manager install denial is recorded as policy evidence.
- Package lifecycle script requests are denied.
- Inline script execution requests are denied.
- Ambient environment forwarding requests are denied.

## Boundaries

- Source-checkout validation is the only accepted operating mode for this gate.
- No dependency installation is performed.
- No bundled runtime, updater, cloud runtime, or signed distribution claim is made.
- Windows validation evidence must come from the standard local validation workflow.
