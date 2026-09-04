#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evidenceRedactionSchemaVersion, requiredEvidenceProducers, sanitizeEvidenceValue, syntheticEvidenceCorpus } from "../src/core/evidence-redaction-boundary.mjs";
import { validateVisualEvidenceInventory } from "../src/core/evidence-redaction-visual.mjs";

export function reviewEvidenceRedactionIntegration(sources) {
  const failures = [];
  requireIncludes(
    sources.secretVaultSource,
    ["./evidence-redaction-boundary.mjs", "return redactEvidenceText(value)", "assertNoEncodedSensitiveMaterialForValue(value)"],
    "shared vault/export integration",
    failures
  );
  requireIncludes(
    sources.rustSource,
    ["percent_decode_bounded", "decode_base64_bounded", "contains_unsafe_projection_material(&bytes)", "redacted:internal-reference"],
    "native persistence boundary",
    failures
  );
  const redactStart = sources.rustSource.indexOf("fn redact_runner_text");
  const redactBefore = sources.rustSource.indexOf("redact_bearer_tokens(value.to_string())", redactStart);
  const truncateAfter = sources.rustSource.indexOf("bounded_text(&text)", redactStart);
  if (redactStart < 0 || redactBefore < redactStart || truncateAfter < redactBefore) {
    failures.push("native evidence must redact before truncation");
  }
  requireIncludes(sources.publicScannerSource, ["export function scanPublicBoundary", "inspectEvidenceText", "encoded-internal-marker"], "importable public scanner", failures);
  requireIncludes(
    sources.contractSource,
    ["Redact before authority", "Encoded input fails closed", "Metadata provenance only", "No runtime authority"],
    "public evidence contract",
    failures
  );
  const scripts = JSON.parse(sources.packageSource).scripts ?? {};
  if (!String(scripts["validate:evidence-redaction-boundary"] ?? "").includes("check-evidence-redaction-boundary.mjs")) {
    failures.push("package scripts must define the evidence redaction validator");
  }
  if (!String(scripts["validate:diagnostics-support-bundle"] ?? "").includes("validate:evidence-redaction-boundary")) {
    failures.push("the existing diagnostics validation stage must include the evidence redaction gate");
  }
  return { ok: failures.length === 0, failures };
}

export function validateEvidenceRedactionBoundary(root = process.cwd()) {
  const sources = {
    secretVaultSource: read(root, "src/core/secret-vault.mjs"),
    rustSource: read(root, "src-tauri/src/lib.rs"),
    publicScannerSource: read(root, "scripts/check-public-boundary.mjs"),
    packageSource: read(root, "package.json"),
    contractSource: read(root, "docs/contracts/evidence-redaction-boundary.md")
  };
  const integration = reviewEvidenceRedactionIntegration(sources);
  const corpus = syntheticEvidenceCorpus();
  const plainEntries = corpus.entries.filter((entry) => entry.family !== "encoded");
  const sanitized = sanitizeEvidenceValue(plainEntries.map((entry) => entry.value));
  const visual = validateVisualEvidenceInventory({ root });
  const failures = [...integration.failures];
  if (corpus.schemaVersion !== evidenceRedactionSchemaVersion || corpus.realPrivateStateRead !== false) {
    failures.push("synthetic corpus identity or private-state boundary drifted");
  }
  if (requiredEvidenceProducers.length !== 12) failures.push("the required evidence producer matrix is incomplete");
  if (JSON.stringify(sanitized).includes("session-sensitive")) failures.push("seeded material survived shared sanitization");
  if (!visual.ok) failures.push(...visual.findings.map((finding) => `${finding.code}: ${finding.path}`));
  return {
    status: failures.length === 0 ? "passed" : "failed",
    schemaVersion: evidenceRedactionSchemaVersion,
    producerCount: requiredEvidenceProducers.length,
    corpusEntries: corpus.entries.length,
    visualFiles: visual.files.length,
    pixelContentInspected: visual.pixelContentInspected,
    ocrClaimed: visual.ocrClaimed,
    failures
  };
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url))) {
  const report = validateEvidenceRedactionBoundary();
  const output = JSON.stringify(report, null, 2);
  if (report.status === "failed") {
    console.error(output);
    process.exit(1);
  }
  console.log(output);
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split("/")), "utf8");
}

function requireIncludes(text, phrases, label, failures) {
  for (const phrase of phrases) {
    if (!text.includes(phrase)) failures.push(`${label} missing required phrase: ${phrase}`);
  }
}
