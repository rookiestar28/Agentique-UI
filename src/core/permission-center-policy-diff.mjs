import { redactText } from "./secret-vault.mjs";
import { createPermissionGrantStore, evaluateRunStartGrants, permissionGrantFamilies } from "./permission-grants.mjs";
import {
  approveRunnerPermissionGrants,
  createBlockedRunnerPermissionScenario,
  createInitialRunnerPermissionStore,
  createRunnerPermissionReview,
  revokeRunnerPermissionGrant,
  runnerPermissionRequirements
} from "./runner-permission-preflight.mjs";

export const permissionCenterPolicyDiffSchemaVersion = "agentique.permissionCenterPolicyDiff.v1";

export const requiredPermissionCenterSections = Object.freeze([
  "grants",
  "revocations",
  "adapter-ceilings",
  "stale-grants",
  "policy-diffs",
  "denied-families",
  "audit-receipts",
  "risk-explanations"
]);

export const requiredDeniedPermissionFamilies = Object.freeze(["files", "network", "shell", "environment", "browserData", "containers", "externalProviders"]);

const fixedNow = "2026-06-12T00:00:00.000Z";
const staleBeforeNow = "2026-06-11T23:59:59.000Z";
const auditArtifactPath = "artifacts/permission-center-audit.json";
const privateTextPattern = /(?:bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|[A-Z]:\\|\/Users\/|\/home\/)/iu;

export function createPermissionCenterSurface(options = {}) {
  const scenario = normalizeScenario(options.scenario ?? "required");
  const reviews = createScenarioReviews();
  const activeReview = reviews[scenario] ?? reviews.required;
  const approvedReview = reviews.approved;
  const revokedReview = reviews.revoked;
  const staleReview = reviews.stale;
  const blockedReview = reviews.blocked;
  const grants = grantRows(approvedReview.grants);
  const revocations = grantRows(revokedReview.grants.filter((grant) => grant.revoked || grant.status === "revoked"));
  const staleGrants = staleReview.decisions
    .filter((decision) => decision.status !== "allowed")
    .map((decision) => ({
      id: `stale-${safeText(decision.family)}-${safeText(decision.action)}`,
      family: safeText(decision.family),
      status: "stale",
      code: safeText(decision.code),
      expiresAt: staleBeforeNow,
      target: safeText(decision.target),
      risk: "Grant expired before the reviewed start window."
    }));
  const adapterCeilings = createAdapterCeilings();
  const policyDiffs = createPolicyDiffs();
  const deniedFamilies = createDeniedFamilies(blockedReview);
  const riskExplanations = createRiskExplanations();
  const auditReceipts = createAuditReceipts([activeReview, approvedReview, revokedReview, blockedReview, staleReview]);
  const controls = createControls(scenario);

  const surface = {
    schemaVersion: permissionCenterPolicyDiffSchemaVersion,
    status: scenarioStatus(scenario),
    scenario,
    sections: requiredPermissionCenterSections.map((id) => ({
      id,
      present: true
    })),
    controls,
    grants,
    revocations,
    staleGrants,
    adapterCeilings,
    policyDiffs,
    deniedFamilies,
    auditReceipts,
    riskExplanations,
    activePreflight: {
      status: activeReview.status,
      ok: activeReview.ok,
      required: activeReview.summary.required,
      allowed: activeReview.summary.allowed,
      blocked: activeReview.summary.blocked,
      auditEvents: activeReview.summary.auditEvents
    },
    boundary: {
      frontendAuthority: "display-and-request-only",
      nativeAuthorityRequired: true,
      promptIsSandbox: false,
      genericShellEnabled: false,
      packageLifecycleEnabled: false,
      browserDataEnabled: false,
      containerStartEnabled: false,
      externalProviderAutomationEnabled: false,
      auditArtifact: auditArtifactPath,
      redacted: true
    },
    interactionEvidence: [
      interaction("desktop", "Permission center scenario buttons can focus, activate, and update review state."),
      interaction("narrow", "Permission center rows keep the same scenario controls in the narrow Run workspace.")
    ],
    summary: {
      sections: requiredPermissionCenterSections.length,
      grants: grants.length,
      revocations: revocations.length,
      staleGrants: staleGrants.length,
      adapterCeilings: adapterCeilings.length,
      policyDiffs: policyDiffs.length,
      deniedFamilies: deniedFamilies.length,
      auditReceipts: auditReceipts.length,
      riskExplanations: riskExplanations.length,
      controls: controls.length,
      interactionViewports: 2
    }
  };

  return freeze(surface);
}

export function createPermissionCenterScenario(scenario = "required") {
  return createPermissionCenterSurface({ scenario });
}

export function reviewPermissionCenterPolicyDiff() {
  const surface = createPermissionCenterSurface();
  const validation = validatePermissionCenterSurface(surface);
  return freeze({
    ok: validation.ok,
    surface,
    validation,
    errors: validation.failures
  });
}

export function validatePermissionCenterSurface(surface) {
  const failures = [];
  if (surface?.schemaVersion !== permissionCenterPolicyDiffSchemaVersion) {
    failures.push(issue("permission-center.schema", "Unsupported Permission Center schema version."));
  }

  const sectionIds = surface?.sections?.map((section) => section.id) ?? [];
  for (const required of requiredPermissionCenterSections) {
    if (!sectionIds.includes(required)) {
      failures.push(issue("permission-center.section", `Permission Center is missing ${required}.`));
    }
  }

  const deniedFamilies = new Set((surface?.deniedFamilies ?? []).map((entry) => entry.family));
  for (const family of requiredDeniedPermissionFamilies) {
    if (!deniedFamilies.has(family)) {
      failures.push(issue("permission-center.denied-family", `Permission Center is missing denied family ${family}.`));
    }
  }

  for (const requiredCode of [
    "permission-center.broad-file",
    "permission-center.hidden-network",
    "permission-center.generic-shell",
    "permission-center.ambient-env",
    "permission-center.browser-data",
    "permission-center.container-start",
    "permission-center.provider-without-vault"
  ]) {
    if (!(surface?.riskExplanations ?? []).some((entry) => entry.code === requiredCode)) {
      failures.push(issue("permission-center.risk", `Permission Center is missing risk code ${requiredCode}.`));
    }
  }

  if (!(surface?.policyDiffs ?? []).some((entry) => entry.family === "shell" && entry.baseline === "deny" && entry.requested === "allow" && entry.effective === "deny")) {
    failures.push(issue("permission-center.policy-diff", "Shell policy diff must show deny-by-default effective outcome."));
  }
  if (!(surface?.adapterCeilings ?? []).some((entry) => entry.status === "exceeded" && entry.blockedFamilies.includes("shell"))) {
    failures.push(issue("permission-center.adapter-ceiling", "Adapter ceiling must block shell permission widening."));
  }
  if ((surface?.controls ?? []).some((control) => control.keyboardAccessible !== true)) {
    failures.push(issue("permission-center.keyboard", "All Permission Center actions must be keyboard accessible."));
  }
  if (surface?.boundary?.promptIsSandbox !== false || surface?.boundary?.nativeAuthorityRequired !== true) {
    failures.push(issue("permission-center.authority", "Permission Center must not describe prompts as sandbox authority."));
  }
  if ((surface?.interactionEvidence ?? []).length < 2) {
    failures.push(issue("permission-center.interaction", "Permission Center must record desktop and narrow interaction evidence."));
  }

  const exportedText = JSON.stringify(surface ?? {});
  if (privateTextPattern.test(exportedText) || /vault:providerCredential|(?:^|[;\s])cookie\s*=|authorization:/iu.test(exportedText)) {
    failures.push(issue("permission-center.public-safe", "Permission Center export must remain redacted and path-neutral."));
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    summary: {
      sections: surface?.sections?.length ?? 0,
      deniedFamilies: surface?.deniedFamilies?.length ?? 0,
      riskExplanations: surface?.riskExplanations?.length ?? 0,
      auditReceipts: surface?.auditReceipts?.length ?? 0,
      interactionViewports: surface?.interactionEvidence?.length ?? 0
    }
  };
}

function createScenarioReviews() {
  const required = createRunnerPermissionReview({
    store: createInitialRunnerPermissionStore({ now: fixedNow }),
    now: fixedNow
  });
  const approved = approveRunnerPermissionGrants(createInitialRunnerPermissionStore({ now: fixedNow }), undefined, { now: fixedNow });
  const revoked = revokeRunnerPermissionGrant(approved.store, "grant.network-connect", { now: fixedNow });
  const blocked = createBlockedRunnerPermissionScenario({ now: fixedNow });
  const stale = createStaleReview();
  return { required, approved, revoked, blocked, stale };
}

function createStaleReview() {
  const store = createPermissionGrantStore(
    {
      runId: "run.local-001",
      grants: runnerPermissionRequirements.map((requirement) => ({
        id: `grant.stale-${safeText(requirement.family).replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}-${safeText(requirement.action)}`,
        family: requirement.family,
        targets: [scopeForRequirement(requirement)],
        expiresAt: staleBeforeNow
      }))
    },
    { now: fixedNow }
  );
  const preflight = evaluateRunStartGrants(store, runnerPermissionRequirements, { now: fixedNow });
  return {
    status: "stale",
    ok: false,
    decisions: preflight.decisions,
    grants: preflight.store.grants,
    audit: preflight.audit,
    auditArtifact: {
      path: auditArtifactPath,
      events: preflight.audit.events.length,
      redacted: true
    },
    summary: {
      required: preflight.decisions.length,
      allowed: preflight.decisions.filter((decision) => decision.status === "allowed").length,
      blocked: preflight.decisions.filter((decision) => decision.status !== "allowed").length,
      currentGrants: preflight.store.grants.length,
      revoked: 0,
      stale: preflight.errors.filter((error) => error.code === "permission-grant.expired").length,
      auditEvents: preflight.audit.events.length
    },
    errors: preflight.errors
  };
}

function createControls(activeScenario) {
  return [
    control("required", "Required grants", "Show required grants before approval.", activeScenario),
    control("approved", "Approved grants", "Apply scoped grant approval evidence.", activeScenario),
    control("revoked", "Revoked grant", "Revoke the network grant and block start.", activeScenario),
    control("blocked", "Blocked requests", "Show broad request fail-closed examples.", activeScenario),
    control("stale", "Stale grants", "Show expired grant evidence.", activeScenario)
  ];
}

function createAdapterCeilings() {
  return [
    adapterCeiling("adapter.local-python", ["files", "network", "envVault", "subprocess", "artifactRetention"], ["files", "network", "shell"], "exceeded"),
    adapterCeiling("adapter.local-node", ["files", "network", "envVault", "subprocess", "artifactRetention"], ["files", "network"], "within-ceiling"),
    adapterCeiling("adapter.external-provider", ["externalProviders"], ["externalProviders", "browserData"], "exceeded")
  ];
}

function createPolicyDiffs() {
  return [
    policyDiff("files", "allow", "allow", "allow", "unchanged", "workspace-scoped files only"),
    policyDiff("network", "allow", "allow", "allow", "restricted", "loopback HTTP hosts only"),
    policyDiff("shell", "deny", "allow", "deny", "blocked", "generic shell remains denied"),
    policyDiff("environment", "deny", "allow", "deny", "blocked", "ambient environment remains denied"),
    policyDiff("browserData", "deny", "allow", "deny", "blocked", "browser cookies and profiles remain denied"),
    policyDiff("containers", "ask", "allow-start", "deny", "blocked", "container start and image pull remain denied"),
    policyDiff("externalProviders", "ask", "allow-with-raw-token", "deny", "blocked", "provider access requires vault references only")
  ];
}

function createDeniedFamilies(blockedReview) {
  const blockedCodes = new Map((blockedReview.errors ?? []).map((entry) => [entry.code, entry.message]));
  return [
    denied("files", "permission-center.broad-file", blockedCodes.get("permission-grant.hidden-file") ?? "Broad or hidden file scope denied."),
    denied("network", "permission-center.hidden-network", blockedCodes.get("permission-grant.hidden-network") ?? "Non-loopback network access denied."),
    denied("shell", "permission-center.generic-shell", blockedCodes.get("permission-grant.generic-shell") ?? "Generic shell access denied."),
    denied("environment", "permission-center.ambient-env", blockedCodes.get("permission-grant.ambient-env") ?? "Ambient environment access denied."),
    denied("browserData", "permission-center.browser-data", blockedCodes.get("permission-grant.unsupported-family") ?? "Browser data access denied."),
    denied("containers", "permission-center.container-start", "Container start, image pull, and non-rootless scopes remain denied."),
    denied("externalProviders", "permission-center.provider-without-vault", "External providers require redacted vault references and cannot use raw tokens.")
  ];
}

function createRiskExplanations() {
  return [
    risk("permission-center.broad-file", "files", "Broad file grants can expose private workspace data; only visible workspace references are reviewable."),
    risk("permission-center.hidden-network", "network", "Non-loopback network targets can exfiltrate data; local runner grants stay loopback-only."),
    risk("permission-center.generic-shell", "shell", "Generic shell/process requests bypass adapter ceilings and remain fail-closed."),
    risk("permission-center.ambient-env", "environment", "Ambient environment values can contain secrets; use redacted vault references instead."),
    risk("permission-center.browser-data", "browserData", "Browser profiles, cookies, and storage are never imported into runner context."),
    risk("permission-center.container-start", "containers", "Container start and image pull need separate evidence; current posture is preflight-only."),
    risk("permission-center.provider-without-vault", "externalProviders", "External provider access requires a credential reference and cannot expose raw tokens."),
    risk("permission-center.prompt-not-sandbox", "authority", "Permission prompts are request controls; native runtime authority is still required.")
  ];
}

function createAuditReceipts(reviews) {
  return reviews.map((review, index) => ({
    id: `permission-center-audit-${index + 1}`,
    kind: "permission-audit",
    status: safeText(review.status),
    path: auditArtifactPath,
    events: Number(review.audit?.events?.length ?? review.auditArtifact?.events ?? 0),
    redacted: true,
    localOnly: true,
    message: safeText(`${review.status} permission audit receipt`)
  }));
}

function grantRows(grants) {
  return grants.map((grant) => ({
    id: safeText(grant.id),
    family: safeText(grant.family),
    status: grant.revoked ? "revoked" : safeText(grant.status),
    targets: (grant.targets ?? []).map(safeTarget),
    expiresAt: safeText(grant.expiresAt),
    runScoped: true
  }));
}

function adapterCeiling(adapterId, allowedFamilies, requestedFamilies, status) {
  const allowed = new Set(allowedFamilies);
  const blockedFamilies = requestedFamilies.filter((family) => !allowed.has(family));
  return {
    adapterId,
    allowedFamilies,
    requestedFamilies,
    blockedFamilies,
    status,
    risk: blockedFamilies.length > 0 ? "Requested permission exceeds adapter ceiling." : "Requested permissions stay within adapter ceiling."
  };
}

function policyDiff(family, baseline, requested, effective, status, reason) {
  return {
    family,
    baseline,
    requested,
    effective,
    status,
    reason
  };
}

function denied(family, code, message) {
  return {
    family,
    code,
    status: "denied",
    message: safeText(message)
  };
}

function risk(code, family, explanation) {
  return {
    code,
    family,
    severity: code === "permission-center.prompt-not-sandbox" ? "high" : "blocking",
    explanation: safeText(explanation)
  };
}

function control(scenario, label, description, activeScenario) {
  return {
    scenario,
    label,
    description,
    selected: scenario === activeScenario,
    keyboardAccessible: true
  };
}

function interaction(viewport, evidence) {
  return {
    viewport,
    control: "scenario-buttons",
    evidence,
    keyboardAccessible: true
  };
}

function scenarioStatus(scenario) {
  if (scenario === "approved") return "allowed";
  if (scenario === "revoked") return "revoked";
  if (scenario === "stale") return "stale";
  if (scenario === "blocked") return "blocked";
  return "required";
}

function normalizeScenario(value) {
  return new Set(["required", "approved", "revoked", "blocked", "stale"]).has(String(value)) ? String(value) : "required";
}

function scopeForRequirement(requirement) {
  const target = String(requirement.target ?? "");
  if (requirement.family === "files") {
    const index = target.lastIndexOf("/");
    return index > -1 ? target.slice(0, index) : target;
  }
  if (requirement.family === "network") {
    try {
      return new URL(target).origin;
    } catch {
      return target;
    }
  }
  return target;
}

function safeTarget(value) {
  return safeText(String(value ?? "").replace(/vault:[a-z][a-zA-Z0-9._-]{2,80}/gu, "redacted:vault-reference"));
}

function safeText(value) {
  return redactText(String(value ?? "")).replace(/vault:[a-z][a-zA-Z0-9._-]{2,80}/gu, "redacted:vault-reference");
}

function issue(code, message) {
  return { code, message: safeText(message) };
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

export const permissionCenterFamilies = Object.freeze([...permissionGrantFamilies]);
