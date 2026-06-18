import assert from "node:assert/strict";
import test from "node:test";
import { createRunHistoryEvidence } from "../src/core/run-history-evidence.mjs";
import { readNativeRunnerArtifactReadbackInputs, reviewNativeRunnerArtifactReadback } from "../src/core/native-runner-artifact-readback.mjs";

test("native runner artifact readback validation gate passes", () => {
  const review = reviewNativeRunnerArtifactReadback();

  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.readback.nativeBacked, true);
  assert.equal(review.readback.descriptorOnly, false);
  assert.equal(review.readback.artifactsCommandReadsFolder, true);
  assert.equal(review.readback.historyNativeBacked, true);
});

test("native runner artifact readback rejects boundary-only artifacts command", () => {
  const input = readNativeRunnerArtifactReadbackInputs();
  const weakened = reviewNativeRunnerArtifactReadback({
    ...input,
    rustSource: input.rustSource.replace("read_native_run_artifact_evidence", "runner_boundary_receipt")
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-artifact.artifacts-command"));
});

test("run history evidence is native backed rather than descriptor only", () => {
  const history = createRunHistoryEvidence();

  assert.equal(history.boundary.nativeBacked, true);
  assert.equal(history.boundary.descriptorOnly, false);
  assert.equal(history.evidenceBrowser.viewerMetadata.artifactViewers.includes("json"), true);
});

test("native runner artifact readback rejects unsafe receipt material", () => {
  const input = readNativeRunnerArtifactReadbackInputs();
  const unsafePath = ["C", ":/Users/example/raw "].join("");
  const unsafeSecret = ["bearer", "abcdefghijklmnop"].join(" ");
  const weakened = reviewNativeRunnerArtifactReadback({
    ...input,
    rustSource: `${input.rustSource}\nconst BAD_ARTIFACT_RECEIPT: &str = "${unsafePath}${unsafeSecret}";`
  });

  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "native-artifact.unsafe-receipt"));
});

test("native runner artifact readback uses path-neutral fallback without a node process root", () => {
  const input = readNativeRunnerArtifactReadbackInputs(null);
  const review = reviewNativeRunnerArtifactReadback(input);

  assert.equal(input.root, "browser-source-checkout-fallback");
  assert.equal(review.ok, true, JSON.stringify(review.errors));
  assert.equal(review.readback.nativeBacked, true);
  assert.equal(review.readback.descriptorOnly, false);
});
