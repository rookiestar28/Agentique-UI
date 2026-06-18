import fs from "node:fs";
import path from "node:path";

export const workspaceFileBudgetsSchemaVersion = "agentique.workspaceFileBudgets.v1";

export const workspaceFileBudgets = [
  { path: "src/workspaces/TrustRunSettingsWorkspaces.tsx", maxLines: 40, role: "aggregate-shim" },
  { path: "src/workspaces/LibraryImportWorkspaces.tsx", maxLines: 40, role: "aggregate-shim" },
  { path: "src/workspaces/TrustRunSettingsTypes.ts", maxLines: 140, role: "shared-types" },
  { path: "src/workspaces/LibraryImportWorkspaceTypes.ts", maxLines: 360, role: "shared-types" },
  { path: "src/workspaces/VerifyWorkspace.tsx", maxLines: 170, role: "workspace" },
  { path: "src/workspaces/RunWorkspace.tsx", maxLines: 950, role: "workspace" },
  { path: "src/workspaces/SettingsWorkspace.tsx", maxLines: 220, role: "workspace" },
  { path: "src/workspaces/LibraryWorkspace.tsx", maxLines: 180, role: "workspace" },
  { path: "src/workspaces/ImportWorkspace.tsx", maxLines: 540, role: "workspace" },
  { path: "src/workspaces/GraphWorkspace.tsx", maxLines: 760, role: "workspace" },
  { path: "src/workspaces/GraphWorkspaceModel.ts", maxLines: 170, role: "shared-model" }
];

const aggregateShimContracts = [
  {
    path: "src/workspaces/TrustRunSettingsWorkspaces.tsx",
    requiredPhrases: ["export { VerifyWorkspace }", "export { RunWorkspace }", "export { SettingsWorkspace }"]
  },
  {
    path: "src/workspaces/LibraryImportWorkspaces.tsx",
    requiredPhrases: ["export { LibraryWorkspace }", "export { ImportWorkspace }"]
  }
];

const aggregateForbiddenPatterns = [/\buseI18n\b/u, /\buseState\b/u, /\buseMemo\b/u, /export function/u, /workspace-section/u, /runnerPermissionReview/u, /externalIntakeReport/u];

export function reviewWorkspaceFileBudgets({ root = process.cwd() } = {}) {
  const report = collectWorkspaceFileBudgetReport({ root });
  const validation = validateWorkspaceFileBudgetReport(report);
  return { report, validation };
}

export function collectWorkspaceFileBudgetReport({ root = process.cwd() } = {}) {
  const repoRoot = path.resolve(root);
  const files = workspaceFileBudgets.map((budget) => {
    const absolutePath = path.join(repoRoot, budget.path);
    const exists = fs.existsSync(absolutePath);
    const text = exists ? fs.readFileSync(absolutePath, "utf8") : "";
    return {
      ...budget,
      exists,
      lines: countLines(text),
      bytes: exists ? fs.statSync(absolutePath).size : 0
    };
  });

  return {
    schemaVersion: workspaceFileBudgetsSchemaVersion,
    files,
    aggregateShims: aggregateShimContracts.map((contract) => {
      const absolutePath = path.join(repoRoot, contract.path);
      const text = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
      return {
        path: contract.path,
        exists: fs.existsSync(absolutePath),
        requiredPhrasesPresent: contract.requiredPhrases.every((phrase) => text.includes(phrase)),
        forbiddenPatternMatches: aggregateForbiddenPatterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source)
      };
    })
  };
}

export function validateWorkspaceFileBudgetReport(report) {
  const failures = [];
  if (report?.schemaVersion !== workspaceFileBudgetsSchemaVersion) {
    failures.push(issue("schema-version", "Unsupported workspace file budget schema version."));
  }

  for (const file of report?.files ?? []) {
    if (!file.exists) {
      failures.push(issue("missing-file", `Workspace budget file is missing: ${file.path}`));
      continue;
    }
    if (file.lines > file.maxLines) {
      failures.push(issue("budget-exceeded", `${file.path} has ${file.lines} lines; maximum is ${file.maxLines}.`));
    }
  }

  for (const shim of report?.aggregateShims ?? []) {
    if (!shim.exists) {
      failures.push(issue("missing-shim", `Workspace aggregate shim is missing: ${shim.path}`));
      continue;
    }
    if (!shim.requiredPhrasesPresent) {
      failures.push(issue("shim-exports", `Workspace aggregate shim is missing required exports: ${shim.path}`));
    }
    if (shim.forbiddenPatternMatches.length > 0) {
      failures.push(issue("shim-contains-implementation", `Workspace aggregate shim contains implementation markers: ${shim.path}`));
    }
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    summary: {
      files: report?.files?.length ?? 0,
      aggregateShims: report?.aggregateShims?.length ?? 0,
      largestBudgetedFile: largestBudgetedFile(report?.files ?? [])
    }
  };
}

function largestBudgetedFile(files) {
  return files.slice().sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path))[0] ?? null;
}

function countLines(text) {
  if (!text) {
    return 0;
  }
  return text.split(/\r?\n/u).length;
}

function issue(code, message) {
  return { code, message };
}
