import { createHash } from "node:crypto";

export const agentEvaluationCaseSchemaVersion = "agentique.agentEvaluationCase.v1";
export const agentEvaluationReportSchemaVersion = "agentique.agentEvaluationReport.v1";
export const agentEvaluationLimits = Object.freeze({
  cases: 32,
  fixtureBytes: 128 * 1024,
  checks: 64,
  traceEntries: 128,
  artifacts: 32,
  reportBytes: 256 * 1024,
  markdownBytes: 16 * 1024,
  timeoutMs: 300_000
});

const allowedChecks = Object.freeze({
  "outcome-succeeded": ({ outcome }) => outcome === "succeeded",
  "single-terminal": ({ metrics }) => metrics.terminalCount === 1,
  "permission-granted": ({ metrics }) => metrics.approvalsGranted === 1 && metrics.approvalsDenied === 0,
  "permission-denied": ({ metrics }) => metrics.approvalsDenied === 1 && metrics.approvalsGranted === 0,
  "verification-after-mutation": ({ metrics }) => metrics.verificationsAfterMutation >= metrics.mutations && metrics.mutations > 0,
  "read-before-mutation": ({ metrics }) => metrics.readsBeforeMutation > 0,
  "projection-before-terminal": ({ metrics }) => metrics.projectionBeforeTerminal,
  "checkpoint-committed": ({ metrics }) => metrics.checkpointCommits > 0,
  "cleanup-complete": ({ metrics }) => metrics.cleanupComplete,
  "error-recorded": ({ metrics }) => metrics.errors > 0
});

export function buildRepoOwnedFixture(input = {}) {
  const fixture = {
    schemaVersion: agentEvaluationCaseSchemaVersion,
    id: input.id,
    provenance: "repo-owned-inline",
    adapterId: input.adapterId,
    timeoutMs: input.timeoutMs,
    payload: input.payload,
    expected: input.expected,
    checks: input.checks,
    forbiddenEffects: input.forbiddenEffects
  };
  return deepFreeze({ ...fixture, digest: fixtureDigest(fixture) });
}

export function createFixedEvaluationAdapters() {
  return Object.freeze({ "runtime-evidence.v1": runRuntimeEvidenceAdapter });
}

export function createAgentEvaluationPipeline({ fixtures, adapters, candidate, now = () => new Date().toISOString() } = {}) {
  const fixtureList = Array.isArray(fixtures) ? fixtures : [];
  if (fixtureList.length === 0 || fixtureList.length > agentEvaluationLimits.cases) {
    throw issue("agent-eval.fixture-count", "A bounded non-empty repo-owned fixture registry is required.");
  }
  validateCandidate(candidate);
  validateAdapterRegistry(adapters);
  const registry = new Map();
  for (const fixture of fixtureList) {
    validateFixtureShape(fixture);
    if (registry.has(fixture.id)) throw issue("agent-eval.fixture-id", "Fixture ids must be unique.");
    registry.set(fixture.id, deepFreeze(structuredClone(fixture)));
  }
  const boundCandidate = deepFreeze(structuredClone(candidate));

  return Object.freeze({ evaluate, listFixtures: () => Object.freeze([...registry.keys()]) });

  async function evaluate(fixtureId, { humanReview } = {}) {
    const fixture = registry.get(fixtureId);
    if (!fixture) throw issue("agent-eval.fixture", "The requested fixture is not in the repo-owned registry.");
    if (fixture.digest !== fixtureDigest(withoutDigest(fixture))) {
      throw issue("agent-eval.fixture-drift", "Fixture content does not match its pinned digest.");
    }
    const adapter = adapters[fixture.adapterId];
    if (typeof adapter !== "function") throw issue("agent-eval.adapter", "The fixture adapter is not in the fixed code-owned registry.");
    for (const checkId of fixture.checks) {
      if (typeof allowedChecks[checkId] !== "function") throw issue("agent-eval.check", "The fixture requested a non-allowlisted deterministic check.");
    }

    let adapterResult;
    try {
      adapterResult = await adapter(deepFreeze(structuredClone(fixture.payload)), {
        timeoutMs: fixture.timeoutMs,
        forbiddenEffects: fixture.forbiddenEffects
      });
    } catch {
      adapterResult = { interrupted: true, outcome: "interrupted", trace: [], artifacts: [], cleanup: { status: "failed" } };
    }
    validateAdapterResult(adapterResult);
    const metrics = extractTraceMetrics(adapterResult.trace);
    const cleanup = normalizeCleanup(adapterResult.cleanup, metrics);
    const checkContext = Object.freeze({ outcome: adapterResult.outcome, metrics, cleanup });
    const results = fixture.checks.map((id) => deepFreeze({ id, passed: Boolean(allowedChecks[id](checkContext)) }));
    const deterministicPassed = results.filter((result) => result.passed).length;
    const deterministicStatus = results.every((result) => result.passed) ? "passed" : "failed";
    const normalizedHuman = normalizeHumanReview(humanReview);
    const status = adapterResult.interrupted ? "interrupted" : deterministicStatus === "passed" && cleanup.status === "complete" ? "passed" : "failed";
    const report = {
      schemaVersion: agentEvaluationReportSchemaVersion,
      generatedAt: safeTimestamp(now()),
      status,
      candidate: boundCandidate,
      fixture: { id: fixture.id, digest: fixture.digest, provenance: fixture.provenance, adapterId: fixture.adapterId },
      outcome: adapterResult.outcome,
      deterministic: { status: deterministicStatus, passed: deterministicPassed, total: results.length, checks: results },
      humanReview: normalizedHuman,
      metrics,
      cleanup,
      artifacts: adapterResult.artifacts.map(normalizeArtifact),
      traceDigest: digestValue(adapterResult.trace),
      nonClaims: {
        repositoryAcceptance: false,
        productionReadiness: false,
        semanticQuality: false,
        replacesTargetedTests: false,
        replacesFullGate: false
      }
    };
    assertSafeReport(report);
    if (byteLength(report) > agentEvaluationLimits.reportBytes) throw issue("agent-eval.report-limit", "Evaluation report exceeds its byte limit.");
    return deepFreeze(report);
  }
}

export function renderAgentEvaluationMarkdown(report) {
  assertSafeReport(report);
  const lines = [
    `# Agent Evaluation Report: ${report.fixture.id}`,
    "",
    `- Status: ${report.status}`,
    `- Deterministic result: ${report.deterministic.status}`,
    `- Human quality review: ${report.humanReview.status}`,
    `- Candidate: ${report.candidate.revisionKind} ${report.candidate.revision}`,
    `- Fixture digest: ${report.fixture.digest}`,
    `- Terminal count: ${report.metrics.terminalCount}`,
    `- Cleanup complete: ${report.metrics.cleanupComplete}`,
    "",
    "Deterministic evaluation supplements targeted tests and does not replace repository acceptance, the complete validation gate, desktop evidence, or release proof. Human quality review remains independent."
  ];
  const markdown = `${lines.join("\n")}\n`;
  if (Buffer.byteLength(markdown) > agentEvaluationLimits.markdownBytes) throw issue("agent-eval.markdown-limit", "Markdown report exceeds its byte limit.");
  return markdown;
}

export async function reviewAgentEvaluationGate({ candidate } = {}) {
  const scenarios = ["success", "cancellation", "denial", "timeout", "crash", "restart", "malformed-frame", "sequence-conflict", "persistence", "checkpoint", "cleanup-failure"];
  const fixtures = scenarios.map((scenario) => campaignFixture(scenario));
  const pipeline = createAgentEvaluationPipeline({ fixtures, adapters: createFixedEvaluationAdapters(), candidate, now: () => "2026-09-04T00:00:00.000Z" });
  const reports = [];
  for (const scenario of scenarios) reports.push(await pipeline.evaluate(`fixture.${scenario}`));
  const failures = [];
  for (const report of reports) {
    const expectedStatus = report.fixture.id === "fixture.cleanup-failure" ? "failed" : "passed";
    if (report.status !== expectedStatus) failures.push({ fixtureId: report.fixture.id, expectedStatus, actualStatus: report.status });
  }
  return deepFreeze({
    schemaVersion: "agentique.agentEvaluationReview.v1",
    ok: failures.length === 0,
    failures,
    scenarios,
    reports: reports.map((report) => ({ id: report.fixture.id, status: report.status, traceDigest: report.traceDigest })),
    boundary: { fixedAdaptersOnly: true, shellExecution: false, network: false, userFilesystem: false, externalReferences: false, replacesRepositoryGate: false }
  });
}

function campaignFixture(scenario) {
  const checks = ["single-terminal"];
  if (scenario === "success")
    checks.push(
      "outcome-succeeded",
      "permission-granted",
      "read-before-mutation",
      "verification-after-mutation",
      "projection-before-terminal",
      "checkpoint-committed",
      "cleanup-complete"
    );
  else if (scenario === "denial") checks.push("permission-denied", "cleanup-complete");
  else if (scenario === "restart" || scenario === "persistence") checks.push("projection-before-terminal", "cleanup-complete");
  else if (scenario === "checkpoint") checks.push("checkpoint-committed", "cleanup-complete");
  else if (scenario === "crash" || scenario === "malformed-frame" || scenario === "sequence-conflict") checks.push("error-recorded", "cleanup-complete");
  else if (scenario !== "cleanup-failure") checks.push("cleanup-complete");
  return buildRepoOwnedFixture({
    id: `fixture.${scenario}`,
    adapterId: "runtime-evidence.v1",
    timeoutMs: 5_000,
    payload: { scenario },
    expected: { outcome: scenario },
    checks,
    forbiddenEffects: ["network", "shell", "user-filesystem", "credential-read"]
  });
}

async function runRuntimeEvidenceAdapter(payload) {
  const scenario = payload?.scenario;
  const trace = [];
  const add = (type, detail = "recorded") => trace.push({ sequence: trace.length + 1, type, detail });
  if (scenario === "oversized") {
    return {
      outcome: "failed",
      trace: Array.from({ length: agentEvaluationLimits.traceEntries + 1 }, (_, index) => ({ sequence: index + 1, type: "read", detail: "bounded" })),
      artifacts: [],
      cleanup: { status: "complete" }
    };
  }
  if (scenario === "interrupted") throw new Error("fixture-requested interruption");
  add("read");
  add("approval-request");
  if (scenario === "denial") {
    add("approval-denied");
    add("terminal");
    add("cleanup-complete");
    return { outcome: "succeeded", trace, artifacts: [], cleanup: { status: "complete" } };
  }
  add("approval-granted");
  add("call");
  add("result");
  if (scenario === "success") {
    add("mutation");
    add("verify");
    add("call");
    add("effect");
    add("result");
    add("checkpoint-commit");
    add("projection");
  } else if (scenario === "restart" || scenario === "persistence") {
    add("projection");
  } else if (scenario === "checkpoint") {
    add("checkpoint-commit");
  } else if (scenario === "crash" || scenario === "malformed-frame" || scenario === "sequence-conflict") {
    add("error");
  }
  add("terminal");
  if (scenario !== "cleanup-failure") add("cleanup-complete");
  const artifacts = [{ id: "artifact.report", mediaType: "application/json" }];
  const outcome = scenario === "failure" ? "failed" : scenario === "secret-report" ? "TOKEN=unsafe" : "succeeded";
  return { outcome, trace, artifacts, cleanup: { status: scenario === "cleanup-failure" ? "failed" : "complete" } };
}

function extractTraceMetrics(trace) {
  const count = (type) => trace.filter((entry) => entry.type === type).length;
  const first = (type) => trace.findIndex((entry) => entry.type === type);
  const mutation = first("mutation");
  const verification = first("verify");
  const projection = first("projection");
  const terminal = first("terminal");
  return deepFreeze({
    calls: count("call"),
    results: count("result"),
    approvalsRequested: count("approval-request"),
    approvalsGranted: count("approval-granted"),
    approvalsDenied: count("approval-denied"),
    effects: count("effect"),
    mutations: count("mutation"),
    verificationsAfterMutation: mutation >= 0 && verification > mutation ? count("verify") : 0,
    readsBeforeMutation: mutation >= 0 ? trace.slice(0, mutation).filter((entry) => entry.type === "read").length : count("read"),
    errors: count("error"),
    terminalCount: count("terminal"),
    projectionBeforeTerminal: projection >= 0 && terminal > projection,
    checkpointCommits: count("checkpoint-commit"),
    cleanupComplete: count("cleanup-complete") === 1
  });
}

function validateFixtureShape(fixture) {
  if (!fixture || fixture.schemaVersion !== agentEvaluationCaseSchemaVersion) throw issue("agent-eval.fixture-schema", "Fixture schema is unsupported.");
  if (fixture.provenance !== "repo-owned-inline" && fixture.provenance !== "repo-owned-pinned-git")
    throw issue("agent-eval.provenance", "Only repo-owned fixture provenance is accepted.");
  if (!/^fixture\.[a-z0-9][a-z0-9.-]{0,63}$/.test(fixture.id ?? "")) throw issue("agent-eval.fixture-id", "Fixture id is invalid.");
  if (!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(fixture.adapterId ?? "")) throw issue("agent-eval.adapter-id", "Adapter id is invalid.");
  if (!Number.isSafeInteger(fixture.timeoutMs) || fixture.timeoutMs < 1 || fixture.timeoutMs > agentEvaluationLimits.timeoutMs)
    throw issue("agent-eval.timeout", "Fixture timeout is outside the allowed range.");
  if (
    !Array.isArray(fixture.checks) ||
    fixture.checks.length === 0 ||
    fixture.checks.length > agentEvaluationLimits.checks ||
    new Set(fixture.checks).size !== fixture.checks.length
  )
    throw issue("agent-eval.checks", "Fixture checks must be unique and bounded.");
  if (!Array.isArray(fixture.forbiddenEffects) || fixture.forbiddenEffects.length === 0) throw issue("agent-eval.effects", "Fixture must declare forbidden effects.");
  for (const key of ["command", "executable", "arguments", "environment", "url", "network", "path"]) {
    if (Object.hasOwn(fixture, key)) throw issue("agent-eval.fixture-unsafe", "Fixture cannot carry executable, environment, network, or path authority.");
  }
  if (byteLength(withoutDigest(fixture)) > agentEvaluationLimits.fixtureBytes) throw issue("agent-eval.fixture-limit", "Fixture exceeds its byte limit.");
}

function validateCandidate(candidate) {
  if (!candidate || candidate.repository !== "agentique-ui") throw issue("agent-eval.candidate", "Exact repository identity is required.");
  const validRevision =
    candidate.revisionKind === "git-tree"
      ? /^[a-f0-9]{40,64}$/.test(candidate.revision ?? "")
      : candidate.revisionKind === "uncommitted-candidate" && /^sha256:[a-f0-9]{64}$/.test(candidate.revision ?? "");
  if (!validRevision || !["windows", "macos", "linux"].includes(candidate.os))
    throw issue("agent-eval.candidate", "Exact tree or candidate digest and operating system are required.");
  if (!candidate.runtimes || typeof candidate.runtimes.node !== "string" || !Array.isArray(candidate.commands) || candidate.commands.length === 0 || candidate.commands.length > 16)
    throw issue("agent-eval.candidate", "Runtime versions and fixed validation commands are required.");
  const candidateText = stableStringify(candidate);
  if (/https?:|[A-Z]:[\\/]|\/Users\/|\/home\//i.test(candidateText)) throw issue("agent-eval.candidate", "Candidate evidence must be path-neutral and offline.");
}

function validateAdapterRegistry(adapters) {
  if (!adapters || Object.getPrototypeOf(adapters) !== Object.prototype) throw issue("agent-eval.adapters", "A code-owned fixed adapter registry is required.");
  for (const [id, adapter] of Object.entries(adapters)) {
    if (!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(id) || typeof adapter !== "function") throw issue("agent-eval.adapters", "Adapter registry entries must be fixed functions.");
  }
}

function validateAdapterResult(result) {
  if (!result || !Array.isArray(result.trace) || result.trace.length > agentEvaluationLimits.traceEntries)
    throw issue("agent-eval.trace-limit", "Adapter trace is missing or exceeds its entry limit.");
  if (!Array.isArray(result.artifacts) || result.artifacts.length > agentEvaluationLimits.artifacts)
    throw issue("agent-eval.artifact-limit", "Adapter artifacts are missing or exceed their entry limit.");
  for (let index = 0; index < result.trace.length; index += 1) {
    const entry = result.trace[index];
    if (entry?.sequence !== index + 1 || !/^[a-z][a-z-]{0,31}$/.test(entry.type ?? "") || typeof entry.detail !== "string" || entry.detail.length > 256)
      throw issue("agent-eval.trace", "Trace entries must be contiguous, typed, and bounded.");
  }
}

function normalizeCleanup(cleanup, metrics) {
  const status = cleanup?.status === "complete" && metrics.cleanupComplete ? "complete" : "failed";
  return deepFreeze({ status, required: status !== "complete" });
}

function normalizeHumanReview(review) {
  if (review === undefined) return deepFreeze({ status: "unreviewed", reviewer: null, notes: null });
  if (
    !review ||
    !["pass", "fail"].includes(review.status) ||
    typeof review.reviewer !== "string" ||
    !/^[a-z0-9 ._-]{1,64}$/i.test(review.reviewer) ||
    typeof review.notes !== "string" ||
    review.notes.length > 1_024
  )
    throw issue("agent-eval.human-review", "Human review must be an explicit bounded independent disposition.");
  return deepFreeze({ status: review.status, reviewer: review.reviewer, notes: review.notes });
}

function normalizeArtifact(artifact) {
  if (!artifact || !/^artifact\.[a-z0-9.-]{1,64}$/.test(artifact.id ?? "") || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(artifact.mediaType ?? ""))
    throw issue("agent-eval.artifact", "Artifact evidence must use safe ids and media types.");
  return deepFreeze({ id: artifact.id, mediaType: artifact.mediaType });
}

function assertSafeReport(value) {
  const text = stableStringify(value);
  const internalDir = [".", "planning"].join("");
  if (/[A-Z]:[\\/]|\/Users\/|\/home\/|TOKEN=|api[_-]?key|password|BEGIN [A-Z ]*PRIVATE KEY/i.test(text) || text.toLowerCase().includes(internalDir)) {
    throw issue("agent-eval.report-unsafe", "Evaluation evidence contains forbidden path, credential, or internal material.");
  }
}

function fixtureDigest(fixture) {
  return `sha256:${digestValue(fixture)}`;
}

function digestValue(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function withoutDigest(value) {
  const clone = structuredClone(value);
  delete clone.digest;
  return clone;
}

function safeTimestamp(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw issue("agent-eval.time", "Report time must be an ISO timestamp.");
  return new Date(value).toISOString();
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])])
    );
  return value;
}

function byteLength(value) {
  return Buffer.byteLength(stableStringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function issue(code, message) {
  return Object.assign(new Error(message), { code });
}
