import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { coreContractFixtureSetVersion } from "../src/core/core-contract-drift-gate.mjs";
import {
  coreAlignmentReadinessVersion,
  createCoreAlignmentReadiness,
  validateCoreAlignmentReadiness
} from "../src/core/core-alignment-readiness.mjs";
import { importIntentContractVersion } from "../src/core/import-intent.mjs";
import { localIntegrationSmokeVersion } from "../src/core/local-integration-smoke.mjs";
import {
  resourceBundleSchemaVersion,
  sourceResourceBundleMapperVersion
} from "../src/core/source-resource-bundle-mapper.mjs";
import {
  sourceGraphContractVersion,
  sourceWorkflowGraphMapperVersion,
  workflowIrSchemaVersion
} from "../src/core/source-workflow-graph-mapper.mjs";

test("summarizes completed alignment surfaces without unlocking runtime claims", () => {
  const readiness = createCoreAlignmentReadiness();
  assert.deepEqual(validateCoreAlignmentReadiness(readiness), { ok: true, issues: [] });
  assert.equal(readiness.schemaVersion, coreAlignmentReadinessVersion);
  assert.equal(readiness.status, "completed");
  assert.deepEqual(Object.values(readiness.noGoClaims), Array(Object.keys(readiness.noGoClaims).length).fill(false));
  assert.equal(readiness.publicClaimBoundary.canClaimCoreContractsAligned, true);
  assert.equal(readiness.publicClaimBoundary.canClaimFixtureBackedLocalImportSmoke, true);
  assert.equal(readiness.publicClaimBoundary.canClaimLiveProductionByteTransfer, false);
  assert.equal(readiness.publicClaimBoundary.canClaimReleasedDesktopRuntime, false);
  assert.equal(readiness.publicClaimBoundary.canClaimInstallerOrUpdater, false);
  assert.equal(readiness.publicClaimBoundary.canClaimNativeExecution, false);

  assertSurface(readiness, "public-readback-envelope", [coreContractFixtureSetVersion, sourceResourceBundleMapperVersion]);
  assertSurface(readiness, "download-post-handoff", [coreContractFixtureSetVersion]);
  assertSurface(readiness, "import-intent-deep-link", [importIntentContractVersion]);
  assertSurface(readiness, "resource-bundle-projection", [sourceResourceBundleMapperVersion, resourceBundleSchemaVersion]);
  assertSurface(readiness, "workflow-graph-projection", [
    sourceGraphContractVersion,
    sourceWorkflowGraphMapperVersion,
    workflowIrSchemaVersion
  ]);
  assertSurface(readiness, "contract-fixture-drift-gate", [coreContractFixtureSetVersion]);
  assertSurface(readiness, "local-import-smoke", [localIntegrationSmokeVersion]);
});

test("fails closed when a required alignment surface is not completed", () => {
  const readiness = cloneReadiness();
  readiness.surfaces.find((surface) => surface.id === "local-import-smoke").status = "blocked";
  assert.deepEqual(validateCoreAlignmentReadiness(readiness), {
    ok: false,
    issues: ["missing_alignment_surface"]
  });
});

test("fails closed when unsupported release or runtime claims are enabled", () => {
  const readiness = cloneReadiness();
  readiness.noGoClaims.nativeRunnerAvailable = true;
  assert.deepEqual(validateCoreAlignmentReadiness(readiness), {
    ok: false,
    issues: ["unsupported_claim_enabled"]
  });

  const boundary = cloneReadiness();
  boundary.publicClaimBoundary.canClaimInstallerOrUpdater = true;
  assert.deepEqual(validateCoreAlignmentReadiness(boundary), {
    ok: false,
    issues: ["unsupported_claim_enabled"]
  });
});

test("fails closed when unsafe public readiness text appears", () => {
  const readiness = cloneReadiness();
  readiness.surfaces[0].contractVersions.push("sk-test-not-a-real-secret");
  assert.deepEqual(validateCoreAlignmentReadiness(readiness), {
    ok: false,
    issues: ["unsafe_readiness_text"]
  });
});

test("core alignment closeout validation gate passes and is wired into full validation", () => {
  const output = execFileSync(process.execPath, ["scripts/check-core-alignment-closeout.mjs"], { encoding: "utf8" });
  const result = JSON.parse(output);
  assert.equal(result.status, "passed");
  assert.ok(result.checked.includes("docs/validation/core-alignment-closeout.md"));

  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(packageJson.scripts["validate:core-alignment"], /check-core-alignment-closeout\.mjs/u);
  assert.match(packageJson.scripts.validate, /validate:core-alignment/u);
});

test("public closeout doc preserves no-overclaim wording", () => {
  const text = fs.readFileSync("docs/validation/core-alignment-closeout.md", "utf8");
  assert.match(text, /Status: contract alignment complete; desktop distribution remains No-Go\./u);
  assert.match(text, /No released installer\./u);
  assert.match(text, /No signed updater\./u);
  assert.match(text, /No production desktop runtime or broad native backend claim\./u);
  assert.doesNotMatch(text, /\breleased installer is available\b/iu);
  assert.doesNotMatch(text, /\bsigned updater is available\b/iu);
  assert.doesNotMatch(text, /\bproduction desktop runtime is available\b/iu);
});

function assertSurface(readiness, id, contractVersions) {
  const surface = readiness.surfaces.find((entry) => entry.id === id);
  assert.ok(surface, `missing surface ${id}`);
  assert.equal(surface.status, "completed");
  assert.deepEqual(surface.contractVersions, contractVersions);
}

function cloneReadiness() {
  return JSON.parse(JSON.stringify(createCoreAlignmentReadiness()));
}
