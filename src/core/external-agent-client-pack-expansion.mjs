import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const externalAgentClientPackExpansionSchemaVersion = "agentique.externalAgentClientPackExpansion.v1";

const fixedNow = "2026-06-18T00:30:00.000Z";

const clientTargets = Object.freeze([
  target("codex", "Codex", "project-instructions", "agentique.codex.pack-source", "agentique-client"),
  target("claude-code", "Claude Code", "settings-scope", "agentique.claude-code.pack-source", "claude-code"),
  target("opencode", "OpenCode", "permissioned-agent", "agentique.opencode.pack-source", "opencode"),
  target("gemini-cli", "Gemini CLI", "layered-settings", "agentique.gemini-cli.pack-source", "gemini"),
  target("github-copilot", "GitHub Copilot", "repository-instructions", "agentique.github-copilot.pack-source", "github-copilot"),
  target("openclaw-gateway", "OpenClaw Gateway", "gateway-handoff", "agentique.openclaw.pack-source", "openclaw"),
  target("continue", "Continue", "yaml-agent-config", "agentique.continue.pack-source", "continue"),
  target("mcp-client", "MCP client", "descriptor-registration", "agentique.mcp.pack-source", "mcp")
]);

const blockedReasonCodes = Object.freeze([
  "credential-forwarding",
  "browser-data",
  "hidden-bridge",
  "lifecycle-hook-trust",
  "automatic-install",
  "external-runtime-automation",
  "package-install",
  "executable-command",
  "unsafe-destination",
  "missing-user-action",
  "drifted-source",
  "raw-secret",
  "local-absolute-path",
  "deeplink-auto-open",
  "open-folder-without-user",
  "mcp-auto-tool-invocation"
]);

const unsafeEvidencePattern =
  /(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|cookie=|\b(?:spawn|exec)(?:\s|$)|\b(?:curl|powershell|bash|sh|cmd|npm\s+run|node\s+|python\s+|npx\s+|docker\s+|podman\s+)|browser\s+(?:profile|cookie|data)\s+export/iu;

export function createExternalAgentClientPackExpansion({ now = fixedNow } = {}) {
  const packs = clientTargets.map((entry, index) => packFor(entry, index, now));
  const blockedSamples = blockedReasonCodes.map((reason) => blocked(reason));
  const review = {
    schemaVersion: externalAgentClientPackExpansionSchemaVersion,
    generatedAt: now,
    status: "review-required",
    packs,
    blockedSamples,
    deniedAuthority: deniedAuthorityMatrix(),
    summary: summarize(packs, blockedSamples),
    notes: [
      "External agent-client packs are static descriptor output for user-owned clients.",
      "Destination choice, open-folder review, deep-link review, and import remain explicit user actions.",
      "No credential forwarding, browser-data access, automatic install, hidden bridge, package lifecycle trust, or external runtime automation is enabled."
    ]
  };
  assertExternalAgentClientPackExpansionSafe(review);
  return freeze(review);
}

export function reviewExternalAgentClientPackExpansionGate() {
  const review = createExternalAgentClientPackExpansion();
  const targetIds = review.packs.map((entry) => entry.target.id);
  const blockedReasons = new Set(review.blockedSamples.map((entry) => entry.reason));
  const text = JSON.stringify(review);
  const ok =
    review.schemaVersion === externalAgentClientPackExpansionSchemaVersion &&
    targetIds.join("|") === clientTargets.map((entry) => entry.id).join("|") &&
    review.packs.every((entry) => entry.output.descriptorOnly && entry.output.reviewOnly && entry.output.staticOutput) &&
    review.packs.every((entry) => entry.destination.requiresExplicitUserAction && entry.destination.userOwnedRequired) &&
    review.packs.every((entry) => entry.destination.openFolder.automatic === false && entry.destination.deepLink.opensAutomatically === false) &&
    review.packs.every((entry) => entry.userAction.required === true && entry.userAction.automaticClientLaunch === false) &&
    review.packs.every((entry) => entry.provenance.canonicalSource.digest.length === 64 && entry.provenance.generator.digest.length === 64) &&
    review.packs.every((entry) => entry.compatibility.warnings.length > 0 && entry.cleanup.ready && entry.rollback.reversible) &&
    review.packs.every((entry) => allAuthorityDenied(entry.authority)) &&
    blockedReasonCodes.every((reason) => blockedReasons.has(reason)) &&
    review.blockedSamples.every((entry) => entry.accepted === false && entry.launched === false) &&
    !unsafeEvidencePattern.test(text);

  return freeze({
    schemaVersion: "agentique.externalAgentClientPackExpansionReview.v1",
    ok,
    checks: {
      packRows: review.summary.packRows,
      reviewOnlyRows: review.packs.filter((entry) => entry.output.reviewOnly).length,
      explicitUserActionRows: review.packs.filter((entry) => entry.userAction.required).length,
      provenanceRows: review.packs.filter((entry) => entry.provenance.canonicalSource.available).length,
      compatibilityWarnings: review.summary.compatibilityWarnings,
      cleanupReadyRows: review.packs.filter((entry) => entry.cleanup.ready).length,
      rollbackRows: review.packs.filter((entry) => entry.rollback.reversible).length,
      blockedBeforeLaunch: review.summary.blockedBeforeLaunch,
      automaticInstallRows: review.packs.filter((entry) => entry.authority.automaticInstall).length,
      forwardedCredentials: review.packs.filter((entry) => entry.authority.forwardsCredentials).length,
      browserDataAccessRows: review.packs.filter((entry) => entry.authority.browserDataAccess).length,
      hiddenBridgeRows: review.packs.filter((entry) => entry.authority.hiddenBridge).length,
      runtimeAutomationRows: review.packs.filter((entry) => entry.authority.externalRuntimeAutomation).length
    },
    errors: ok ? [] : [issue("external-agent-client-pack-expansion.review", "External agent client pack expansion review failed.")]
  });
}

export function assertExternalAgentClientPackExpansionSafe(value) {
  assertNoInlineSecrets(value);
  const text = JSON.stringify(value ?? {});
  const unsafeMatch = text.match(unsafeEvidencePattern);
  if (unsafeMatch) {
    throw issue("external-agent-client-pack-expansion.unsafe-output", "External agent client pack contains unsafe material.");
  }
  return true;
}

function packFor(entry, index, now) {
  const outputName = `${entry.id}-review-pack.json`;
  return {
    id: `client-pack-${entry.id}`,
    target: {
      id: entry.id,
      label: entry.label,
      family: entry.family,
      userOwnedClientRequired: true
    },
    output: {
      descriptorOnly: true,
      reviewOnly: true,
      staticOutput: true,
      mediaType: "application/json",
      fileName: outputName,
      installMode: "manual-review",
      generatedFiles: [`exports/${outputName}`]
    },
    provenance: {
      canonicalSource: {
        available: true,
        sourceId: entry.sourceId,
        digest: digestFor(index, "c"),
        revision: "static-pack-source-v1"
      },
      generator: {
        generatorId: "agentique.client-pack-static-generator",
        version: "0.1.0",
        digest: digestFor(index, "a")
      }
    },
    drift: {
      status: index % 3 === 1 ? "review-required" : index % 3 === 2 ? "stale-compatible" : "current",
      comparedAt: now,
      sourceDigest: digestFor(index, "c"),
      generatedDigest: digestFor(index, "a"),
      blocksAutomaticInstall: true
    },
    compatibility: {
      warnings: compatibilityWarnings(entry),
      requiresManualMapping: true,
      unsupportedClaims: ["automatic install", "hidden bridge", "external runtime automation"],
      importSupport: "manual-review"
    },
    destination: {
      userOwnedRequired: true,
      requiresExplicitUserAction: true,
      allowedDestinations: ["user-owned-client", "export-folder"],
      appWritesFiles: false,
      openFolder: {
        available: true,
        automatic: false,
        requiresExplicitUserAction: true
      },
      deepLink: {
        available: true,
        scheme: entry.deepLinkScheme,
        opensAutomatically: false,
        carriesCredentials: false,
        requiresExplicitUserAction: true
      }
    },
    userAction: {
      required: true,
      intent: "review-copy-import-user-owned-client",
      automaticClientLaunch: false,
      automaticInstall: false,
      automaticOpenFolder: false,
      automaticOpenDeepLink: false
    },
    cleanup: {
      ready: true,
      receiptRequired: true,
      removes: ["temporary descriptor preview", "client import checklist"]
    },
    rollback: {
      reversible: true,
      requiresUserAction: true,
      instruction: "Remove the manually imported descriptor from the user-owned client and keep the library resource unchanged."
    },
    evidence: {
      redacted: true,
      receipt: `evidence/client-packs/${entry.id}-review.json`,
      fields: ["target", "provenance", "destination-policy", "compatibility-warning", "denied-authority"]
    },
    authority: authorityDenied(),
    createdAt: now
  };
}

function target(id, label, family, sourceId, deepLinkScheme) {
  return Object.freeze({ id, label, family, sourceId, deepLinkScheme });
}

function compatibilityWarnings(entry) {
  const base = ["Static review-only output; import must be completed outside this app."];
  if (entry.id === "mcp-client") {
    return [...base, "MCP rows describe descriptor readiness only; no server start or automatic tool invocation is included."];
  }
  if (entry.id === "openclaw-gateway") {
    return [...base, "Gateway handoff stays inert; channel plugins and gateway processes are not started."];
  }
  if (entry.id === "opencode") {
    return [...base, "Permission posture is exported as review data and does not replace host sandboxing."];
  }
  return [...base, "Destination selection and client-side import require explicit user action."];
}

function authorityDenied() {
  return {
    automaticInstall: false,
    startsBridge: false,
    startsRuntime: false,
    writesFiles: false,
    makesNetworkRequest: false,
    invokesTools: false,
    forwardsCredentials: false,
    browserDataAccess: false,
    hiddenBridge: false,
    lifecycleHookTrust: false,
    packageInstall: false,
    externalRuntimeAutomation: false,
    autoOpenFolder: false,
    autoOpenDeepLink: false
  };
}

function deniedAuthorityMatrix() {
  return Object.freeze(Object.keys(authorityDenied()).map((key) => ({ key, decision: "deny" })));
}

function allAuthorityDenied(authority) {
  return Object.values(authority ?? {}).every((value) => value === false);
}

function blocked(reason) {
  return {
    reason,
    status: "blocked-before-launch",
    accepted: false,
    launched: false,
    code: `client-pack.${reason}`,
    message: redactText(`${reason} external client pack sample fails closed before launch.`)
  };
}

function summarize(packs, blockedSamples) {
  return {
    packRows: packs.length,
    reviewOnlyRows: packs.filter((entry) => entry.output.reviewOnly).length,
    explicitUserActionRows: packs.filter((entry) => entry.userAction.required).length,
    provenanceRows: packs.filter((entry) => entry.provenance.canonicalSource.available).length,
    compatibilityWarnings: packs.reduce((total, entry) => total + entry.compatibility.warnings.length, 0),
    driftReviewRequired: packs.filter((entry) => entry.drift.status !== "current").length,
    cleanupReadyRows: packs.filter((entry) => entry.cleanup.ready).length,
    rollbackRows: packs.filter((entry) => entry.rollback.reversible).length,
    blockedBeforeLaunch: blockedSamples.length
  };
}

function digestFor(index, seed) {
  const prefix = `${seed}${index.toString(16)}`.padEnd(8, seed);
  return `${prefix}${String(index).padStart(2, "0")}`.padEnd(64, seed).slice(0, 64);
}

function issue(code, message) {
  const error = /** @type {Error & { code?: string }} */ (new Error(message));
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
