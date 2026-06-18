import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBrowserAutomationPolicySafe,
  createBrowserAutomationConsentReview,
  reviewBrowserAutomationConsentGate,
  sampleBrowserAutomationConsentRequest,
  sampleBrowserAutomationPermissionStore
} from "../src/core/browser-automation-consent-gate.mjs";
import { revokePermissionGrant } from "../src/core/permission-grants.mjs";

test("complete browser automation consent contract is ready without starting a browser", () => {
  const review = createBrowserAutomationConsentReview(sampleBrowserAutomationConsentRequest);

  assert.equal(review.ok, true);
  assert.equal(review.status, "consent-ready");
  assert.equal(review.startsBrowser, false);
  assert.equal(review.executionDecision, "review-only-no-browser-start");
  assert.equal(review.context.mode, "isolated-non-persistent");
  assert.equal(review.context.persistentContext, false);
  assert.equal(review.scope.targetUrl, "https://example.invalid/agentique-review");
  assert.equal(review.consent.explicitUserConsent, true);
  assert.equal(review.controls.status, "ready");
  assert.equal(review.redaction.status, "ready");
  assert.equal(review.permissions.status, "allowed");
});

test("persistent context default profile and user data directory fail closed", () => {
  const review = createBrowserAutomationConsentReview({
    ...sampleBrowserAutomationConsentRequest,
    context: {
      ...sampleBrowserAutomationConsentRequest.context,
      mode: "persistent-profile",
      persistentContext: true,
      writesBrowsingDataToDisk: true,
      userDataDir: "Default",
      defaultProfileAccess: true,
      userProfileAccess: true
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "browser.context-mode"));
  assert.ok(review.errors.some((error) => error.code === "browser.persistent-context"));
  assert.ok(review.errors.some((error) => error.code === "browser.profile-access"));
});

test("cookie storage state local storage credential and session forwarding are rejected", () => {
  const review = createBrowserAutomationConsentReview({
    ...sampleBrowserAutomationConsentRequest,
    context: {
      ...sampleBrowserAutomationConsentRequest.context,
      cookiesImported: true,
      cookiesExported: true,
      localStorageImported: true,
      storageStateImported: true,
      storageStateExported: true,
      credentialSessionForwarding: true
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "browser.cookie-import-export"));
  assert.ok(review.errors.some((error) => error.code === "browser.storage-state"));
  assert.ok(review.errors.some((error) => error.code === "browser.session-forwarding"));
});

test("existing browser extension current tab remote debugging and cdp attachment are rejected", () => {
  const review = createBrowserAutomationConsentReview({
    ...sampleBrowserAutomationConsentRequest,
    context: {
      ...sampleBrowserAutomationConsentRequest.context,
      existingBrowserConnection: true,
      browserExtensionAttach: true,
      currentTabAttach: true,
      remoteDebuggingAttach: true,
      cdpAttach: true
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "browser.existing-browser"));
  assert.ok(review.errors.some((error) => error.code === "browser.remote-debugging"));
});

test("broad target url action scope and hidden automation fail closed", () => {
  const review = createBrowserAutomationConsentReview({
    ...sampleBrowserAutomationConsentRequest,
    scope: {
      targetUrl: "http://example.invalid/",
      allowedOrigins: ["*"],
      allowedActions: ["navigate", "evaluate", "download"],
      hiddenAutomation: true
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "browser.target-url"));
  assert.ok(review.errors.some((error) => error.code === "browser.scope-origin"));
  assert.ok(review.errors.some((error) => error.code === "browser.scope-action"));
  assert.ok(review.errors.some((error) => error.code === "browser.hidden-automation"));
});

test("explicit consent stop cleanup and timeout receipts are mandatory", () => {
  const review = createBrowserAutomationConsentReview({
    ...sampleBrowserAutomationConsentRequest,
    consent: {
      ...sampleBrowserAutomationConsentRequest.consent,
      explicitUserConsent: false,
      humanInLoop: false,
      expiresAt: "2026-06-12T03:00:00.000Z",
      revocable: false,
      scopeHash: "invalid",
      visibleActionSummary: ""
    },
    controls: {
      maxActions: 100,
      maxDurationMs: 999999999,
      stopControlAvailable: false,
      contextCloseReceiptRequired: false,
      cleanupReceiptRequired: false,
      timeoutReceiptRequired: false
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "browser.consent-required"));
  assert.ok(review.errors.some((error) => error.code === "browser.consent-expiry"));
  assert.ok(review.errors.some((error) => error.code === "browser.consent-revocable"));
  assert.ok(review.errors.some((error) => error.code === "browser.consent-scope-hash"));
  assert.ok(review.errors.some((error) => error.code === "browser.consent-summary"));
  assert.ok(review.errors.some((error) => error.code === "browser.max-actions"));
  assert.ok(review.errors.some((error) => error.code === "browser.max-duration"));
  assert.ok(review.errors.some((error) => error.code === "browser.stop-control"));
  assert.ok(review.errors.some((error) => error.code === "browser.cleanup-receipt"));
  assert.ok(review.errors.some((error) => error.code === "browser.timeout-receipt"));
});

test("artifact and log redaction blocks raw downloads profile capture and storage state capture", () => {
  const review = createBrowserAutomationConsentReview({
    ...sampleBrowserAutomationConsentRequest,
    redaction: {
      logRedaction: false,
      artifactRedaction: false,
      screenshotMode: "raw",
      rawDownloadsAllowed: true,
      rawProfileCaptureAllowed: true,
      storageStateCaptureAllowed: true,
      forbiddenFields: ["token"]
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "browser.redaction-field"));
  assert.ok(review.errors.some((error) => error.code === "browser.redaction-required"));
  assert.ok(review.errors.some((error) => error.code === "browser.raw-artifact-blocked"));
});

test("permission preflight and denied authority list must pass before consent readiness", () => {
  const revoked = revokePermissionGrant(sampleBrowserAutomationPermissionStore, "grant.browser.artifacts", { now: "2026-06-12T00:00:00.000Z" });
  const review = createBrowserAutomationConsentReview({
    ...sampleBrowserAutomationConsentRequest,
    permissionStore: revoked.store,
    deniedAuthorities: ["persistent-context"]
  });

  assert.equal(review.ok, false);
  assert.equal(review.permissions.status, "blocked");
  assert.ok(review.errors.some((error) => error.code === "browser.permission-preflight"));
  assert.ok(review.errors.some((error) => error.code === "browser.denied-authority-list"));
});

test("unsupported browser automation runtime claims are rejected", () => {
  const review = createBrowserAutomationConsentReview({
    ...sampleBrowserAutomationConsentRequest,
    claims: {
      browserAutomationAvailable: true,
      productionDesktopRuntime: true,
      externalProviderAutomation: true,
      hiddenAutomation: true,
      credentialSessionForwarding: true,
      userProfileAutomation: true
    }
  });

  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "browser.unsupported-claim"));
});

test("browser automation policy helper accepts bounded policy and rejects broad scope", () => {
  assert.equal(assertBrowserAutomationPolicySafe(sampleBrowserAutomationConsentRequest), true);

  assert.throws(
    () =>
      assertBrowserAutomationPolicySafe({
        ...sampleBrowserAutomationConsentRequest,
        scope: { ...sampleBrowserAutomationConsentRequest.scope, allowedOrigins: ["*"] }
      }),
    /bounded origin allowlist/u
  );
});

test("browser automation consent review proves approved and blocked samples", () => {
  const summary = reviewBrowserAutomationConsentGate();

  assert.equal(summary.ok, true);
  assert.equal(summary.approvedStatus, "consent-ready");
  assert.equal(summary.startsBrowser, false);
  assert.equal(summary.persistentProfileBlocked, true);
  assert.equal(summary.storageForwardingBlocked, true);
  assert.equal(summary.broadScopeBlocked, true);
  assert.equal(summary.existingBrowserBlocked, true);
  assert.equal(summary.hiddenAutomationBlocked, true);
  assert.equal(summary.missingStopCleanupBlocked, true);
});
