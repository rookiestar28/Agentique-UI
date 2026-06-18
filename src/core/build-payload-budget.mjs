import fs from "node:fs";
import path from "node:path";

export const buildPayloadBudgetSchemaVersion = "agentique.buildPayloadBudget.v1";

export const buildPayloadBudgets = Object.freeze({
  largestJavaScriptBytes: 500_000,
  largestImageBytes: 50_000,
  largestCssBytes: 80_000,
  largestSourceMapBytes: 1_600_000,
  minJavaScriptChunks: 4
});

export function reviewBuildPayloadBudget({ root = process.cwd() } = {}) {
  const report = collectBuildPayloadReport({ root });
  const validation = validateBuildPayloadReport(report);
  return { report, validation };
}

export function collectBuildPayloadReport({ root = process.cwd() } = {}) {
  const repoRoot = path.resolve(root);
  const assetsDir = path.join(repoRoot, "dist", "assets");
  const viteConfigSource = readTextIfExists(path.join(repoRoot, "vite.config.ts"));
  const files = fs.existsSync(assetsDir)
    ? fs
        .readdirSync(assetsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const filePath = path.join(assetsDir, entry.name);
          return {
            name: entry.name,
            path: `dist/assets/${entry.name}`,
            bytes: fs.statSync(filePath).size,
            kind: classifyBuildAsset(entry.name)
          };
        })
        .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
    : [];
  const summary = summarizeBuildAssets(files);

  return {
    schemaVersion: buildPayloadBudgetSchemaVersion,
    measured: fs.existsSync(assetsDir),
    distAssetsPath: "dist/assets",
    budgets: { ...buildPayloadBudgets },
    sourceMapPolicy: {
      explicit: /sourceMapPolicy/u.test(viteConfigSource),
      localInspection: /sourceMapPolicy\s*=\s*"local-inspection"/u.test(viteConfigSource),
      sourcemapBoundToPolicy: /sourcemap:\s*sourceMapPolicy\s*===\s*"local-inspection"/u.test(viteConfigSource)
    },
    files,
    summary
  };
}

export function validateBuildPayloadReport(report) {
  const failures = [];
  if (report?.schemaVersion !== buildPayloadBudgetSchemaVersion) {
    failures.push(issue("schema-version", "Unsupported build payload budget schema version."));
  }
  if (report?.measured !== true) {
    failures.push(issue("dist-assets-missing", "Run npm run build before validating build payload budgets."));
  }
  if (report?.sourceMapPolicy?.explicit !== true || report?.sourceMapPolicy?.localInspection !== true || report?.sourceMapPolicy?.sourcemapBoundToPolicy !== true) {
    failures.push(issue("sourcemap-policy", "Vite sourcemap policy must be explicit and bound to the local-inspection policy."));
  }

  const summary = report?.summary ?? {};
  requireAtLeast(summary.javascriptFiles, report?.budgets?.minJavaScriptChunks, "javascript-chunk-count", "Production build must emit route-level JavaScript chunks.", failures);
  requireAtMost(
    summary.largestJavaScriptBytes,
    report?.budgets?.largestJavaScriptBytes,
    "largest-javascript",
    "Largest emitted JavaScript chunk exceeds the Vite warning budget.",
    failures
  );
  requireAtMost(summary.largestImageBytes, report?.budgets?.largestImageBytes, "largest-image", "Largest emitted image exceeds the runtime image budget.", failures);
  requireAtMost(summary.largestCssBytes, report?.budgets?.largestCssBytes, "largest-css", "Largest emitted CSS asset exceeds the CSS budget.", failures);
  requireAtMost(
    summary.largestSourceMapBytes,
    report?.budgets?.largestSourceMapBytes,
    "largest-sourcemap",
    "Largest emitted source map exceeds the local inspection budget.",
    failures
  );

  const legacyLogo = (report?.files ?? []).find((file) => /logo-[\w-]+\.png$/u.test(file.name) && file.bytes > report.budgets.largestImageBytes);
  if (legacyLogo) {
    failures.push(issue("legacy-logo-image", `Runtime build still emits an oversized PNG logo: ${legacyLogo.path}.`));
  }

  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    summary: {
      files: report?.files?.length ?? 0,
      javascriptFiles: summary.javascriptFiles ?? 0,
      largestJavaScriptBytes: summary.largestJavaScriptBytes ?? 0,
      largestImageBytes: summary.largestImageBytes ?? 0,
      largestCssBytes: summary.largestCssBytes ?? 0,
      largestSourceMapBytes: summary.largestSourceMapBytes ?? 0
    }
  };
}

export function formatBuildPayloadBudgetReport(report, validation) {
  return {
    status: validation.status,
    schemaVersion: report.schemaVersion,
    measured: report.measured,
    budgets: report.budgets,
    sourceMapPolicy: report.sourceMapPolicy,
    summary: validation.summary,
    largestAssets: report.files.slice(0, 12),
    failures: validation.failures
  };
}

export function classifyBuildAsset(name) {
  if (/\.js$/u.test(name)) return "javascript";
  if (/\.css$/u.test(name)) return "css";
  if (/\.js\.map$/u.test(name) || /\.css\.map$/u.test(name)) return "sourcemap";
  if (/\.(?:png|jpe?g|webp|avif|gif|svg|ico)$/iu.test(name)) return "image";
  return "other";
}

function summarizeBuildAssets(files) {
  return {
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    javascriptFiles: countKind(files, "javascript"),
    cssFiles: countKind(files, "css"),
    imageFiles: countKind(files, "image"),
    sourcemapFiles: countKind(files, "sourcemap"),
    largestJavaScriptBytes: maxBytes(files, "javascript"),
    largestImageBytes: maxBytes(files, "image"),
    largestCssBytes: maxBytes(files, "css"),
    largestSourceMapBytes: maxBytes(files, "sourcemap")
  };
}

function requireAtMost(actual, expected, code, message, failures) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || actual > expected) {
    failures.push(issue(code, `${message} Actual ${actual ?? "unknown"} bytes, budget ${expected ?? "unknown"} bytes.`));
  }
}

function requireAtLeast(actual, expected, code, message, failures) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || actual < expected) {
    failures.push(issue(code, `${message} Actual ${actual ?? "unknown"}, minimum ${expected ?? "unknown"}.`));
  }
}

function countKind(files, kind) {
  return files.filter((file) => file.kind === kind).length;
}

function maxBytes(files, kind) {
  return Math.max(0, ...files.filter((file) => file.kind === kind).map((file) => file.bytes));
}

function readTextIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function issue(code, message) {
  return { code, message };
}
