import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRunFolderManifest, sampleRunFolderInput } from "../src/core/run-folder.mjs";
import { cleanupRunFolder, reviewRunFolderWriter, validateCommittedRunFolder, writeRunFolder } from "../src/core/run-folder-writer.mjs";

const rootDir = ".tmp/run-folder-writer-test";
const now = "2026-06-12T00:00:00.000Z";

test("run folder writer validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-run-folder-writer.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.ok(result.summary.files >= 7);
});

test("run folder writer materializes deterministic files", () => {
  resetRoot();
  const manifest = createRunFolderManifest(sampleRunFolderInput);
  const result = writeRunFolder(manifest, { rootDir, now });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  for (const file of [
    "runs/run-local-001/run.json",
    "runs/run-local-001/logs/stdout.log",
    "runs/run-local-001/logs/stderr.log",
    "runs/run-local-001/outputs/result.json",
    "runs/run-local-001/artifacts/result.json",
    "runs/run-local-001/viewer-metadata.json",
    "runs/run-local-001/failure.json",
    "runs/run-local-001/write-receipt.json"
  ]) {
    assert.equal(fs.existsSync(path.join(rootDir, file)), true, file);
  }
  const runJson = JSON.parse(fs.readFileSync(path.join(rootDir, "runs/run-local-001/run.json"), "utf8"));
  assert.equal(runJson.reproducibility.inputDigest.length, 64);
  assert.doesNotMatch(JSON.stringify(runJson), /[A-Za-z]:[\\/]/u);
  const receipt = JSON.parse(fs.readFileSync(path.join(rootDir, "runs/run-local-001/write-receipt.json"), "utf8"));
  assert.equal(receipt.schemaVersion, "agentique.runFolderWriteReceipt.v2");
  assert.equal(receipt.committed, true);
  assert.equal(receipt.digestAlgorithm, "sha256");
  assert.ok(receipt.entries.length >= 7);
  assert.ok(receipt.entries.every((entry) => /^[a-f0-9]{64}$/u.test(entry.contentDigest)));
  assert.equal(validateCommittedRunFolder({ runId: "run-local-001" }, { rootDir }).ok, true);
});

test("run folder writer publishes atomically and removes failed staging", () => {
  resetRoot();
  const manifest = createRunFolderManifest(sampleRunFolderInput);
  const result = writeRunFolder(manifest, { rootDir, now, injectFailureAt: "before-commit" });
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(path.join(rootDir, "runs/run-local-001")), false);
  const runsRoot = path.join(rootDir, "runs");
  const remnants = fs.existsSync(runsRoot) ? fs.readdirSync(runsRoot).filter((name) => name.startsWith(".staging-run-local-001-")) : [];
  assert.deepEqual(remnants, []);
});

test("run folder writer rejects private material before final publication", () => {
  resetRoot();
  const manifest = createRunFolderManifest(sampleRunFolderInput);
  const invalid = {
    ...manifest,
    runJson: {
      ...manifest.runJson,
      failureState: { status: "failed", code: "unsafe", message: `.${["plan", "ning"].join("")}/private.md` }
    }
  };
  const result = writeRunFolder(invalid, { rootDir, now });
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(path.join(rootDir, "runs/run-local-001")), false);
  assert.ok(result.errors.some((error) => error.code === "run-writer.redaction"));
});

test("committed run validation and cleanup fail closed on tamper", () => {
  resetRoot();
  const manifest = createRunFolderManifest(sampleRunFolderInput);
  assert.equal(writeRunFolder(manifest, { rootDir, now }).ok, true);
  fs.writeFileSync(path.join(rootDir, "runs/run-local-001/logs/stdout.log"), "tampered", "utf8");
  const validation = validateCommittedRunFolder({ runId: "run-local-001" }, { rootDir });
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.code === "run-writer.integrity"));
  const cleanup = cleanupRunFolder({ runId: "run-local-001" }, { rootDir, now });
  assert.equal(cleanup.ok, false);
  assert.equal(fs.existsSync(path.join(rootDir, "runs/run-local-001/logs/stdout.log")), true);
});

test("run folder cleanup is idempotent and receipt based", () => {
  resetRoot();
  const manifest = createRunFolderManifest(sampleRunFolderInput);
  writeRunFolder(manifest, { rootDir, now });
  const first = cleanupRunFolder({ runId: "run-local-001" }, { rootDir, now });
  const second = cleanupRunFolder({ runId: "run-local-001" }, { rootDir, now });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.receipt.idempotent, true);
  assert.equal(fs.existsSync(path.join(rootDir, "runs/run-local-001/logs")), false);
  assert.equal(fs.existsSync(path.join(rootDir, "runs/run-local-001/cleanup-receipt.json")), true);
});

test("run folder writer rejects traversal paths", () => {
  resetRoot();
  const manifest = createRunFolderManifest(sampleRunFolderInput);
  const invalid = {
    ...manifest,
    runJson: {
      ...manifest.runJson,
      paths: { ...manifest.runJson.paths, logs: "../outside/logs" }
    }
  };
  const result = writeRunFolder(invalid, { rootDir, now });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "run-writer.unsafe-path"));
});

test("run folder writer rejects unsafe filenames", () => {
  resetRoot();
  const manifest = createRunFolderManifest(sampleRunFolderInput);
  const invalid = {
    ...manifest,
    runJson: {
      ...manifest.runJson,
      logs: [{ ...manifest.runJson.logs[0], name: "../stdout.log" }]
    }
  };
  const result = writeRunFolder(invalid, { rootDir, now });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "run-writer.unsafe-path"));
});

test("run folder writer rejects oversized logs outputs and artifacts", () => {
  resetRoot();
  const manifest = createRunFolderManifest(sampleRunFolderInput);
  const invalid = {
    ...manifest,
    runJson: {
      ...manifest.runJson,
      logs: [{ ...manifest.runJson.logs[0], text: "x".repeat(262145), maxBytes: 262144 }],
      outputs: [{ ...manifest.runJson.outputs[0], bytes: 104857601 }],
      artifacts: [{ ...manifest.runJson.artifacts[0], bytes: 104857601 }]
    }
  };
  const result = writeRunFolder(invalid, { rootDir, now });
  assert.equal(result.ok, false);
  for (const code of ["run-writer.log-size", "run-writer.output-size", "run-writer.artifact-size"]) {
    assert.ok(
      result.errors.some((error) => error.code === code),
      code
    );
  }
});

test("run folder writer blocks redaction failures before write", () => {
  resetRoot();
  const manifest = createRunFolderManifest(sampleRunFolderInput);
  const invalid = {
    ...manifest,
    runJson: {
      ...manifest.runJson,
      logs: [{ ...manifest.runJson.logs[0], text: "bearer abcdefghijklmnop" }]
    }
  };
  const result = writeRunFolder(invalid, { rootDir, now });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "run-writer.redaction"));
});

test("run folder writer review succeeds", () => {
  const review = reviewRunFolderWriter({ rootDir: ".tmp/run-folder-writer-review-test" });
  assert.equal(review.ok, true);
  assert.ok(review.summary.reproducibilityDigest.length === 64);
});

function resetRoot() {
  fs.rmSync(rootDir, { recursive: true, force: true });
}
