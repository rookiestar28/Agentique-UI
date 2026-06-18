import { sampleLibraryState } from "./library-store.mjs";

const descriptorSchemaVersion = "agentique.handoffDescriptor.v1";
const supportedTargets = new Map([
  ["codex", { label: "Codex", mode: "agent-client" }],
  ["claude-code", { label: "Claude Code", mode: "agent-client" }],
  ["mcp-client", { label: "MCP client", mode: "bridge-descriptor" }],
  ["folder-export", { label: "Folder export", mode: "export-only" }]
]);

const unsafeMaterialPattern = /(secret-ref:|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|ya29\.|internalNotes|privateToken)/iu;
const privateBoundaryMarkers = [[".", "planning"].join(""), ["reference", "docs"].join("/")];

export const handoffTargets = Object.freeze([...supportedTargets.keys()]);

export const sampleHandoffDescriptor = createHandoffDescriptor(sampleLibraryState.resources[0], "codex", {
  createdAt: "2026-06-11T00:10:00.000Z"
});

export function createHandoffDescriptor(resource, target, options = {}) {
  const targetInfo = supportedTargets.get(String(target));
  if (!targetInfo) {
    return {
      ok: false,
      schemaVersion: descriptorSchemaVersion,
      target: String(target ?? "unknown"),
      label: "Unsupported target",
      execution: noExecution(),
      cleanup: reversibleCleanup(),
      errors: [{
        code: "handoff.unsupported-target",
        message: "Handoff target is not supported."
      }]
    };
  }

  const publicResource = toPublicResource(resource);
  const descriptor = {
    ok: true,
    schemaVersion: descriptorSchemaVersion,
    target,
    label: targetInfo.label,
    mode: targetInfo.mode,
    createdAt: isoDate(options.createdAt ?? new Date().toISOString()),
    resource: publicResource,
    output: {
      fileName: `${publicResource.resourceId}-${publicResource.version}-${target}.handoff.json`,
      mediaType: "application/json",
      copyText: buildCopyText(publicResource, targetInfo.label)
    },
    userActions: buildUserActions(target, targetInfo.label),
    execution: noExecution(),
    cleanup: reversibleCleanup()
  };

  assertDescriptorSafe(descriptor);
  return descriptor;
}

export function assertDescriptorSafe(descriptor) {
  const text = JSON.stringify(descriptor);
  if (unsafeMaterialPattern.test(text)) {
    throw issue("handoff.unsafe-output", "Handoff descriptor contains unsafe material.");
  }
  if (privateBoundaryMarkers.some((marker) => text.includes(marker))) {
    throw issue("handoff.unsafe-output", "Handoff descriptor contains unsafe material.");
  }
  if (/(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\)/u.test(text) || /(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u.test(text)) {
    throw issue("handoff.unsafe-path", "Handoff descriptor contains local path material.");
  }
  return true;
}

function toPublicResource(resource) {
  if (!resource || typeof resource !== "object") {
    throw issue("handoff.invalid-resource", "Resource is required.");
  }
  return {
    resourceId: requireText(resource.resourceId, "resourceId"),
    title: requireText(resource.title, "title"),
    version: requireText(resource.version, "version"),
    digest: requireText(resource.digest, "digest"),
    supportMode: requireText(resource.supportMode, "supportMode")
  };
}

function buildCopyText(resource, targetLabel) {
  return [
    `Target: ${targetLabel}`,
    `Resource: ${resource.title} (${resource.resourceId}@${resource.version})`,
    `Digest: ${resource.digest}`,
    "Action: review this descriptor in the selected client; no command is executed by Agentique UI."
  ].join("\n");
}

function buildUserActions(target, targetLabel) {
  if (target === "folder-export") {
    return [
      "Choose an export folder.",
      "Save the verified package and descriptor.",
      "Remove the exported copy to roll back."
    ];
  }
  if (target === "mcp-client") {
    return [
      "Review the descriptor before registering it with the MCP client.",
      "Keep the bridge disabled until the client confirms trust.",
      "Delete the descriptor to roll back."
    ];
  }
  return [
    `Review the descriptor before importing into ${targetLabel}.`,
    "Confirm the package digest matches the verified library record.",
    "Remove the imported descriptor to roll back."
  ];
}

function noExecution() {
  return {
    willExecute: false,
    startsBridge: false,
    writesOutsideUserSelectedDestination: false,
    requiresUserReview: true
  };
}

function reversibleCleanup() {
  return {
    reversible: true,
    removes: ["handoff descriptor", "exported package copy"],
    leavesResourceLibraryRecord: true
  };
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw issue("handoff.invalid-field", `${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function isoDate(value) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    throw issue("handoff.invalid-date", "createdAt must be an ISO date.");
  }
  return time.toISOString();
}

function issue(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
