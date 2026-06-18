import { createCoreContractFixtureSet, validateCoreContractFixtureSet } from "./core-contract-drift-gate.mjs";
import { validateImportIntent } from "./import-intent.mjs";
import { createLibraryRecord, emptyLibraryState, upsertLibraryRecord } from "./library-store.mjs";
import { sha256Hex, verifyScopedPackage } from "./package-verifier.mjs";

export const localIntegrationSmokeVersion = "agentique.localIntegrationSmoke.v1";

const defaultNow = "2026-06-11T00:05:00.000Z";
const ticketIssuedAt = "2026-06-11T00:00:00.000Z";
const ticketExpiresAt = "2026-06-11T00:10:00.000Z";

export function createSyntheticPackageBytes(fixture = createCoreContractFixtureSet()) {
  return [
    "agentique-ui-local-integration-smoke",
    fixture.resource.id,
    fixture.resource.version,
    fixture.projections.bundle.bundle.provenance.publishedDigest
  ].join("\n");
}

export async function runLocalIntegrationSmoke(options = {}) {
  const fixture = options.fixture ?? createCoreContractFixtureSet();
  const base = createBaseResult();
  const fixtureValidation = validateCoreContractFixtureSet(fixture);
  if (!fixtureValidation.ok) {
    return fail(base, "fixture.contract-drift", "Core contract fixture drifted.", {
      issues: fixtureValidation.issues,
      cleanupRequired: false
    });
  }
  base.steps.push("fixture-validated");

  const intentValidation = validateImportIntent(fixture.importIntent.uri, {
    now: options.now ?? defaultNow,
    expectedOrigin: fixture.resource.origin
  });
  if (!intentValidation.ok) {
    return fail(base, "intent.invalid", "Import intent failed validation.", {
      issues: intentValidation.errors.map((error) => error.code),
      cleanupRequired: false
    });
  }
  base.steps.push("intent-validated");

  const bundleProjection = fixture.projections.bundle;
  const expectedBytes = createSyntheticPackageBytes(fixture);
  const bytes = options.bytes ?? expectedBytes;
  const expectedDigest = await sha256Hex(expectedBytes);
  const ticket = createVerificationTicket({
    fixture,
    digest: options.ticketDigest ?? expectedDigest,
    sizeBytes: options.ticketSizeBytes ?? byteLength(expectedBytes)
  });
  const verification = await verifyScopedPackage({
    ticket,
    bundle: bundleProjection.bundle,
    bytes,
    now: options.now ?? defaultNow,
    replayedTickets: options.replayedTickets ?? []
  });
  if (!verification.ok) {
    return fail(base, "package.verification-failed", "Synthetic package verification failed.", {
      issues: verification.errors.map((error) => error.code),
      digest: verification.digest,
      cleanupRequired: true
    });
  }
  base.steps.push("package-verified");

  const libraryRecord = createLibraryRecord({
    ...bundleProjection.libraryRecord,
    digest: verification.digest,
    provenance: {
      ...bundleProjection.libraryRecord.provenance,
      publishedDigest: verification.digest
    },
    verifiedAt: options.now ?? defaultNow
  });
  const libraryState = upsertLibraryRecord(emptyLibraryState(), libraryRecord);
  base.steps.push("library-upserted");

  const result = {
    ...base,
    ok: true,
    importIntent: {
      resourceId: intentValidation.intent.resource.id,
      resourceVersion: intentValidation.intent.resource.version,
      source: intentValidation.intent.source,
      grantsAuthorization: intentValidation.intent.security.grantsAuthorization,
      grantsDownload: intentValidation.intent.security.grantsDownload,
      grantsExecution: intentValidation.intent.security.grantsExecution,
      grantsPermission: intentValidation.intent.security.grantsPermission
    },
    verification: {
      digest: verification.digest,
      sizeBytes: byteLength(bytes),
      signatureKind: "synthetic-fixture-digest",
      signature: `fixture-sha256:${expectedDigest.slice(0, 16)}`,
      ticketMethod: ticket.download.method,
      handoffMethod: fixture.routes.downloadHandoff.method,
      scopedTicketEndpoint: null,
      finalByteUrlInMetadata: false
    },
    libraryState,
    cleanup: {
      required: false,
      reason: null,
      action: "not-required"
    }
  };

  if (unsafeSmokeOutputPattern().test(JSON.stringify(result))) {
    return fail(base, "smoke.unsafe-output", "Smoke output contained unsafe public text.", {
      cleanupRequired: true
    });
  }
  return result;
}

function createVerificationTicket({ fixture, digest, sizeBytes }) {
  const bundle = fixture.projections.bundle.bundle;
  return {
    schemaVersion: "agentique.scopedDownloadTicket.v1",
    ticketId: "ticket_Aq2ULu3DZpaSSx7dlS6k8w",
    audience: "agentique-ui",
    scope: "resource-download",
    resource: {
      id: bundle.resource.id,
      version: bundle.resource.version
    },
    download: {
      url: `https://www.agentique.io/api/resources/${encodeURIComponent(bundle.resource.id)}/versions/${encodeURIComponent(bundle.resource.version)}/download`,
      method: "GET",
      maxBytes: Math.max(sizeBytes, 1)
    },
    integrity: {
      sha256: digest,
      sizeBytes,
      signer: "synthetic-fixture"
    },
    replayPolicy: {
      singleUse: true,
      nonce: "Aq2ULu3DZpaSSx7dlS6k8w"
    },
    issuedAt: ticketIssuedAt,
    expiresAt: ticketExpiresAt
  };
}

function createBaseResult() {
  return {
    ok: false,
    schemaVersion: localIntegrationSmokeVersion,
    steps: [],
    importIntent: null,
    verification: null,
    libraryState: null,
    cleanup: {
      required: false,
      reason: null,
      action: "not-required"
    },
    noExecution: {
      networkRequestsPerformed: false,
      packageManagersExecuted: false,
      lifecycleHooksExecuted: false,
      workflowsExecuted: false,
      shellCommandsExecuted: false,
      nativeRuntimeStarted: false
    },
    noOverclaim: {
      installerAvailable: false,
      updaterAvailable: false,
      nativeRunnerAvailable: false,
      localExecutionAvailable: false,
      directInstallVerified: false,
      publicSdkReleased: false,
      pactBrokerPublished: false
    },
    errors: []
  };
}

function fail(base, code, message, details = {}) {
  return {
    ...base,
    ok: false,
    cleanup: {
      required: details.cleanupRequired === true,
      reason: code,
      action: details.cleanupRequired === true ? "discard-untrusted-fixture-bytes" : "no-local-state-created"
    },
    errors: [
      {
        code,
        message,
        issues: details.issues ?? [],
        digest: details.digest
      }
    ]
  };
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function unsafeSmokeOutputPattern() {
  return new RegExp(
    [
      "sk-[A-Za-z0-9_-]{6,}",
      "ghp_[A-Za-z0-9_]{12,}",
      "github_pat_[A-Za-z0-9_]{12,}",
      "bearer\\s+[A-Za-z0-9._-]{12,}",
      "-----BEGIN [A-Z ]*PRIVATE KEY-----",
      "(?:^|[\\s\"'`(])[A-Za-z]:[\\\\/]",
      "(?:^|[\\s\"'`(])/(?:Users|home|private|tmp|var)/",
      "file://",
      "storageKey",
      "signedUrl",
      "rawCommand",
      "operatorNote",
      "privateEvidence",
      ["\\.plan", "ning"].join(""),
      ["ref", "erence[\\\\/]docs"].join("")
    ].join("|"),
    "iu"
  );
}
