# Browser Automation Strict Consent Gate Contract

Status: guarded consent review only. This contract does not start a browser, connect to an existing browser, import browser profile data, or provide a production desktop runtime.

Agentique UI treats browser automation as high-risk local automation because it can cross into user identity, cookies, sessions, account actions, and private browser state. A future browser lane can only move beyond review after isolated context behavior, target/action scope, explicit consent, stop controls, cleanup receipts, artifact redaction, and denied browser-data boundaries are proven.

## Required Consent Review

The browser automation consent gate requires:

- isolated non-persistent context only;
- browser start remains disabled while this gate is review-only;
- no persistent context and no user data directory;
- no default browser profile, user profile, extension, current tab, remote debugging, or protocol attachment;
- no cookie, local storage, storage state, credential, or session import/export;
- explicit HTTPS target URL and matching origin allowlist;
- bounded action allowlist for navigate, click, fill, read-text, and screenshot metadata only;
- explicit consent id, approval timestamp, expiry, revocation, scope hash, and visible action summary;
- bounded maximum action count and duration;
- stop control, context close receipt, timeout receipt, and cleanup receipt;
- bounded artifact/log redaction that blocks cookies, tokens, credentials, storage state, local storage, sessions, and local paths;
- permission-grant preflight for review logs, cleanup receipts, and artifact retention.

## Blocked Declarations

The gate blocks:

- persistent contexts;
- browser profile or user data directory access;
- cookie, local storage, storage state, credential, or session forwarding;
- default profile automation;
- existing browser, extension, current tab, remote debugging, or protocol attachment;
- wildcard origins, non-HTTPS targets, broad action scopes, hidden automation, raw downloads, raw profile capture, and raw storage capture;
- missing explicit consent, missing revocation, stale or unbounded consent, missing stop control, missing context close receipt, missing cleanup receipt, or missing timeout receipt;
- claims that browser automation, external-provider automation, signed installer, updater, user profile automation, or production desktop runtime is available.

## Output

The review output is deterministic and redacted. A successful review returns `consent-ready` while keeping `startsBrowser: false`. A blocked review returns explicit error codes for the failed browser consent gate.

## Non-Goals

This contract does not install browser tooling, launch Playwright, run Chromium, connect to Chrome DevTools, attach browser extensions, reuse authentication state, capture screenshots with sensitive content, crawl websites, submit forms, download files, expose a Tauri command, start a sidecar, or publish release artifacts.

