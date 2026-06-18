import { redactText, sanitizeForExport } from "./secret-vault.mjs";

const allowedEventTypes = new Set(["preview", "validation", "dry-run", "handoff", "log", "artifact", "cleanup", "failure"]);

export const sampleSession = createSessionRecord({
  sessionId: "session-local-001",
  resource: {
    resourceId: "example.visual-guide",
    version: "0.1.0",
    digest: "e".repeat(64)
  },
  status: "validate-only",
  events: [
    event("preview", "Static preview rendered", { artifactRef: "artifact:preview-summary" }),
    event("validation", "Capability review completed", { result: "default-deny" }),
    event("dry-run", "Validate-only checks queued", { sideEffects: [] }),
    event("handoff", "Descriptor reviewed", { target: "codex" }),
    event("log", "Using vault:providerCredential reference only", { level: "info" }),
    event("artifact", "Redacted config draft exported", { artifactRef: "artifact:config-draft" }),
    event("cleanup", "No cleanup required", { status: "not-required" }),
    event("failure", "Unsupported node remains blocked", { code: "workflow.unsupported-node" })
  ],
  cleanup: {
    status: "not-required",
    reversible: true
  }
});

export function createSessionRecord(input) {
  if (!input || typeof input !== "object") {
    throw issue("session.invalid", "Session input must be an object.");
  }
  const session = {
    schemaVersion: "agentique.localSession.v1",
    sessionId: requireText(input.sessionId, "sessionId"),
    resource: {
      resourceId: requireText(input.resource?.resourceId, "resource.resourceId"),
      version: requireText(input.resource?.version, "resource.version"),
      digest: requireDigest(input.resource?.digest, "resource.digest")
    },
    status: requireText(input.status ?? "draft", "status"),
    events: normalizeEvents(input.events ?? []),
    cleanup: {
      status: requireText(input.cleanup?.status ?? "pending", "cleanup.status"),
      reversible: input.cleanup?.reversible !== false
    },
    cloudSessionRequired: false
  };
  return sanitizeForExport(session);
}

export function summarizeSession(session) {
  const events = Array.isArray(session?.events) ? session.events : [];
  return {
    eventCount: events.length,
    artifacts: events.filter((item) => item.type === "artifact").length,
    failures: events.filter((item) => item.type === "failure").length,
    cleanupStatus: session?.cleanup?.status ?? "unknown",
    cloudSessionRequired: session?.cloudSessionRequired === true
  };
}

export function exportSessionRecord(session) {
  const sanitized = sanitizeForExport(session);
  return {
    schemaVersion: "agentique.localSessionExport.v1",
    exportedAt: "2026-06-11T00:30:00.000Z",
    session: sanitized
  };
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) {
    throw issue("session.invalid-events", "Session events must be an array.");
  }
  return events.map((entry, index) => {
    const type = requireText(entry.type, `events[${index}].type`);
    if (!allowedEventTypes.has(type)) {
      throw issue("session.invalid-event-type", `Unsupported event type: ${type}`);
    }
    return {
      type,
      label: redactText(requireText(entry.label, `events[${index}].label`)),
      details: sanitizeForExport(entry.details ?? {}),
      createdAt: entry.createdAt ?? "2026-06-11T00:30:00.000Z"
    };
  });
}

function event(type, label, details = {}) {
  return {
    type,
    label,
    details,
    createdAt: "2026-06-11T00:30:00.000Z"
  };
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw issue("session.invalid-field", `${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function requireDigest(value, fieldName) {
  const text = requireText(value, fieldName).toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(text)) {
    throw issue("session.invalid-digest", `${fieldName} must be a SHA-256 digest.`);
  }
  return text;
}

function issue(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

