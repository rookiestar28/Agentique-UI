import assert from "node:assert/strict";
import test from "node:test";
import {
  importIntentContractVersion,
  legacyResourceUriAlias,
  sampleImportIntent,
  validateImportIntent
} from "../src/core/import-intent.mjs";

const now = "2026-06-11T00:05:00.000Z";

test("canonical import intent is accepted for cold-start and runtime-open handling", () => {
  for (const path of ["cold-start", "runtime-open"]) {
    const result = validateImportIntent(sampleImportIntent, { now, expectedOrigin: "https://www.agentique.io" });
    assert.equal(result.ok, true, path);
    assert.equal(result.intent.version, importIntentContractVersion);
    assert.equal(result.intent.action, "import");
    assert.equal(result.intent.resource.id, "example.visual-guide");
    assert.equal(result.intent.resource.version, "0.1.0");
    assert.equal(result.intent.source, "canonical-import-intent");
    assert.equal(result.intent.security.grantsAuthorization, false);
    assert.equal(result.intent.security.grantsDownload, false);
    assert.equal(result.intent.security.grantsExecution, false);
    assert.equal(result.intent.security.grantsPermission, false);
    assert.equal(result.intent.security.requiresReadbackVerification, true);
  }
});

test("malformed and wrong protocol intents fail closed", () => {
  assert.equal(validateImportIntent("not a url", { now }).ok, false);
  const wrongProtocol = validateImportIntent("https://www.agentique.io/resources/example.visual-guide", { now });
  assert.equal(wrongProtocol.ok, false);
  assert.equal(wrongProtocol.errors[0].code, "intent.invalid-protocol");
});

test("invalid action version origin readback expiry and replay are rejected", () => {
  const invalid = new URL(sampleImportIntent);
  invalid.searchParams.set("action", "execute");
  invalid.searchParams.set("version", "agentique.importIntent.v999");
  invalid.searchParams.set("origin", "http://example.test");
  invalid.searchParams.set("readbackUrl", "https://example.test/api/public/v1/resources/example.visual-guide/readback");
  invalid.searchParams.set("resourceVersion", "latest:bad");
  invalid.searchParams.set("expiresAt", "2026-06-10T00:00:00.000Z");
  const result = validateImportIntent(invalid.toString(), {
    now,
    replayedNonces: ["Aq2ULu3DZpaS"],
    expectedOrigin: "https://www.agentique.io"
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "intent.unsupported-action"));
  assert.ok(result.errors.some((error) => error.code === "intent.unsupported-version"));
  assert.ok(result.errors.some((error) => error.code === "origin.insecure"));
  assert.ok(result.errors.some((error) => error.code === "origin.mismatch"));
  assert.ok(result.errors.some((error) => error.code === "readback.invalid-url"));
  assert.ok(result.errors.some((error) => error.code === "resource.invalid-version"));
  assert.ok(result.errors.some((error) => error.code === "intent.expired"));
  assert.ok(result.errors.some((error) => error.code === "nonce.replayed"));
  assert.ok(result.errors.every((error) => !error.message.includes("agentique://")));
});

test("public resource ids allow dot colon hyphen and underscore but reject encoded separators", () => {
  const accepted = new URL(sampleImportIntent);
  accepted.searchParams.set("resourceId", "agent:alpha");
  accepted.searchParams.set("readbackUrl", "/api/public/v1/resources/agent%3Aalpha/readback");
  assert.equal(validateImportIntent(accepted.toString(), { now }).ok, true);

  const rejected = new URL(sampleImportIntent);
  rejected.searchParams.set("resourceId", "agent%2Falpha");
  const result = validateImportIntent(rejected.toString(), { now });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === "resource.invalid-id"));
});

test("JSON intent is accepted when it matches the canonical public shape", () => {
  const result = validateImportIntent(JSON.stringify({
    schemaVersion: importIntentContractVersion,
    action: "import",
    resource: { id: "agent:alpha", version: "version_1" },
    origin: { site: "https://www.agentique.io" },
    readbackUrl: "/api/public/v1/resources/agent%3Aalpha/readback",
    nonce: "Aq2ULu3DZpaS",
    issuedAt: "2026-06-11T00:00:00.000Z",
    expiresAt: "2026-06-11T00:10:00.000Z"
  }), { now });
  assert.equal(result.ok, true);
  assert.equal(result.intent.resource.id, "agent:alpha");
  assert.equal(result.intent.resource.version, "version_1");
});

test("legacy resource URI is accepted only as a compatibility alias without authority", () => {
  const result = validateImportIntent("agentique://resources/agent%3Aalpha", { now });
  assert.equal(result.ok, true);
  assert.equal(result.intent.source, "legacy-resource-uri");
  assert.equal(result.intent.compatibilityAlias, legacyResourceUriAlias);
  assert.equal(result.intent.resource.id, "agent:alpha");
  assert.equal(result.intent.readbackUrl, "/api/public/v1/resources/agent%3Aalpha/readback");
  assert.equal(result.intent.security.grantsAuthorization, false);
  assert.equal(result.intent.security.grantsDownload, false);

  const invalid = validateImportIntent("agentique://resources/agent%2Falpha", { now });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors[0].code, "resource.invalid-id");
});
