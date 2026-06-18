import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const mcpBridgeReadinessDescriptorSchemaVersion = "agentique.mcpBridgeReadinessDescriptor.v1";

const fixedNow = "2026-06-18T01:30:00.000Z";
const protocolVersion = "2025-06-18";

const blockedReasonCodes = Object.freeze([
  "unsafe-tool-schema",
  "missing-auth-policy",
  "broad-filesystem-claim",
  "broad-network-claim",
  "credential-material",
  "automatic-tool-invocation",
  "resource-read-before-approval",
  "prompt-get-before-selection",
  "token-passthrough",
  "insecure-remote-uri",
  "ssrf-prone-metadata",
  "local-startup-command",
  "package-lifecycle",
  "browser-data",
  "missing-user-action",
  "local-absolute-path"
]);

const unsafeEvidencePattern =
  /(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|file:\/\/\/|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|cookie=|client_secret|access_token|refresh_token|authorization:\s*bearer|browser\s+(?:profile|cookie|data)\s+(?:import|export)|\btools\/call\b|\bresources\/read\b|\bprompts\/get\b|\b(?:spawn|exec)(?:\s|$)|\b(?:curl|powershell|bash|sh|cmd|npm\s+run|node\s+|python\s+|npx\s+|docker\s+|podman\s+)/iu;

export function createMcpBridgeReadinessDescriptor({ now = fixedNow } = {}) {
  const servers = [localServer(now), remoteServer(now)];
  const blockedSamples = blockedReasonCodes.map((reason) => blocked(reason));
  const review = {
    schemaVersion: mcpBridgeReadinessDescriptorSchemaVersion,
    generatedAt: now,
    status: "review-required",
    servers,
    blockedSamples,
    deniedAuthority: deniedAuthorityMatrix(),
    summary: summarize(servers, blockedSamples),
    notes: [
      "MCP bridge readiness is static descriptor review only.",
      "Connect, list refresh, prompt/resource selection, and tool invocation require explicit user action.",
      "No server start, network discovery, credential exchange, resource read, prompt retrieval, or tool invocation is enabled."
    ]
  };
  assertMcpBridgeReadinessDescriptorSafe(review);
  return freeze(review);
}

export function reviewMcpBridgeReadinessDescriptorGate() {
  const review = createMcpBridgeReadinessDescriptor();
  const blockedReasons = new Set(review.blockedSamples.map((entry) => entry.reason));
  const text = JSON.stringify(review);
  const checks = {
    serverRows: review.summary.serverRows,
    localRows: review.servers.filter((entry) => entry.trust.mode === "local").length,
    remoteRows: review.servers.filter((entry) => entry.trust.mode === "remote").length,
    toolRows: review.summary.toolRows,
    resourceRows: review.summary.resourceRows,
    promptRows: review.summary.promptRows,
    vaultReferenceRows: review.servers.filter((entry) => entry.credentials.mode === "vault-reference-only" && /^vault:/u.test(entry.credentials.vaultRef)).length,
    auditReceiptRows: review.servers.filter((entry) => entry.audit.redacted && entry.audit.receiptRequired).length,
    blockedBeforeLaunch: review.summary.blockedBeforeLaunch,
    automaticToolInvocations: review.servers.reduce((total, entry) => total + entry.listings.tools.filter((tool) => tool.invocation.autoInvoke).length, 0),
    rawCredentialRows: review.servers.filter((entry) => entry.credentials.containsMaterial).length,
    broadFilesystemRows: review.servers.filter((entry) => entry.claims.filesystem === "broad").length,
    broadNetworkRows: review.servers.filter((entry) => entry.claims.network === "broad").length
  };
  const ok =
    review.schemaVersion === mcpBridgeReadinessDescriptorSchemaVersion &&
    checks.localRows === 1 &&
    checks.remoteRows === 1 &&
    review.servers.every((entry) => entry.identity.protocolVersion === protocolVersion) &&
    review.servers.every((entry) => entry.capabilities.tools.declared && entry.capabilities.resources.declared && entry.capabilities.prompts.declared) &&
    review.servers.every((entry) => allAuthorityDenied(entry.authority)) &&
    review.servers.every((entry) => hasSafeListings(entry)) &&
    review.servers.every((entry) => hasExplicitUserActionGates(entry)) &&
    review.servers.every((entry) => hasSafeAuthPolicy(entry)) &&
    blockedReasonCodes.every((reason) => blockedReasons.has(reason)) &&
    review.blockedSamples.every((entry) => entry.accepted === false && entry.launched === false) &&
    checks.automaticToolInvocations === 0 &&
    checks.rawCredentialRows === 0 &&
    checks.broadFilesystemRows === 0 &&
    checks.broadNetworkRows === 0 &&
    !unsafeEvidencePattern.test(text);

  return freeze({
    schemaVersion: "agentique.mcpBridgeReadinessDescriptorReview.v1",
    ok,
    checks,
    errors: ok ? [] : [issue("mcp-bridge-readiness.review", "MCP bridge readiness descriptor review failed.")]
  });
}

export function assertMcpBridgeReadinessDescriptorSafe(value) {
  assertNoInlineSecrets(value);
  const text = JSON.stringify(value ?? {});
  const unsafeMatch = text.match(unsafeEvidencePattern);
  if (unsafeMatch) {
    throw issue("mcp-bridge-readiness.unsafe-output", "MCP bridge readiness descriptor contains unsafe material.");
  }
  return true;
}

function localServer(now) {
  return server({
    id: "local-filesystem-review",
    mode: "local",
    state: "local-review-required",
    displayName: "Local filesystem MCP review",
    transport: "stdio-descriptor",
    canonicalUri: null,
    localTransport: "stdio-user-owned-server",
    vaultRef: "vault:mcpLocalFilesystem",
    authPolicy: {
      kind: "local-consent",
      required: true,
      resourceIndicatorRequired: false,
      audienceBound: true,
      tokenPassthrough: false,
      accessTokenInQuery: false,
      pkceRequired: false,
      stateRequired: true,
      exactRedirectRequired: false,
      httpsRequired: false,
      metadataFetch: "not-applicable",
      ssrfReview: "not-applicable"
    },
    claims: {
      filesystem: "none-before-approval",
      network: "none-before-approval",
      process: "not-started"
    },
    receipt: "evidence/mcp/local-filesystem-readiness.json",
    now
  });
}

function remoteServer(now) {
  return server({
    id: "remote-https-review",
    mode: "remote",
    state: "remote-auth-review-required",
    displayName: "Remote HTTPS MCP review",
    transport: "streamable-http-descriptor",
    canonicalUri: "https://mcp.example.invalid/mcp",
    localTransport: null,
    vaultRef: "vault:mcpRemoteHttps",
    authPolicy: {
      kind: "oauth-resource-indicator",
      required: true,
      resourceIndicatorRequired: true,
      audienceBound: true,
      tokenPassthrough: false,
      accessTokenInQuery: false,
      pkceRequired: true,
      stateRequired: true,
      exactRedirectRequired: true,
      httpsRequired: true,
      metadataFetch: "blocked-until-user-review",
      ssrfReview: "required"
    },
    claims: {
      filesystem: "none-before-approval",
      network: "none-before-approval",
      process: "not-started"
    },
    receipt: "evidence/mcp/remote-https-readiness.json",
    now
  });
}

function server({ id, mode, state, displayName, transport, canonicalUri, localTransport, vaultRef, authPolicy, claims, receipt, now }) {
  const local = mode === "local";
  return {
    id: `mcp-server-${id}`,
    identity: {
      serverId: `mcp.${id}`,
      displayName,
      protocolVersion,
      transport,
      canonicalUri,
      localTransport,
      serverVersion: "descriptor-fixture-v1"
    },
    trust: {
      mode,
      state,
      reviewedAt: now,
      trustedServerAnnotations: false,
      lifecycle: "descriptor-only"
    },
    capabilities: {
      tools: {
        declared: true,
        listChanged: true
      },
      resources: {
        declared: true,
        subscribe: false,
        listChanged: true
      },
      prompts: {
        declared: true,
        listChanged: true
      }
    },
    listings: {
      tools: toolsFor(mode),
      resources: resourcesFor(mode),
      prompts: promptsFor(mode)
    },
    userActionGates: userActionGates(),
    credentials: {
      mode: "vault-reference-only",
      vaultRef,
      containsMaterial: false,
      exportable: false,
      preview: redactText(vaultRef)
    },
    authPolicy: {
      ...authPolicy,
      canonicalResource: canonicalUri ?? `local:${id}`,
      consentRequired: true
    },
    claims,
    audit: {
      redacted: true,
      receiptRequired: true,
      receipt,
      events: ["identity-reviewed", "capabilities-listed", "authority-denied", local ? "local-consent-required" : "remote-auth-required"],
      timeoutMs: 30000,
      rateLimit: "required-before-runtime"
    },
    authority: authorityDenied(),
    createdAt: now
  };
}

function toolsFor(mode) {
  return [tool(`${mode}.read_summary`, "Read summary metadata", ["resourceId"]), tool(`${mode}.write_plan_review`, "Prepare review plan metadata", ["planId"])];
}

function resourcesFor(mode) {
  return [resource(`resource://mcp/${mode}/status`, "MCP status resource"), resource(`https://mcp.example.invalid/${mode}/catalog`, "Remote catalog descriptor")];
}

function promptsFor(mode) {
  return [prompt(`${mode}.summarize`, "Summarize selected MCP metadata", ["resourceId"]), prompt(`${mode}.triage`, "Triage listed MCP capability metadata", ["capabilityId"])];
}

function tool(name, title, required) {
  return {
    name,
    title,
    description: `${title} without invocation.`,
    metadataOnly: true,
    annotationsTrusted: false,
    inputSchema: schema(required),
    outputSchema: schema(["status"]),
    invocation: {
      autoInvoke: false,
      requiresUserConfirmation: true,
      auditReceiptRequired: true
    }
  };
}

function resource(uri, title) {
  return {
    uri,
    name: title.toLowerCase().replaceAll(" ", "-"),
    title,
    mimeType: "application/json",
    metadataOnly: true,
    readAllowed: false,
    subscribeAllowed: false,
    requiresUserSelection: true
  };
}

function prompt(name, title, args) {
  return {
    name,
    title,
    description: `${title} after explicit user selection.`,
    metadataOnly: true,
    userSelectable: true,
    getAllowed: false,
    arguments: args.map((arg) => ({ name: arg, required: true }))
  };
}

function schema(required) {
  return {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(required.map((name) => [name, { type: "string", maxLength: 120 }])),
    required
  };
}

function userActionGates() {
  return {
    connect: gate("review-connect"),
    refreshListings: gate("review-listings"),
    selectResource: gate("select-resource"),
    selectPrompt: gate("select-prompt"),
    invokeTool: gate("confirm-tool-invocation")
  };
}

function gate(intent) {
  return {
    intent,
    required: true,
    automatic: false,
    receiptRequired: true
  };
}

function authorityDenied() {
  return {
    startsServer: false,
    startsBridge: false,
    makesNetworkRequest: false,
    refreshesLists: false,
    invokesTools: false,
    readsResources: false,
    getsPrompts: false,
    subscribesResources: false,
    forwardsCredentials: false,
    acceptsTokenPassthrough: false,
    browserDataAccess: false,
    packageInstall: false,
    lifecycleHookTrust: false,
    broadFilesystemAccess: false,
    broadNetworkAccess: false,
    hiddenRuntime: false
  };
}

function deniedAuthorityMatrix() {
  return Object.freeze(Object.keys(authorityDenied()).map((key) => ({ key, decision: "deny" })));
}

function blocked(reason) {
  return {
    reason,
    status: "blocked-before-launch",
    accepted: false,
    launched: false,
    code: `mcp-readiness.${reason}`,
    message: redactText(`${reason} MCP bridge readiness sample fails closed before launch.`)
  };
}

function summarize(servers, blockedSamples) {
  return {
    serverRows: servers.length,
    localRows: servers.filter((entry) => entry.trust.mode === "local").length,
    remoteRows: servers.filter((entry) => entry.trust.mode === "remote").length,
    toolRows: servers.reduce((total, entry) => total + entry.listings.tools.length, 0),
    resourceRows: servers.reduce((total, entry) => total + entry.listings.resources.length, 0),
    promptRows: servers.reduce((total, entry) => total + entry.listings.prompts.length, 0),
    vaultReferenceRows: servers.filter((entry) => entry.credentials.mode === "vault-reference-only").length,
    auditReceiptRows: servers.filter((entry) => entry.audit.receiptRequired).length,
    blockedBeforeLaunch: blockedSamples.length
  };
}

function hasSafeListings(server) {
  return (
    server.listings.tools.every(
      (entry) =>
        entry.metadataOnly &&
        entry.inputSchema?.type === "object" &&
        entry.outputSchema?.type === "object" &&
        entry.annotationsTrusted === false &&
        entry.invocation.autoInvoke === false &&
        entry.invocation.requiresUserConfirmation === true
    ) &&
    server.listings.resources.every((entry) => entry.metadataOnly && entry.readAllowed === false && entry.subscribeAllowed === false) &&
    server.listings.prompts.every((entry) => entry.metadataOnly && entry.getAllowed === false && entry.userSelectable === true)
  );
}

function hasExplicitUserActionGates(server) {
  return Object.values(server.userActionGates).every((gateEntry) => gateEntry.required === true && gateEntry.automatic === false && gateEntry.receiptRequired === true);
}

function hasSafeAuthPolicy(server) {
  const policy = server.authPolicy;
  return (
    policy &&
    policy.required === true &&
    policy.consentRequired === true &&
    policy.audienceBound === true &&
    policy.tokenPassthrough === false &&
    policy.accessTokenInQuery === false &&
    server.credentials.mode === "vault-reference-only" &&
    server.credentials.containsMaterial === false
  );
}

function allAuthorityDenied(authority) {
  return Object.values(authority ?? {}).every((value) => value === false);
}

function issue(code, message) {
  const error = /** @type {Error & { code?: string }} */ (new Error(message));
  error.code = code;
  return error;
}

function freeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
