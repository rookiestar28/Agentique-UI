import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  createLibraryUpdateLifecycle,
  libraryUpdateLifecycleSchemaVersion,
  requiredLibraryUpdateStates,
  reviewLibraryUpdateLifecycle,
  sampleLibraryUpdateLifecycle,
  validateLibraryUpdateLifecycle
} from "../src/core/library-update-lifecycle.mjs";
import { sampleLibraryState } from "../src/core/library-store.mjs";

const currentResource = sampleLibraryState.resources[0];

test("library update lifecycle models local resource update states and metadata", () => {
  const review = reviewLibraryUpdateLifecycle();

  assert.equal(review.validation.ok, true, JSON.stringify(review.validation.failures));
  assert.equal(review.lifecycle.schemaVersion, libraryUpdateLifecycleSchemaVersion);

  const states = new Set(review.lifecycle.entries.map((entry) => entry.state));
  for (const state of requiredLibraryUpdateStates) {
    assert.equal(states.has(state), true, `missing lifecycle state: ${state}`);
  }

  const available = review.lifecycle.entries.find((entry) => entry.state === "available");
  const interactionViewports = new Set(review.lifecycle.interactionEvidence.map((entry) => entry.viewport));
  assert.equal(available.resource.resourceId, currentResource.resourceId);
  assert.equal(available.current.version, "0.1.0");
  assert.equal(available.available.version, "0.2.0");
  assert.equal(available.digestComparison.status, "changed");
  assert.equal(available.provenanceComparison.status, "changed");
  assert.equal(available.preview.reviewOnly, true);
  assert.equal(available.preview.installAutomatically, false);
  assert.equal(available.preview.executesCode, false);
  assert.equal(available.preview.requiresCloudSession, false);
  assert.equal(available.rollback.available, true);
  assert.equal(available.rollback.targetVersion, "0.1.0");
  assert.equal(available.cleanup.receipt.kind, "library-cleanup");
  assert.equal(available.offline.noCloudSessionRequired, true);

  const offline = review.lifecycle.entries.find((entry) => entry.state === "offline");
  assert.equal(offline.preview.allowed, false);
  assert.equal(offline.offline.cachedMetadataUsable, true);
  assert.equal(offline.offline.cloudSessionState, "not-required");
  assert.equal(interactionViewports.has("desktop"), true);
  assert.equal(interactionViewports.has("narrow"), true);
  assert.equal(
    review.lifecycle.interactionEvidence.every((entry) => entry.stateTransition === "library-row-to-update-preview" && entry.covered === true),
    true
  );
});

test("library update lifecycle fails closed for downgrade, digest mismatch, private fields, and stale tickets", () => {
  const lifecycle = createLibraryUpdateLifecycle({
    currentRecord: currentResource,
    now: "2026-06-17T12:00:00.000Z",
    candidates: [
      candidate({ id: "unsafe-downgrade", version: "0.0.9", digest: "1".repeat(64) }),
      candidate({ id: "digest-mismatch", version: "0.2.1", digest: "2".repeat(64), expectedDigest: "3".repeat(64) }),
      candidate({ id: "private-field", version: "0.2.2", digest: "4".repeat(64), metadata: { apiKey: "redacted-placeholder" } }),
      candidate({ id: "stale-ticket", version: "0.2.3", digest: "5".repeat(64), ticketExpiresAt: "2026-06-17T11:59:59.000Z" })
    ]
  });

  const errorEntries = lifecycle.entries.filter((entry) => entry.state === "error");
  const failClosedCodes = new Set(errorEntries.flatMap((entry) => entry.failClosed.map((failure) => failure.code)));

  assert.deepEqual([...failClosedCodes].sort(), ["digest-mismatch", "inline-private-field", "stale-ticket", "unsafe-downgrade"]);
  assert.equal(
    errorEntries.every((entry) => entry.preview.allowed === false),
    true
  );
  assert.equal(
    errorEntries.every((entry) => entry.preview.installAutomatically === false),
    true
  );
  assert.equal(
    errorEntries.every((entry) => entry.preview.requiresCloudSession === false),
    true
  );
});

test("library update lifecycle validator rejects missing states and unsafe preview claims", () => {
  const missingOffline = {
    ...sampleLibraryUpdateLifecycle,
    entries: sampleLibraryUpdateLifecycle.entries.filter((entry) => entry.state !== "offline")
  };
  assertValidationFailure(missingOffline, "missing-state");

  const automaticInstall = structuredClone(sampleLibraryUpdateLifecycle);
  automaticInstall.entries.find((entry) => entry.state === "available").preview.installAutomatically = true;
  assertValidationFailure(automaticInstall, "automatic-install");

  const cloudSession = structuredClone(sampleLibraryUpdateLifecycle);
  cloudSession.entries.find((entry) => entry.state === "available").preview.requiresCloudSession = true;
  assertValidationFailure(cloudSession, "cloud-session");
});

test("library update lifecycle validator is exposed as a runnable package gate", () => {
  const output = execFileSync(process.execPath, ["scripts/check-library-update-lifecycle.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);

  assert.equal(result.status, "passed");
  assert.equal(result.summary.requiredStates, requiredLibraryUpdateStates.length);
  assert.equal(result.summary.failClosedCases, 4);
  assert.equal(result.summary.interactionViewports, 2);
});

function candidate(overrides = {}) {
  return {
    id: "candidate",
    version: "0.2.0",
    digest: "a".repeat(64),
    expectedDigest: overrides.digest ?? "a".repeat(64),
    ticketIssuedAt: "2026-06-17T11:00:00.000Z",
    ticketExpiresAt: "2026-06-17T13:00:00.000Z",
    provenance: {
      sourceDigest: "d".repeat(64),
      publishedDigest: overrides.digest ?? "a".repeat(64),
      verificationStatus: "verified",
      signer: "agentique-example"
    },
    ...overrides
  };
}

function assertValidationFailure(lifecycle, expectedCode) {
  const validation = validateLibraryUpdateLifecycle(lifecycle);
  assert.equal(validation.ok, false);
  assert.ok(
    validation.failures.some((failure) => failure.code === expectedCode),
    `missing failure code ${expectedCode}`
  );
}
