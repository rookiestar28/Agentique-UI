import assert from "node:assert/strict";
import test from "node:test";
import { createSessionRecord, exportSessionRecord, sampleSession, summarizeSession } from "../src/core/session-store.mjs";

test("sample session records local visual runner events", () => {
  const summary = summarizeSession(sampleSession);
  assert.equal(sampleSession.schemaVersion, "agentique.localSession.v1");
  assert.equal(summary.eventCount, 8);
  assert.equal(summary.artifacts, 1);
  assert.equal(summary.failures, 1);
  assert.equal(summary.cloudSessionRequired, false);
});

test("session logs and exports redact vault references", () => {
  const log = sampleSession.events.find((entry) => entry.type === "log");
  assert.match(log.label, /redacted:vault-reference/u);
  const exported = exportSessionRecord(sampleSession);
  assert.equal(exported.schemaVersion, "agentique.localSessionExport.v1");
  assert.doesNotMatch(JSON.stringify(exported), /vault:providerCredential/u);
});

test("session rejects invalid events and malformed resources", () => {
  assert.throws(
    () => createSessionRecord({
      sessionId: "bad",
      resource: { resourceId: "example", version: "0.1.0", digest: "x" },
      events: []
    }),
    /SHA-256/u
  );
  assert.throws(
    () => createSessionRecord({
      sessionId: "bad",
      resource: { resourceId: "example", version: "0.1.0", digest: "e".repeat(64) },
      events: [{ type: "execute", label: "Run" }]
    }),
    /Unsupported event type/u
  );
});

