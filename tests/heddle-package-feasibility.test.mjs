import assert from "node:assert/strict";
import test from "node:test";
import { evaluateHeddlePackageFeasibility, validateHeddlePackageFeasibilityReceipt } from "../src/core/heddle-package-feasibility.mjs";

test("selects no adoption when both packages add cost without closing an Agentique gap", () => {
  const evaluation = evaluateHeddlePackageFeasibility(sampleReceipt());

  assert.equal(evaluation.status, "accepted");
  assert.equal(evaluation.disposition, "NO_ADOPT");
  assert.deepEqual(evaluation.eligibleDispositions, ["NO_ADOPT"]);
  assert.match(evaluation.reasons.join(" "), /packaged Node runtime/i);
  assert.match(evaluation.reasons.join(" "), /complete run address/i);
});

test("rejects integrity drift before considering package adoption", () => {
  const receipt = sampleReceipt();
  receipt.candidates.runtime.observedIntegrity = "sha512-different";

  const validation = validateHeddlePackageFeasibilityReceipt(receipt);
  assert.equal(validation.ok, false);
  assert.equal(validation.errors[0].code, "heddle-feasibility.integrity");
  assert.throws(() => evaluateHeddlePackageFeasibility(receipt), hasCode("heddle-feasibility.integrity"));
});

test("rejects default effects, advisories, lifecycle scripts, and non-permissive licenses", () => {
  for (const mutate of [
    (candidate) => (candidate.defaultEffects.network = 1),
    (candidate) => (candidate.advisories.high = 1),
    (candidate) => candidate.lifecycleScripts.push("postinstall"),
    (candidate) => (candidate.license = "UNKNOWN")
  ]) {
    const receipt = sampleReceipt();
    mutate(receipt.candidates.runtime);
    const validation = validateHeddlePackageFeasibilityReceipt(receipt);
    assert.equal(validation.ok, false);
  }
});

test("runtime sidecar requires packaged runtime and a smaller security surface", () => {
  const receipt = sampleReceipt();
  receipt.candidates.runtime.packagedNodeRuntime = true;
  receipt.candidates.runtime.installedBytes = 1;
  receipt.candidates.runtime.lockPackageCount = 1;
  receipt.candidates.runtime.protocol.completeAddress = true;
  receipt.candidates.runtime.protocol.conflictingDuplicateRejection = true;
  receipt.candidates.runtime.protocol.safePayloadBoundary = true;
  receipt.candidates.runtime.closesAcceptedProductGap = true;

  const evaluation = evaluateHeddlePackageFeasibility(receipt);
  assert.deepEqual(evaluation.eligibleDispositions, ["ADOPT_RUNTIME_SIDECAR", "NO_ADOPT"]);
  assert.equal(evaluation.disposition, "NO_ADOPT");
});

test("run client cannot replace full-address, conflict, and payload conformance", () => {
  const receipt = sampleReceipt();
  const runClient = receipt.candidates.runClient;
  assert.deepEqual(runClient.protocol, {
    completeAddress: false,
    conflictingDuplicateRejection: false,
    contiguousSequence: true,
    safePayloadBoundary: false,
    singleTerminal: true
  });

  const evaluation = evaluateHeddlePackageFeasibility(receipt);
  assert.equal(evaluation.options.runClient.eligible, false);
  assert.match(evaluation.options.runClient.reason, /adapter would duplicate/i);
});

test("requires exactly one recorded disposition and keeps the receipt public-safe", () => {
  const receipt = sampleReceipt();
  receipt.recordedDisposition = ["NO_ADOPT", "ADOPT_RUN_CLIENT_ONLY"];
  assert.equal(validateHeddlePackageFeasibilityReceipt(receipt).ok, false);

  const unsafe = sampleReceipt();
  unsafe.notes = ["C:", "Users", "person", "private"].join("\\");
  assert.equal(validateHeddlePackageFeasibilityReceipt(unsafe).ok, false);
});

function sampleReceipt() {
  return {
    schemaVersion: "agentique.heddlePackageFeasibility.v1",
    assessedAt: "2026-09-04",
    sourceCommit: "298864eb3d5b30aa10384ca5f8a8be67fb665f02",
    recordedDisposition: ["NO_ADOPT"],
    productRequirements: {
      allowsUserInstalledNode: false,
      needsHttpSseTransport: false,
      protocolOwner: "agentique"
    },
    candidates: {
      runtime: candidate({
        name: "@heddleagent/runtime",
        version: "7.1.0",
        integrity: "sha512-CB3FXphO8tk/pcgl50t6Oy6OvU3NTdatueJBA7U/scbojyHEHGx6cnJx1ozPR/edP4XnMx8Y5pOFA44DV342Qw==",
        tarballBytes: 1_501_851,
        unpackedBytes: 7_261_334,
        installedBytes: 80_481_237,
        fileCount: 2_304,
        lockPackageCount: 187,
        directDependencyCount: 18,
        packagedNodeRuntime: false,
        closesAcceptedProductGap: false,
        protocol: {
          completeAddress: false,
          conflictingDuplicateRejection: true,
          contiguousSequence: true,
          safePayloadBoundary: false,
          singleTerminal: true
        }
      }),
      runClient: candidate({
        name: "@heddleagent/run-client",
        version: "6.0.0",
        integrity: "sha512-SNdXnnpSH7vPaKgk0pKmbiYxxxWynsV4PL+dP3N9jmVNEuq37RoOodv5qQL6TL31sqX5Xgj5P8g5ide7NYoITg==",
        tarballBytes: 20_049,
        unpackedBytes: 85_737,
        installedBytes: 6_031_184,
        fileCount: 31,
        lockPackageCount: 4,
        directDependencyCount: 3,
        packagedNodeRuntime: true,
        closesAcceptedProductGap: false,
        protocol: {
          completeAddress: false,
          conflictingDuplicateRejection: false,
          contiguousSequence: true,
          safePayloadBoundary: false,
          singleTerminal: true
        }
      })
    },
    comparison: {
      conceptOnly: "Retain the accepted Agentique protocol with no new package or transport.",
      runClientOnly: "Would require an adapter and a new HTTP/SSE or equivalent transport need.",
      runtimeSidecar: "Would require a packaged Node runtime and a much larger dependency graph."
    },
    rollback: "No product dependency was added; retain the Agentique protocol and remove only disposable audit material.",
    notes: "No provider, model, tool, MCP, uploaded code, credential, or production endpoint was used."
  };
}

function candidate(overrides) {
  return {
    expectedIntegrity: overrides.integrity,
    observedIntegrity: overrides.integrity,
    license: "MIT",
    lifecycleScripts: [],
    binaryPackageCount: 0,
    advisories: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
    defaultEffects: {
      network: 0,
      listener: 0,
      credentialEnvironment: 0,
      arbitraryFilesystem: 0,
      childProcess: 0,
      residualHandles: 0
    },
    ...overrides
  };
}

function hasCode(code) {
  return (error) => error?.code === code;
}
