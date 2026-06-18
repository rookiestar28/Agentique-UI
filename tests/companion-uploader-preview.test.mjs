import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertReviewOnlyUploaderPreview,
  createCompanionUploaderPreview,
  createCompanionUploaderPreviewFailure,
  sampleCompanionUploaderPreviewInput,
  sampleUnsafeCompanionUploaderPreviewInput
} from "../src/core/companion-uploader-preview.mjs";

test("valid companion uploader preview remains review-only and local", () => {
  const preview = createCompanionUploaderPreview(sampleCompanionUploaderPreviewInput);
  assert.equal(preview.ok, true);
  assert.equal(preview.decision, "accepted");
  assert.equal(preview.boundary.submissionMode, "review-only");
  assert.equal(preview.boundary.liveUploadAvailable, false);
  assert.equal(preview.plans.import.dryRunOnly, true);
  assert.equal(preview.plans.variant.sourceOnlyCount, 1);
  assert.equal(preview.plans.variant.readyForDownloadCount, 0);
  assert.equal(preview.plans.agentNative.installGuidance[0].readyForLocalReview, true);
  assert.equal(preview.draft.draftOnly, true);
  assert.equal(preview.draft.submitted, false);
  assert.equal(preview.patchDelta.partialUpdateOnly, true);
  assert.equal(preview.patchDelta.submitted, false);
  assert.deepEqual(assertReviewOnlyUploaderPreview(preview), { ok: true, issues: [] });
});

test("unsafe draft and full snapshot patch fail closed without leaking unsafe text", () => {
  const preview = createCompanionUploaderPreview(sampleUnsafeCompanionUploaderPreviewInput);
  const codes = preview.evidence.findings.map((finding) => finding.code);
  const serialized = JSON.stringify(preview);
  assert.equal(preview.ok, false);
  assert.equal(preview.decision, "blocked");
  assert.ok(codes.includes("uploader.live-upload-disabled"));
  assert.ok(codes.includes("draft-overclaim-approval"));
  assert.ok(codes.includes("draft-overclaim-hosted-execution"));
  assert.ok(codes.includes("patch-delta-full-snapshot-forbidden"));
  assert.equal(preview.draft.summary, "[blocked:unsafe-draft]");
  assert.doesNotMatch(serialized, /approved for hosted execution/i);
  assert.deepEqual(assertReviewOnlyUploaderPreview(preview), { ok: false, issues: ["boundary_live_upload"] });
});

test("missing import variant and agent-native evidence becomes review-required", () => {
  const preview = createCompanionUploaderPreview({
    ...sampleCompanionUploaderPreviewInput,
    importPlan: {
      ok: false,
      code: "upload.import_plan.review_required",
      reviewOnly: true,
      dryRunOnly: true,
      noExecution: true,
      evidence: { findings: [] }
    },
    variantPlan: {
      ok: false,
      code: "upload.variant_plan.review_required",
      reviewOnly: true,
      dryRunOnly: true,
      noExecution: true,
      variants: [],
      evidence: { findings: [] }
    },
    agentNativePlan: {
      ok: false,
      code: "upload.agent_native_plan.review_required",
      reviewOnly: true,
      dryRunOnly: true,
      noExecution: true,
      evidence: { findings: [] }
    }
  });
  const codes = preview.evidence.findings.map((finding) => finding.code);
  assert.equal(preview.ok, false);
  assert.equal(preview.plans.import.ok, false);
  assert.equal(preview.plans.variant.ok, false);
  assert.equal(preview.plans.agentNative.ok, false);
  assert.ok(codes.includes("import-plan-parser-evidence-missing"));
  assert.ok(codes.includes("variant-plan-variants-missing"));
  assert.ok(codes.includes("agent-native-plan-namespace-missing"));
  assert.ok(codes.includes("agent-native-plan-install-guidance-missing"));
});

test("source-only variant and agent-native guidance cannot become install or download claims", () => {
  const preview = createCompanionUploaderPreview({
    ...sampleCompanionUploaderPreviewInput,
    variantPlan: {
      ...sampleCompanionUploaderPreviewInput.variantPlan,
      variants: [
        {
          ...sampleCompanionUploaderPreviewInput.variantPlan.variants[0],
          downloadAvailability: "source-only",
          readyForDownload: true
        }
      ]
    },
    agentNativePlan: {
      ...sampleCompanionUploaderPreviewInput.agentNativePlan,
      installGuidance: [
        {
          ...sampleCompanionUploaderPreviewInput.agentNativePlan.installGuidance[0],
          noExecution: false,
          requiresManualReview: false
        }
      ]
    }
  });
  const codes = preview.evidence.findings.map((finding) => finding.code);
  assert.equal(preview.ok, false);
  assert.ok(codes.includes("variant-plan-download-overclaim"));
  assert.ok(codes.includes("agent-native-guidance-boundary"));
  assert.equal(preview.noOverclaim.platformDownloadReadiness, false);
  assert.equal(preview.noOverclaim.directInstallClaim, false);
});

test("preview redacts local paths internal markers and secret-like values", () => {
  const localPath = ["C", ":", "\\", "Users", "\\", "someone", "\\", "package"].join("");
  const internalMarker = [".", "planning"].join("");
  const secretValue = ["sk-", "a".repeat(24)].join("");
  const preview = createCompanionUploaderPreviewFailure({
    draft: {
      ok: true,
      code: "upload.draft.ready",
      reviewOnly: true,
      draftOnly: true,
      submitted: false,
      requiresUserConfirmation: true,
      requiresServerValidationBeforeSubmit: true,
      draft: {
        kind: "manifest",
        summary: `Draft mentions ${localPath} ${internalMarker} ${secretValue}`
      }
    },
    patchDelta: sampleCompanionUploaderPreviewInput.patchDelta
  });
  const serialized = JSON.stringify(preview);
  assert.equal(preview.ok, false);
  assert.doesNotMatch(serialized, new RegExp(localPath.replace(/\\/gu, "\\\\"), "u"));
  assert.doesNotMatch(serialized, new RegExp(["\\.", "planning"].join(""), "u"));
  assert.doesNotMatch(serialized, new RegExp(secretValue, "u"));
  assert.match(serialized, /redacted:path/u);
  assert.match(serialized, /redacted:secret/u);
});

test("uploader preview UI and docs expose review-only rows without submit claims", () => {
  const app = fs.readFileSync("src/workspaces/routes/LibraryWorkspaceAndImportWorkspaceRoute.tsx", "utf8");
  const workspace = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  const docs = fs.readFileSync("docs/contracts/companion-alignment.md", "utf8");

  assert.match(app, /createCompanionUploaderPreview/u);
  for (const label of [
    "Uploader boundary",
    "submissionMode",
    "liveUploadAvailable",
    "Upload plan preview",
    "Import plan preview",
    "Variant plan preview",
    "Agent-native plan preview",
    "Draft preview",
    "Patch/delta preview",
    "No submit action"
  ]) {
    assert.match(workspace, new RegExp(label, "u"));
  }
  assert.match(docs, /Review-Only Uploader Preview Boundary/u);
  assert.match(docs, /liveUploadAvailable: false/u);
  assert.match(docs, /must not expose submit/u);
});
