import assert from "node:assert/strict";
import test from "node:test";
import {
  createLibraryRecord,
  createWebStorageLibraryAdapter,
  emptyLibraryState,
  exportLibraryState,
  librarySchemaVersion,
  migrateLibraryState,
  upsertLibraryRecord
} from "../src/core/library-store.mjs";

const baseRecord = {
  resourceId: "example.visual-guide",
  title: "Example Visual Guide",
  version: "0.1.0",
  digest: "e".repeat(64),
  supportMode: "visualizable",
  provenance: {
    sourceDigest: "b".repeat(64),
    publishedDigest: "c".repeat(64),
    verificationStatus: "verified",
    signer: "agentique-example"
  },
  compatibility: {
    agentiqueUi: ">=0.1.0",
    platforms: ["windows", "macos", "linux"]
  },
  permissionState: {
    files: "denied",
    network: "denied",
    shell: "denied",
    environment: "denied"
  },
  installState: {
    status: "verified-only",
    installedAt: null
  },
  cleanupState: {
    status: "not-required",
    lastAction: null
  },
  verifiedAt: "2026-06-11T00:05:00.000Z"
};

test("library records include versioned identity and local state", () => {
  const record = createLibraryRecord(baseRecord);
  assert.equal(record.schemaVersion, "agentique.localLibraryRecord.v1");
  assert.equal(record.key, "example.visual-guide@0.1.0");
  assert.equal(record.digest, "e".repeat(64));
  assert.equal(record.permissionState.files, "denied");
  assert.equal(record.installState.status, "verified-only");
  assert.equal(record.cleanupState.status, "not-required");
});

test("library records reject inline sensitive fields and values", () => {
  assert.throws(
    () => createLibraryRecord({
      ...baseRecord,
      provenance: {
        ...baseRecord.provenance,
        authorization: "bearer demoSensitive12345"
      }
    }),
    /not allowed in the local library/u
  );
  assert.throws(
    () => createLibraryRecord({
      ...baseRecord,
      installState: {
        status: "verified-only",
        note: "secret-ref:local"
      }
    }),
    /contains inline sensitive material/u
  );
});

test("legacy library state migrates with rollback metadata", () => {
  const legacyState = {
    schemaVersion: "legacy.localLibrary.v0",
    resources: [
      {
        id: "example.visual-guide",
        title: "Example Visual Guide",
        version: "0.1.0",
        checksum: "e".repeat(64),
        mode: "visualizable",
        platforms: ["windows"],
        verifiedAt: "2026-06-11T00:05:00.000Z"
      }
    ]
  };

  const result = migrateLibraryState(legacyState);
  assert.equal(result.ok, true);
  assert.equal(result.state.schemaVersion, librarySchemaVersion);
  assert.equal(result.state.resources[0].key, "example.visual-guide@0.1.0");
  assert.equal(result.rollback.available, true);
  assert.deepEqual(result.rollback.previousState, legacyState);
});

test("failed migration preserves previous state for rollback", () => {
  const brokenState = {
    schemaVersion: "legacy.localLibrary.v0",
    resources: [{ id: "bad", version: "not-semver", checksum: "x", mode: "visualizable" }]
  };

  const result = migrateLibraryState(brokenState);
  assert.equal(result.ok, false);
  assert.equal(result.state, null);
  assert.equal(result.rollback.available, true);
  assert.deepEqual(result.rollback.previousState, brokenState);
});

test("upsert replaces matching resource versions and export stays bounded", () => {
  const firstState = upsertLibraryRecord(emptyLibraryState(), baseRecord);
  const nextState = upsertLibraryRecord(firstState, {
    ...baseRecord,
    title: "Renamed Visual Guide"
  });
  const exported = exportLibraryState(nextState, { exportedAt: "2026-06-11T00:06:00.000Z" });

  assert.equal(nextState.resources.length, 1);
  assert.equal(nextState.resources[0].title, "Renamed Visual Guide");
  assert.equal(exported.schemaVersion, librarySchemaVersion);
  assert.equal(exported.resources[0].title, "Renamed Visual Guide");
});

test("web storage adapter persists normalized library state", () => {
  const memory = new Map();
  const storage = {
    getItem(key) {
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      memory.set(key, value);
    },
    removeItem(key) {
      memory.delete(key);
    }
  };
  const adapter = createWebStorageLibraryAdapter(storage);
  const state = upsertLibraryRecord(emptyLibraryState(), baseRecord);

  adapter.save(state);
  assert.equal(adapter.load().resources[0].key, "example.visual-guide@0.1.0");

  adapter.clear();
  assert.equal(adapter.load().resources.length, 0);
});
