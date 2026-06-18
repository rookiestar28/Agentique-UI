import assert from "node:assert/strict";
import test from "node:test";
import {
  assertUpdaterEvidenceSafe,
  readUpdaterReleaseInputs,
  sampleUpdaterBlockedEvidence,
  sampleUpdaterReadyEvidence,
  validateLatestJsonSchema,
  validateUpdaterReleaseGate
} from "../src/core/updater-release-gate.mjs";

test("updater gate is valid but blocked while updater artifacts are disabled", () => {
  const result = validateUpdaterReleaseGate(readUpdaterReleaseInputs());

  assert.equal(result.ok, true);
  assert.equal(result.ready, false);
  assert.equal(result.publicationAllowed, false);
  assert.ok(result.blockers.some((blocker) => blocker.code === "updater.artifacts-disabled"));
  assert.ok(result.blockers.some((blocker) => blocker.code === "updater.latest-json-invalid"));
});

test("updater latest.json schema accepts complete platform entries", () => {
  const { manifestSchema } = readUpdaterReleaseInputs();
  const result = validateLatestJsonSchema(manifestSchema, sampleUpdaterReadyEvidence.latestJson);

  assert.equal(result.ok, true);
});

test("updater latest.json schema rejects platform entries without signatures", () => {
  const { manifestSchema } = readUpdaterReleaseInputs();
  const invalid = {
    ...sampleUpdaterReadyEvidence.latestJson,
    platforms: {
      "windows-x86_64": {
        url: "https://example.com/agentique-ui/v0.1.1/windows-installer.exe"
      }
    }
  };
  const result = validateLatestJsonSchema(manifestSchema, invalid);

  assert.equal(result.ok, false);
});

test("updater gate accepts complete evidence only when updater config is enabled", () => {
  const inputs = readUpdaterReleaseInputs();
  const tauriConfig = {
    ...inputs.tauriConfig,
    bundle: {
      ...inputs.tauriConfig.bundle,
      createUpdaterArtifacts: true
    },
    plugins: {
      updater: {
        pubkey: "public-updater-key",
        endpoints: ["https://example.com/agentique-ui/latest.json"]
      }
    }
  };
  const result = validateUpdaterReleaseGate({ ...inputs, tauriConfig, evidence: sampleUpdaterReadyEvidence });

  assert.equal(result.ok, true);
  assert.equal(result.ready, true);
  assert.equal(result.publicationAllowed, true);
  assert.equal(result.summary.rollback, "tested");
});

test("updater evidence rejects local path material and private references", () => {
  assert.throws(
    () => assertUpdaterEvidenceSafe({
      ...sampleUpdaterBlockedEvidence,
      signatureFiles: [{ platform: "windows-x86_64", fileName: ["C", ":\\release\\latest.json.sig"].join("") }]
    }),
    (error) => error.code === "updater.local-path"
  );
});
