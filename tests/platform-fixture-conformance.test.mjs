import assert from "node:assert/strict";
import test from "node:test";
import { reviewPlatformFixtureConformancePack } from "../src/core/platform-fixture-conformance.mjs";
import { platformWorkflowFixturePack } from "./fixtures/platform-workflows/fixtures.mjs";

test("platform fixture conformance pack validates accepted golden summaries", () => {
  const report = reviewPlatformFixtureConformancePack(platformWorkflowFixturePack);

  assert.equal(report.ok, true);
  assert.equal(report.schemaVersion, "agentique.platformFixtureConformance.v1");
  assert.equal(report.boundary.noExecution, true);
  assert.equal(report.boundary.noExternalPlatformInvoke, true);
  assert.equal(report.boundary.noInstall, true);
  assert.equal(report.summary.acceptedFixtures, 3);
  assert.equal(report.summary.firstClassPlatforms, 3);
  assert.equal(report.summary.goldenChecks, 12);
  assert.deepEqual(report.accepted.map((row) => row.platform), ["n8n", "dify", "langgraph"]);
});

test("negative fixtures fail closed or stay non-executable", () => {
  const report = reviewPlatformFixtureConformancePack(platformWorkflowFixturePack);

  assert.equal(report.summary.negativeFixtures, 8);
  assert.equal(report.summary.blockedNegatives, 7);
  assert.equal(report.summary.nonExecutableNegatives, 1);
  assert.equal(report.negative.every((row) => row.actual.capability.executable === 0), true);
  assert.equal(report.negative.some((row) => row.id === "dify-unsupported-provider" && row.actual.mode === "non-executable"), true);
});

test("golden summaries include adapter IR capability and loss report outputs", () => {
  const report = reviewPlatformFixtureConformancePack(platformWorkflowFixturePack);
  const n8n = report.accepted.find((row) => row.platform === "n8n");
  const dify = report.accepted.find((row) => row.platform === "dify");
  const langgraph = report.accepted.find((row) => row.platform === "langgraph");

  assert.deepEqual(n8n.actual.adapter, platformWorkflowFixturePack.accepted[0].golden.adapter);
  assert.deepEqual(n8n.actual.canonicalIr, platformWorkflowFixturePack.accepted[0].golden.canonicalIr);
  assert.deepEqual(n8n.actual.capability, platformWorkflowFixturePack.accepted[0].golden.capability);
  assert.deepEqual(n8n.actual.lossReport, platformWorkflowFixturePack.accepted[0].golden.lossReport);
  assert.equal(dify.actual.lossReport.handoffOnly, 1);
  assert.equal(langgraph.actual.capability.handoffOnly, 1);
  assert.equal(langgraph.actual.lossReport.handoffOnly, 1);
});

test("fixture conformance output is deterministic and public safe", () => {
  const first = reviewPlatformFixtureConformancePack(platformWorkflowFixturePack);
  const second = reviewPlatformFixtureConformancePack(platformWorkflowFixturePack);
  const serialized = JSON.stringify(first);

  assert.deepEqual(first, second);
  for (const forbidden of ["./src/agent", "../", ".env", "Bearer ", "npm install", "pip install"]) {
    assert.equal(serialized.includes(forbidden), false, `serialized report leaked ${forbidden}`);
  }
});

test("golden drift fails the conformance review", () => {
  const drifted = {
    ...platformWorkflowFixturePack,
    accepted: [
      {
        ...platformWorkflowFixturePack.accepted[0],
        golden: {
          ...platformWorkflowFixturePack.accepted[0].golden,
          adapter: { ...platformWorkflowFixturePack.accepted[0].golden.adapter, nodes: 999 }
        }
      },
      ...platformWorkflowFixturePack.accepted.slice(1)
    ]
  };
  const report = reviewPlatformFixtureConformancePack(drifted);

  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.code === "fixture.adapter-drift"));
});
