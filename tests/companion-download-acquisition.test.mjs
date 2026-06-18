import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertNoInstallAcquisitionBoundary,
  createCompanionArtifactAcquisitionProof,
  createCompanionDownloadAcquisitionPlan,
  sampleCompanionAcquisitionRequest,
  sampleCompanionAcquisitionResult
} from "../src/core/companion-download-acquisition.mjs";
import { sampleCompanionReadback } from "../src/core/companion-readback-adapter.mjs";

test("valid companion ticket metadata creates safe acquisition plan and proof", () => {
  const plan = createCompanionDownloadAcquisitionPlan(sampleCompanionReadback, sampleCompanionAcquisitionRequest);
  const proof = createCompanionArtifactAcquisitionProof(plan, sampleCompanionAcquisitionResult);

  assert.equal(plan.ok, true);
  assert.equal(plan.decision, "ready");
  assert.equal(plan.transfer.ticketMethod, "POST");
  assert.equal(plan.transfer.byteFetchMethod, "GET");
  assert.equal(plan.destination.userSelectedDestination, true);
  assert.equal(plan.destination.noOverwriteDefault, true);
  assert.equal(plan.destination.rootBounded, true);
  assert.equal(plan.destination.writeMode, "atomic-temp-rename");
  assert.equal(plan.integrity.expectedSizeBytes, 10 * 1024 * 1024);
  assert.equal(plan.integrity.expectedSha256, "e".repeat(64));
  assert.equal(proof.ok, true);
  assert.equal(proof.decision, "accepted");
  assert.equal(proof.integrity.sizeMatches, true);
  assert.equal(proof.integrity.digestMatches, true);
  assert.deepEqual(assertNoInstallAcquisitionBoundary(proof), { ok: true, issues: [] });
});

test("direct safe HTTPS and loopback metadata remain bounded without install claims", () => {
  const directPlan = createCompanionDownloadAcquisitionPlan({
    resourceId: "example.direct",
    availability: "available",
    url: "https://cdn.agentique.io/resources/example.agentique.zip",
    filename: "example.agentique.zip",
    sizeBytes: 42,
    digest: "a".repeat(64)
  }, {
    ...sampleCompanionAcquisitionRequest,
    filename: "example.agentique.zip",
    maxBytes: 100,
    allowedRedirectOrigins: ["https://cdn.agentique.io"]
  });
  const loopbackPlan = createCompanionDownloadAcquisitionPlan({
    resourceId: "example.loopback",
    availability: "available",
    url: "http://127.0.0.1:8787/download/example.agentique.zip",
    filename: "example.agentique.zip",
    sizeBytes: 42,
    digest: "b".repeat(64)
  }, {
    ...sampleCompanionAcquisitionRequest,
    filename: "example.agentique.zip",
    maxBytes: 100,
    allowedRedirectOrigins: ["http://127.0.0.1:8787"]
  });

  assert.equal(directPlan.ok, true);
  assert.equal(directPlan.transfer.requestMethod, "GET");
  assert.equal(directPlan.noInstall.directInstall, false);
  assert.equal(loopbackPlan.ok, true);
  assert.equal(loopbackPlan.transfer.origin, "http://127.0.0.1:8787");
});

test("unsafe unavailable or sensitive download metadata fails closed", () => {
  const sensitivePlan = createCompanionDownloadAcquisitionPlan({
    resourceId: "example.unsafe",
    availability: "available",
    url: "https://cdn.agentique.io/resource.zip?signature=private",
    filename: "resource.zip",
    sizeBytes: 42,
    digest: "c".repeat(64)
  }, sampleCompanionAcquisitionRequest);
  const unavailablePlan = createCompanionDownloadAcquisitionPlan({
    resourceId: "example.unavailable",
    availability: "blocked",
    filename: "resource.zip",
    sizeBytes: 42,
    digest: "d".repeat(64)
  }, sampleCompanionAcquisitionRequest);
  const invalidDigestPlan = createCompanionDownloadAcquisitionPlan({
    resourceId: "example.digest",
    availability: "available",
    url: "https://cdn.agentique.io/resource.zip",
    filename: "resource.zip",
    sizeBytes: 42,
    digest: "not-a-digest"
  }, sampleCompanionAcquisitionRequest);

  assert.equal(sensitivePlan.ok, false);
  assert.ok(sensitivePlan.findings.some((finding) => finding.code === "download.unsafe-url"));
  assert.equal(unavailablePlan.ok, false);
  assert.ok(unavailablePlan.findings.some((finding) => finding.code === "download.unavailable"));
  assert.equal(invalidDigestPlan.ok, false);
  assert.ok(invalidDigestPlan.findings.some((finding) => finding.code === "download.invalid-digest"));
});

test("destination safety enforces user selection filename no overwrite and root boundary", () => {
  const traversal = createCompanionDownloadAcquisitionPlan(sampleCompanionReadback, {
    ...sampleCompanionAcquisitionRequest,
    filename: "../escape.zip"
  });
  const reserved = createCompanionDownloadAcquisitionPlan(sampleCompanionReadback, {
    ...sampleCompanionAcquisitionRequest,
    filename: "CON.zip"
  });
  const existing = createCompanionDownloadAcquisitionPlan(sampleCompanionReadback, {
    ...sampleCompanionAcquisitionRequest,
    existingFiles: ["workspace:library/example-visual-guide.agentique.zip"]
  });
  const overwriteAllowed = createCompanionDownloadAcquisitionPlan(sampleCompanionReadback, {
    ...sampleCompanionAcquisitionRequest,
    allowOverwrite: true,
    existingFiles: ["workspace:library/example-visual-guide.agentique.zip"]
  });
  const notUserSelected = createCompanionDownloadAcquisitionPlan(sampleCompanionReadback, {
    ...sampleCompanionAcquisitionRequest,
    userSelectedDestination: false
  });

  assert.equal(traversal.ok, false);
  assert.equal(reserved.ok, false);
  assert.equal(existing.ok, false);
  assert.ok(existing.findings.some((finding) => finding.code === "destination.output-exists"));
  assert.equal(overwriteAllowed.ok, true);
  assert.equal(overwriteAllowed.destination.noOverwriteDefault, false);
  assert.equal(notUserSelected.ok, false);
  assert.ok(notUserSelected.findings.some((finding) => finding.code === "destination.not-user-selected"));
});

test("oversize size mismatch digest mismatch partial writes and cleanup evidence fail closed", () => {
  const oversizePlan = createCompanionDownloadAcquisitionPlan(sampleCompanionReadback, {
    ...sampleCompanionAcquisitionRequest,
    maxBytes: 1024
  });
  const plan = createCompanionDownloadAcquisitionPlan(sampleCompanionReadback, sampleCompanionAcquisitionRequest);
  const mismatch = createCompanionArtifactAcquisitionProof(plan, {
    ok: true,
    bytesWritten: 123,
    sha256: "f".repeat(64),
    atomicRename: false,
    partialWrite: true,
    cleanupReceipt: { required: true, performed: false }
  });
  const cleanedPartial = createCompanionArtifactAcquisitionProof(plan, {
    ok: false,
    bytesWritten: 123,
    sha256: "f".repeat(64),
    atomicRename: false,
    partialWrite: true,
    cleanupReceipt: { required: true, performed: true, status: "completed", receiptId: "cleanup-1" }
  });

  assert.equal(oversizePlan.ok, false);
  assert.ok(oversizePlan.findings.some((finding) => finding.code === "integrity.oversize-metadata"));
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.findings.some((finding) => finding.code === "acquisition.cleanup-missing"));
  assert.ok(mismatch.findings.some((finding) => finding.code === "acquisition.digest-mismatch"));
  assert.equal(cleanedPartial.ok, false);
  assert.equal(cleanedPartial.cleanup.status, "completed");
});

test("redirect policy is bounded and deny-by-default for unlisted origins", () => {
  const allowed = createCompanionDownloadAcquisitionPlan(sampleCompanionReadback, {
    ...sampleCompanionAcquisitionRequest,
    redirectChain: [
      {
        from: "https://agentique.io/resource",
        to: "https://cdn.agentique.io/resource"
      }
    ]
  });
  const denied = createCompanionDownloadAcquisitionPlan(sampleCompanionReadback, {
    ...sampleCompanionAcquisitionRequest,
    redirectChain: [
      {
        from: "https://agentique.io/resource",
        to: "https://other.example/resource"
      }
    ]
  });
  const tooMany = createCompanionDownloadAcquisitionPlan(sampleCompanionReadback, {
    ...sampleCompanionAcquisitionRequest,
    maxRedirects: 0,
    redirectChain: [
      {
        from: "https://agentique.io/resource",
        to: "https://cdn.agentique.io/resource"
      }
    ]
  });

  assert.equal(allowed.ok, true);
  assert.equal(denied.ok, false);
  assert.ok(denied.findings.some((finding) => finding.code === "redirect.origin-denied"));
  assert.equal(tooMany.ok, false);
  assert.ok(tooMany.findings.some((finding) => finding.code === "redirect.limit-exceeded"));
});

test("acquisition proof redacts local paths internal markers and secret-like values", () => {
  const localPath = ["C", ":", "\\", "Users", "\\", "someone", "\\", "Downloads"].join("");
  const internalPath = [".", "planning", "/", "private-note.md"].join("");
  const secretValue = ["sk-", "a".repeat(24)].join("");
  const plan = createCompanionDownloadAcquisitionPlan({
    resourceId: "example.redaction",
    availability: "available",
    url: "https://cdn.agentique.io/resource.zip",
    filename: "resource.zip",
    sizeBytes: 42,
    digest: "e".repeat(64)
  }, {
    ...sampleCompanionAcquisitionRequest,
    destinationRoot: localPath,
    filename: "resource.zip",
    allowedRedirectOrigins: ["https://cdn.agentique.io"],
    redirectChain: [
      {
        from: "https://agentique.io/resource",
        to: `https://cdn.agentique.io/resource?token=${secretValue}`
      }
    ],
    existingFiles: [internalPath]
  });

  const serialized = JSON.stringify(plan);
  assert.equal(plan.ok, false);
  assert.doesNotMatch(serialized, new RegExp(localPath.replace(/\\/gu, "\\\\"), "u"));
  assert.doesNotMatch(serialized, new RegExp(["\\.", "planning"].join(""), "u"));
  assert.doesNotMatch(serialized, new RegExp(secretValue, "u"));
  assert.match(serialized, /redacted:path/u);
  assert.match(serialized, /redacted:secret/u);
});

test("acquisition UI and docs expose safe proof without broad transfer or install claims", () => {
  const app = fs.readFileSync("src/workspaces/routes/LibraryWorkspaceAndImportWorkspaceRoute.tsx", "utf8");
  const workspace = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  const docs = fs.readFileSync("docs/contracts/companion-alignment.md", "utf8");

  assert.match(app, /createCompanionDownloadAcquisitionPlan/u);
  assert.match(app, /createCompanionArtifactAcquisitionProof/u);
  for (const label of [
    "Acquisition bridge",
    "Destination boundary",
    "No-overwrite default",
    "Atomic write",
    "Byte/digest proof",
    "Cleanup receipt",
    "Install boundary"
  ]) {
    assert.match(workspace, new RegExp(label, "u"));
  }
  assert.match(docs, /Safe Download Acquisition Boundary/u);
  assert.match(docs, /must not install/u);
  assert.match(docs, /not platform approval/u);
});
