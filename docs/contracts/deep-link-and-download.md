# Deep Link And Scoped Download Contract

Agentique UI may be opened from a website through a versioned `agentique://import?...` intent. The intent is never authorization. It is only a request to start a local validation flow.

The canonical query payload uses `version=agentique.importIntent.v1`, `action=import`, `resourceId`, `resourceVersion`, `origin`, `readbackUrl`, `issuedAt`, `expiresAt`, and `nonce`. Legacy `agentique://resources/{resourceId}` links may be parsed only as a compatibility alias. Legacy links do not carry origin, expiry, nonce, download, permission, or execution authority.

Schemas:

- `schemas/deep-link-intent.schema.json`
- `schemas/scoped-download-ticket.schema.json`

Examples:

- `examples/deep-link-intent.valid.json`
- `examples/scoped-download-ticket.valid.json`

## Required Validation Flow

1. Parse the incoming intent.
2. Reject malformed payloads.
3. Confirm the origin is an expected HTTPS site.
4. Confirm resource id and version syntax, including encoded ids and dot, colon, hyphen, and underscore decisions.
5. Reject unsupported versions, invalid actions, expired intents, replayed nonces, and readback URLs outside the public resource readback endpoint.
6. Request or verify a scoped download ticket through a trusted API.
7. Reject expired, replayed, wrong-audience, wrong-scope, downgraded, or tampered tickets.
8. Download only through the ticket URL.
9. Verify byte count and digest before import.
10. Import only after bundle validation passes.

## Replay And Expiry

Scoped tickets are single-use. The app must keep enough local state to reject replayed nonce/ticket pairs during the relevant retention window.

## Failure Recovery

Failure should leave no partially trusted resource in the local library. If bytes were downloaded but verification fails, the app records cleanup evidence and deletes or quarantines the untrusted bytes.

## Non-Claims

These contracts do not register an operating-system URL handler, issue real tickets, create a downloader, or authorize resource execution.
