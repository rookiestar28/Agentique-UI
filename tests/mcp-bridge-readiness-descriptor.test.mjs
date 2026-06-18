import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertMcpBridgeReadinessDescriptorSafe,
  createMcpBridgeReadinessDescriptor,
  mcpBridgeReadinessDescriptorSchemaVersion,
  reviewMcpBridgeReadinessDescriptorGate
} from "../src/core/mcp-bridge-readiness-descriptor.mjs";

const expectedModes = ["local", "remote"];

test("mcp bridge readiness descriptor validates local and remote trust states", () => {
  const review = createMcpBridgeReadinessDescriptor();
  const modes = review.servers.map((server) => server.trust.mode);

  assert.equal(review.schemaVersion, mcpBridgeReadinessDescriptorSchemaVersion);
  assert.deepEqual(modes, expectedModes);
  assert.equal(review.summary.serverRows, expectedModes.length);

  for (const server of review.servers) {
    assert.match(server.identity.serverId, /^mcp\.[a-z0-9.-]+$/u);
    assert.equal(server.identity.protocolVersion, "2025-06-18");
    assert.ok(["local-review-required", "remote-auth-review-required"].includes(server.trust.state));
    assert.equal(server.capabilities.tools.declared, true);
    assert.equal(server.capabilities.resources.declared, true);
    assert.equal(server.capabilities.prompts.declared, true);
    assert.equal(server.authority.startsServer, false);
    assert.equal(server.authority.makesNetworkRequest, false);
    assert.equal(server.authority.invokesTools, false);
  }
});

test("mcp readiness rows list tools resources and prompts as metadata only", () => {
  const review = createMcpBridgeReadinessDescriptor();

  for (const server of review.servers) {
    assert.ok(server.listings.tools.length >= 1);
    assert.ok(server.listings.resources.length >= 1);
    assert.ok(server.listings.prompts.length >= 1);
    for (const tool of server.listings.tools) {
      assert.equal(tool.metadataOnly, true);
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.outputSchema.type, "object");
      assert.equal(tool.annotationsTrusted, false);
      assert.equal(tool.invocation.autoInvoke, false);
      assert.equal(tool.invocation.requiresUserConfirmation, true);
    }
    for (const resource of server.listings.resources) {
      assert.equal(resource.metadataOnly, true);
      assert.equal(resource.readAllowed, false);
      assert.match(resource.uri, /^(resource|https):\/\//u);
    }
    for (const prompt of server.listings.prompts) {
      assert.equal(prompt.metadataOnly, true);
      assert.equal(prompt.getAllowed, false);
      assert.equal(prompt.userSelectable, true);
    }
  }
});

test("mcp readiness gates credential references and user actions without raw material", () => {
  const review = createMcpBridgeReadinessDescriptor();

  for (const server of review.servers) {
    assert.equal(server.credentials.mode, "vault-reference-only");
    assert.match(server.credentials.vaultRef, /^vault:mcp[A-Za-z0-9._-]+$/u);
    assert.equal(server.credentials.containsMaterial, false);
    assert.equal(server.authPolicy.tokenPassthrough, false);
    assert.equal(server.authPolicy.accessTokenInQuery, false);
    assert.equal(server.audit.redacted, true);
    assert.equal(server.audit.receiptRequired, true);
    assert.match(server.audit.receipt, /^evidence\/mcp\//u);

    for (const gate of Object.values(server.userActionGates)) {
      assert.equal(gate.required, true);
      assert.equal(gate.automatic, false);
    }
  }
});

test("unsafe mcp bridge readiness samples fail closed before launch", () => {
  const review = createMcpBridgeReadinessDescriptor();
  const reasons = new Set(review.blockedSamples.map((sample) => sample.reason));

  for (const reason of [
    "unsafe-tool-schema",
    "missing-auth-policy",
    "broad-filesystem-claim",
    "broad-network-claim",
    "credential-material",
    "automatic-tool-invocation",
    "resource-read-before-approval",
    "prompt-get-before-selection",
    "token-passthrough",
    "insecure-remote-uri",
    "ssrf-prone-metadata",
    "local-startup-command",
    "package-lifecycle",
    "browser-data",
    "missing-user-action",
    "local-absolute-path"
  ]) {
    assert.equal(reasons.has(reason), true, reason);
  }

  assert.equal(
    review.blockedSamples.every((sample) => sample.accepted === false && sample.launched === false),
    true
  );
});

test("mcp bridge readiness review passes and remains browser safe", () => {
  const validation = reviewMcpBridgeReadinessDescriptorGate();
  const moduleText = fs.readFileSync("src/core/mcp-bridge-readiness-descriptor.mjs", "utf8");

  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(validation.checks.serverRows, expectedModes.length);
  assert.equal(validation.checks.localRows, 1);
  assert.equal(validation.checks.remoteRows, 1);
  assert.equal(validation.checks.toolRows, 4);
  assert.equal(validation.checks.resourceRows, 4);
  assert.equal(validation.checks.promptRows, 4);
  assert.equal(validation.checks.vaultReferenceRows, 2);
  assert.equal(validation.checks.auditReceiptRows, 2);
  assert.equal(validation.checks.blockedBeforeLaunch, 16);
  assert.equal(validation.checks.automaticToolInvocations, 0);
  assert.equal(validation.checks.rawCredentialRows, 0);
  assert.equal(validation.checks.broadFilesystemRows, 0);
  assert.equal(validation.checks.broadNetworkRows, 0);
  assert.doesNotMatch(moduleText, /node:child_process|child_process|node:fs|writeFile|appendFile|createWriteStream|spawn\(|execFile\(|exec\(|fetch\(|WebSocket\(|invoke\(/u);
});

test("mcp readiness safety rejects raw credentials commands paths and live calls", () => {
  for (const unsafe of [
    { output: ["C", ":\\tmp\\mcp.json"].join("") },
    { output: "Authorization: Bearer abcdefghijklmnop" },
    { output: "client_secret=visible" },
    { output: "cookie=session" },
    { output: "browser profile import" },
    { output: "npm run mcp-server" },
    { output: "tools/call weather" },
    { output: "resources/read resource://workspace" },
    { output: "prompts/get deploy" }
  ]) {
    assert.throws(() => assertMcpBridgeReadinessDescriptorSafe(unsafe), /unsafe material|inline sensitive material/u);
  }
});
