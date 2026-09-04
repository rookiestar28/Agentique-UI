#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectEvidenceText } from "../src/core/evidence-redaction-boundary.mjs";

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

export function scanPublicBoundary(repoRoot) {
  const findings = [];
  const files = listFiles(repoRoot);
  for (const filePath of files) {
    const rel = path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
    const text = fs.readFileSync(filePath, "utf8");
    for (const rule of forbidden) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(text)) {
        findings.push({ file: rel, rule: rule.id });
      }
    }
    const decodedInternal = inspectEvidenceText(text).findings.some((finding) => finding.code === "internal-reference" && finding.encoding);
    if (decodedInternal) {
      findings.push({ file: rel, rule: "encoded-internal-marker" });
    }
  }
  return { status: findings.length === 0 ? "passed" : "failed", checkedFiles: files.length, findings };
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url))) {
  const report = scanPublicBoundary(process.cwd());
  if (report.findings.length > 0) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(report, null, 2));
}

function listFiles(dir) {
  try {
    // IMPORTANT: public scans cover tracked files plus non-ignored candidate files. Scanning
    // ignored local governance/runtime material would both cross the publication boundary and
    // make an intentionally private file look like part of the public candidate.
    // IMPORTANT: an ignored candidate below a parent worktree still makes Git report success,
    // but `ls-files` is empty there. Require the scan root to be the actual Git top-level or an
    // exact-candidate scan can silently inspect zero files.
    const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (path.resolve(gitRoot).toLowerCase() !== path.resolve(dir).toLowerCase()) {
      return listFilesRecursively(dir);
    }
    const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: dir,
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 16 * 1024 * 1024
    });
    return output
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .filter((relative) => isTextFile(path.basename(relative)))
      .map((relative) => path.resolve(dir, relative))
      .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile());
  } catch {
    return listFilesRecursively(dir);
  }
}

function listFilesRecursively(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFilesRecursively(full));
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
