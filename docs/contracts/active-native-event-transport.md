# Active Native Event Transport

Status: accepted for the fixed runner event transport gate; no release or broad runtime claim is added.

Agentique UI can treat fixed native runner progress as active transport only when the event stream is versioned, bounded, redacted, lifecycle-cleaned, replayable, and terminal-state consistent.

The active transport boundary is narrower than a runtime permission grant. It does not add a generic shell, process manager, package lifecycle execution, browser data access, ambient environment forwarding, arbitrary downloaded-resource execution, signed installer, updater, or production desktop runtime.

## Transport Contract

- Events use versioned payloads.
- Event ids are monotonic and stable for a run; this is the monotonic event ids requirement.
- Payloads and replay buffers are bounded.
- Unsafe text is redacted before display, export, replay, or evidence.
- Late subscribers receive bounded replay before live messages.
- Listener cleanup must call the native unlisten handle on unmount; this is the listener cleanup requirement.
- Duplicate listener registration for the same subscriber is blocked.
- Overflow is summarized instead of retaining unbounded logs; this is the overflow requirement.
- A terminal event must remain visible and consistent with the final run status.

## Accepted Live Scope

The accepted live scope is the fixed native runner event name and supported local runner payloads. A transport review may set `liveTransport` to `true` only after ordered delivery, late-subscriber replay, cleanup, duplicate-listener prevention, backpressure, terminal consistency, and no-capability-widening checks pass.

Existing replay-only receipts remain replay evidence. They are not relabeled as live transport unless the active transport gate is the evidence source.

## Rejected Expansion

This contract does not permit:

- generic shell commands;
- raw process manager controls;
- package lifecycle commands;
- browser cookie or session forwarding;
- ambient environment-variable forwarding;
- unbounded logs or raw local paths;
- automatic execution of downloaded workflows;
- signed installer, updater, or production desktop runtime claims.
