const supportModes = new Set(["catalog-only", "visualizable", "editable", "dry-runnable", "locally-runnable", "external-handoff"]);

export const verificationChecklist = [
  { label: "Ticket audience and scope", status: "Required" },
  { label: "Ticket expiry and replay", status: "Required" },
  { label: "Byte count and digest", status: "Required" },
  { label: "Bundle support mode", status: "Required" },
  { label: "Import side effects", status: "Blocked until verified" }
];

export async function verifyScopedPackage(input) {
  const now = input.now ? new Date(input.now) : new Date();
  const errors = [];
  const ticket = input.ticket ?? {};
  const bundle = input.bundle ?? {};
  const bytes = toUint8Array(input.bytes ?? "");
  const replayedTickets = new Set(input.replayedTickets ?? []);

  if (ticket.audience !== "agentique-ui") {
    errors.push(issue("ticket.invalid-audience", "Ticket audience is invalid."));
  }
  if (ticket.scope !== "resource-download") {
    errors.push(issue("ticket.invalid-scope", "Ticket scope is invalid."));
  }
  if (!ticket.expiresAt || new Date(ticket.expiresAt) <= now) {
    errors.push(issue("ticket.expired", "Ticket is expired."));
  }
  if (ticket.ticketId && replayedTickets.has(ticket.ticketId)) {
    errors.push(issue("ticket.replayed", "Ticket was already used."));
  }
  if (ticket.download?.method !== "GET") {
    errors.push(issue("download.invalid-method", "Download method must be GET."));
  }
  if (!String(ticket.download?.url ?? "").startsWith("https://")) {
    errors.push(issue("download.insecure-url", "Download URL must use HTTPS."));
  }
  if (Number(ticket.integrity?.sizeBytes) !== bytes.byteLength) {
    errors.push(issue("integrity.size-mismatch", "Downloaded byte count does not match ticket."));
  }

  const digest = await sha256Hex(bytes);
  if (ticket.integrity?.sha256 !== digest) {
    errors.push(issue("integrity.digest-mismatch", "Downloaded digest does not match ticket."));
  }

  if (bundle.schemaVersion !== "agentique.resourceBundle.v1") {
    errors.push(issue("bundle.invalid-schema", "Bundle schema version is unsupported."));
  }
  if (!Array.isArray(bundle.support?.modes) || bundle.support.modes.length === 0) {
    errors.push(issue("bundle.missing-support", "Bundle has no support mode."));
  } else if (!bundle.support.modes.every((mode) => supportModes.has(mode))) {
    errors.push(issue("bundle.unsupported-mode", "Bundle declares an unsupported mode."));
  }

  if (errors.length > 0) {
    return {
      ok: false,
      imported: false,
      digest,
      errors,
      cleanup: {
        required: true,
        reason: errors[0].code,
        action: "delete-or-quarantine-untrusted-bytes"
      }
    };
  }

  return {
    ok: true,
    imported: true,
    digest,
    record: {
      resourceId: bundle.resource.id,
      version: bundle.resource.version,
      digest,
      supportMode: bundle.support.primaryMode,
      verifiedAt: now.toISOString()
    }
  };
}

export async function sha256Hex(bytes) {
  const data = toUint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") return new TextEncoder().encode(value);
  return new Uint8Array(value);
}

function issue(code, message) {
  return { code, message };
}
