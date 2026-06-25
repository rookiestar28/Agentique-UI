import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertReadOnlyCompanionClientSurface,
  createCompanionBadgeState,
  createCompanionReadbackClient,
  createCompanionReadbackReview,
  normalizeCompanionBaseUrl,
  normalizeCompanionDownloadMetadata,
  normalizeCompanionPublicReadback,
  sampleCompanionReadback
} from "../src/core/companion-readback-adapter.mjs";

test("companion readback client exposes read-only GET surface without auth headers", async () => {
  const calls = [];
  const client = createCompanionReadbackClient({
    baseUrl: "https://www.agentique.io/catalog/",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return jsonResponse({ id: "example.visual-guide", status: "published" });
    }
  });

  assert.deepEqual(assertReadOnlyCompanionClientSurface(client), { ok: true, issues: [] });
  await client.getReadback("example.visual-guide");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.accept, "application/json");
  assert.equal(Object.hasOwn(calls[0].options.headers, "authorization"), false);
  assert.match(calls[0].url, /\/api\/public\/v1\/resources\/example\.visual-guide\/readback$/u);
});

test("companion readback base URL allows HTTPS and loopback only", () => {
  assert.equal(normalizeCompanionBaseUrl("https://www.agentique.io/").origin, "https://www.agentique.io");
  assert.equal(normalizeCompanionBaseUrl("http://127.0.0.1:1420").origin, "http://127.0.0.1:1420");
  assert.throws(() => normalizeCompanionBaseUrl("http://agentique.io"), /HTTPS outside loopback/u);
});

test("companion public readback strips private and prototype fields", () => {
  const normalized = normalizeCompanionPublicReadback({
    id: "example.visual-guide",
    adminNote: "hidden",
    secretValue: "hidden",
    privateMcpBoundary: { availability: "private-denied" },
    constructor: { prototype: "blocked" },
    nested: {
      objectKey: "hidden",
      title: "Visible"
    }
  });
  assert.equal(normalized.id, "example.visual-guide");
  assert.equal(normalized.adminNote, undefined);
  assert.equal(normalized.secretValue, undefined);
  assert.deepEqual(normalized.privateMcpBoundary, { availability: "private-denied" });
  assert.equal(Object.hasOwn(normalized, "constructor"), false);
  assert.deepEqual(normalized.nested, { title: "Visible" });
});

test("companion download metadata redacts sensitive URLs and validates digest", () => {
  const metadata = normalizeCompanionDownloadMetadata({
    resourceId: "example.visual-guide",
    download: {
      availability: "available",
      url: "https://cdn.agentique.io/file.zip?token=secret",
      ticketEndpoint: "/api/public/v1/resources/example.visual-guide/download",
      method: "POST",
      filename: "file.zip",
      sizeBytes: 1200,
      digest: "f".repeat(64)
    }
  });
  assert.equal(metadata.url, null);
  assert.equal(metadata.urlRedacted, true);
  assert.equal(metadata.ticketEndpoint, "/api/public/v1/resources/example.visual-guide/download");
  assert.equal(metadata.downloadKind, "ticketed-post");
  assert.equal(metadata.digestValid, true);
});

test("companion download metadata normalizes canonical source packages", () => {
  const metadata = normalizeCompanionDownloadMetadata({
    ok: true,
    availability: "available",
    data: {
      resourceId: "example.canonical",
      selectedPlatform: "source-package",
      status: "published",
      sourcePackage: {
        platformId: "source-package",
        artifactKind: "source-package",
        status: "DOWNLOADABLE",
        method: "POST",
        downloadEndpoint: "/api/public/v1/resources/example.canonical/download?ignored=true",
        file: {
          fileName: "example-canonical.agentique.zip",
          contentType: "application/zip",
          byteSize: 4096,
          checksumSha256: "a".repeat(64),
          storageKey: "hidden"
        }
      }
    }
  });

  assert.equal(metadata.resourceId, "example.canonical");
  assert.equal(metadata.availability, "available");
  assert.equal(metadata.downloadKind, "ticketed-post");
  assert.equal(metadata.method, "POST");
  assert.equal(metadata.ticketEndpoint, "/api/public/v1/resources/example.canonical/download");
  assert.equal(metadata.filename, "example-canonical.agentique.zip");
  assert.equal(metadata.mediaType, "application/zip");
  assert.equal(metadata.sizeBytes, 4096);
  assert.equal(metadata.digest, "a".repeat(64));
  assert.equal(metadata.digestValid, true);
  assert.equal(JSON.stringify(metadata).includes("hidden"), false);
});

test("companion download metadata rejects canonical metadata-only despite legacy fields", () => {
  const metadata = normalizeCompanionDownloadMetadata({
    ok: true,
    availability: "available",
    data: {
      resourceId: "example.metadata",
      method: "POST",
      downloadEndpoint: "/api/public/v1/resources/example.metadata/legacy-download",
      files: [
        {
          filename: "legacy.zip",
          mediaType: "application/zip",
          sizeBytes: 4096,
          digest: "b".repeat(64)
        }
      ],
      sourcePackage: {
        platformId: "source-package",
        artifactKind: "source-package",
        status: "METADATA_ONLY",
        method: "POST",
        unavailableReason: "source_file_not_route_ready",
        file: {
          fileName: "example-metadata.agentique.zip",
          contentType: "application/zip",
          byteSize: 4096,
          checksumSha256: "b".repeat(64)
        }
      }
    }
  });

  assert.equal(metadata.availability, "unavailable");
  assert.equal(metadata.downloadKind, "unavailable");
  assert.equal(metadata.ticketEndpoint, null);
  assert.equal(metadata.filename, "example-metadata.agentique.zip");
  assert.equal(metadata.digest, "b".repeat(64));
  assert.equal(metadata.unavailableReason, "source_file_not_route_ready");
  assert.doesNotMatch(JSON.stringify(metadata), /legacy|legacy-download/u);
});

test("companion download metadata rejects malformed canonical source packages", () => {
  const metadata = normalizeCompanionDownloadMetadata({
    ok: true,
    availability: "available",
    data: {
      resourceId: "example.malformed",
      sourcePackage: {
        platformId: "source-package",
        artifactKind: "source-package",
        status: "DOWNLOADABLE",
        method: "GET",
        downloadEndpoint: "/api/public/v1/resources/example.malformed/download",
        file: {
          fileName: "../malformed.zip",
          contentType: "application/zip",
          byteSize: 0,
          checksumSha256: "not-a-checksum"
        }
      }
    }
  });

  assert.equal(metadata.availability, "unavailable");
  assert.equal(metadata.downloadKind, "unavailable");
  assert.equal(metadata.ticketEndpoint, "/api/public/v1/resources/example.malformed/download");
  assert.equal(metadata.filename, null);
  assert.equal(metadata.sizeBytes, 0);
  assert.equal(metadata.digest, null);
  assert.equal(metadata.digestPresent, true);
  assert.equal(metadata.digestValid, false);
  assert.equal(metadata.unavailableReason, "source_file_name_invalid");
});

test("companion readback badge covers normal stale unavailable and rate-limited states", () => {
  assert.equal(createCompanionBadgeState(sampleCompanionReadback, { now: "2026-06-13T00:05:00.000Z" }).state, "variant-available");
  assert.equal(createCompanionBadgeState(sampleCompanionReadback, { now: "2026-06-13T02:00:00.000Z" }).state, "stale");
  assert.equal(createCompanionBadgeState(null).state, "unavailable");
  assert.equal(createCompanionBadgeState({ code: "rate-limited", retryAfter: "30" }).state, "rate-limited");
});

test("companion readback badge covers trust parser and agent-native branches", () => {
  assert.equal(createCompanionBadgeState({ platformProjection: { publicationState: "blocked" } }).state, "blocked");
  assert.equal(createCompanionBadgeState({ parserVariant: { parserEvidence: { parseStatus: "partial" } } }).state, "partial");
  assert.equal(
    createCompanionBadgeState({
      agentNative: {
        resolverResult: { state: "ambiguous", ambiguity: "alternatives-available" },
        namespace: { latestPointer: { state: "current" } },
        provenanceTrust: { state: "current" }
      }
    }).state,
    "agent-native-ambiguous"
  );
});

test("companion readback review projects UI proof state without release overclaims", () => {
  const review = createCompanionReadbackReview(sampleCompanionReadback, { now: "2026-06-13T00:05:00.000Z" });
  assert.equal(review.schemaVersion, "agentique.companionReadbackAdapter.v1");
  assert.equal(review.sourcePackage, "@agentique.io/readback");
  assert.equal(review.detail.resourceId, "example.visual-guide");
  assert.equal(review.download.downloadKind, "ticketed-post");
  assert.equal(review.readOnly.mutationMethods, false);
  assert.equal(review.readOnly.authRequired, false);
  assert.equal(review.noOverclaim.liveUploadAvailable, false);
  assert.equal(review.noOverclaim.runtimeReleaseAvailable, false);
});

test("companion readback UI and docs expose badge and read-only proof rows", () => {
  const app = fs.readFileSync("src/workspaces/routes/LibraryWorkspaceAndImportWorkspaceRoute.tsx", "utf8");
  const workspace = [
    "src/workspaces/LibraryImportWorkspaces.tsx",
    "src/workspaces/LibraryImportWorkspaceTypes.ts",
    "src/workspaces/LibraryWorkspace.tsx",
    "src/workspaces/ImportWorkspace.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  const docs = fs.readFileSync("docs/contracts/companion-alignment.md", "utf8");
  assert.match(app, /createCompanionReadbackReview/u);
  for (const label of ["Companion readback", "Download proof", "Parser variant", "Agent-native private boundary", "Read-only client"]) {
    assert.match(workspace, new RegExp(label, "u"));
  }
  assert.match(docs, /Read-Only Adapter Boundary/u);
  assert.match(docs, /GET-only/u);
  assert.match(docs, /do not carry authorization headers/u);
});

function jsonResponse(payload, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: {
      get() {
        return null;
      }
    },
    async json() {
      return payload;
    }
  };
}
