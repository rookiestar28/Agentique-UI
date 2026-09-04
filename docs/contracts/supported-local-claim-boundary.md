# Supported-Local Claim Boundary

Status: fixed native Python and Node local execution plus deterministic fixed-adapter DAG
orchestration is supported for source validation on Windows and Linux only.

This contract is the public claim boundary for Agentique UI. It distinguishes executable native
runtime evidence from deterministic models, descriptors, preflight gates, and release plans.

## Supported Claim

The supported execution lanes are `fixed-native-python`, `fixed-native-node`, and
`fixed-native-dag-scheduler`. The first two are implemented by the native-owned
`adapter.local-python` and `adapter.local-node` manifests and their fixed helpers. The scheduler
orchestrates only distinct pre-approved attempts or checkpointed human-approval interrupts through
those same lanes in a stable sequential topological order. The verified runtime platforms are
Windows and Linux. Both helpers and the
scheduler preserve explicit approval, one-use grants, bounded protocols, redaction, durable
evidence, cancellation, timeout, and process-tree cleanup boundaries. The Node lane and scheduler
cannot run package managers, lifecycle scripts, inline scripts, or caller-selected executables,
paths, arguments, or environment values.

macOS local execution remains unverified and is not currently supported. The presence of a macOS
source branch or future package plan is not runtime evidence.

## Review-Only Surfaces

The earlier workflow scheduler model remains review-only evidence, not a native execution lane.
External runtime bridges, WASM/WASI, rootless containers, and browser automation remain descriptor,
preflight, or consent surfaces until separate runtime evidence gates accept them.

## Forbidden Claims

The source checkout does not provide generic shell or subprocess authority, package lifecycle
execution, ambient environment forwarding, browser-data access, automatic execution of arbitrary
resources, external-provider automation, a hosted or universal runtime, a production desktop
runtime, or a released installer/updater.

Public validation rejects widened platform/lane allowlists, missing evidence states, positive
macOS or broadened scheduler execution claims, unsafe authority, release overclaims, private paths,
credentials, and internal planning or research markers.
