import assert from "node:assert/strict";
import test from "node:test";
import { createAjv, readJson } from "../scripts/validate-contracts.mjs";
import { createLibraryRecord } from "../src/core/library-store.mjs";
import {
  createResourceBundleFromSourceMetadata,
  createSupportModeDecision,
  resourceBundleSchemaVersion,
  sourceResourceBundleMapperVersion
} from "../src/core/source-resource-bundle-mapper.mjs";

const digestA = "a".repeat(64);
const digestB = "b".repeat(64);
const observedAt = "2026-06-11T00:05:00.000Z";

function sourceMetadata() {
  return {
    observedAt,
    readback: {
      id: "agent:research.alpha",
      latestVersion: "2026.06+alpha",
      title: "Research Alpha",
      summary: "Public metadata for a source package with an external handoff path.",
      compatibility: {
        agentiqueUi: ">=0.1.0",
        platforms: ["windows", "macos", "linux"]
      },
      manifest: {
        schemaVersion: "agentique.resourceManifest.v1",
        capabilities: ["read-docs", "summarize"],
        graph: {
          nodes: 2
        }
      },
      versions: [
        {
          version: "2026.06+alpha",
          files: [
            {
              id: "readme",
              fileName: "README.md",
              contentType: "text/markdown",
              byteSize: 2048,
              checksumSha256: digestA
            }
          ]
        }
      ]
    },
    importMetadata: {
      resourceId: "agent:research.alpha",
      status: "published",
      installTargets: [
        {
          targetId: "codex",
          status: "download-backed",
          download: {
            variantId: "source-package"
          }
        }
      ]
    },
    downloadMetadata: {
      resourceId: "agent:research.alpha",
      method: "POST",
      downloadEndpoint: "/api/agents/agent%3Aresearch.alpha/download",
      handoff: {
        method: "POST",
        endpoint: "/api/agents/agent%3Aresearch.alpha/download",
        finalByteUrl: null,
        expiresInSeconds: 600,
        ticket: {
          replayMitigation: "short_expiry_and_route_rate_limit"
        }
      },
      files: [
        {
          id: "readme",
          fileName: "README.md",
          contentType: "text/markdown",
          byteSize: 2048,
          checksumSha256: digestA
        }
      ],
      sourcePackage: {
        platformId: "source-package",
        status: "DOWNLOADABLE"
      }
    },
    provenance: {
      sourceDigest: digestA,
      publishedDigest: digestB,
      verificationStatus: "reviewed",
      signer: "source-metadata"
    }
  };
}

test("maps public source metadata to a bundle, library record, and POST handoff descriptor", () => {
  const result = createResourceBundleFromSourceMetadata(sourceMetadata(), { verifiedAt: observedAt });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.projection.schemaVersion, sourceResourceBundleMapperVersion);
  assert.equal(result.projection.bundle.schemaVersion, resourceBundleSchemaVersion);
  assert.equal(result.projection.bundle.resource.id, "agent:research.alpha");
  assert.equal(result.projection.bundle.resource.version, "2026.06+alpha");
  assert.equal(result.projection.bundle.package.files[0].path, "docs/README.md");
  assert.equal(result.projection.bundle.support.primaryMode, "external-handoff");
  assert.deepEqual(result.projection.bundle.support.modes, ["catalog-only", "visualizable", "external-handoff"]);
  assert.equal(result.projection.handoff.method, "POST");
  assert.equal(result.projection.handoff.finalByteUrl, null);
  assert.equal(result.projection.handoff.scopedTicketEndpoint, null);
  assert.equal(result.projection.verification.requiresAttachmentDisposition, true);

  const ajv = createAjv();
  const validate = ajv.compile(readJson("schemas/agentique-resource-bundle.schema.json"));
  assert.equal(validate(result.projection.bundle), true, JSON.stringify(validate.errors));
  const libraryRecord = createLibraryRecord(result.projection.libraryRecord);
  assert.equal(libraryRecord.resourceId, "agent:research.alpha");
  assert.equal(libraryRecord.version, "2026.06+alpha");
});

test("support decisions never claim edit, dry-run, or local-run without evidence", () => {
  const support = createSupportModeDecision({
    hasPublicHandoff: true,
    handoffTargets: ["codex", "unsafe target", "codex"]
  });
  assert.deepEqual(support.modes, ["catalog-only", "visualizable", "external-handoff"]);
  assert.deepEqual(support.handoffTargets, ["codex"]);
  assert.deepEqual(
    support.unsupported.map((item) => item.mode),
    ["editable", "dry-runnable", "locally-runnable"]
  );
});

test("missing files still produce a metadata-only no-dead-end bundle", () => {
  const input = sourceMetadata();
  input.downloadMetadata.files = [];
  input.downloadMetadata.sourcePackage.status = "UNAVAILABLE";
  input.importMetadata.installTargets = [];
  input.readback.versions = [];
  const result = createResourceBundleFromSourceMetadata(input, { verifiedAt: observedAt });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.projection.bundle.package.files[0].path, "metadata/resource.json");
  assert.equal(result.projection.bundle.support.primaryMode, "visualizable");
  assert.deepEqual(result.projection.bundle.support.modes, ["catalog-only", "visualizable"]);
  assert.equal(result.projection.handoff.available, false);
  assert.equal(result.projection.support.noDeadEnd, true);
});

test("rejects private fields, inline credentials, local paths, and final byte URLs", () => {
  const withPrivateField = sourceMetadata();
  withPrivateField.readback.privateReviewNote = "do not expose";
  assert.equal(createResourceBundleFromSourceMetadata(withPrivateField).ok, false);

  const withCredential = sourceMetadata();
  withCredential.importMetadata.authorization = ["bearer", "sampleSensitiveValue"].join(" ");
  assert.equal(createResourceBundleFromSourceMetadata(withCredential).ok, false);

  const withLocalPath = sourceMetadata();
  withLocalPath.downloadMetadata.files[0].fileName = ["C", ":", "\\", "Users", "\\", "local", "\\", "secret.txt"].join("");
  assert.equal(createResourceBundleFromSourceMetadata(withLocalPath).ok, false);

  const withByteUrl = sourceMetadata();
  withByteUrl.downloadMetadata.handoff.finalByteUrl = "https://www.agentique.io/download/final";
  const byteUrlResult = createResourceBundleFromSourceMetadata(withByteUrl);
  assert.equal(byteUrlResult.ok, false);
  assert.equal(byteUrlResult.errors[0].code, "metadata.unsafe-transport-field");
});

test("resource bundle schema accepts canonical public id and version rules", () => {
  const ajv = createAjv();
  const validate = ajv.compile(readJson("schemas/agentique-resource-bundle.schema.json"));
  const example = readJson("examples/resource-bundle.valid.json");
  example.resource.id = "agent:research.alpha";
  example.resource.version = "2026.06+alpha";
  assert.equal(validate(example), true, JSON.stringify(validate.errors));
});
