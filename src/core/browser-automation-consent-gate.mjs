import { createPermissionGrantStore, evaluateRunStartGrants } from "./permission-grants.mjs";
import { assertNoInlineSecrets, redactText, sanitizeForExport } from "./secret-vault.mjs";

const schemaVersion = "agentique.browserAutomationConsentGate.v1";
const allowedContextModes = new Set(["isolated-non-persistent"]);
const allowedActions = new Set(["navigate", "click", "fill", "read-text", "screenshot-metadata"]);
const requiredDeniedAuthorities = Object.freeze([
  "persistent-context",
  "user-default-profile",
  "profile-directory",
  "cookie-import-export",
  "local-storage-import-export",
  "storage-state-import-export",
  "credential-forwarding",
  "session-forwarding",
  "existing-browser-attach",
  "browser-extension-attach",
  "remote-debugging-attach",
  "hidden-automation"
]);

export const sampleBrowserAutomationPermissionStore = createPermissionGrantStore(
  {
    runId: "run.browser.001",
    grants: [
      { id: "grant.browser.logs", family: "files", targets: ["workspace:runs/run.browser.001/logs"] },
      { id: "grant.browser.artifacts", family: "files", targets: ["workspace:runs/run.browser.001/artifacts"] },
      { id: "grant.browser.retention", family: "artifactRetention", targets: ["artifact-retention:24h"] }
    ]
  },
  { now: "2026-06-12T00:00:00.000Z" }
);

export const sampleBrowserAutomationConsentRequest = Object.freeze({
  runId: "run.browser.001",
  context: {
    mode: "isolated-non-persistent",
    persistentContext: false,
    writesBrowsingDataToDisk: false,
    userDataDir: "none",
    defaultProfileAccess: false,
    userProfileAccess: false,
    cookiesImported: false,
    cookiesExported: false,
    localStorageImported: false,
    localStorageExported: false,
    storageStateImported: false,
    storageStateExported: false,
    credentialSessionForwarding: false,
    existingBrowserConnection: false,
    browserExtensionAttach: false,
    currentTabAttach: false,
    remoteDebuggingAttach: false,
    cdpAttach: false
  },
  scope: {
    targetUrl: "https://example.invalid/agentique-review",
    allowedOrigins: ["https://example.invalid"],
    allowedActions: ["navigate", "click", "fill", "read-text", "screenshot-metadata"],
    disallowedActions: ["evaluate", "download", "upload", "grant-permissions", "read-cookies", "read-storage-state"],
    hiddenAutomation: false
  },
  consent: {
    explicitUserConsent: true,
    consentId: "consent.browser.001",
    approvedAt: "2026-06-12T00:00:00.000Z",
    expiresAt: "2026-06-12T00:30:00.000Z",
    revocable: true,
    scopeHash: "a".repeat(64),
    visibleActionSummary: "Review one isolated non-persistent browser plan for a single target URL.",
    humanInLoop: true
  },
  controls: {
    maxActions: 8,
    maxDurationMs: 60000,
    stopControlAvailable: true,
    contextCloseReceiptRequired: true,
    cleanupReceiptRequired: true,
    timeoutReceiptRequired: true
  },
  redaction: {
    logRedaction: true,
    artifactRedaction: true,
    screenshotMode: "metadata-only",
    rawDownloadsAllowed: false,
    rawProfileCaptureAllowed: false,
    storageStateCaptureAllowed: false,
    forbiddenFields: ["cookie", "token", "credential", "storageState", "localStorage", "session", "localPath"]
  },
  deniedAuthorities: requiredDeniedAuthorities,
  permissionStore: sampleBrowserAutomationPermissionStore,
  permissionRequirements: [
    { family: "files", action: "write", target: "workspace:runs/run.browser.001/logs/browser-review.json" },
    { family: "files", action: "write", target: "workspace:runs/run.browser.001/artifacts/cleanup-receipt.json" },
    { family: "artifactRetention", action: "retain", target: "artifact-retention:24h" }
  ],
  claims: {
    browserAutomationAvailable: false,
    productionDesktopRuntime: false,
    externalProviderAutomation: false,
    hiddenAutomation: false,
    credentialSessionForwarding: false,
    userProfileAutomation: false
  }
});

export function createBrowserAutomationConsentReview(request = sampleBrowserAutomationConsentRequest, options = {}) {
  const errors = [];
  const runId = sanitizeId(request?.runId ?? "run.browser.001", "runId", errors);
  const context = reviewContext(request?.context, errors);
  const scope = reviewScope(request?.scope, errors);
  const consent = reviewConsent(request?.consent, errors);
  const controls = reviewControls(request?.controls, errors);
  const redaction = reviewRedaction(request?.redaction, errors);
  const deniedAuthorities = reviewDeniedAuthorities(Array.from(request?.deniedAuthorities ?? []), errors);
  const permissions = reviewPermissions(request, runId, options, errors);
  const claims = reviewClaims(request?.claims, errors);
  const ok = errors.length === 0;

  return sanitizeForExport({
    schemaVersion,
    ok,
    status: ok ? "consent-ready" : "blocked",
    startsBrowser: false,
    executionDecision: "review-only-no-browser-start",
    runId,
    context,
    scope,
    consent,
    controls,
    redaction,
    deniedAuthorities,
    permissions,
    claims,
    userActions: ok
      ? ["Review the target URL and action scope.", "Confirm explicit consent before any future browser runtime exists.", "Use stop and cleanup receipts for any future runtime."]
      : ["Resolve browser automation consent blockers before any automation lane can be considered."],
    errors: errors.map((error) => ({ code: error.code, message: redactText(error.message) }))
  });
}

export function assertBrowserAutomationPolicySafe(policy) {
  assertNoInlineSecrets(policy);
  const review = createBrowserAutomationConsentReview(policy);
  if (!review.ok) {
    const first = review.errors[0] ?? { code: "browser.policy", message: "Browser automation consent policy failed." };
    throw issue(first.code, first.message);
  }
  return true;
}

export function reviewBrowserAutomationConsentGate() {
  const approved = createBrowserAutomationConsentReview();
  const persistentProfile = createBrowserAutomationConsentReview({
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
  const storageForwarding = createBrowserAutomationConsentReview({
    ...sampleBrowserAutomationConsentRequest,
    context: {
      ...sampleBrowserAutomationConsentRequest.context,
      cookiesImported: true,
      cookiesExported: true,
      localStorageImported: true,
      storageStateImported: true,
      credentialSessionForwarding: true
    }
  });
  const broadScope = createBrowserAutomationConsentReview({
    ...sampleBrowserAutomationConsentRequest,
    scope: {
      ...sampleBrowserAutomationConsentRequest.scope,
      targetUrl: "http://example.invalid/",
      allowedOrigins: ["*"],
      allowedActions: ["navigate", "evaluate", "download"],
      hiddenAutomation: true
    }
  });
  const existingBrowser = createBrowserAutomationConsentReview({
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
  const missingStopCleanup = createBrowserAutomationConsentReview({
    ...sampleBrowserAutomationConsentRequest,
    consent: { ...sampleBrowserAutomationConsentRequest.consent, explicitUserConsent: false },
    controls: {
      ...sampleBrowserAutomationConsentRequest.controls,
      stopControlAvailable: false,
      contextCloseReceiptRequired: false,
      cleanupReceiptRequired: false
    }
  });

  return {
    schemaVersion: "agentique.browserAutomationConsentGateReview.v1",
    ok: approved.ok && !persistentProfile.ok && !storageForwarding.ok && !broadScope.ok && !existingBrowser.ok && !missingStopCleanup.ok,
    approvedStatus: approved.status,
    startsBrowser: approved.startsBrowser,
    persistentProfileBlocked: persistentProfile.errors.some((error) => ["browser.context-mode", "browser.profile-access"].includes(error.code)),
    storageForwardingBlocked: storageForwarding.errors.some((error) => ["browser.cookie-import-export", "browser.storage-state"].includes(error.code)),
    broadScopeBlocked: broadScope.errors.some((error) => ["browser.target-url", "browser.scope-origin", "browser.scope-action"].includes(error.code)),
    existingBrowserBlocked: existingBrowser.errors.some((error) => ["browser.existing-browser", "browser.remote-debugging"].includes(error.code)),
    hiddenAutomationBlocked: broadScope.errors.some((error) => error.code === "browser.hidden-automation"),
    missingStopCleanupBlocked: missingStopCleanup.errors.some((error) => ["browser.consent-required", "browser.stop-control", "browser.cleanup-receipt"].includes(error.code)),
    summary: {
      contextMode: approved.context.mode,
      actionCount: approved.scope.allowedActions.length,
      permissionStatus: approved.permissions.status,
      redaction: approved.redaction.status
    }
  };
}

function reviewContext(context = {}, errors) {
  const mode = String(context.mode ?? "");
  if (!allowedContextModes.has(mode)) {
    errors.push(issue("browser.context-mode", "Browser automation must use isolated non-persistent contexts only."));
  }
  if (context.persistentContext === true || context.writesBrowsingDataToDisk === true || String(context.userDataDir ?? "none") !== "none") {
    errors.push(issue("browser.persistent-context", "Persistent context and user data directory access are blocked."));
  }
  if (context.defaultProfileAccess === true || context.userProfileAccess === true) {
    errors.push(issue("browser.profile-access", "Default or user browser profile access is blocked."));
  }
  if (context.cookiesImported === true || context.cookiesExported === true) {
    errors.push(issue("browser.cookie-import-export", "Cookie import and export are blocked."));
  }
  if (context.localStorageImported === true || context.localStorageExported === true || context.storageStateImported === true || context.storageStateExported === true) {
    errors.push(issue("browser.storage-state", "Local storage and storage state import/export are blocked."));
  }
  if (context.credentialSessionForwarding === true) {
    errors.push(issue("browser.session-forwarding", "Credential or session forwarding is blocked."));
  }
  if (context.existingBrowserConnection === true || context.browserExtensionAttach === true || context.currentTabAttach === true) {
    errors.push(issue("browser.existing-browser", "Existing browser, extension, or current-tab attachment is blocked."));
  }
  if (context.remoteDebuggingAttach === true || context.cdpAttach === true) {
    errors.push(issue("browser.remote-debugging", "Remote debugging and CDP attachment are blocked."));
  }
  return {
    mode: allowedContextModes.has(mode) ? mode : "blocked",
    persistentContext: context.persistentContext === true,
    writesBrowsingDataToDisk: context.writesBrowsingDataToDisk === true,
    userDataDir: String(context.userDataDir ?? "none") === "none" ? "none" : "blocked",
    defaultProfileAccess: context.defaultProfileAccess === true,
    userProfileAccess: context.userProfileAccess === true,
    cookiesImported: context.cookiesImported === true,
    cookiesExported: context.cookiesExported === true,
    localStorageImported: context.localStorageImported === true,
    localStorageExported: context.localStorageExported === true,
    storageStateImported: context.storageStateImported === true,
    storageStateExported: context.storageStateExported === true,
    credentialSessionForwarding: context.credentialSessionForwarding === true,
    existingBrowserConnection: context.existingBrowserConnection === true,
    browserExtensionAttach: context.browserExtensionAttach === true,
    currentTabAttach: context.currentTabAttach === true,
    remoteDebuggingAttach: context.remoteDebuggingAttach === true,
    cdpAttach: context.cdpAttach === true
  };
}

function reviewScope(scope = {}, errors) {
  const targetUrl = String(scope.targetUrl ?? "");
  const parsed = parseTargetUrl(targetUrl);
  if (!parsed || parsed.protocol !== "https:") {
    errors.push(issue("browser.target-url", "Browser automation target URL must be an explicit HTTPS URL."));
  }
  const allowedOrigins = Array.isArray(scope.allowedOrigins) ? scope.allowedOrigins.map(String) : [];
  if (allowedOrigins.length === 0 || allowedOrigins.some((origin) => origin === "*" || origin.includes("*")) || (parsed && !allowedOrigins.includes(parsed.origin))) {
    errors.push(issue("browser.scope-origin", "Browser automation requires a bounded origin allowlist matching the target URL."));
  }
  const actions = Array.isArray(scope.allowedActions) ? scope.allowedActions.map(String) : [];
  if (actions.length === 0 || actions.some((action) => !allowedActions.has(action))) {
    errors.push(issue("browser.scope-action", "Browser automation actions must be selected from the bounded allowlist."));
  }
  if (scope.hiddenAutomation === true) {
    errors.push(issue("browser.hidden-automation", "Hidden browser automation is blocked."));
  }
  return {
    targetUrl: parsed ? redactText(targetUrl) : "blocked",
    allowedOrigins: allowedOrigins.filter((origin) => origin !== "*" && !origin.includes("*")).map(redactText),
    allowedActions: actions.filter((action) => allowedActions.has(action)),
    disallowedActions: Array.isArray(scope.disallowedActions) ? scope.disallowedActions.map(String) : [],
    hiddenAutomation: scope.hiddenAutomation === true
  };
}

function reviewConsent(consent = {}, errors) {
  const consentId = sanitizeId(consent.consentId ?? "consent.browser.001", "consentId", errors);
  const approvedAt = String(consent.approvedAt ?? "");
  const expiresAt = String(consent.expiresAt ?? "");
  const approvedTime = Date.parse(approvedAt);
  const expiresTime = Date.parse(expiresAt);
  if (consent.explicitUserConsent !== true || consent.humanInLoop !== true) {
    errors.push(issue("browser.consent-required", "Browser automation requires explicit human consent."));
  }
  if (!Number.isFinite(approvedTime) || !Number.isFinite(expiresTime) || expiresTime <= approvedTime || expiresTime - approvedTime > 3600000) {
    errors.push(issue("browser.consent-expiry", "Browser automation consent must have a bounded expiry after approval."));
  }
  if (consent.revocable !== true) {
    errors.push(issue("browser.consent-revocable", "Browser automation consent must be revocable."));
  }
  if (!/^[a-f0-9]{64}$/u.test(String(consent.scopeHash ?? ""))) {
    errors.push(issue("browser.consent-scope-hash", "Browser automation consent requires a stable scope hash."));
  }
  if (String(consent.visibleActionSummary ?? "").trim().length < 12) {
    errors.push(issue("browser.consent-summary", "Browser automation consent requires a visible action summary."));
  }
  return {
    explicitUserConsent: consent.explicitUserConsent === true,
    consentId,
    approvedAt: Number.isFinite(approvedTime) ? new Date(approvedTime).toISOString() : "blocked",
    expiresAt: Number.isFinite(expiresTime) ? new Date(expiresTime).toISOString() : "blocked",
    revocable: consent.revocable === true,
    scopeHash: /^[a-f0-9]{64}$/u.test(String(consent.scopeHash ?? "")) ? `${String(consent.scopeHash).slice(0, 12)}...` : "blocked",
    visibleActionSummary: redactText(String(consent.visibleActionSummary ?? "")),
    humanInLoop: consent.humanInLoop === true
  };
}

function reviewControls(controls = {}, errors) {
  const maxActions = Number(controls.maxActions);
  const maxDurationMs = Number(controls.maxDurationMs);
  if (!Number.isInteger(maxActions) || maxActions < 1 || maxActions > 25) {
    errors.push(issue("browser.max-actions", "Browser automation max actions must be positive and bounded."));
  }
  if (!Number.isInteger(maxDurationMs) || maxDurationMs < 1000 || maxDurationMs > 300000) {
    errors.push(issue("browser.max-duration", "Browser automation duration must be bounded."));
  }
  if (controls.stopControlAvailable !== true) {
    errors.push(issue("browser.stop-control", "Browser automation requires an explicit stop control."));
  }
  if (controls.contextCloseReceiptRequired !== true || controls.cleanupReceiptRequired !== true) {
    errors.push(issue("browser.cleanup-receipt", "Browser automation requires context close and cleanup receipts."));
  }
  if (controls.timeoutReceiptRequired !== true) {
    errors.push(issue("browser.timeout-receipt", "Browser automation requires a timeout receipt."));
  }
  return {
    maxActions,
    maxDurationMs,
    stopControlAvailable: controls.stopControlAvailable === true,
    contextCloseReceiptRequired: controls.contextCloseReceiptRequired === true,
    cleanupReceiptRequired: controls.cleanupReceiptRequired === true,
    timeoutReceiptRequired: controls.timeoutReceiptRequired === true,
    status: controls.stopControlAvailable === true && controls.contextCloseReceiptRequired === true && controls.cleanupReceiptRequired === true ? "ready" : "blocked"
  };
}

function reviewRedaction(redaction = {}, errors) {
  const forbiddenFields = Array.isArray(redaction.forbiddenFields) ? redaction.forbiddenFields.map(String) : [];
  for (const required of ["cookie", "token", "credential", "storageState", "localStorage", "session", "localPath"]) {
    if (!forbiddenFields.includes(required)) {
      errors.push(issue("browser.redaction-field", "Browser automation redaction fields are incomplete."));
      break;
    }
  }
  if (redaction.logRedaction !== true || redaction.artifactRedaction !== true || redaction.screenshotMode !== "metadata-only") {
    errors.push(issue("browser.redaction-required", "Browser automation logs, artifacts, and screenshots must be redacted or metadata-only."));
  }
  if (redaction.rawDownloadsAllowed === true || redaction.rawProfileCaptureAllowed === true || redaction.storageStateCaptureAllowed === true) {
    errors.push(issue("browser.raw-artifact-blocked", "Raw downloads, profile capture, and storage state capture are blocked."));
  }
  return {
    logRedaction: redaction.logRedaction === true,
    artifactRedaction: redaction.artifactRedaction === true,
    screenshotMode: redaction.screenshotMode === "metadata-only" ? "metadata-only" : "blocked",
    rawDownloadsAllowed: redaction.rawDownloadsAllowed === true,
    rawProfileCaptureAllowed: redaction.rawProfileCaptureAllowed === true,
    storageStateCaptureAllowed: redaction.storageStateCaptureAllowed === true,
    forbiddenFields,
    status: redaction.logRedaction === true && redaction.artifactRedaction === true && redaction.screenshotMode === "metadata-only" ? "ready" : "blocked"
  };
}

function reviewDeniedAuthorities(deniedAuthorities = [], errors) {
  const authorities = Array.isArray(deniedAuthorities) ? deniedAuthorities.map(String) : [];
  const missing = requiredDeniedAuthorities.filter((authority) => !authorities.includes(authority));
  if (missing.length > 0) {
    errors.push(issue("browser.denied-authority-list", "Browser automation denied authority list is incomplete."));
  }
  return {
    status: missing.length === 0 ? "complete" : "incomplete",
    authorities,
    missing
  };
}

function reviewPermissions(request, runId, options, errors) {
  const store = request?.permissionStore;
  if (!store || store.runId !== runId) {
    errors.push(issue("browser.permission-run", "Browser automation permission grants must be scoped to the consent run."));
  }
  const requirements = Array.isArray(request?.permissionRequirements) ? request.permissionRequirements : [];
  if (requirements.length === 0) {
    errors.push(issue("browser.permission-requirements", "Browser automation consent review requires explicit artifact/log permission requirements."));
  }
  const preflight = evaluateRunStartGrants(store, requirements, { now: options.now ?? "2026-06-12T00:00:00.000Z" });
  if (!preflight.ok) {
    errors.push(issue("browser.permission-preflight", "Browser automation permission preflight failed."));
  }
  return {
    status: preflight.status,
    decisions: preflight.decisions.map((decision) => ({
      family: decision.family,
      action: decision.action,
      target: decision.target,
      status: decision.status,
      code: decision.code
    })),
    auditEvents: preflight.audit?.events?.length ?? 0
  };
}

function reviewClaims(claims = {}, errors) {
  const normalized = {
    browserAutomationAvailable: claims.browserAutomationAvailable === true,
    productionDesktopRuntime: claims.productionDesktopRuntime === true,
    externalProviderAutomation: claims.externalProviderAutomation === true,
    hiddenAutomation: claims.hiddenAutomation === true,
    credentialSessionForwarding: claims.credentialSessionForwarding === true,
    userProfileAutomation: claims.userProfileAutomation === true
  };
  for (const [claim, value] of Object.entries(normalized)) {
    if (value === true) {
      errors.push(issue("browser.unsupported-claim", `${claim} is not supported by the browser automation consent gate.`));
    }
  }
  return normalized;
}

function parseTargetUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function sanitizeId(value, fieldName, errors) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/u.test(text) || text.includes("..") || text.includes("/") || text.includes("\\") || text.includes(":")) {
    errors.push(issue("browser.invalid-id", `${fieldName} must be an opaque id.`));
    return "blocked";
  }
  return text;
}

function issue(code, message) {
  return Object.assign(new Error(redactText(message)), { code });
}
