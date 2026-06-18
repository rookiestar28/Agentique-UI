#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import ts from "typescript";

import { workspaceCopyBoundary } from "../src/i18n/workspace-copy-boundary.mjs";

const failures = [];
let catalogBacked = 0;
let documentedUntranslated = 0;

const entries = new Map(workspaceCopyBoundary.files.map((entry) => [entry.path, entry]));

for (const entry of workspaceCopyBoundary.files) {
  if (!fs.existsSync(entry.path)) {
    failures.push(`workspace copy boundary file missing: ${entry.path}`);
    continue;
  }

  const source = fs.readFileSync(entry.path, "utf8");
  catalogBacked += countCatalogBackedCalls(source);

  const literals = extractVisibleLiterals(entry.path, source);
  documentedUntranslated += literals.length;
  const actualHash = hashLiterals(literals);

  if (entry.literalCount !== literals.length || entry.untranslatedHash !== actualHash) {
    failures.push(
      `${entry.path} untranslated visible literal boundary drift: expected ${entry.literalCount}/${entry.untranslatedHash || "<empty>"} actual ${literals.length}/${actualHash}`
    );
  }
}

for (const requiredFile of [
  "src/workspaces/LibraryWorkspace.tsx",
  "src/workspaces/ImportWorkspace.tsx",
  "src/workspaces/PreviewHandoffWorkspaces.tsx",
  "src/workspaces/GraphWorkspace.tsx",
  "src/workspaces/RunWorkspace.tsx",
  "src/workspaces/AdapterRegistryTrustPanel.tsx",
  "src/workspaces/PythonNodeAdapterPackExpansionPanel.tsx",
  "src/workspaces/RepoLocalTaskRunnerLanePanel.tsx",
  "src/workspaces/ExternalAgentClientPackExpansionPanel.tsx",
  "src/workspaces/McpBridgeReadinessPanel.tsx",
  "src/workspaces/WasmWasiSandboxGatePanel.tsx",
  "src/workspaces/RootlessContainerPreflightGatePanel.tsx",
  "src/workspaces/BrowserAutomationConsentGatePanel.tsx",
  "src/workspaces/LocalVaultSecretsPanel.tsx",
  "src/workspaces/DiagnosticsSupportBundlePanel.tsx",
  "src/workspaces/FunctionExpansionCloseoutPanel.tsx",
  "src/workspaces/VerifyWorkspace.tsx",
  "src/workspaces/SettingsWorkspace.tsx"
]) {
  if (!entries.has(requiredFile)) {
    failures.push(`workspace copy boundary missing required file: ${requiredFile}`);
  }
}

if (catalogBacked <= 0) {
  failures.push("workspace copy coverage found no catalog-backed workspace calls");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checkedFiles: workspaceCopyBoundary.files.length,
      catalogBacked,
      documentedUntranslated
    },
    null,
    2
  )
);

function extractVisibleLiterals(filePath, source) {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const literals = [];

  function add(node, value) {
    const normalized = normalizeLiteral(value);
    if (!normalized || shouldIgnoreValue(normalized)) return;
    literals.push(normalized);
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      add(node, node.getText(sourceFile));
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (isVisibleAttribute(name) && node.initializer && ts.isStringLiteral(node.initializer)) {
        add(node.initializer, node.initializer.text);
      }
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isVisibleJsxExpressionLiteral(node)) {
      add(node, node.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return Array.from(new Set(literals)).sort((a, b) => a.localeCompare(b));
}

function isVisibleJsxExpressionLiteral(node) {
  if (isMessageIdLiteral(node.text)) return false;

  let current = node.parent;
  while (current) {
    if (ts.isCallExpression(current) && current.expression.getText() === "t") return false;
    if (ts.isJsxAttribute(current)) return isVisibleAttribute(current.name.getText());
    if (ts.isJsxExpression(current)) return true;
    current = current.parent;
  }
  return false;
}

function isVisibleAttribute(name) {
  return ["aria-label", "alt", "placeholder", "title"].includes(name);
}

function normalizeLiteral(value) {
  return String(value).replace(/\s+/gu, " ").trim();
}

function shouldIgnoreValue(value) {
  if (isMessageIdLiteral(value)) return true;
  if (/^[./#\-%]+$/u.test(value)) return true;
  if (/^#[0-9a-f]{3,8}$/iu.test(value)) return true;
  if (/^--[a-z0-9-]+$/iu.test(value)) return true;
  if (/^[a-z0-9_-]+$/u.test(value) && value.length <= 3) return true;
  return false;
}

function isMessageIdLiteral(value) {
  return /^(app|shell|navigation|page|command|settings|workspace|common)\.[a-z0-9.-]+$/u.test(String(value));
}

function countCatalogBackedCalls(source) {
  return [...source.matchAll(/\bt\("workspace\.[a-z0-9.]+"/gu)].length;
}

function hashLiterals(literals) {
  return crypto.createHash("sha256").update(literals.join("\n")).digest("hex");
}
