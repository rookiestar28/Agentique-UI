import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertNoEncodedSensitiveMaterial,
  evidenceRedactionSchemaVersion,
  inspectEvidenceText,
  requiredEvidenceProducers,
  sanitizeEvidenceValue,
  syntheticEvidenceCorpus,
  visualEvidenceManifest
} from "../src/core/evidence-redaction-boundary.mjs";
import { validateVisualEvidenceInventory } from "../src/core/evidence-redaction-visual.mjs";
import { scanPublicBoundary } from "../scripts/check-public-boundary.mjs";
import { reviewEvidenceRedactionIntegration } from "../scripts/check-evidence-redaction-boundary.mjs";

const rawMarkers = () => ({
  bearer: ["Bear", "er abcdefghijklmnop"].join(""),
  provider: ["s", "k-12345678901234567890"].join(""),
  github: ["gh", "p_12345678901234567890"].join(""),
  githubFine: ["github", "_pat_12345678901234567890"].join(""),
  google: ["ya", "29.1234567890abcdef"].join(""),
  cookie: ["cook", "ie=session-sensitive"].join(""),
  vault: ["va", "ult:providerCredential"].join(""),
  windowsPath: ["C", ":\\Users\\example\\private.txt"].join(""),
  unixPath: ["/ho", "me/example/private.txt"].join(""),
  internalPath: [".", "planning/private-record.md"].join(""),
  browserState: ["storage", "State=session-sensitive"].join(""),
  command: ["raw", "Command=powershell -encodedCommand unsafe"].join("")
});

test("synthetic evidence corpus is bounded and covers every required family", () => {
  const corpus = syntheticEvidenceCorpus();
  assert.equal(corpus.schemaVersion, evidenceRedactionSchemaVersion);
  assert.equal(corpus.realPrivateStateRead, false);
  assert.ok(corpus.entries.length >= 12);
  assert.deepEqual(
    new Set(corpus.entries.map((entry) => entry.family)),
    new Set(["secret-token", "credential", "browser-vault", "windows-path", "unix-path", "internal-marker", "process-authority", "encoded"])
  );
});

test("sanitization redacts every plaintext marker before export", () => {
  const markers = rawMarkers();
  const sanitized = sanitizeEvidenceValue({
    log: Object.values(markers).join(" | "),
    nested: [{ receipt: `${markers.bearer} ${markers.github} ${markers.windowsPath}` }]
  });
  const text = JSON.stringify(sanitized);
  for (const marker of Object.values(markers)) {
    assert.equal(text.includes(marker), false, marker);
  }
  assert.match(text, /redacted:(?:inline-sensitive-material|local-path|internal-reference|browser-material|process-authority|vault-reference)/u);
  assert.deepEqual(inspectEvidenceText(text).findings, []);
});

test("percent base64 and nested serialized unsafe variants fail closed", () => {
  const markers = rawMarkers();
  const percent = encodeURIComponent(markers.windowsPath);
  const base64 = Buffer.from(markers.bearer, "utf8").toString("base64");
  const nested = JSON.stringify({ payload: markers.cookie });

  assert.throws(() => assertNoEncodedSensitiveMaterial(percent), /encoded sensitive material/u);
  assert.throws(() => assertNoEncodedSensitiveMaterial(base64), /encoded sensitive material/u);
  assert.throws(() => assertNoEncodedSensitiveMaterial(nested), /serialized sensitive material/u);
});

test("producer matrix covers every required evidence and authority boundary", () => {
  assert.deepEqual(
    requiredEvidenceProducers.map((entry) => entry.id),
    [
      "logs",
      "events",
      "registry",
      "run-folder",
      "product-projection",
      "checkpoint",
      "evaluation",
      "receipts",
      "session-export",
      "support-bundle",
      "browser-screenshot",
      "public-scan"
    ]
  );
  assert.ok(requiredEvidenceProducers.every((entry) => entry.disposition === "redact-before-authority" || entry.disposition === "metadata-only"));
});

test("visual evidence inventory binds every PNG and rejects drift or unsafe metadata", () => {
  const root = process.cwd();
  const approved = validateVisualEvidenceInventory({ root });
  assert.equal(approved.ok, true);
  assert.equal(approved.files.length, visualEvidenceManifest.length);
  assert.equal(approved.pixelContentInspected, false);
  assert.equal(approved.ocrClaimed, false);

  const missing = validateVisualEvidenceInventory({ root, manifest: visualEvidenceManifest.slice(1) });
  assert.equal(missing.ok, false);
  assert.ok(missing.findings.some((finding) => finding.code === "visual.inventory-unexpected"));

  const drifted = structuredClone(visualEvidenceManifest);
  drifted[0].sha256 = "0".repeat(64);
  assert.equal(validateVisualEvidenceInventory({ root, manifest: drifted }).ok, false);
});

test("importable public scan rejects decoded sensitive text without reading private state", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentique-public-boundary-"));
  try {
    fs.writeFileSync(path.join(root, "safe.md"), "Public-safe evidence.\n", "utf8");
    assert.deepEqual(scanPublicBoundary(root).findings, []);

    const encoded = Buffer.from(rawMarkers().internalPath, "utf8").toString("base64");
    fs.writeFileSync(path.join(root, "unsafe.txt"), encoded, "utf8");
    const report = scanPublicBoundary(root);
    assert.ok(report.findings.some((finding) => finding.rule === "encoded-internal-marker"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("public scan recursively inspects an exact candidate nested below an ignored worktree directory", () => {
  const tempParent = path.join(process.cwd(), ".tmp");
  fs.mkdirSync(tempParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(tempParent, "public-boundary-candidate-"));
  try {
    fs.writeFileSync(path.join(root, "safe.md"), "Public-safe exact candidate.\n", "utf8");
    const report = scanPublicBoundary(root);
    assert.equal(report.status, "passed");
    assert.equal(report.checkedFiles, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("structural mutations reject delegation scanner and ordering regressions", () => {
  const sources = {
    secretVaultSource: fs.readFileSync("src/core/secret-vault.mjs", "utf8"),
    rustSource: fs.readFileSync("src-tauri/src/lib.rs", "utf8"),
    publicScannerSource: fs.readFileSync("scripts/check-public-boundary.mjs", "utf8"),
    packageSource: fs.readFileSync("package.json", "utf8"),
    contractSource: fs.readFileSync("docs/contracts/evidence-redaction-boundary.md", "utf8")
  };
  assert.equal(reviewEvidenceRedactionIntegration(sources).ok, true);

  const withoutDelegation = structuredClone(sources);
  withoutDelegation.secretVaultSource = withoutDelegation.secretVaultSource.replace("return redactEvidenceText(value)", "return String(value)");
  assert.equal(reviewEvidenceRedactionIntegration(withoutDelegation).ok, false);

  const truncateFirst = structuredClone(sources);
  truncateFirst.rustSource = truncateFirst.rustSource.replace("redact_bearer_tokens(value.to_string())", "redact_bearer_tokens(bounded_text(value))");
  assert.equal(reviewEvidenceRedactionIntegration(truncateFirst).ok, false);

  const withoutDecodedScan = structuredClone(sources);
  withoutDecodedScan.publicScannerSource = withoutDecodedScan.publicScannerSource.replace("encoded-internal-marker", "plain-only-marker");
  assert.equal(reviewEvidenceRedactionIntegration(withoutDecodedScan).ok, false);
});
