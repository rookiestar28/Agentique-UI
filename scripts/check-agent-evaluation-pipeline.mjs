import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createAgentEvaluationPipeline, createFixedEvaluationAdapters, renderAgentEvaluationMarkdown, reviewAgentEvaluationGate } from "../src/core/agent-evaluation-pipeline.mjs";
import { createAjv } from "./validate-contracts.mjs";

const sourcePaths = [
  "src/core/agent-evaluation-pipeline.mjs",
  "schemas/agent-evaluation-case.schema.json",
  "schemas/agent-evaluation-report.schema.json",
  "docs/contracts/agent-evaluation-pipeline.md"
];
const fixturePaths = [
  "tests/fixtures/agent-evaluation/success.json",
  "tests/fixtures/agent-evaluation/denial.json",
  "tests/fixtures/agent-evaluation/checkpoint.json",
  "tests/fixtures/agent-evaluation/cleanup-failure.json"
];

const candidateHash = createHash("sha256");
for (const path of sourcePaths) candidateHash.update(path).update("\0").update(readFileSync(path)).update("\0");
const candidate = Object.freeze({
  repository: "agentique-ui",
  revisionKind: "uncommitted-candidate",
  revision: `sha256:${candidateHash.digest("hex")}`,
  os: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux",
  runtimes: { node: process.versions.node, rust: "validated-by-native-gate" },
  commands: ["npm run validate:agent-evaluation-pipeline", "npm run validate"]
});
const fixtures = fixturePaths.map((path) => JSON.parse(readFileSync(path, "utf8")));
const ajv = createAjv();
const validateCase = ajv.compile(JSON.parse(readFileSync("schemas/agent-evaluation-case.schema.json", "utf8")));
const validateReport = ajv.compile(JSON.parse(readFileSync("schemas/agent-evaluation-report.schema.json", "utf8")));
for (const fixture of fixtures) {
  if (!validateCase(fixture)) throw new Error(JSON.stringify(validateCase.errors));
}
const pipeline = createAgentEvaluationPipeline({ fixtures, adapters: createFixedEvaluationAdapters(), candidate, now: () => "2026-09-04T00:00:00.000Z" });
const reports = [];
for (const fixture of fixtures) reports.push(await pipeline.evaluate(fixture.id));
for (const report of reports) {
  if (!validateReport(report)) throw new Error(JSON.stringify(validateReport.errors));
}
const review = await reviewAgentEvaluationGate({ candidate });
if (!review.ok) throw new Error(JSON.stringify(review.failures));
for (const report of reports) renderAgentEvaluationMarkdown(report);

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: [...sourcePaths, ...fixturePaths],
      summary: {
        fixtures: reports.length,
        campaignScenarios: review.scenarios.length,
        deterministicPassed: reports.filter((report) => report.status === "passed").length,
        expectedCleanupFailures: reports.filter((report) => report.cleanup.status === "failed").length,
        shellExecution: review.boundary.shellExecution,
        network: review.boundary.network,
        replacesRepositoryGate: review.boundary.replacesRepositoryGate
      }
    },
    null,
    2
  )
);
