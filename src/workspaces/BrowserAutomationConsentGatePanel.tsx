import type { AnyRecord } from "./TrustRunSettingsTypes";

type BrowserAutomationConsentGatePanelProps = {
  browserAutomationConsentGate: AnyRecord;
};

export function BrowserAutomationConsentGatePanel({ browserAutomationConsentGate }: BrowserAutomationConsentGatePanelProps) {
  const review = browserAutomationConsentGate.review ?? browserAutomationConsentGate;
  const gate = browserAutomationConsentGate.gate ?? {};
  const context = review.context ?? {};
  const scope = review.scope ?? {};
  const consent = review.consent ?? {};
  const controls = review.controls ?? {};
  const redaction = review.redaction ?? {};
  const permissions = review.permissions ?? {};
  const deniedAuthorities = review.deniedAuthorities ?? {};
  const claims = review.claims ?? {};
  const allowedActions = Array.isArray(scope.allowedActions) ? scope.allowedActions : [];
  const allowedOrigins = Array.isArray(scope.allowedOrigins) ? scope.allowedOrigins : [];
  const permissionRows = Array.isArray(permissions.decisions) ? permissions.decisions : [];
  const deniedRows = Array.isArray(deniedAuthorities.authorities) ? deniedAuthorities.authorities : [];
  const forbiddenFields = Array.isArray(redaction.forbiddenFields) ? redaction.forbiddenFields : [];
  const blockedSamples = [
    {
      label: "Persistent browser profile",
      status: gate.persistentProfileBlocked ? "blocked" : "missing",
      detail: "persistent contexts, default profile access, and user data directories stay denied."
    },
    {
      label: "Storage state and cookies",
      status: gate.storageForwardingBlocked ? "blocked" : "missing",
      detail: "cookies, local storage, storage state, credentials, and sessions are not imported or exported."
    },
    {
      label: "Broad target/action scope",
      status: gate.broadScopeBlocked ? "blocked" : "missing",
      detail: "wildcard origins, non-HTTPS targets, evaluate, download, upload, and hidden actions stay denied."
    },
    {
      label: "Existing browser or remote debugging",
      status: gate.existingBrowserBlocked ? "blocked" : "missing",
      detail: "existing browser, extension, current tab, remote debugging, and protocol attachment remain blocked."
    },
    {
      label: "Hidden automation",
      status: gate.hiddenAutomationBlocked ? "blocked" : "missing",
      detail: "automation must be visible, scoped, and explicitly consented before any future runtime exists."
    },
    {
      label: "Missing stop cleanup receipt",
      status: gate.missingStopCleanupBlocked ? "blocked" : "missing",
      detail: "stop control, context close, timeout, and cleanup receipts are mandatory."
    }
  ];

  return (
    <div className="curated-adapter-lane-panel" aria-label="Browser automation strict consent gate">
      <div className="section-heading">
        <p className="caption">Browser automation strict consent gate</p>
        <h2>Consent-scoped browser review</h2>
      </div>
      <div className="curated-adapter-lane-grid" aria-label="Browser automation consent status">
        <div>
          <span>Consent status</span>
          <strong>{review.status}</strong>
          <small>{review.ok ? "explicit consent ready" : "blocked before automation"}</small>
        </div>
        <div>
          <span>Execution decision</span>
          <strong>{review.executionDecision}</strong>
          <small>{review.startsBrowser ? "browser start enabled" : "browser start disabled"}</small>
        </div>
        <div>
          <span>Context isolation</span>
          <strong>{context.mode}</strong>
          <small>{context.persistentContext ? "persistent" : "non-persistent context only"}</small>
        </div>
        <div>
          <span>Profile access</span>
          <strong>{context.userDataDir}</strong>
          <small>{context.defaultProfileAccess ? "default profile requested" : "no user profile access"}</small>
        </div>
      </div>
      <div className="curated-adapter-lane-grid compact" aria-label="Target URL and action scope">
        <div>
          <span>Target URL</span>
          <strong>{scope.targetUrl}</strong>
          <small>{allowedOrigins.join(" / ")}</small>
        </div>
        <div>
          <span>Action scope</span>
          <strong>{allowedActions.length}</strong>
          <small>{allowedActions.join(" / ")}</small>
        </div>
        <div>
          <span>Consent id</span>
          <strong>{consent.consentId}</strong>
          <small>{consent.revocable ? "revocable consent" : "revocation missing"}</small>
        </div>
        <div>
          <span>Scope hash</span>
          <strong>{consent.scopeHash}</strong>
          <small>{consent.visibleActionSummary}</small>
        </div>
      </div>
      <div className="curated-adapter-lane-grid compact" aria-label="Stop and cleanup receipt policy">
        <div>
          <span>Stop control</span>
          <strong>{controls.stopControlAvailable ? "available" : "missing"}</strong>
          <small>{`${controls.maxActions} actions / ${controls.maxDurationMs} ms`}</small>
        </div>
        <div>
          <span>Context close receipt</span>
          <strong>{controls.contextCloseReceiptRequired ? "required" : "missing"}</strong>
          <small>future runtime must close isolated context</small>
        </div>
        <div>
          <span>Cleanup receipt</span>
          <strong>{controls.cleanupReceiptRequired ? "required" : "missing"}</strong>
          <small>{controls.timeoutReceiptRequired ? "timeout receipt required" : "timeout receipt missing"}</small>
        </div>
        <div>
          <span>No runtime claims</span>
          <strong>{claims.browserAutomationAvailable ? "claimed" : "blocked"}</strong>
          <small>{claims.userProfileAutomation ? "profile automation claimed" : "no profile automation claim"}</small>
        </div>
      </div>
      <div className="curated-adapter-lane-grid compact" aria-label="Artifact and log redaction">
        <div>
          <span>Artifact/log redaction</span>
          <strong>{redaction.status}</strong>
          <small>{redaction.screenshotMode}</small>
        </div>
        <div>
          <span>Raw downloads</span>
          <strong>{redaction.rawDownloadsAllowed ? "allowed" : "blocked"}</strong>
          <small>{redaction.rawProfileCaptureAllowed ? "profile capture allowed" : "profile capture blocked"}</small>
        </div>
        <div>
          <span>Storage capture</span>
          <strong>{redaction.storageStateCaptureAllowed ? "allowed" : "blocked"}</strong>
          <small>storage state capture remains denied</small>
        </div>
        <div>
          <span>Redacted fields</span>
          <strong>{forbiddenFields.length}</strong>
          <small>{forbiddenFields.slice(0, 4).join(" / ")}</small>
        </div>
      </div>
      <ol className="curated-adapter-evidence-list" aria-label="Permission preflight">
        {permissionRows.map((decision: AnyRecord) => (
          <li key={`${decision.family}-${decision.action}-${decision.target}`}>
            <span>{decision.family}</span>
            <strong>{decision.status}</strong>
            <small>{`${decision.action} / ${decision.target}`}</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-evidence-list" aria-label="Denied browser authorities">
        {deniedRows.map((authority: string) => (
          <li key={authority}>
            <span>Denied authority</span>
            <strong>{authority}</strong>
            <small>blocked before any browser runtime exists</small>
          </li>
        ))}
      </ol>
      <ol className="curated-adapter-block-list" aria-label="Blocked unsafe browser automation samples">
        {blockedSamples.map((sample) => (
          <li key={sample.label}>
            <span>{sample.label}</span>
            <strong>{sample.status}</strong>
            <small>{sample.detail}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
