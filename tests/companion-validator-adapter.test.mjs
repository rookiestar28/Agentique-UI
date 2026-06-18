import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assertNoExecutionValidatorProof,
  createCompanionValidatorImportProof,
  normalizeCompanionValidatorReport,
  sampleCompanionValidatorReport,
  sampleInvalidCompanionValidatorReport
} from "../src/core/companion-validator-adapter.mjs";

test("valid companion validator report creates accepted no-execution import proof", () => {
  const proof = createCompanionValidatorImportProof(sampleCompanionValidatorReport);
  assert.equal(proof.ok, true);
  assert.equal(proof.decision, "accepted");
  assert.equal(proof.summary.findingCount, 0);
  assert.equal(proof.summary.inventoryFiles, 2);
  assert.equal(proof.summary.parserVariantState, "ready");
  assert.equal(proof.summary.agentNativeState, "ready");
  assert.deepEqual(assertNoExecutionValidatorProof(proof), { ok: true, issues: [] });
  assert.deepEqual(proof.noExecution.sideEffects, []);
});

test("invalid companion validator report groups actionable blocked proof categories", () => {
  const proof = createCompanionValidatorImportProof(sampleInvalidCompanionValidatorReport);
  const categories = new Map(proof.categories.map((category) => [category.label, category]));
  assert.equal(proof.ok, false);
  assert.equal(proof.decision, "blocked");
  assert.equal(categories.get("Hash/inventory").status, "blocked");
  assert.equal(categories.get("Path/lifecycle").status, "blocked");
  assert.equal(categories.get("Secret/redaction").status, "blocked");
  assert.equal(categories.get("Overclaim gate").status, "blocked");
  assert.equal(categories.get("Parser variant").status, "blocked");
  assert.equal(categories.get("Agent-native").status, "blocked");
});

test("malformed companion validator reports fail closed", () => {
  const normalized = normalizeCompanionValidatorReport(null);
  const proof = createCompanionValidatorImportProof({ ok: true, command: "submit", findings: "none" });
  assert.equal(normalized.ok, false);
  assert.ok(normalized.findings.some((finding) => finding.code === "validator.report-malformed"));
  assert.equal(proof.ok, false);
  assert.ok(proof.report.findings.some((finding) => finding.code === "validator.command-unsupported"));
});

test("companion validator proof redacts paths internal markers and secret-like values", () => {
  const secretValue = ["sk-", "a".repeat(24)].join("");
  const localPath = ["C", ":", "\\", "Users", "\\", "someone", "\\", "secret.txt"].join("");
  const internalPath = [".", "planning", "/", "private-note.md"].join("");
  const proof = createCompanionValidatorImportProof({
    ok: false,
    command: "validate",
    packageDir: localPath,
    manifest: { name: "redaction-case", formatVersion: "1.0" },
    inventory: [{ path: "README.md", sha256: "c".repeat(64), bytes: 10 }],
    findings: [
      {
        code: "assignment-secret",
        message: `Secret-like value detected: ${secretValue}`,
        location: localPath
      },
      {
        code: "internal-path",
        message: `Forbidden internal path ${internalPath}`,
        location: internalPath
      }
    ]
  });
  const serialized = JSON.stringify(proof);
  assert.doesNotMatch(serialized, new RegExp(secretValue, "u"));
  assert.doesNotMatch(serialized, new RegExp(localPath.replace(/\\/gu, "\\\\"), "u"));
  assert.doesNotMatch(serialized, new RegExp(["\\.", "planning"].join(""), "u"));
  assert.match(serialized, /redacted:secret/u);
  assert.match(serialized, /redacted:path/u);
  assert.match(serialized, /redacted:internal/u);
});

test("parser variant and agent-native review states fail closed without execution", () => {
  const proof = createCompanionValidatorImportProof(sampleInvalidCompanionValidatorReport);
  assert.equal(proof.summary.parserVariantState, "review-required");
  assert.equal(proof.summary.agentNativeState, "review-required");
  assert.deepEqual(assertNoExecutionValidatorProof(proof), { ok: true, issues: [] });
  assert.equal(proof.noOverclaim.platformApproval, false);
  assert.equal(proof.noOverclaim.safetyCertification, false);
  assert.equal(proof.noOverclaim.platformDownloadAvailability, false);
});

test("companion validator UI and docs expose import proof without approval claims", () => {
  const app = fs.readFileSync("src/workspaces/routes/LibraryWorkspaceAndImportWorkspaceRoute.tsx", "utf8");
  const workspace = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  const docs = fs.readFileSync("docs/contracts/companion-alignment.md", "utf8");
  assert.match(app, /createCompanionValidatorImportProof/u);
  for (const label of [
    "Validator import proof",
    "Manifest/schema",
    "Hash/inventory",
    "Secret/overclaim gate",
    "Parser/agent-native proof",
    "No-execution validator"
  ]) {
    assert.match(workspace, new RegExp(label, "u"));
  }
  assert.match(docs, /Validator Import Proof Boundary/u);
  assert.match(docs, /must not run package lifecycle scripts/u);
  assert.match(docs, /not platform approval/u);
});
