import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { readNativeRunnerAdapterManifestInputs, reviewNativeRunnerAdapterManifest } from "../src/core/native-runner-adapter-manifest.mjs";

test("native adapter manifest validation gate passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-native-runner-adapter-manifest.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.equal(result.manifest.adapterId, "adapter.local-python");
  assert.equal(result.manifest.runtime, "python");
  assert.equal(result.manifest.supportMode, "locally-runnable");
  assert.equal(result.manifest.digestPrefix, "cccccccccccc");
  assert.equal(result.manifest.executableRef, "native-bundled-local-python-adapter");
});

test("native adapter manifest is resolved by native code and redacted in receipts", () => {
  const review = reviewNativeRunnerAdapterManifest();
  assert.equal(review.ok, true);
  assert.equal(review.manifest.nativeOwned, true);
  assert.equal(review.manifest.redactedReceipt, true);
  assert.equal(review.manifest.pathNeutralExecutableRef, true);
  assert.equal(review.manifest.prepareStoresManifest, true);
  assert.equal(review.manifest.startRevalidatesManifest, true);
});

test("native adapter manifest rejects untrusted variants", () => {
  const review = reviewNativeRunnerAdapterManifest();
  assert.equal(review.failClosed.missing, true);
  assert.equal(review.failClosed.unsigned, true);
  assert.equal(review.failClosed.tampered, true);
  assert.equal(review.failClosed.revoked, true);
  assert.equal(review.failClosed.incompatiblePlatform, true);
  assert.equal(review.failClosed.wrongRuntime, true);
  assert.equal(review.failClosed.wrongSupportMode, true);
  assert.equal(review.failClosed.unsafeExecutableRef, true);
});

test("runner request struct rejects manifest override and executable fields", () => {
  const input = readNativeRunnerAdapterManifestInputs();
  const weakened = reviewNativeRunnerAdapterManifest({
    ...input,
    rustSource: input.rustSource.replace(
      "permission_profile_id: Option<String>,",
      "permission_profile_id: Option<String>,\n    executable_path: String,\n    adapter_digest: String,"
    )
  });
  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "manifest.request-override"));
});

test("native adapter manifest gate fails when package validation wiring is missing", () => {
  const input = readNativeRunnerAdapterManifestInputs();
  const weakened = reviewNativeRunnerAdapterManifest({
    ...input,
    packageJson: input.packageJson.replaceAll("validate:native-runner-adapter-manifest", "validate:native-runner-adapter-manifest-missing")
  });
  assert.equal(weakened.ok, false);
  assert.ok(weakened.errors.some((error) => error.code === "manifest.validation-wiring"));
});
