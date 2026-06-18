import assert from "node:assert/strict";
import test from "node:test";
import { createAjv, readJson, validateExample } from "../scripts/validate-contracts.mjs";
import {
  reviewRunnerCapability,
  sampleRunnerCapabilityInput
} from "../src/core/runner-capability.mjs";

const schemaPath = "schemas/runner-capability.schema.json";
const examplePath = "examples/runner-capability.valid.json";

test("runner capability example validates", () => {
  const result = validateExample(schemaPath, examplePath);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("runner capability review accepts complete local-run contract", () => {
  const review = reviewRunnerCapability(sampleRunnerCapabilityInput);
  assert.equal(review.ok, true);
  assert.equal(review.claims.localRunAvailable, true);
  assert.equal(review.requiresNativeBackend, true);
  assert.equal(review.willSpawnProcessFromWebLayer, false);
  assert.equal(review.adapterReview.signature, "verified");
  assert.equal(review.artifactContract.contract, "agentique.artifactContract.v1");
  assert.equal(review.lifecycle.cleanup, "process-tree");
});

test("runner capability rejects local-run overclaim for dry-run resources", () => {
  const review = reviewRunnerCapability({
    ...sampleRunnerCapabilityInput,
    resource: {
      ...sampleRunnerCapabilityInput.resource,
      supportMode: "dry-runnable"
    }
  });
  assert.equal(review.ok, false);
  assert.equal(review.claims.localRunAvailable, false);
  assert.ok(review.errors.some((error) => error.code === "runner.local-run-support"));
  assert.ok(review.errors.some((error) => error.code === "runner.adapter-blocked"));
});

test("runner capability blocks unsigned or non-allowlisted adapters", () => {
  const review = reviewRunnerCapability({
    ...sampleRunnerCapabilityInput,
    adapterPack: {
      ...sampleRunnerCapabilityInput.adapterPack,
      signature: {
        ...sampleRunnerCapabilityInput.adapterPack.signature,
        status: "missing"
      }
    }
  });
  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "runner.adapter-blocked"));
});

test("runner capability blocks unsafe public text and local paths", () => {
  const review = reviewRunnerCapability({
    ...sampleRunnerCapabilityInput,
    artifactContract: {
      ...sampleRunnerCapabilityInput.artifactContract,
      outputPaths: [`${"C"}:/Users/example/secret.txt`]
    }
  });
  assert.equal(review.ok, false);
  assert.ok(review.errors.some((error) => error.code === "runner.unsafe-public-text"));
  assert.ok(review.errors.some((error) => error.code === "runner.artifact-path"));
});

test("runner capability blocks ambient environment browser data and generic shell claims", () => {
  const review = reviewRunnerCapability({
    ...sampleRunnerCapabilityInput,
    permissions: {
      ...sampleRunnerCapabilityInput.permissions,
      shell: "allow",
      browserData: "ask"
    },
    claims: {
      ...sampleRunnerCapabilityInput.claims,
      ambientEnvironment: true,
      browserData: true,
      genericShell: true
    }
  });
  assert.equal(review.ok, false);
  for (const code of [
    "runner.shell-blocked",
    "runner.browser-data-blocked",
    "runner.unsupported-claim"
  ]) {
    assert.ok(review.errors.some((error) => error.code === code), code);
  }
});

test("runner capability blocks missing artifact cleanup and cancellation gates", () => {
  const review = reviewRunnerCapability({
    ...sampleRunnerCapabilityInput,
    artifactContract: {
      ...sampleRunnerCapabilityInput.artifactContract,
      contract: "missing",
      logRedaction: "optional",
      outputPaths: []
    },
    lifecycle: {
      timeoutMs: 0,
      cancel: "immediate-deny",
      cleanup: "manual",
      retry: { maxAttempts: 99 }
    }
  });
  assert.equal(review.ok, false);
  for (const code of [
    "runner.artifact-contract",
    "runner.log-redaction",
    "runner.artifact-output",
    "runner.timeout",
    "runner.cancel",
    "runner.cleanup",
    "runner.retry"
  ]) {
    assert.ok(review.errors.some((error) => error.code === code), code);
  }
});

test("runner capability schema rejects unsupported runnable claims", () => {
  const ajv = createAjv();
  const validate = ajv.compile(readJson(schemaPath));
  const example = readJson(examplePath);
  example.claims.universalRuntime = true;
  assert.equal(validate(example), false);
});
