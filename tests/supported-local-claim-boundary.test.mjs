import assert from "node:assert/strict";
import test from "node:test";
import {
  reviewSupportedLocalClaimBoundary,
  reviewSupportedLocalClaimGate,
  reviewSupportedLocalClaimSurfaces,
  supportedLocalClaimBoundary
} from "../src/core/supported-local-claim-boundary.mjs";

const canonicalSurfaces = Object.freeze({
  readme: [
    "Fixed native Python and Node local execution is supported for source validation on Windows and Linux only.",
    "The fixed native DAG scheduler supports pre-approved attempts and checkpointed human-approval interrupts on Windows and Linux only.",
    "macOS local execution remains unverified and is not currently supported.",
    "The earlier workflow scheduler model remains review-only evidence, not a native execution lane."
  ].join("\n"),
  support: [
    "Supported local execution: fixed native Python and Node on Windows and Linux source-validation environments only.",
    "Supported native orchestration: deterministic fixed-adapter DAGs with pre-approved attempts or checkpointed human-approval interrupts on Windows and Linux only.",
    "macOS local execution is unverified and unsupported.",
    "The workflow scheduler model remains review-only evidence."
  ].join("\n"),
  security: [
    "The supported execution lanes are the fixed native Python and Node adapters plus their deterministic native DAG scheduler on verified Windows and Linux environments only.",
    "macOS is unverified and is not a supported local-execution platform.",
    "Scheduler models do not grant executable authority; only the fixed native DAG scheduler can launch attempts after native approval validation."
  ].join("\n"),
  nativeRunner: [
    "The supported runtime claim covers the fixed native Python and Node adapters on Windows and Linux only.",
    "The native DAG scheduler may orchestrate only those fixed adapters through distinct pre-approved attempts or checkpointed approval interrupts.",
    "The macOS process-group source branch is unverified and does not establish macOS support."
  ].join("\n"),
  runnerCloseout: [
    "Accepted execution scope: fixed native Python and Node plus deterministic fixed-adapter DAG orchestration with checkpointed approval interrupts on Windows and Linux only.",
    "macOS remains unverified; the earlier scheduler model remains review-only."
  ].join("\n")
});

test("supported-local claim boundary accepts fixed adapters and native DAG scheduling on Windows and Linux", () => {
  const review = reviewSupportedLocalClaimBoundary(supportedLocalClaimBoundary);
  assert.equal(review.ok, true);
  assert.deepEqual(review.verifiedPlatforms, ["windows", "linux"]);
  assert.deepEqual(review.unverifiedPlatforms, ["macos"]);
  assert.deepEqual(review.supportedExecutionLanes, ["fixed-native-python", "fixed-native-node", "fixed-native-dag-scheduler"]);
});

test("macOS and unknown platform support claims fail closed", () => {
  const macosClaim = structuredClone(supportedLocalClaimBoundary);
  macosClaim.verifiedPlatforms.push("macos");
  macosClaim.unverifiedPlatforms = [];
  assert.equal(reviewSupportedLocalClaimBoundary(macosClaim).ok, false);

  const unknownClaim = structuredClone(supportedLocalClaimBoundary);
  unknownClaim.verifiedPlatforms.push("freebsd");
  assert.equal(reviewSupportedLocalClaimBoundary(unknownClaim).ok, false);
});

test("scheduler and arbitrary execution lanes cannot become supported claims", () => {
  for (const lane of ["workflow-scheduler", "generic-subprocess"]) {
    const candidate = structuredClone(supportedLocalClaimBoundary);
    candidate.supportedExecutionLanes.push(lane);
    const review = reviewSupportedLocalClaimBoundary(candidate);
    assert.equal(review.ok, false, lane);
    assert.ok(review.errors.some((error) => error.code === "supported-local.supported-lanes"));
  }
});

test("hosted, universal, production, installer, shell, browser, and environment authority stays false", () => {
  for (const claim of Object.keys(supportedLocalClaimBoundary.forbiddenClaims)) {
    const candidate = structuredClone(supportedLocalClaimBoundary);
    candidate.forbiddenClaims[claim] = true;
    const review = reviewSupportedLocalClaimBoundary(candidate);
    assert.equal(review.ok, false, claim);
    assert.ok(review.errors.some((error) => error.code === "supported-local.forbidden-claim"));
  }
});

test("claim policy rejects duplicates, missing evidence state, and unsafe internal text", () => {
  const duplicate = structuredClone(supportedLocalClaimBoundary);
  duplicate.verifiedPlatforms.push("windows");
  assert.equal(reviewSupportedLocalClaimBoundary(duplicate).ok, false);

  const missingEvidence = structuredClone(supportedLocalClaimBoundary);
  delete missingEvidence.platformEvidence.linux;
  assert.equal(reviewSupportedLocalClaimBoundary(missingEvidence).ok, false);

  const unsafe = structuredClone(supportedLocalClaimBoundary);
  unsafe.notes = [".", "planning"].join("");
  assert.equal(reviewSupportedLocalClaimBoundary(unsafe).ok, false);
});

test("canonical public claim surfaces pass with explicit support and non-support qualifiers", () => {
  const review = reviewSupportedLocalClaimSurfaces(canonicalSurfaces);
  assert.equal(review.ok, true);
  assert.deepEqual(review.checkedSurfaces, Object.keys(canonicalSurfaces));
});

test("public claim surfaces reject positive macOS, scheduler, and broad runtime claims", () => {
  const mutations = [
    ["readme", "macOS local execution is supported."],
    ["runnerCloseout", "The workflow scheduler is an accepted execution lane."],
    ["security", "Agentique UI provides a universal workflow runtime."],
    ["nativeRunner", "The runner can execute arbitrary commands."]
  ];
  for (const [surface, phrase] of mutations) {
    const candidate = { ...canonicalSurfaces, [surface]: `${canonicalSurfaces[surface]}\n${phrase}` };
    const review = reviewSupportedLocalClaimSurfaces(candidate);
    assert.equal(review.ok, false, phrase);
    assert.ok(review.errors.some((error) => error.code === "supported-local.public-overclaim"));
  }
});

test("honest blocked or future platform release language is not a support claim", () => {
  const candidate = {
    ...canonicalSurfaces,
    readme: `${canonicalSurfaces.readme}\nmacOS installer publication remains blocked pending notarization.`,
    support: `${canonicalSurfaces.support}\nA future macOS release still requires platform runtime evidence.`
  };
  assert.equal(reviewSupportedLocalClaimSurfaces(candidate).ok, true);
});

test("supported-local claim mutation gate covers every fail-closed family", () => {
  const gate = reviewSupportedLocalClaimGate();
  assert.equal(gate.ok, true);
  assert.equal(gate.canonicalAccepted, true);
  assert.equal(gate.macosOverclaimBlocked, true);
  assert.equal(gate.unknownLaneBlocked, true);
  assert.equal(gate.authorityOverclaimBlocked, true);
  assert.equal(gate.publicOverclaimBlocked, true);
});
