import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDiagnosticsSupportBundleSafe,
  createDiagnosticsSupportBundleReview,
  reviewDiagnosticsSupportBundleGate,
  sampleDiagnosticsSupportBundleRequest
} from "../src/core/diagnostics-support-bundle.mjs";

test("diagnostics support bundle review exports bounded metadata only", () => {
  const review = createDiagnosticsSupportBundleReview();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.status, "ready");
  assert.equal(review.identity.exportMode, "descriptor-only");
  assert.equal(review.identity.fileArchiveCreated, false);
  assert.equal(review.identity.willWriteFile, false);
  assert.equal(review.identity.willUpload, false);
  assert.equal(review.identity.approxBytes <= review.identity.maxBytes, true);
  assert.equal(
    review.contents.some((entry) => entry.section === "environment"),
    true
  );
  assert.equal(
    review.contents.some((entry) => entry.section === "validation"),
    true
  );
  assert.equal(
    review.contents.some((entry) => entry.section === "artifact-lifecycle"),
    true
  );
  assert.equal(review.environment.includesEnvVars, false);
  assert.equal(review.validation.includesRawLogs, false);
  assert.equal(review.artifactLifecycle.includesRawLogs, false);
  assert.equal(review.artifactLifecycle.includesRawArtifactBytes, false);
  assert.equal(review.redaction.pathNeutral, true);
  assert.equal(review.redaction.descriptorOnly, true);
  assert.equal(review.deniedMaterials.length >= 10, true);
  assert.doesNotThrow(() => assertDiagnosticsSupportBundleSafe());
});

test("unsafe diagnostics materials fail closed", () => {
  const unsafePath = ["C:", "\\", "tmp", "\\", "secrets"].join("");
  const unsafeMarker = [String.raw`\.plan`, "ning", "/private-marker"].join("");
  const unsafe = createDiagnosticsSupportBundleReview({
    request: {
      ...sampleDiagnosticsSupportBundleRequest,
      environment: {
        ...sampleDiagnosticsSupportBundleRequest.environment,
        includesEnvVars: true,
        includesHomeDir: true,
        versions: [{ name: "node", version: unsafePath, status: "ready" }]
      },
      validation: {
        ...sampleDiagnosticsSupportBundleRequest.validation,
        includesRawLogs: true,
        publicSafeErrors: [["bearer", "abcdefghijklmnop"].join(" "), unsafeMarker]
      },
      claims: {
        ...sampleDiagnosticsSupportBundleRequest.claims,
        uploadEnabled: true,
        telemetryEnabled: true,
        browserDataCollection: true,
        ambientEnvCollection: true,
        productionDesktopRuntime: true
      },
      redaction: {
        ...sampleDiagnosticsSupportBundleRequest.redaction,
        artifactBytesExcluded: false,
        signedUrlsRedacted: false,
        storageStateExcluded: false
      }
    }
  });

  assert.equal(unsafe.ok, false);
  assert.ok(unsafe.errors.some((error) => error.code === "diagnostics.environment"));
  assert.ok(unsafe.errors.some((error) => error.code === "diagnostics.raw-logs"));
  assert.ok(unsafe.errors.some((error) => error.code === "diagnostics.authority"));
  assert.ok(unsafe.errors.some((error) => error.code === "diagnostics.raw-artifact-bytes"));
  assert.ok(unsafe.errors.some((error) => error.code === "diagnostics.private-text"));
});

test("credential references and artifact rows stay redacted", () => {
  const review = createDiagnosticsSupportBundleReview();
  const serialized = JSON.stringify(review);

  assert.equal(review.credentialReferences.tokenExchange, false);
  assert.equal(review.credentialReferences.webhookExecution, false);
  assert.equal(review.credentialReferences.externalProviderAutomation, false);
  assert.equal(
    review.credentialReferences.records.every((record) => record.refPreview === "redacted:vault-reference"),
    true
  );
  assert.equal(
    review.artifactLifecycle.artifacts.every((artifact) => artifact.rawBytesIncluded === false),
    true
  );
  assert.doesNotMatch(serialized, /vault:providerCredential|vault:webhookCredential/u);
  assert.doesNotMatch(serialized, /cookie=|set-cookie|storageState\s*[:(]|https:\/\/example\.invalid\?token=/iu);
});

test("support bundle gate proves unsafe samples are blocked", () => {
  const gate = reviewDiagnosticsSupportBundleGate();

  assert.equal(gate.ok, true, JSON.stringify(gate));
  assert.equal(gate.descriptorOnly, true);
  assert.equal(gate.rawLogBlocked, true);
  assert.equal(gate.rawArtifactBytesBlocked, true);
  assert.equal(gate.unsafeEnvironmentBlocked, true);
  assert.equal(gate.unsupportedAuthorityBlocked, true);
  assert.equal(gate.internalMarkerBlocked, true);
  assert.equal(gate.summary.blockedUnsafeSamples, 10);
});
