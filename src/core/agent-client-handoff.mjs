import { sampleLibraryState } from "./library-store.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

const planSchemaVersion = "agentique.agentClientHandoffPlan.v1";
const unsafePathPattern = /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\)|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]/u;
const commandPattern = /\b(?:spawn|exec)(?:\s|$)|\b(?:curl|powershell|bash|npm\s+run|node\s+|python\s+|npx\s+)/iu;

const clientManifests = Object.freeze([
  {
    target: "codex",
    label: "Codex",
    mode: "agent-client",
    actions: ["review-descriptor", "copy-command", "import-descriptor"]
  },
  {
    target: "claude-code",
    label: "Claude Code",
    mode: "agent-client",
    actions: ["review-descriptor", "copy-command", "import-descriptor"]
  },
  {
    target: "mcp-client",
    label: "MCP client",
    mode: "bridge-descriptor",
    actions: ["review-descriptor", "copy-command", "register-disabled-bridge"]
  },
  {
    target: "local-folder",
    label: "Local folder",
    mode: "folder-export",
    actions: ["choose-folder", "export-package-copy", "open-folder"]
  },
  {
    target: "local-bridge",
    label: "Local bridge",
    mode: "bridge-descriptor",
    actions: ["review-descriptor", "copy-command", "register-disabled-bridge"]
  }
]);

export const agentClientTargets = Object.freeze(clientManifests.map((manifest) => manifest.target));

export const sampleAgentClientHandoffPlan = createAgentClientHandoffPlan(
  sampleLibraryState.resources[0],
  "local-bridge",
  { createdAt: "2026-06-11T00:25:00.000Z" }
);

export function createAgentClientHandoffPlan(resource, target, options = {}) {
  const manifest = clientManifests.find((entry) => entry.target === String(target));
  if (!manifest) {
    return failedPlan(target, "agent-client.unsupported-target", "Agent client handoff target is not supported.");
  }

  const unsafeDestination = validateDestination(options.destination);
  if (unsafeDestination) {
    return failedPlan(target, unsafeDestination.code, unsafeDestination.message);
  }

  const unsafeCopyText = validateCopyText(options.copyText);
  if (unsafeCopyText) {
    return failedPlan(target, unsafeCopyText.code, unsafeCopyText.message);
  }

  let publicResource;
  try {
    publicResource = toPublicResource(resource);
  } catch (error) {
    return failedPlan(target, error.code ?? "agent-client.invalid-resource", error.message);
  }

  const plan = {
    ok: true,
    schemaVersion: planSchemaVersion,
    target: manifest.target,
    label: manifest.label,
    mode: manifest.mode,
    createdAt: isoDate(options.createdAt ?? new Date().toISOString()),
    resource: publicResource,
    actions: manifest.actions.map((actionId) => buildAction(actionId, manifest)),
    output: {
      fileName: `${publicResource.resourceId}-${publicResource.version}-${manifest.target}.handoff.json`,
      mediaType: "application/json",
      copyText: buildCopyInstruction(publicResource, manifest, options.copyText)
    },
    bridge: {
      descriptorOnly: manifest.mode === "bridge-descriptor",
      startsBridge: false,
      listenHost: null,
      authMaterial: null
    },
    execution: noExecution(),
    cleanup: reversibleCleanup(manifest),
    errors: []
  };

  assertAgentClientHandoffPlanSafe(plan);
  return clone(plan);
}

export function assertAgentClientHandoffPlanSafe(plan) {
  assertNoInlineSecrets(plan);
  const text = JSON.stringify(plan);
  if (unsafePathPattern.test(text)) {
    throw issue("agent-client.unsafe-path", "Agent client handoff plan contains local path material.");
  }
  if (text.includes([".", "planning"].join("")) || text.includes(["reference", "docs"].join("/"))) {
    throw issue("agent-client.unsafe-output", "Agent client handoff plan contains private planning material.");
  }
  if (commandPattern.test(text)) {
    throw issue("agent-client.command-output", "Agent client handoff plan must not include executable commands.");
  }
  if (plan?.execution?.willExecute || plan?.execution?.startsBridge || plan?.bridge?.startsBridge) {
    throw issue("agent-client.execution-enabled", "Agent client handoff plan must remain non-executing.");
  }
  if (!plan?.cleanup?.reversible) {
    throw issue("agent-client.non-reversible", "Agent client handoff plan must be reversible.");
  }
  return true;
}

function buildAction(actionId, manifest) {
  const actionLabels = {
    "review-descriptor": "Review descriptor",
    "copy-command": "Copy review instruction",
    "import-descriptor": `Import descriptor in ${manifest.label}`,
    "register-disabled-bridge": "Register disabled bridge descriptor",
    "choose-folder": "Choose export folder",
    "export-package-copy": "Export verified package copy",
    "open-folder": "Open selected folder"
  };
  return {
    id: actionId,
    label: actionLabels[actionId] ?? actionId,
    requiresUserAction: true,
    willExecute: false,
    startsBridge: false,
    writesFiles: false
  };
}

function buildCopyInstruction(resource, manifest, overrideText) {
  if (overrideText) {
    return redactText(overrideText);
  }
  return [
    `Target: ${manifest.label}`,
    `Resource: ${resource.title} (${resource.resourceId}@${resource.version})`,
    `Digest: ${resource.digest}`,
    "Instruction: review this descriptor in the selected agent client; Agentique UI does not execute commands or start bridges."
  ].join("\n");
}

function toPublicResource(resource) {
  if (!resource || typeof resource !== "object") {
    throw issue("agent-client.invalid-resource", "Resource is required.");
  }
  const publicResource = {
    resourceId: requireText(resource.resourceId, "resourceId"),
    title: requireText(resource.title, "title"),
    version: requireText(resource.version, "version"),
    digest: requireText(resource.digest, "digest"),
    supportMode: requireText(resource.supportMode, "supportMode")
  };
  assertNoInlineSecrets(publicResource);
  return publicResource;
}

function failedPlan(target, code, message) {
  return {
    ok: false,
    schemaVersion: planSchemaVersion,
    target: String(target ?? "unknown"),
    label: "Unsupported agent client",
    mode: "unsupported",
    createdAt: null,
    resource: null,
    actions: [],
    output: { fileName: null, mediaType: "application/json", copyText: "" },
    bridge: { descriptorOnly: false, startsBridge: false, listenHost: null, authMaterial: null },
    execution: noExecution(),
    cleanup: reversibleCleanup({ mode: "unsupported" }),
    errors: [{ code, message: redactText(message) }]
  };
}

function validateDestination(destination) {
  if (destination == null || destination === "") {
    return null;
  }
  if (typeof destination !== "string" || unsafePathPattern.test(destination)) {
    return issue("agent-client.unsafe-destination", "Agent client handoff destination must be user-selected and path-free.");
  }
  return null;
}

function validateCopyText(copyText) {
  if (copyText == null || copyText === "") {
    return null;
  }
  if (typeof copyText !== "string" || commandPattern.test(copyText)) {
    return issue("agent-client.command-output", "Copy instruction must be inert review text, not an executable command.");
  }
  return null;
}

function noExecution() {
  return {
    willExecute: false,
    startsBridge: false,
    writesFiles: false,
    opensFolder: false,
    requiresUserReview: true
  };
}

function reversibleCleanup(manifest) {
  return {
    reversible: true,
    removes: manifest.mode === "folder-export" ? ["exported package copy", "handoff descriptor"] : ["handoff descriptor"],
    leavesResourceLibraryRecord: true
  };
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw issue("agent-client.invalid-field", `${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function isoDate(value) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    throw issue("agent-client.invalid-date", "createdAt must be an ISO date.");
  }
  return time.toISOString();
}

function issue(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
