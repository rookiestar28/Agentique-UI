import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePermissionBatch,
  evaluatePermissionRequest,
  revokePermission,
  samplePermissionPolicy,
  samplePermissionRequests
} from "../src/core/permission-engine.mjs";

test("permission batch emits audit events for allow deny and ask decisions", () => {
  const batch = evaluatePermissionBatch(samplePermissionPolicy, samplePermissionRequests);
  assert.equal(batch.summary.allowed, 2);
  assert.equal(batch.summary.blocked, 2);
  assert.equal(batch.summary.promptRequired, 3);
  for (const result of batch.results) {
    assert.equal(result.audit.schemaVersion, undefined);
    assert.ok(result.audit.createdAt);
    assert.equal(result.audit.family, result.family);
  }
});

test("file permission allows scoped workspace reference", () => {
  const result = evaluatePermissionRequest(samplePermissionPolicy, {
    family: "files",
    action: "write",
    target: "workspace:outputs/example-visual-guide/result.json"
  });
  assert.equal(result.status, "allowed");
  assert.equal(result.code, "permission.allowed");
});

test("file permission blocks path traversal and out-of-scope references", () => {
  const traversal = evaluatePermissionRequest(samplePermissionPolicy, {
    family: "files",
    action: "read",
    target: "workspace:inputs/../secrets.txt"
  });
  const outside = evaluatePermissionRequest(samplePermissionPolicy, {
    family: "files",
    action: "read",
    target: "workspace:other-project/file.txt"
  });
  assert.equal(traversal.status, "blocked");
  assert.equal(traversal.code, "permission.path-traversal");
  assert.equal(outside.status, "blocked");
  assert.equal(outside.code, "permission.file-scope");
});

test("network permission enforces host and protocol allowlists", () => {
  const allowed = evaluatePermissionRequest(samplePermissionPolicy, {
    family: "network",
    action: "connect",
    target: "http://localhost:39123/health"
  });
  const hostBlocked = evaluatePermissionRequest(samplePermissionPolicy, {
    family: "network",
    action: "connect",
    target: "https://example.com/api"
  });
  assert.equal(allowed.status, "allowed");
  assert.equal(hostBlocked.status, "blocked");
  assert.equal(hostBlocked.code, "permission.host-allowlist");
});

test("shell environment and browser data are blocked by default", () => {
  for (const request of [
    { family: "shell", action: "spawn", target: "cmd" },
    { family: "environment", action: "read", target: "PATH" },
    { family: "browserData", action: "read", target: "browser:cookies" }
  ]) {
    const result = evaluatePermissionRequest(samplePermissionPolicy, request);
    assert.equal(result.status, "blocked");
  }
});

test("gpu container and external provider requests require prompt", () => {
  for (const request of [
    { family: "gpu", action: "request-device", target: "gpu:default" },
    { family: "containers", action: "start", target: "container:adapter-pack" },
    { family: "externalProviders", action: "connect", target: "vault:providerCredential" }
  ]) {
    const result = evaluatePermissionRequest(samplePermissionPolicy, request);
    assert.equal(result.status, "prompt-required");
  }
});

test("revocation blocks previously allowed permission", () => {
  const revoked = revokePermission(samplePermissionPolicy, "files");
  const result = evaluatePermissionRequest(revoked, {
    family: "files",
    action: "read",
    target: "workspace:inputs/example-visual-guide/input.json"
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.code, "permission.revoked");
});
