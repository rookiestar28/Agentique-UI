import assert from "node:assert/strict";
import test from "node:test";
import {
  agentEvaluationLimits,
  buildRepoOwnedFixture,
  createAgentEvaluationPipeline,
  createFixedEvaluationAdapters,
  renderAgentEvaluationMarkdown,
  reviewAgentEvaluationGate
} from "../src/core/agent-evaluation-pipeline.mjs";

const candidate = Object.freeze({
  repository: "agentique-ui",
  revisionKind: "uncommitted-candidate",
  revision: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  os: "windows",
  runtimes: { node: "24.13.1", rust: "1.94.1" },
  commands: ["npm run validate:agent-evaluation-pipeline", "npm run validate"]
});

test("repo-owned fixture digest and exact candidate bind a reproducible report", async () => {
  const fixture = fixtureFor("success", ["outcome-succeeded", "single-terminal", "projection-before-terminal", "cleanup-complete"]);
  const pipeline = createAgentEvaluationPipeline({ fixtures: [fixture], adapters: createFixedEvaluationAdapters(), candidate, now: () => "2026-09-04T00:00:00.000Z" });
  const report = await pipeline.evaluate(fixture.id);

  assert.equal(report.status, "passed");
  assert.equal(report.candidate.revision, candidate.revision);
  assert.equal(report.fixture.digest, fixture.digest);
  assert.equal(report.deterministic.passed, 4);
  assert.equal(report.humanReview.status, "unreviewed");
  assert.equal(report.nonClaims.repositoryAcceptance, false);
});

test("case data cannot supply commands, environment, network, user paths, or external fixtures", async () => {
  for (const mutation of [
    { command: "run anything" },
    { executable: "tool" },
    { arguments: ["--unsafe"] },
    { environment: { TOKEN: "value" } },
    { url: "https://example.invalid" },
    { network: true },
    { path: ["C:", "Users", "example", "work"].join("/") },
    { provenance: "downloaded" }
  ]) {
    const unsafe = { ...fixtureFor("success", ["single-terminal"]), ...mutation };
    assert.throws(
      () => createAgentEvaluationPipeline({ fixtures: [unsafe], adapters: createFixedEvaluationAdapters(), candidate }),
      (error) => error.code === "agent-eval.fixture-unsafe" || error.code === "agent-eval.provenance"
    );
  }
});

test("only fixed registered adapters and allowlisted deterministic checks run", async () => {
  const unknownAdapter = fixtureFor("success", ["single-terminal"], { adapterId: "dynamic-command" });
  const unknownCheck = fixtureFor("success", ["invented-check"]);
  await assert.rejects(
    createAgentEvaluationPipeline({ fixtures: [unknownAdapter], adapters: createFixedEvaluationAdapters(), candidate }).evaluate(unknownAdapter.id),
    (error) => error.code === "agent-eval.adapter"
  );
  await assert.rejects(
    createAgentEvaluationPipeline({ fixtures: [unknownCheck], adapters: createFixedEvaluationAdapters(), candidate }).evaluate(unknownCheck.id),
    (error) => error.code === "agent-eval.check"
  );
});

test("human rubric never rewrites deterministic failure or pass", async () => {
  const failing = fixtureFor("failure", ["outcome-succeeded", "single-terminal", "cleanup-complete"]);
  const passing = fixtureFor("success", ["outcome-succeeded", "single-terminal", "cleanup-complete"]);
  const pipeline = createAgentEvaluationPipeline({ fixtures: [failing, passing], adapters: createFixedEvaluationAdapters(), candidate });

  const positiveHuman = await pipeline.evaluate(failing.id, { humanReview: { status: "pass", reviewer: "human", notes: "Looks useful." } });
  const negativeHuman = await pipeline.evaluate(passing.id, { humanReview: { status: "fail", reviewer: "human", notes: "Quality is insufficient." } });
  assert.equal(positiveHuman.status, "failed");
  assert.equal(positiveHuman.humanReview.status, "pass");
  assert.equal(negativeHuman.status, "passed");
  assert.equal(negativeHuman.humanReview.status, "fail");
});

test("cleanup failure and evaluator interruption prevent pass", async () => {
  const dirty = fixtureFor("cleanup-failure", ["single-terminal"]);
  const interrupted = fixtureFor("interrupted", ["single-terminal"]);
  const pipeline = createAgentEvaluationPipeline({ fixtures: [dirty, interrupted], adapters: createFixedEvaluationAdapters(), candidate });
  assert.equal((await pipeline.evaluate(dirty.id)).status, "failed");
  assert.equal((await pipeline.evaluate(dirty.id)).cleanup.status, "failed");
  assert.equal((await pipeline.evaluate(interrupted.id)).status, "interrupted");
});

test("trace metrics cover approval effect mutation verification projection terminal checkpoint and cleanup", async () => {
  const fixture = fixtureFor("success", [
    "permission-granted",
    "verification-after-mutation",
    "read-before-mutation",
    "single-terminal",
    "projection-before-terminal",
    "checkpoint-committed",
    "cleanup-complete"
  ]);
  const report = await createAgentEvaluationPipeline({ fixtures: [fixture], adapters: createFixedEvaluationAdapters(), candidate }).evaluate(fixture.id);
  assert.deepEqual(report.metrics, {
    calls: 2,
    results: 2,
    approvalsRequested: 1,
    approvalsGranted: 1,
    approvalsDenied: 0,
    effects: 1,
    mutations: 1,
    verificationsAfterMutation: 1,
    readsBeforeMutation: 1,
    errors: 0,
    terminalCount: 1,
    projectionBeforeTerminal: true,
    checkpointCommits: 1,
    cleanupComplete: true
  });
});

test("fixture drift, oversized evidence, report injection, and invalid candidate fail closed", async () => {
  const fixture = fixtureFor("success", ["single-terminal"]);
  const drifted = { ...fixture, payload: { scenario: "failure" } };
  await assert.rejects(
    createAgentEvaluationPipeline({ fixtures: [drifted], adapters: createFixedEvaluationAdapters(), candidate }).evaluate(drifted.id),
    (error) => error.code === "agent-eval.fixture-drift"
  );

  const oversized = fixtureFor("oversized", ["single-terminal"]);
  await assert.rejects(
    createAgentEvaluationPipeline({ fixtures: [oversized], adapters: createFixedEvaluationAdapters(), candidate }).evaluate(oversized.id),
    (error) => error.code === "agent-eval.trace-limit"
  );

  const injected = fixtureFor("secret-report", ["single-terminal"]);
  await assert.rejects(
    createAgentEvaluationPipeline({ fixtures: [injected], adapters: createFixedEvaluationAdapters(), candidate }).evaluate(injected.id),
    (error) => error.code === "agent-eval.report-unsafe"
  );

  assert.throws(
    () => createAgentEvaluationPipeline({ fixtures: [fixture], adapters: createFixedEvaluationAdapters(), candidate: { ...candidate, revision: "main" } }),
    (error) => error.code === "agent-eval.candidate"
  );
});

test("JSON and Markdown remain bounded path-neutral and explicit about non-claims", async () => {
  const fixture = fixtureFor("denial", ["permission-denied", "single-terminal", "cleanup-complete"]);
  const report = await createAgentEvaluationPipeline({ fixtures: [fixture], adapters: createFixedEvaluationAdapters(), candidate }).evaluate(fixture.id);
  const markdown = renderAgentEvaluationMarkdown(report);
  assert.ok(Buffer.byteLength(JSON.stringify(report)) <= agentEvaluationLimits.reportBytes);
  assert.ok(Buffer.byteLength(markdown) <= agentEvaluationLimits.markdownBytes);
  assert.match(markdown, /Deterministic result: passed/);
  assert.match(markdown, /Human quality review: unreviewed/);
  assert.match(markdown, /does not replace repository acceptance/i);
  assert.doesNotMatch(markdown, /[A-Z]:[\\/]|\/Users\/|TOKEN=/);
});

test("campaign gate covers success denial cancellation timeout crash restart malformed sequence persistence checkpoint and cleanup", async () => {
  const review = await reviewAgentEvaluationGate({ candidate });
  assert.equal(review.ok, true, JSON.stringify(review.failures));
  assert.deepEqual(review.scenarios, [
    "success",
    "cancellation",
    "denial",
    "timeout",
    "crash",
    "restart",
    "malformed-frame",
    "sequence-conflict",
    "persistence",
    "checkpoint",
    "cleanup-failure"
  ]);
  assert.equal(review.boundary.shellExecution, false);
  assert.equal(review.boundary.network, false);
  assert.equal(review.boundary.replacesRepositoryGate, false);
});

function fixtureFor(scenario, checks, overrides = {}) {
  return buildRepoOwnedFixture({
    id: `fixture.${scenario}`,
    adapterId: "runtime-evidence.v1",
    timeoutMs: 5_000,
    payload: { scenario },
    expected: { outcome: scenario === "failure" ? "failed" : scenario === "interrupted" ? "interrupted" : "succeeded" },
    checks,
    forbiddenEffects: ["network", "shell", "user-filesystem", "credential-read"],
    ...overrides
  });
}
