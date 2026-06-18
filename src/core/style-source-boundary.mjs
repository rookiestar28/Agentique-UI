import fs from "node:fs";
import path from "node:path";

export const styleSourceBoundarySchemaVersion = "agentique.styleSourceBoundary.v1";

export const expectedStyleImports = [
  "./styles/00-tokens-base.css",
  "./styles/10-shell-workspace.css",
  "./styles/20-library-import-preview.css",
  "./styles/30-graph-run-contracts.css",
  "./styles/40-layout-hardening.css",
  "./styles/50-graph-editor.css",
  "./styles/60-runner-evidence.css",
  "./styles/90-motion-responsive.css"
];

const manifestPath = "src/styles.css";
const maxManifestLines = 20;
const maxShardLines = 700;
const forbiddenSelectorTokens = [
  "bento",
  "bento-grid",
  "card",
  "card-grid",
  "content-grid",
  "dashboard",
  "dashboard-grid",
  "lifecycle-rail",
  "metric-card",
  "page-panel",
  "stat-card",
  "status-card",
  "status-strip",
  "summary-card"
];

const requiredBundleAnchors = [
  ".workspace-page",
  ".workspace-stack",
  ".workspace-section",
  ".graph-layout",
  ".workflow-canvas",
  ".runner-control-panel",
  ".resource-browser",
  ".import-flow",
  ".preview-workspace",
  ".handoff-steps",
  ".descriptor-review",
  ".config-fields",
  ".vault-list",
  "focus-visible",
  "prefers-reduced-motion: reduce",
  "@media (max-width: 840px)",
  "overflow-wrap: anywhere",
  "text-overflow: ellipsis",
  "min-height: 44px"
];

export function collectStyleSourceFiles({ root = process.cwd() } = {}) {
  const repoRoot = path.resolve(root);
  const manifestFullPath = path.join(repoRoot, manifestPath);
  const manifestSource = fs.existsSync(manifestFullPath) ? fs.readFileSync(manifestFullPath, "utf8") : "";
  const imports = parseStyleImports(manifestSource);
  const files = [
    {
      path: manifestPath,
      role: "manifest",
      lines: countLines(manifestSource),
      bytes: fs.existsSync(manifestFullPath) ? fs.statSync(manifestFullPath).size : 0,
      imports
    }
  ];

  for (const importPath of imports) {
    const normalizedPath = path.posix.normalize(path.posix.join("src", importPath));
    const fullPath = path.join(repoRoot, normalizedPath);
    const source = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
    files.push({
      path: normalizedPath,
      role: "shard",
      lines: countLines(source),
      bytes: fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0,
      imports: []
    });
  }

  return files;
}

export function readStyleSourceBundle({ root = process.cwd() } = {}) {
  const repoRoot = path.resolve(root);
  const files = collectStyleSourceFiles({ root: repoRoot });
  return files.map((file) => fs.readFileSync(path.join(repoRoot, file.path), "utf8")).join("\n");
}

export function reviewStyleSourceBoundary({ root = process.cwd() } = {}) {
  const repoRoot = path.resolve(root);
  const files = collectStyleSourceFiles({ root: repoRoot });
  const manifest = files.find((file) => file.role === "manifest");
  const shards = files.filter((file) => file.role === "shard");
  const bundle = readStyleSourceBundle({ root: repoRoot });
  const report = {
    schemaVersion: styleSourceBoundarySchemaVersion,
    manifest: {
      path: manifestPath,
      lines: manifest?.lines ?? 0,
      maxLines: maxManifestLines,
      imports: manifest?.imports ?? [],
      expectedImports: expectedStyleImports
    },
    shards: shards.map((file) => ({
      path: file.path,
      lines: file.lines,
      maxLines: maxShardLines,
      bytes: file.bytes
    })),
    bundle: {
      lines: countLines(bundle),
      forbiddenSelectors: forbiddenSelectorTokens.filter((token) => selectorPattern(token).test(bundle)),
      missingAnchors: requiredBundleAnchors.filter((anchor) => !bundle.includes(anchor)),
      hasNegativeLetterSpacing: /letter-spacing\s*:\s*-/iu.test(bundle),
      hasViewportFontSize: /font-size\s*:[^;]*vw/iu.test(bundle),
      stylelintDependencyStatus: readStylelintDependencyStatus(repoRoot)
    }
  };
  const validation = validateStyleSourceBoundary(report);
  return {
    ...report,
    ok: validation.ok,
    status: validation.status,
    failures: validation.failures
  };
}

export function validateStyleSourceBoundary(report) {
  const failures = [];
  if (report?.schemaVersion !== styleSourceBoundarySchemaVersion) {
    failures.push(issue("schema-version", "Unsupported style source boundary schema version."));
  }
  if ((report?.manifest?.lines ?? 0) > maxManifestLines) {
    failures.push(issue("manifest-lines", `CSS manifest must stay at or below ${maxManifestLines} lines.`));
  }
  if (JSON.stringify(report?.manifest?.imports ?? []) !== JSON.stringify(expectedStyleImports)) {
    failures.push(issue("manifest-imports", "CSS manifest imports must match the approved ordered shard list."));
  }
  for (const shard of report?.shards ?? []) {
    if (shard.lines > maxShardLines) {
      failures.push(issue("shard-lines", `${shard.path} has ${shard.lines} lines; max is ${maxShardLines}.`));
    }
  }
  if ((report?.shards ?? []).length !== expectedStyleImports.length) {
    failures.push(issue("shard-count", "CSS shard count must match the approved import list."));
  }
  for (const selector of report?.bundle?.forbiddenSelectors ?? []) {
    failures.push(issue("forbidden-selector", `Forbidden page-level selector returned: .${selector}.`));
  }
  for (const anchor of report?.bundle?.missingAnchors ?? []) {
    failures.push(issue("missing-anchor", `CSS bundle is missing required layout anchor: ${anchor}.`));
  }
  if (report?.bundle?.hasNegativeLetterSpacing === true) {
    failures.push(issue("negative-letter-spacing", "Negative letter spacing is not allowed."));
  }
  if (report?.bundle?.hasViewportFontSize === true) {
    failures.push(issue("viewport-font-size", "Viewport-width font sizing is not allowed."));
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures
  };
}

function parseStyleImports(source) {
  return source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^@import\s+"([^"]+)";$/u);
      return match?.[1] ?? line;
    });
}

function readStylelintDependencyStatus(repoRoot) {
  const packagePath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(packagePath)) return "not-configured";
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {})
  };
  return Object.hasOwn(dependencies, "stylelint") ? "configured" : "deferred-to-lint-baseline";
}

function selectorPattern(className) {
  return new RegExp(`\\.${escapeRegExp(className)}\\b`, "u");
}

function countLines(text) {
  if (!text) return 0;
  return text.endsWith("\n") ? text.slice(0, -1).split("\n").length : text.split("\n").length;
}

function issue(code, message) {
  return { code, message };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
