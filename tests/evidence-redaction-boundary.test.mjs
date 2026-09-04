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
  syntheticEvidenceCorpus
} from "../src/core/evidence-redaction-boundary.mjs";
import { scanPublicBoundary } from "../scripts/check-public-boundary.mjs";

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
