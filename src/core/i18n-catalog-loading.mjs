import fs from "node:fs";
import path from "node:path";
import { hasValidationCommand } from "./validation-stage-reporting.mjs";

export const i18nCatalogLoadingSchemaVersion = "agentique.i18nCatalogLoading.v1";

export const expectedLocaleCodes = Object.freeze(["en", "zh-Hans", "zh-Hant", "ja", "ko", "de", "fr", "it", "es", "ru"]);

const sourceBudget = Object.freeze({
  centralIndexMaxLines: 320,
  centralIndexMaxBytes: 12000,
  minCatalogBytes: 1000
});

const forbiddenSourcePatterns = Object.freeze([
  { code: "remote-fetch", pattern: /\bfetch\s*\(/u },
  { code: "xml-http-request", pattern: /\bXMLHttpRequest\b/u },
  { code: "browser-language", pattern: /\bnavigator\.languages?\b/u },
  { code: "remote-catalog-url", pattern: /https?:\/\/|cdn\.|locales?\//iu },
  { code: "external-i18n-runtime", pattern: /i18next|react-i18next|react-intl|@lingui/u }
]);

export function reviewI18nCatalogLoading({ root = process.cwd() } = {}) {
  const report = collectI18nCatalogLoadingReport({ root });
  const validation = validateI18nCatalogLoadingReport(report);
  return { report, validation };
}

export function collectI18nCatalogLoadingReport({ root = process.cwd() } = {}) {
  const repoRoot = path.resolve(root);
  const indexPath = path.join(repoRoot, "src/i18n/index.mjs");
  const providerPath = path.join(repoRoot, "src/i18n/I18nProvider.tsx");
  const packagePath = path.join(repoRoot, "package.json");
  const indexSource = readText(indexPath);
  const providerSource = readText(providerPath);
  const packageJson = readJson(packagePath);
  const catalogFiles = expectedLocaleCodes.map((locale) => {
    const relPath = `src/i18n/catalogs/${locale}.mjs`;
    const filePath = path.join(repoRoot, relPath);
    const source = readText(filePath);
    return {
      locale,
      path: relPath,
      exists: fs.existsSync(filePath),
      bytes: source ? Buffer.byteLength(source, "utf8") : 0,
      lines: countLines(source),
      defaultExport: /export\s+default\s+messages/u.test(source)
    };
  });
  const dynamicImportLocales = [...indexSource.matchAll(/import\("\.\/catalogs\/([^"]+)\.mjs"\)/gu)].map((match) => match[1]).sort((a, b) => a.localeCompare(b));
  const catalogSource = catalogFiles.map((file) => readText(path.join(repoRoot, file.path))).join("\n");
  const allI18nSource = [indexSource, providerSource, catalogSource].join("\n");
  const forbiddenMatches = forbiddenSourcePatterns.filter((entry) => entry.pattern.test(allI18nSource)).map((entry) => entry.code);
  const distCatalogChunks = collectDistCatalogChunks(repoRoot);

  return {
    schemaVersion: i18nCatalogLoadingSchemaVersion,
    expectedLocaleCodes,
    sourceBudget,
    centralIndex: {
      path: "src/i18n/index.mjs",
      exists: fs.existsSync(indexPath),
      bytes: Buffer.byteLength(indexSource, "utf8"),
      lines: countLines(indexSource),
      importsEnglishCatalog: /from "\.\/catalogs\/en\.mjs"/u.test(indexSource),
      exportsAllMessagesObject: /export\s+const\s+messages\s*=/u.test(indexSource),
      dynamicImportLocales
    },
    provider: {
      path: "src/i18n/I18nProvider.tsx",
      usesCatalogLoader: /loadLocaleCatalog/u.test(providerSource),
      cachesCatalogs: /setCatalogs|catalogs\[/u.test(providerSource),
      usesEnglishFallback: /englishMessages/u.test(providerSource),
      writesHtmlMetadata: /document\.documentElement\.lang/u.test(providerSource) && /document\.documentElement\.dir/u.test(providerSource),
      usesBrowserStorage: /window\.localStorage/u.test(providerSource),
      usesBrowserLanguage: /navigator\.languages?/u.test(providerSource)
    },
    catalogFiles,
    packageScripts: {
      hasCatalogLoadingScript: Boolean(packageJson.scripts?.["validate:i18n-catalog-loading"]),
      validateIncludesCatalogLoading: hasValidationCommand("npm run validate:i18n-catalog-loading")
    },
    dist: distCatalogChunks,
    forbiddenMatches
  };
}

export function validateI18nCatalogLoadingReport(report) {
  const failures = [];
  if (report?.schemaVersion !== i18nCatalogLoadingSchemaVersion) {
    failures.push(issue("schema-version", "Unsupported i18n catalog loading schema version."));
  }
  if (report.centralIndex.lines > report.sourceBudget.centralIndexMaxLines) {
    failures.push(issue("central-index-lines", `Central i18n facade has ${report.centralIndex.lines} lines.`));
  }
  if (report.centralIndex.bytes > report.sourceBudget.centralIndexMaxBytes) {
    failures.push(issue("central-index-bytes", `Central i18n facade has ${report.centralIndex.bytes} bytes.`));
  }
  if (!report.centralIndex.importsEnglishCatalog) {
    failures.push(issue("english-fallback-catalog", "Central i18n facade must import the English fallback catalog."));
  }
  if (report.centralIndex.exportsAllMessagesObject) {
    failures.push(issue("all-messages-inline", "Central i18n facade must not export an inline all-locale messages object."));
  }
  const expectedDynamic = report.expectedLocaleCodes.filter((locale) => locale !== "en").sort((a, b) => a.localeCompare(b));
  if (JSON.stringify(report.centralIndex.dynamicImportLocales) !== JSON.stringify(expectedDynamic)) {
    failures.push(issue("dynamic-import-locales", `Non-default dynamic locale imports drifted: ${report.centralIndex.dynamicImportLocales.join(", ")}`));
  }
  for (const file of report.catalogFiles) {
    if (!file.exists) {
      failures.push(issue("missing-catalog", `Missing catalog file: ${file.path}`));
      continue;
    }
    if (file.bytes < report.sourceBudget.minCatalogBytes) {
      failures.push(issue("catalog-too-small", `Catalog file is unexpectedly small: ${file.path}`));
    }
    if (!file.defaultExport) {
      failures.push(issue("catalog-export", `Catalog file must default-export messages: ${file.path}`));
    }
  }
  if (!report.provider.usesCatalogLoader || !report.provider.cachesCatalogs || !report.provider.usesEnglishFallback) {
    failures.push(issue("provider-loader", "I18nProvider must load, cache, and fall back to local catalogs."));
  }
  if (!report.provider.writesHtmlMetadata || !report.provider.usesBrowserStorage) {
    failures.push(issue("provider-metadata-persistence", "I18nProvider must keep html metadata and local persistence behavior."));
  }
  if (report.provider.usesBrowserLanguage) {
    failures.push(issue("browser-language", "I18nProvider must not use browser-language autodetection."));
  }
  if (!report.packageScripts.hasCatalogLoadingScript || !report.packageScripts.validateIncludesCatalogLoading) {
    failures.push(issue("package-validation", "Catalog loading validation must be wired into package validation."));
  }
  for (const code of report.forbiddenMatches) {
    failures.push(issue(code, `Forbidden i18n source pattern found: ${code}`));
  }
  return {
    ok: failures.length === 0,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    summary: {
      centralIndexBytes: report.centralIndex.bytes,
      centralIndexLines: report.centralIndex.lines,
      catalogFiles: report.catalogFiles.filter((file) => file.exists).length,
      dynamicImportLocales: report.centralIndex.dynamicImportLocales.length,
      distMeasured: report.dist.measured,
      distLocaleChunks: report.dist.localeChunks.length
    }
  };
}

function collectDistCatalogChunks(repoRoot) {
  const assetsDir = path.join(repoRoot, "dist/assets");
  if (!fs.existsSync(assetsDir)) {
    return {
      measured: false,
      localeChunks: [],
      files: []
    };
  }
  const files = fs
    .readdirSync(assetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.js$/u.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      bytes: fs.statSync(path.join(assetsDir, entry.name)).size
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const localeChunks = expectedLocaleCodes.filter((locale) => locale !== "en").filter((locale) => files.some((file) => file.name.startsWith(`${locale}-`)));
  return {
    measured: true,
    localeChunks,
    files
  };
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function countLines(text) {
  if (!text) return 0;
  return text.split(/\r?\n/u).length - (text.endsWith("\n") ? 1 : 0);
}

function issue(code, message) {
  return { code, message };
}
