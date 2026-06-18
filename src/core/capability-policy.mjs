const capabilityFamilies = Object.freeze([
  "files",
  "network",
  "shell",
  "environment",
  "gpu",
  "containers",
  "externalProviders",
  "secrets",
  "sidecars",
  "browserData"
]);

const decisionStates = new Set(["allow", "deny", "ask"]);
const ambientRiskFamilies = new Set(["shell", "environment", "browserData"]);

export const defaultCapabilityDecision = "deny";

export const sampleCapabilityManifest = Object.freeze({
  schemaVersion: "agentique.capabilityManifest.v1",
  resource: {
    id: "example.visual-guide",
    version: "0.1.0"
  },
  capabilities: {
    files: { decision: "ask", scope: "user-selected export folder", revocable: true },
    network: { decision: "deny", scope: "no outbound hosts", revocable: true },
    shell: { decision: "deny", scope: "blocked", revocable: true },
    environment: { decision: "deny", scope: "no ambient variables", revocable: true },
    gpu: { decision: "deny", scope: "not requested", revocable: true },
    containers: { decision: "deny", scope: "not requested", revocable: true },
    externalProviders: { decision: "ask", scope: "provider reference only", revocable: true },
    secrets: { decision: "ask", scope: "vault references only", revocable: true },
    sidecars: { decision: "deny", scope: "adapter not started", revocable: true },
    browserData: { decision: "deny", scope: "cookies and profiles blocked", revocable: true }
  },
  audit: {
    reviewedAt: "2026-06-11T00:20:00.000Z",
    reviewer: "local-user",
    action: "review-only"
  }
});

export function reviewCapabilityManifest(input) {
  const errors = [];
  if (!input || typeof input !== "object") {
    return failedReview("capability.invalid-manifest", "Capability manifest must be an object.");
  }
  if (input.schemaVersion !== "agentique.capabilityManifest.v1") {
    errors.push(issue("capability.invalid-schema", "Capability manifest schema is unsupported."));
  }
  if (!input.resource || typeof input.resource !== "object") {
    errors.push(issue("capability.invalid-resource", "Capability manifest must name a resource."));
  }
  if (!input.capabilities || typeof input.capabilities !== "object" || Array.isArray(input.capabilities)) {
    errors.push(issue("capability.invalid-map", "Capability map must be an object."));
  }

  const capabilities = {};
  for (const family of capabilityFamilies) {
    const next = normalizeDecision(input.capabilities?.[family], family, errors);
    capabilities[family] = next;
    if (ambientRiskFamilies.has(family) && next.decision === "allow") {
      errors.push(issue("capability.ambient-access", `${family} cannot be allowed by default.`));
    }
  }

  const unknownFamilies = Object.keys(input.capabilities ?? {}).filter((family) => !capabilityFamilies.includes(family));
  for (const family of unknownFamilies) {
    errors.push(issue("capability.unknown-family", `Unknown capability family: ${family}`));
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      capabilities,
      summary: summarizeCapabilities(capabilities)
    };
  }

  return {
    ok: true,
    resource: {
      id: String(input.resource.id ?? ""),
      version: String(input.resource.version ?? "")
    },
    capabilities,
    audit: {
      reviewedAt: input.audit?.reviewedAt ?? "",
      reviewer: input.audit?.reviewer ?? "local-user",
      action: "review-only"
    },
    summary: summarizeCapabilities(capabilities)
  };
}

export function revokeCapability(review, family) {
  if (!review || typeof review !== "object" || !review.capabilities?.[family]) {
    throw new Error("Capability review is required before revocation.");
  }
  return {
    ...review,
    capabilities: {
      ...review.capabilities,
      [family]: {
        ...review.capabilities[family],
        decision: "deny",
        revoked: true
      }
    },
    audit: {
      ...(review.audit ?? {}),
      action: "revoked"
    },
    summary: summarizeCapabilities({
      ...review.capabilities,
      [family]: {
        ...review.capabilities[family],
        decision: "deny",
        revoked: true
      }
    })
  };
}

export function capabilityFamiliesList() {
  return [...capabilityFamilies];
}

function normalizeDecision(value, family, errors) {
  const decision = String(value?.decision ?? defaultCapabilityDecision);
  if (!decisionStates.has(decision)) {
    errors.push(issue("capability.invalid-decision", `${family} has an invalid decision.`));
  }
  const scope = String(value?.scope ?? "not requested").trim() || "not requested";
  return {
    family,
    decision: decisionStates.has(decision) ? decision : defaultCapabilityDecision,
    scope,
    revocable: value?.revocable !== false,
    revoked: value?.revoked === true
  };
}

function summarizeCapabilities(capabilities) {
  const values = Object.values(capabilities);
  return {
    allow: values.filter((item) => item.decision === "allow").length,
    ask: values.filter((item) => item.decision === "ask").length,
    deny: values.filter((item) => item.decision === "deny").length,
    revoked: values.filter((item) => item.revoked).length
  };
}

function failedReview(code, message) {
  return {
    ok: false,
    errors: [issue(code, message)],
    capabilities: {},
    summary: { allow: 0, ask: 0, deny: 0, revoked: 0 }
  };
}

function issue(code, message) {
  return { code, message };
}

