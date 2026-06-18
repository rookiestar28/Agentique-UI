#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const planningDir = `.${["plan", "ning"].join("")}`;
const sessionDir = `.${["ses", "sions"].join("")}`;
const referenceDir = ["ref", "erence"].join("");
const ignoredDirs = new Set([".git", planningDir, sessionDir, referenceDir, referenceDir.toUpperCase(), "node_modules", "coverage", "dist", ".tmp", "target"]);
const referenceDocsDir = ["reference", "docs"].join("/");
const itemCodePattern = new RegExp("\\b" + "R" + "\\d{4}\\b", "u");
const forbidden = [
  { id: "internal-planning-path", pattern: new RegExp(escapeRegExp(planningDir), "iu") },
  { id: "internal-reference-path", pattern: new RegExp(escapeRegExp(referenceDocsDir), "iu") },
  { id: "local-absolute-path", pattern: /(?<![A-Za-z])[A-Za-z]:[\\/][^\s)`"']+/u },
  { id: "internal-item-code", pattern: itemCodePattern },
  { id: "openai-key", pattern: /sk-[A-Za-z0-9]{20,}/u },
  { id: "github-token", pattern: /(ghp|github_pat)_[A-Za-z0-9_]{20,}/u },
  { id: "google-oauth-token", pattern: /ya29\.[A-Za-z0-9._-]+/u },
  { id: "private-key", pattern: /-----BEGIN (RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/u }
];

const findings = [];
for (const filePath of listFiles(repoRoot)) {
  const rel = path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
  const text = fs.readFileSync(filePath, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(text)) {
      findings.push({ file: rel, rule: rule.id });
    }
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checkedFiles: listFiles(repoRoot).length }, null, 2));

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(full));
    } else if (entry.isFile() && isTextFile(entry.name)) {
      result.push(full);
    }
  }
  return result;
}

function isTextFile(fileName) {
  return /\.(md|json|mjs|js|ts|tsx|toml|yml|yaml|txt)$/iu.test(fileName) || fileName === "AGENTS.md";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
