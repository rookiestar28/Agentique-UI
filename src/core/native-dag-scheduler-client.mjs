const tokenPattern = /^[a-z0-9][a-z0-9._-]{2,95}$/u;
const workflowStates = new Set(["queued", "running", "canceling", "paused-approval", "succeeded", "failed", "denied", "canceled", "cleanup-required"]);
const nodeStates = new Set(["queued", "running", "retrying", "pending-approval", "succeeded", "failed", "denied", "skipped", "canceled", "cleanup-required"]);
const attemptStates = new Set(["queued", "running", "succeeded", "failed", "timed-out", "canceled", "cleanup-required"]);
const fixedProfiles = Object.freeze({
  "adapter.local-python": "permission.local-python.minimal",
  "adapter.local-node": "permission.local-node.minimal"
});

export const nativeDagSchedulerClientSchemaVersion = "agentique.nativeDagSchedulerClient.v1";

/**
 * @param {{ workflow?: unknown, invokeNative?: (command: string, payload: unknown) => Promise<unknown> }} [options]
 */
export function createNativeDagSchedulerClient({ workflow, invokeNative } = {}) {
  const request = normalizeWorkflow(workflow);
  if (typeof invokeNative !== "function") throw issue("native-dag.invoke", "Native scheduler invoke adapter is required.");
  let lastReceipt = null;

  return Object.freeze({
    schemaVersion: nativeDagSchedulerClientSchemaVersion,
    workflow: deepFreeze(structuredClone(request)),
    start() {
      return invokeScheduler("agentique_scheduler_start", request);
    },
    status() {
      return invokeScheduler("agentique_scheduler_status", commandRequest("status"));
    },
    cancel() {
      return invokeScheduler("agentique_scheduler_cancel", commandRequest("cancel"));
    },
    resume(input) {
      return invokeScheduler("agentique_scheduler_resume", normalizeResumeInput(input));
    },
    snapshot() {
      return Object.freeze({
        schemaVersion: "agentique.nativeDagSchedulerClientSnapshot.v1",
        workflowId: request.workflowId,
        state: lastReceipt?.state ?? "idle",
        activeNodeId: lastReceipt?.activeNodeId ?? null,
        terminalState: lastReceipt?.terminalState ?? null,
        receipt: lastReceipt == null ? null : deepFreeze(structuredClone(lastReceipt))
      });
    }
  });

  function commandRequest(action) {
    return {
      workflowId: request.workflowId,
      resourceId: request.resourceId,
      sessionId: request.sessionId,
      commandId: `command.scheduler-${action}-${request.workflowId}`
    };
  }

  function normalizeResumeInput(input) {
    const expected = ["nodeId", "runId", "interruptId", "checkpointGenerationDigest", "proposalId", "proposalDigest", "decisionId", "decision", "permissionGrantId"];
    exactKeys(input, expected, "resume");
    const decision = String(input.decision ?? "");
    if (decision !== "approved" && decision !== "denied") throw issue("native-dag.resume-decision", "Resume decision must be approved or denied.");
    const permissionGrantId = input.permissionGrantId == null ? null : token(input.permissionGrantId, "permissionGrantId");
    if ((decision === "approved") !== (permissionGrantId != null)) {
      throw issue("native-dag.resume-grant", "Approved resume requires one grant and denied resume forbids it.");
    }
    return {
      workflowId: request.workflowId,
      resourceId: request.resourceId,
      sessionId: request.sessionId,
      commandId: `command.scheduler-resume-${request.workflowId}`,
      nodeId: token(input.nodeId, "nodeId"),
      runId: token(input.runId, "runId"),
      interruptId: token(input.interruptId, "interruptId"),
      checkpointGenerationDigest: digest(input.checkpointGenerationDigest, "checkpointGenerationDigest"),
      proposalId: token(input.proposalId, "proposalId"),
      proposalDigest: digest(input.proposalDigest, "proposalDigest"),
      decisionId: token(input.decisionId, "decisionId"),
      decision,
      permissionGrantId
    };
  }

  async function invokeScheduler(command, nativeRequest) {
    const receipt = await invokeNative(command, { request: nativeRequest });
    lastReceipt = normalizeReceipt(receipt, request);
    return lastReceipt;
  }
}

export function normalizeNativeDagWorkflow(workflow) {
  return normalizeWorkflow(workflow);
}

function normalizeWorkflow(input) {
  exactKeys(input, ["workflowId", "resourceId", "sessionId", "commandId", "nodes"], "workflow");
  const workflowId = token(input.workflowId, "workflowId");
  const resourceId = token(input.resourceId, "resourceId");
  const sessionId = token(input.sessionId, "sessionId");
  const commandId = token(input.commandId, "commandId");
  if (!Array.isArray(input.nodes) || input.nodes.length < 1 || input.nodes.length > 32) {
    throw issue("native-dag.nodes", "Native scheduler requires between 1 and 32 nodes.");
  }
  const nodeIds = new Set();
  const runIds = new Set();
  const grantIds = new Set();
  let edgeCount = 0;
  const nodes = input.nodes.map((candidate) => {
    const nodeType = String(candidate?.nodeType ?? "");
    exactKeys(
      candidate,
      nodeType === "approval-interrupt"
        ? ["nodeId", "nodeType", "interruptId", "dependsOn", "maxRetries", "attempts"]
        : ["nodeId", "nodeType", "dependsOn", "maxRetries", "attempts"],
      "node"
    );
    const nodeId = token(candidate.nodeId, "nodeId");
    if (nodeIds.has(nodeId)) throw issue("native-dag.duplicate-node", "Native scheduler node ids must be unique.");
    nodeIds.add(nodeId);
    if (nodeType === "handoff-only") throw issue("native-dag.handoff-only", "Handoff-only nodes remain blocked from local execution.");
    if (nodeType !== "fixed-adapter" && nodeType !== "approval-interrupt") throw issue("native-dag.node-type", "Native scheduler node type is unsupported.");
    const interruptId = nodeType === "approval-interrupt" ? token(candidate.interruptId, "interruptId") : null;
    if (!Array.isArray(candidate.dependsOn)) throw issue("native-dag.dependencies", "Node dependencies must be an array.");
    const dependsOn = candidate.dependsOn.map((value) => token(value, "dependencyId"));
    edgeCount += dependsOn.length;
    if (edgeCount > 64 || new Set(dependsOn).size !== dependsOn.length || dependsOn.includes(nodeId)) {
      throw issue("native-dag.dependencies", "Node dependencies are duplicate, self-referential, or unbounded.");
    }
    const maxRetries = Number(candidate.maxRetries);
    if (!Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 2) {
      throw issue("native-dag.retries", "Native scheduler allows at most two retries.");
    }
    if (!Array.isArray(candidate.attempts) || candidate.attempts.length !== maxRetries + 1) {
      throw issue("native-dag.attempt-count", "Each initial run and retry requires one distinct pre-approved attempt.");
    }
    if (nodeType === "approval-interrupt" && (maxRetries !== 0 || candidate.attempts.length !== 1)) {
      throw issue("native-dag.interrupt-attempt", "Approval interrupt requires exactly one non-retry attempt.");
    }
    const attempts = candidate.attempts.map((attempt) => {
      exactKeys(attempt, ["runId", "commandId", "adapterId", "approvalId", "permissionProfileId", "permissionGrantId"], "attempt");
      const adapterId = token(attempt.adapterId, "adapterId");
      const permissionProfileId = token(attempt.permissionProfileId, "permissionProfileId");
      if (fixedProfiles[adapterId] !== permissionProfileId) throw issue("native-dag.adapter-profile", "Attempt adapter/profile is outside the fixed allowlist.");
      const runId = token(attempt.runId, "runId");
      const permissionGrantId = attempt.permissionGrantId == null ? null : token(attempt.permissionGrantId, "permissionGrantId");
      if (nodeType === "fixed-adapter" && permissionGrantId == null) throw issue("native-dag.attempt-grant", "Fixed adapter attempt requires a pre-approved grant.");
      if (nodeType === "approval-interrupt" && permissionGrantId != null) throw issue("native-dag.interrupt-grant", "Approval interrupt admission must not contain a grant.");
      if (runIds.has(runId) || (permissionGrantId != null && grantIds.has(permissionGrantId))) {
        throw issue("native-dag.duplicate-attempt", "Attempt run and permission grant identities must be unique across the graph.");
      }
      runIds.add(runId);
      if (permissionGrantId != null) grantIds.add(permissionGrantId);
      return {
        runId,
        commandId: token(attempt.commandId, "commandId"),
        adapterId,
        approvalId: token(attempt.approvalId, "approvalId"),
        permissionProfileId,
        permissionGrantId
      };
    });
    return nodeType === "approval-interrupt" ? { nodeId, nodeType, interruptId, dependsOn, maxRetries, attempts } : { nodeId, nodeType, dependsOn, maxRetries, attempts };
  });
  for (const node of nodes) {
    if (node.dependsOn.some((dependency) => !nodeIds.has(dependency))) throw issue("native-dag.missing-dependency", "Native scheduler dependency is missing.");
  }
  stableOrder(nodes);
  return { workflowId, resourceId, sessionId, commandId, nodes };
}

function normalizeReceipt(input, request) {
  if (!input || typeof input !== "object" || input.schemaVersion !== "agentique.nativeDagWorkflowReceipt.v1") {
    throw issue("native-dag.receipt", "Native scheduler receipt schema is invalid.");
  }
  if (input.workflowId !== request.workflowId || input.resourceId !== request.resourceId || input.sessionId !== request.sessionId) {
    throw issue("native-dag.receipt-scope", "Native scheduler receipt does not match the exact workflow scope.");
  }
  if (!workflowStates.has(input.state) || input.redacted !== true || input.replaysExternalEffects !== false) {
    throw issue("native-dag.receipt-boundary", "Native scheduler receipt state or authority flags are invalid.");
  }
  if (!Array.isArray(input.nodes) || input.nodes.length !== request.nodes.length || !Array.isArray(input.topologicalOrder)) {
    throw issue("native-dag.receipt-graph", "Native scheduler receipt graph is invalid.");
  }
  const nodes = input.nodes.map((node) => {
    if (!nodeStates.has(node?.state) || !request.nodes.some((candidate) => candidate.nodeId === node.nodeId) || !Array.isArray(node.attempts)) {
      throw issue("native-dag.receipt-node", "Native scheduler node receipt is invalid.");
    }
    for (const attempt of node.attempts) {
      if (!attemptStates.has(attempt?.state) || typeof attempt.cleanupVerified !== "boolean" || !tokenPattern.test(String(attempt.runId ?? ""))) {
        throw issue("native-dag.receipt-attempt", "Native scheduler attempt receipt is invalid.");
      }
    }
    if (node.interrupt != null) normalizeInterruptReceipt(node.interrupt, node);
    return node;
  });
  const terminal = new Set(["succeeded", "failed", "denied", "canceled", "cleanup-required"]).has(input.state);
  if ((terminal ? input.state : null) !== (input.terminalState ?? null)) {
    throw issue("native-dag.receipt-terminal", "Native scheduler terminal truth is contradictory.");
  }
  if (input.state === "succeeded" && nodes.some((node) => node.state !== "succeeded")) {
    throw issue("native-dag.receipt-success", "Native scheduler cannot report success while a node is non-successful.");
  }
  return deepFreeze({ ...input, nodes });
}

function normalizeInterruptReceipt(interrupt, node) {
  exactKeys(interrupt, ["interruptId", "runId", "proposalId", "proposalDigest", "checkpointGenerationDigest", "state", "expiresAtEpochSeconds", "reason"], "interrupt-receipt");
  for (const [field, value] of [
    ["interruptId", interrupt.interruptId],
    ["runId", interrupt.runId],
    ["proposalId", interrupt.proposalId]
  ])
    token(value, field);
  digest(interrupt.proposalDigest, "proposalDigest");
  digest(interrupt.checkpointGenerationDigest, "checkpointGenerationDigest");
  if (
    !new Set(["pending", "approved", "denied", "canceled", "cleanup-required"]).has(interrupt.state) ||
    !Number.isSafeInteger(interrupt.expiresAtEpochSeconds) ||
    interrupt.expiresAtEpochSeconds <= 0 ||
    !node.attempts.some((attempt) => attempt.runId === interrupt.runId)
  ) {
    throw issue("native-dag.interrupt-receipt", "Native approval interrupt receipt is invalid.");
  }
}

function stableOrder(nodes) {
  const remaining = new Map(nodes.map((node) => [node.nodeId, new Set(node.dependsOn)]));
  const order = [];
  while (order.length < nodes.length) {
    const next = [...remaining.entries()]
      .filter(([nodeId, dependencies]) => !order.includes(nodeId) && dependencies.size === 0)
      .map(([nodeId]) => nodeId)
      .sort()[0];
    if (!next) throw issue("native-dag.cycle", "Native scheduler graph contains a cycle.");
    order.push(next);
    for (const dependencies of remaining.values()) dependencies.delete(next);
  }
  return order;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw issue(`native-dag.${label}`, `Native scheduler ${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw issue(`native-dag.${label}-fields`, `Native scheduler ${label} contains missing or unknown fields.`);
  }
}

function token(value, field) {
  const result = String(value ?? "");
  if (!tokenPattern.test(result)) throw issue(`native-dag.${field}`, `${field} is not a bounded opaque token.`);
  return result;
}

function digest(value, field) {
  const result = String(value ?? "");
  if (!/^[a-f0-9]{64}$/u.test(result)) throw issue(`native-dag.${field}`, `${field} is not a canonical SHA-256 digest.`);
  return result;
}

function issue(code, message) {
  return Object.assign(new Error(message), { code });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
