import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  createInitialExternalIntakeReport,
  externalIntakeSchemaVersion,
  sampleBlockedExternalIntakeFiles,
  sampleExternalIntakeFiles,
  scanExternalIntakeFiles
} from "../src/core/companion-external-intake-scanner.mjs";

test("external intake scanner emits local v1 reports without execution or absolute paths", async () => {
  const report = await scanExternalIntakeFiles(sampleExternalIntakeFiles, { sourceLabel: "safe candidate" });

  assert.equal(report.schemaVersion, externalIntakeSchemaVersion);
  assert.equal(report.command, "external-intake");
  assert.equal(report.decision, "passed");
  assert.equal(report.boundary.localOnly, true);
  assert.equal(report.boundary.noExecution, true);
  assert.equal(report.boundary.noNetwork, true);
  assert.equal(report.boundary.noUpload, true);
  assert.deepEqual(
    report.inventory.map((item) => item.path),
    ["LICENSE", "nested/run-if-executed.js", "README.md"]
  );
  assert.equal(report.licenses[0].normalized, "MIT");
  assertFindings(report, ["license.allowed"]);
  assertNoUnsafeSerializedText(report, ["would-run.txt", ["C:", "Users"].join("\\"), "/home/"]);
});

test("external intake scanner enforces file and byte thresholds", async () => {
  const report = await scanExternalIntakeFiles([
    file("a.txt", "alpha\n"),
    file("b.txt", "bravo\n")
  ], {
    maxFiles: 1,
    maxBytes: 1
  });

  assert.equal(report.decision, "blocked");
  assert.equal(report.summary.files, 2);
  assert.equal(report.summary.bytes, 12);
  assertFindings(report, ["repo.max-files", "repo.max-bytes", "license.missing"]);
});

test("external intake scanner blocks companion metadata, payload, script, license, and secret findings", async () => {
  const report = await scanExternalIntakeFiles(sampleBlockedExternalIntakeFiles, { sourceLabel: "blocked candidate" });
  const categories = new Set(
    report.findings.filter((finding) => finding.code === "dangerous.capability").map((finding) => finding.details.category)
  );
  const secret = report.findings.find((finding) => finding.code === "secret.detected");

  assert.equal(report.decision, "blocked");
  assertFindings(report, [
    "repo.submodule-config",
    "repo.lfs-attributes",
    "repo.lfs-pointer",
    "payload.archive",
    "script.workflow-run",
    "script.lifecycle",
    "script.package-script",
    "dangerous.capability",
    "secret.detected",
    "license.blocked"
  ]);
  assert.equal(categories.has("download-pipe-execute"), true);
  assert.equal(categories.has("self-hosted-runner"), true);
  assert.equal(categories.has("unpinned-reference"), true);
  assert.match(secret?.details.fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(secret?.details.redacted, "[redacted:assignment-secret]");
  assertNoUnsafeSerializedText(report, ["zzzzzzzzzzzzzzzz", "api_key=\""]);
});

test("external intake scanner applies license policies and conflicts", async () => {
  const allowed = await scanExternalIntakeFiles([file("package.json", JSON.stringify({ license: "MIT OR Apache-2.0" }))]);
  const needsReview = await scanExternalIntakeFiles([file("package.json", JSON.stringify({ license: "LGPL-3.0-only" }))]);
  const conflict = await scanExternalIntakeFiles([
    file("LICENSE", "MIT License\n\nPermission is hereby granted.\n"),
    file("package.json", JSON.stringify({ license: "Apache-2.0" }))
  ]);
  const unknown = await scanExternalIntakeFiles([file("LICENSE", "Custom internal sharing terms.\n")]);

  assert.equal(allowed.decision, "passed");
  assertFindings(allowed, ["license.allowed"]);
  assert.equal(needsReview.decision, "blocked");
  assertFindings(needsReview, ["license.needs-review"]);
  assert.equal(conflict.decision, "blocked");
  assertFindings(conflict, ["license.conflict"]);
  assert.equal(unknown.decision, "blocked");
  assertFindings(unknown, ["license.unknown"]);
});

test("external intake scanner blocks truncated and unreadable high-risk inspection", async () => {
  const lateSecret = await scanExternalIntakeFiles([
    file("LICENSE", "MIT License\n\nPermission is hereby granted.\n"),
    file("late-secret.txt", `${"a".repeat(80)}\napi_key="${"z".repeat(16)}"\n`)
  ], {
    secretTextReadLimitBytes: 64
  });
  const unreadable = await scanExternalIntakeFiles([
    { name: "LICENSE", path: "LICENSE", content: "MIT License\n\nPermission is hereby granted.\n" },
    { name: "blocked.sh", path: "scripts/blocked.sh", size: 16, readError: true }
  ]);

  assert.equal(lateSecret.decision, "blocked");
  assertFindings(lateSecret, ["secret.truncated"]);
  assert.equal(unreadable.decision, "blocked");
  assertFindings(unreadable, ["payload.read-file", "script.read-file", "dangerous.read-file", "secret.read-file"]);
});

test("external intake scanner redacts unsafe input paths and private labels", async () => {
  const privateRoot = ["C:", "Users", "example", "repo"].join("\\");
  const report = await scanExternalIntakeFiles([
    file(`${privateRoot}\\LICENSE`, "MIT License\n\nPermission is hereby granted.\n"),
    file("../private/notes.txt", "notes\n")
  ], {
    sourceLabel: privateRoot
  });

  assert.equal(report.decision, "blocked");
  assertFindings(report, ["intake.unsafe-path"]);
  assert.equal(report.source.label, "[redacted:path]");
  assertNoUnsafeSerializedText(report, [privateRoot, "../private"]);
});

test("initial external intake report is not-run and advisory only", () => {
  const report = createInitialExternalIntakeReport();

  assert.equal(report.decision, "not-run");
  assert.equal(report.summary.files, 0);
  assert.equal(report.boundary.advisoryOnly, true);
  assert.equal(report.boundary.noArchiveExtraction, true);
});

test("external intake UI and docs expose local-only scanner boundaries", () => {
  const importState = fs.readFileSync("src/app-state/useImportWorkspaceState.ts", "utf8");
  const workspace = ["src/workspaces/LibraryImportWorkspaces.tsx", "src/workspaces/LibraryImportWorkspaceTypes.ts", "src/workspaces/LibraryWorkspace.tsx", "src/workspaces/ImportWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  const docs = fs.readFileSync("docs/contracts/companion-alignment.md", "utf8");

  for (const label of [
    "workspace.import.externalIntakeLabel",
    "workspace.import.runStaticScan",
    "Load blocked sample",
    "No-execution intake",
    "No-upload intake",
    "Redacted findings"
  ]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(importState, /scanExternalIntakeFiles/u);
  assert.match(docs, /browser-local external intake/u);
  assert.match(docs, /must not clone, fetch, install, build, run tests, execute workflows, start Docker, extract archives, upload, publish, approve, moderate, certify, or provide legal review/i);
});

function file(path, content) {
  return { name: path.split(/[\\/]/u).at(-1), path, content };
}

function assertFindings(report, expectedCodes) {
  const codes = new Set(report.findings.map((finding) => finding.code));
  for (const code of expectedCodes) {
    assert.equal(codes.has(code), true, `expected finding ${code}`);
  }
}

function assertNoUnsafeSerializedText(report, values) {
  const serialized = JSON.stringify(report);
  for (const value of values) {
    assert.equal(serialized.includes(value), false, `serialized report leaked ${value}`);
  }
}
