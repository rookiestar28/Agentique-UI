import { redactText } from "./secret-vault.mjs";

const decisionStates = new Set(["allow", "deny", "ask"]);
const workspaceRefPattern = /^workspace:[a-z0-9][a-z0-9._/-]{0,120}$/u;

export const samplePermissionPolicy = Object.freeze({
  schemaVersion: "agentique.permissionPolicy.v1",
  decisions: {
    files: { decision: "allow", scopes: ["workspace:inputs", "workspace:outputs", "workspace:runs"], revoked: false },
    network: { decision: "allow", allowedHosts: ["127.0.0.1", "localhost"], protocols: ["http:"], revoked: false },
    shell: { decision: "deny", revoked: false },
    environment: { decision: "deny", allowedNames: ["AGENTIQUE_RUN_ID", "AGENTIQUE_MODE"], revoked: false },
    gpu: { decision: "ask", revoked: false },
    containers: { decision: "ask", revoked: false },
    externalProviders: { decision: "ask", allowedRefs: ["vault:providerCredential"], revoked: false },
    browserData: { decision: "deny", revoked: false }
  }
});

export const samplePermissionRequests = Object.freeze([
  { family: "files", action: "read", target: "workspace:inputs/example-visual-guide/input.json" },
  { family: "network", action: "connect", target: "http://127.0.0.1:49152/health" },
  { family: "shell", action: "spawn", target: "adapter-shell" },
  { family: "environment", action: "read", target: "PATH" },
  { family: "gpu", action: "request-device", target: "gpu:default" },
  { family: "containers", action: "start", target: "container:adapter-pack" },
  { family: "externalProviders", action: "connect", target: "vault:providerCredential" }
]);

export function evaluatePermissionRequest(policy = samplePermissionPolicy, request) {
  if (!request || typeof request !== "object") {
    return permissionResult("blocked", "permission.invalid-request", "Permission request must be an object.", "unknown", request?.target ?? "");
  }
  const family = String(request.family ?? "");
  const decision = normalizeDecision(policy?.decisions?.[family]);
  if (decision.revoked) {
    return permissionResult("blocked", "permission.revoked", `${family} permission has been revoked.`, family, request.target);
  }
  if (decision.decision === "deny") {
    return permissionResult("blocked", "permission.denied", `${family} permission is denied by policy.`, family, request.target);
  }
  const guard = guardFamily(family, decision, request);
  if (!guard.ok) {
    return permissionResult("blocked", guard.code, guard.message, family, request.target);
  }
  if (decision.decision === "ask") {
    return permissionResult("prompt-required", "permission.prompt-required", `${family} requires explicit user approval.`, family, request.target);
  }
  return permissionResult("allowed", "permission.allowed", `${family} request is allowed by scoped policy.`, family, request.target);
}

export function evaluatePermissionBatch(policy = samplePermissionPolicy, requests = samplePermissionRequests) {
  const results = requests.map((request) => evaluatePermissionRequest(policy, request));
  return {
    schemaVersion: "agentique.permissionAuditBatch.v1",
    ok: results.every((result) => result.status === "allowed" || result.status === "prompt-required"),
    summary: {
      allowed: results.filter((result) => result.status === "allowed").length,
      blocked: results.filter((result) => result.status === "blocked").length,
      promptRequired: results.filter((result) => result.status === "prompt-required").length
    },
    results
  };
}

export function revokePermission(policy = samplePermissionPolicy, family) {
  return {
    ...policy,
    decisions: {
      ...(policy.decisions ?? {}),
      [family]: {
        ...normalizeDecision(policy.decisions?.[family]),
        revoked: true,
        decision: "deny"
      }
    }
  };
}

function guardFamily(family, decision, request) {
  switch (family) {
    case "files":
      return guardFile(decision, request.target);
    case "network":
      return guardNetwork(decision, request.target);
    case "shell":
      return blocked("permission.shell-blocked", "Shell access is blocked by default.");
    case "environment":
      return guardEnvironment(decision, request.target);
    case "gpu":
    case "containers":
      return ok();
    case "externalProviders":
      return guardExternalProvider(decision, request.target);
    case "browserData":
      return blocked("permission.browser-data-blocked", "Browser data access is blocked.");
    default:
      return blocked("permission.unknown-family", "Permission family is unknown.");
  }
}

function guardFile(decision, target) {
  const text = String(target ?? "");
  if (!workspaceRefPattern.test(text) || text.includes("..")) {
    return blocked("permission.path-traversal", "File target must be a workspace-scoped reference without traversal.");
  }
  const scopes = Array.isArray(decision.scopes) ? decision.scopes : [];
  if (!scopes.some((scope) => text === scope || text.startsWith(`${scope}/`))) {
    return blocked("permission.file-scope", "File target is outside the allowed workspace scopes.");
  }
  return ok();
}

function guardNetwork(decision, target) {
  let parsed;
  try {
    parsed = new URL(String(target ?? ""));
  } catch {
    return blocked("permission.network-url", "Network target must be a URL.");
  }
  const allowedHosts = new Set(Array.isArray(decision.allowedHosts) ? decision.allowedHosts : []);
  const protocols = new Set(Array.isArray(decision.protocols) ? decision.protocols : []);
  if (!allowedHosts.has(parsed.hostname)) {
    return blocked("permission.host-allowlist", "Network host is not allowlisted.");
  }
  if (!protocols.has(parsed.protocol)) {
    return blocked("permission.network-protocol", "Network protocol is not allowlisted.");
  }
  return ok();
}

function guardEnvironment(decision, target) {
  const name = String(target ?? "");
  const allowedNames = new Set(Array.isArray(decision.allowedNames) ? decision.allowedNames : []);
  if (!allowedNames.has(name)) {
    return blocked("permission.environment-deny", "Ambient environment access is denied.");
  }
  return ok();
}

function guardExternalProvider(decision, target) {
  const allowedRefs = new Set(Array.isArray(decision.allowedRefs) ? decision.allowedRefs : []);
  if (!allowedRefs.has(String(target ?? ""))) {
    return blocked("permission.external-provider-ref", "External provider access requires an approved reference.");
  }
  return ok();
}

function normalizeDecision(value = {}) {
  const decision = decisionStates.has(value.decision) ? value.decision : "deny";
  return {
    ...value,
    decision,
    revoked: value.revoked === true
  };
}

function permissionResult(status, code, message, family, target) {
  return {
    schemaVersion: "agentique.permissionDecision.v1",
    status,
    family,
    code,
    message: redactText(message),
    audit: {
      family,
      status,
      code,
      target: redactText(target),
      createdAt: "2026-06-11T00:50:00.000Z"
    }
  };
}

function ok() {
  return { ok: true };
}

function blocked(code, message) {
  return { ok: false, code, message };
}
