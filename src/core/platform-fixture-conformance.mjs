import { createGraphRunPlan } from "./graph-run-plan.mjs";
import { parseDifyDslYaml, parseLangGraphManifest, parseN8nWorkflowJson } from "./platform-format-adapter.mjs";
import { normalizePlatformIntakeToWorkflowIr } from "./platform-ir-normalizer.mjs";
import { assertNoInlineSecrets, redactText } from "./secret-vault.mjs";

export const platformFixtureConformanceSchemaVersion = "agentique.platformFixtureConformance.v1";

const unsafePathPattern = /(?:[A-Za-z]:[\\/]|\\\\|(?:^|[\\/])\.\.(?:[\\/]|$)|\.\.[\\/]|\/(?:home|Users|mnt)\/)/u;
const privateReferencePattern = new RegExp(`${escapeRegExp([".", "planning"].join(""))}|${escapeRegExp(["reference", "docs"].join("/"))}`, "iu");

export function reviewPlatformFixtureConformancePack(fixturePack, options = {}) {
  const accepted = (fixturePack?.accepted ?? []).map((fixture) => reviewAcceptedFixture(fixture, options));
  const negative = (fixturePack?.negative ?? []).map((fixture) => reviewNegativeFixture(fixture, options));
  const findings = [
    ...accepted.flatMap((row) => row.findings),
    ...negative.flatMap((row) => row.findings)
  ];
  const report = {
    ok: findings.length === 0,
    schemaVersion: platformFixtureConformanceSchemaVersion,
    boundary: createBoundary(),
    summary: {
      acceptedFixtures: accepted.length,
      negativeFixtures: negative.length,
      firstClassPlatforms: new Set(accepted.map((row) => row.platform)).size,
      goldenChecks: accepted.reduce((total, row) => total + row.goldenChecks, 0),
      blockedNegatives: negative.filter((row) => row.actual.mode === "blocked").length,
      nonExecutableNegatives: negative.filter((row) => row.actual.mode === "non-executable").length,
      findings: findings.length
    },
    accepted: accepted.map(stripFindings),
    negative: negative.map(stripFindings),
    findings
  };
  assertConformanceOutputSafe(report);
  return cloneFreeze(report);
}

function reviewAcceptedFixture(fixture, options) {
  const intake = parseFixture(fixture, options);
  const normalization = normalizePlatformIntakeToWorkflowIr(intake, options);
  const runPlan = normalization.workflowIr ? createGraphRunPlan(normalization.workflowIr) : null;
  const actual = {
    adapter: adapterSummary(intake),
    canonicalIr: canonicalIrSummary(normalization.workflowIr),
    capability: capabilitySummary(runPlan),
    lossReport: lossSummary(normalization.lossReport)
  };
  const findings = compareGolden(fixture.id, fixture.golden, actual);
  return {
    id: fixture.id,
    platform: fixture.platform,
    provenance: fixture.provenance,
    actual,
    goldenChecks: 4,
    findings
  };
}

function reviewNegativeFixture(fixture, options) {
  const intake = parseFixture(fixture, options);
  const normalization = normalizePlatformIntakeToWorkflowIr(intake, options);
  const runPlan = normalization.workflowIr ? createGraphRunPlan(normalization.workflowIr) : null;
  const executableNodes = runPlan?.summary.executable ?? 0;
  const actualMode = !intake.ok || !normalization.ok
    ? "blocked"
    : executableNodes === 0
      ? "non-executable"
      : "execution-enabled";
  const actual = {
    mode: actualMode,
    adapter: adapterSummary(intake),
    canonicalIr: canonicalIrSummary(normalization.workflowIr),
    capability: capabilitySummary(runPlan),
    lossReport: lossSummary(normalization.lossReport)
  };
  const findings = [];
  if (fixture.expected.mode !== actualMode) {
    findings.push(finding(fixture.id, "fixture.mode-drift", `Expected ${fixture.expected.mode} but got ${actualMode}.`));
  }
  if (fixture.expected.errorCode && !hasError(intake, normalization, fixture.expected.errorCode)) {
    findings.push(finding(fixture.id, "fixture.error-missing", `Expected error ${fixture.expected.errorCode}.`));
  }
  if (actual.capability.executable > 0) {
    findings.push(finding(fixture.id, "fixture.execution-enabled", "Negative fixture produced executable run-plan nodes."));
  }
  return {
    id: fixture.id,
    platform: fixture.platform,
    provenance: fixture.provenance,
    actual,
    goldenChecks: 1,
    findings
  };
}

function parseFixture(fixture, options) {
  const parseOptions = { ...options, ...(fixture.options ?? {}) };
  if (fixture.platform === "n8n") return parseN8nWorkflowJson(fixture.input, parseOptions);
  if (fixture.platform === "dify") return parseDifyDslYaml(fixture.input, parseOptions);
  if (fixture.platform === "langgraph") return parseLangGraphManifest(fixture.input, parseOptions);
  return {
    ok: false,
    platform: fixture.platform,
    decision: "blocked",
    summary: { nodes: 0, edges: 0, credentialReferences: 0, expressions: 0, triggers: 0, unsupportedMetadata: 0, blockedFindings: 1 },
    errors: [{ code: "fixture.unsupported-platform", message: "Fixture platform is unsupported." }]
  };
}

function adapterSummary(intake) {
  return {
    decision: intake.decision,
    nodes: intake.summary.nodes,
    edges: intake.summary.edges,
    credentialReferences: intake.summary.credentialReferences,
    expressions: intake.summary.expressions,
    blockedFindings: intake.summary.blockedFindings
  };
}

function canonicalIrSummary(workflowIr) {
  return {
    nodes: workflowIr?.nodes.length ?? 0,
    edges: workflowIr?.edges.length ?? 0,
    nodeTypes: [...new Set((workflowIr?.nodes ?? []).map((node) => node.type))].sort()
  };
}

function capabilitySummary(runPlan) {
  return {
    status: runPlan?.status ?? "not-created",
    executable: runPlan?.summary.executable ?? 0,
    permissionRequired: runPlan?.summary.permissionRequired ?? 0,
    blocked: runPlan?.summary.blocked ?? 0,
    handoffOnly: runPlan?.summary.handoffOnly ?? 0
  };
}

function lossSummary(lossReport) {
  return {
    preserved: lossReport?.summary.preserved ?? 0,
    normalized: lossReport?.summary.normalized ?? 0,
    degraded: lossReport?.summary.degraded ?? 0,
    blocked: lossReport?.summary.blocked ?? 0,
    handoffOnly: lossReport?.summary.handoffOnly ?? 0
  };
}

function compareGolden(fixtureId, expected, actual) {
  const findings = [];
  for (const key of ["adapter", "canonicalIr", "capability", "lossReport"]) {
    if (JSON.stringify(expected?.[key]) !== JSON.stringify(actual[key])) {
      findings.push(finding(fixtureId, `fixture.${key}-drift`, `${key} golden summary changed.`));
    }
  }
  return findings;
}

function hasError(intake, normalization, code) {
  return [...(intake.errors ?? []), ...(normalization.errors ?? [])].some((error) => error.code === code);
}

function stripFindings(row) {
  const { findings: _findings, ...safeRow } = row;
  return safeRow;
}

function assertConformanceOutputSafe(report) {
  assertNoInlineSecrets(report);
  const serialized = JSON.stringify(report);
  if (unsafePathPattern.test(serialized)) {
    throw issue("fixture.unsafe-path", "Fixture conformance output contains local or traversal path material.");
  }
  if (privateReferencePattern.test(serialized)) {
    throw issue("fixture.private-reference", "Fixture conformance output contains private planning material.");
  }
  return true;
}

function createBoundary() {
  return {
    staticFixturesOnly: true,
    noExecution: true,
    noInstall: true,
    noBuild: true,
    noExternalPlatformInvoke: true,
    noNetwork: true,
    noContainerStart: true,
    noFilesystemWrite: true,
    noSchedulerStart: true
  };
}

function finding(fixtureId, code, message) {
  return {
    fixtureId: redactText(fixtureId),
    code,
    message: redactText(message)
  };
}

function issue(code, message) {
  return { code, message: redactText(message) };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function cloneFreeze(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}
