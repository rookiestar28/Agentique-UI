import assert from "node:assert/strict";
import test from "node:test";
import {
  createRunFolderManifest,
  sampleRunFolderInput,
  validateRunFolderManifest
} from "../src/core/run-folder.mjs";

test("run folder manifest contains predictable run json logs artifacts cleanup and reproducibility", () => {
  const manifest = createRunFolderManifest(sampleRunFolderInput);
  assert.equal(manifest.ok, true);
  assert.equal(manifest.runJson.schemaVersion, "agentique.runJson.v1");
  assert.equal(manifest.runJson.paths.runJson, "runs/run-local-001/run.json");
  assert.equal(manifest.runJson.logs.length, 2);
  assert.equal(manifest.runJson.outputs.length, 1);
  assert.equal(manifest.runJson.artifacts.length, 1);
  assert.equal(manifest.runJson.cleanup.processTreeCleanup, true);
  assert.equal(manifest.runJson.reproducibility.inputDigest.length, 64);
  assert.equal(validateRunFolderManifest(manifest).ok, true);
});

test("run folder manifest redacts logs and vault references", () => {
  const manifest = createRunFolderManifest({
    ...sampleRunFolderInput,
    logs: [{ name: "stdout.log", text: "Using vault:providerCredential and bearer abcdefghijklmnop" }],
    failure: { status: "failed", code: "example", message: "Missing vault:providerCredential" }
  });
  assert.equal(manifest.runJson.logs[0].redacted, true);
  assert.doesNotMatch(manifest.runJson.logs[0].text, /vault:providerCredential/u);
  assert.doesNotMatch(manifest.runJson.logs[0].text, /bearer abcdefghijklmnop/u);
  assert.doesNotMatch(manifest.runJson.failureState.message, /vault:providerCredential/u);
});

test("run folder manifest rejects absolute and traversal paths", () => {
  const manifest = createRunFolderManifest({
    ...sampleRunFolderInput,
    outputs: [{ path: "../outside/result.json", mediaType: "application/json", bytes: 1 }],
    artifacts: [{ id: "artifact:bad", path: ["C:", "Users", "name", "secret.txt"].join("\\"), viewer: "text", redacted: true }]
  });
  assert.equal(manifest.ok, false);
  assert.ok(manifest.errors.some((error) => error.code === "run-folder.unsafe-path"));
});

test("run folder reproducibility digest is deterministic", () => {
  const left = createRunFolderManifest(sampleRunFolderInput);
  const right = createRunFolderManifest(sampleRunFolderInput);
  assert.equal(left.runJson.reproducibility.inputDigest, right.runJson.reproducibility.inputDigest);
});

test("run folder validation rejects missing cleanup and side effects", () => {
  const manifest = createRunFolderManifest(sampleRunFolderInput);
  const invalid = {
    ...manifest,
    runJson: {
      ...manifest.runJson,
      cleanup: { status: "missing" },
      sideEffects: ["write"]
    }
  };
  const result = validateRunFolderManifest(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "run-folder.cleanup"));
  assert.ok(result.errors.some((error) => error.code === "run-folder.side-effects"));
});
