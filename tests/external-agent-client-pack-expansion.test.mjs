import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertExternalAgentClientPackExpansionSafe,
  createExternalAgentClientPackExpansion,
  externalAgentClientPackExpansionSchemaVersion,
  reviewExternalAgentClientPackExpansionGate
} from "../src/core/external-agent-client-pack-expansion.mjs";

const expectedTargets = [
  "codex",
  "claude-code",
  "opencode",
  "gemini-cli",
  "github-copilot",
  "openclaw-gateway",
  "continue",
  "mcp-client"
];

test("external agent client pack expansion generates static review-only packs", () => {
  const review = createExternalAgentClientPackExpansion();
  const targets = review.packs.map((pack) => pack.target.id);

  assert.equal(review.schemaVersion, externalAgentClientPackExpansionSchemaVersion);
  assert.deepEqual(targets, expectedTargets);
  assert.equal(review.summary.packRows, expectedTargets.length);

  for (const pack of review.packs) {
    assert.equal(pack.output.descriptorOnly, true);
    assert.equal(pack.output.reviewOnly, true);
    assert.equal(pack.output.staticOutput, true);
    assert.equal(pack.authority.automaticInstall, false);
    assert.equal(pack.authority.startsBridge, false);
    assert.equal(pack.authority.startsRuntime, false);
    assert.equal(pack.authority.writesFiles, false);
    assert.equal(pack.authority.makesNetworkRequest, false);
    assert.equal(pack.authority.invokesTools, false);
  }
});

test("external client packs record provenance drift compatibility cleanup and rollback evidence", () => {
  const review = createExternalAgentClientPackExpansion();

  for (const pack of review.packs) {
    assert.match(pack.provenance.canonicalSource.sourceId, /^[a-z0-9.-]+$/u);
    assert.match(pack.provenance.canonicalSource.digest, /^[a-f0-9]{64}$/u);
    assert.match(pack.provenance.generator.generatorId, /^[a-z0-9.-]+$/u);
    assert.match(pack.provenance.generator.digest, /^[a-f0-9]{64}$/u);
    assert.ok(["current", "review-required", "stale-compatible"].includes(pack.drift.status));
    assert.ok(pack.compatibility.warnings.length >= 1);
    assert.equal(pack.cleanup.ready, true);
    assert.equal(pack.cleanup.receiptRequired, true);
    assert.equal(pack.rollback.reversible, true);
    assert.equal(pack.rollback.requiresUserAction, true);
    assert.equal(pack.evidence.redacted, true);
    assert.equal(JSON.stringify(pack).includes("privateToken"), false);
  }
});

test("destination open-folder and deep-link behavior always requires explicit user action", () => {
  const review = createExternalAgentClientPackExpansion();

  for (const pack of review.packs) {
    assert.equal(pack.destination.userOwnedRequired, true);
    assert.equal(pack.destination.requiresExplicitUserAction, true);
    assert.equal(pack.destination.appWritesFiles, false);
    assert.equal(pack.destination.openFolder.available, true);
    assert.equal(pack.destination.openFolder.automatic, false);
    assert.equal(pack.destination.deepLink.available, true);
    assert.equal(pack.destination.deepLink.opensAutomatically, false);
    assert.equal(pack.destination.deepLink.carriesCredentials, false);
    assert.equal(pack.userAction.required, true);
    assert.equal(pack.userAction.automaticClientLaunch, false);
  }
});

test("unsafe install export pack samples fail closed before launch", () => {
  const review = createExternalAgentClientPackExpansion();
  const reasons = new Set(review.blockedSamples.map((sample) => sample.reason));

  for (const reason of [
    "credential-forwarding",
    "browser-data",
    "hidden-bridge",
    "lifecycle-hook-trust",
    "automatic-install",
    "external-runtime-automation",
    "package-install",
    "executable-command",
    "unsafe-destination",
    "missing-user-action",
    "drifted-source",
    "raw-secret",
    "local-absolute-path",
    "deeplink-auto-open",
    "open-folder-without-user",
    "mcp-auto-tool-invocation"
  ]) {
    assert.equal(reasons.has(reason), true, reason);
  }

  assert.equal(
    review.blockedSamples.every((sample) => sample.accepted === false && sample.launched === false),
    true
  );
});

test("external agent client pack review passes and remains browser safe", () => {
  const validation = reviewExternalAgentClientPackExpansionGate();
  const moduleText = fs.readFileSync("src/core/external-agent-client-pack-expansion.mjs", "utf8");

  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(validation.checks.packRows, expectedTargets.length);
  assert.equal(validation.checks.reviewOnlyRows, expectedTargets.length);
  assert.equal(validation.checks.explicitUserActionRows, expectedTargets.length);
  assert.equal(validation.checks.blockedBeforeLaunch, 16);
  assert.equal(validation.checks.automaticInstallRows, 0);
  assert.equal(validation.checks.forwardedCredentials, 0);
  assert.equal(validation.checks.browserDataAccessRows, 0);
  assert.doesNotMatch(moduleText, /node:child_process|child_process|node:fs|writeFile|appendFile|createWriteStream|spawn\(|execFile\(|exec\(|fetch\(|WebSocket\(|invoke\(/u);
});

test("external agent client pack safety rejects commands paths browser data and raw secrets", () => {
  for (const unsafe of [
    { output: ["C", ":\\tmp\\client-pack.json"].join("") },
    { output: "npm run client-install" },
    { output: "bearer abcdefghijklmnop" },
    { output: "cookie=session" },
    { output: "browser profile export" }
  ]) {
    assert.throws(
      () => assertExternalAgentClientPackExpansionSafe(unsafe),
      /unsafe material|inline sensitive material/u
    );
  }
});
