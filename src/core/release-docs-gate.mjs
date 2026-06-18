import fs from "node:fs";
import { redactText } from "./secret-vault.mjs";

export const releaseDocsGateSchemaVersion = "agentique.releaseDocsGate.v1";

const privateMarkerPattern = new RegExp(`(?:${"R"}\\d{4}|\\.${"plan"}${"ning"}|${"reference"}/${"docs"}|REFERENCE/|[A-Za-z]:[\\\\/]|private Agentique core repository)`, "iu");

export function readReleaseDocsInputs({ specPath = "release/release-docs.spec.json", packagePath = "package.json" } = {}) {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const docs = Object.fromEntries(
    (spec.requiredDocs ?? []).map((doc) => [
      doc.path,
      {
        path: doc.path,
        text: fs.existsSync(doc.path) ? fs.readFileSync(doc.path, "utf8") : ""
      }
    ])
  );
  return { spec, packageJson, docs };
}

export function validateReleaseDocsGate({ spec, packageJson, docs } = readReleaseDocsInputs()) {
  const findings = [];
  const blockers = [];

  if (spec?.schemaVersion !== releaseDocsGateSchemaVersion) {
    findings.push(issue("docs.schema", "Release docs spec schema version is unsupported."));
  }
  if (!String(packageJson?.scripts?.["validate:release-docs"] ?? "").includes("validate-release-docs.mjs")) {
    findings.push(issue("docs.package-script", "package.json must expose release docs validation."));
  }

  const requiredDocs = Array.isArray(spec?.requiredDocs) ? spec.requiredDocs : [];
  for (const doc of requiredDocs) {
    const text = docs?.[doc.path]?.text ?? "";
    if (!text.trim()) {
      findings.push(issue("docs.missing", `Required release doc is missing or empty: ${doc.path}.`));
      continue;
    }
    if (privateMarkerPattern.test(text)) {
      findings.push(issue("docs.private-marker", `Release doc must not include private planning markers or local paths: ${doc.path}.`));
    }
    for (const phrase of doc.requiredPhrases ?? []) {
      if (!containsPhrase(text, phrase)) {
        findings.push(issue("docs.required-phrase", `Release doc ${doc.path} is missing required release posture phrase: ${phrase}.`));
      }
    }
  }

  const docsBundle = Object.values(docs ?? {})
    .map((doc) => doc.text)
    .join("\n");
  const evidence = [];
  for (const family of spec?.requiredEvidenceFamilies ?? []) {
    const matched = (family.terms ?? []).filter((term) => containsPhrase(docsBundle, term));
    evidence.push({ id: family.id, matchedTerms: matched });
    if (matched.length !== (family.terms ?? []).length) {
      findings.push(issue("docs.evidence-family", `Release docs are missing evidence family terms for ${family.id}.`));
    }
  }

  for (const claim of spec?.forbiddenClaims ?? []) {
    if (containsPhrase(docsBundle, claim)) {
      blockers.push(issue("docs.unsupported-claim", `Release docs include unsupported release claim: ${claim}.`));
    }
  }

  const ok = findings.length === 0;
  const ready = ok && blockers.length === 0;
  return {
    ok,
    ready,
    publicationAllowed: false,
    status: ready ? "ready" : "blocked",
    findings,
    blockers,
    summary: {
      docs: requiredDocs.length,
      evidenceFamilies: evidence.length,
      forbiddenClaims: spec?.forbiddenClaims?.length ?? 0,
      evidence
    }
  };
}

function containsPhrase(text, phrase) {
  return String(text).toLocaleLowerCase("en-US").includes(String(phrase).toLocaleLowerCase("en-US"));
}

function issue(code, message) {
  return { code, message: redactText(message) };
}
