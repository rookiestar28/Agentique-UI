import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  collectI18nCatalogLoadingReport,
  expectedLocaleCodes,
  validateI18nCatalogLoadingReport
} from "../src/core/i18n-catalog-loading.mjs";
import {
  defaultLocale,
  getCatalogParityReport,
  loadAllLocaleCatalogs,
  loadLocaleCatalog,
  localeCatalogModulePaths,
  supportedLocales,
  translate
} from "../src/i18n/index.mjs";

test("i18n catalog modules split every supported locale out of the central facade", async () => {
  const report = collectI18nCatalogLoadingReport();
  const validation = validateI18nCatalogLoadingReport(report);
  assert.equal(validation.ok, true, JSON.stringify(validation.failures, null, 2));

  assert.deepEqual(supportedLocales.map((locale) => locale.code), expectedLocaleCodes);
  assert.equal(defaultLocale, "en");
  assert.equal(report.centralIndex.exportsAllMessagesObject, false);
  assert.ok(report.centralIndex.lines <= report.sourceBudget.centralIndexMaxLines);
  assert.ok(report.centralIndex.bytes <= report.sourceBudget.centralIndexMaxBytes);
  assert.deepEqual(
    report.centralIndex.dynamicImportLocales,
    expectedLocaleCodes.filter((locale) => locale !== "en").sort((a, b) => a.localeCompare(b))
  );

  for (const locale of expectedLocaleCodes) {
    assert.equal(fs.existsSync(localeCatalogModulePaths[locale]), true, locale);
  }

  const catalogs = await loadAllLocaleCatalogs();
  assert.deepEqual(Object.keys(catalogs), expectedLocaleCodes);
  assert.equal((await getCatalogParityReport()).ok, true);
});

test("catalog loading stays local-only and falls back to English for unsupported locales", async () => {
  await loadLocaleCatalog("zh-Hant");
  assert.equal(translate("zh-Hant", "navigation.settings"), "設定");
  assert.equal(translate("not-supported", "navigation.settings"), "Settings");

  const sourceFiles = [
    "src/i18n/index.mjs",
    "src/i18n/I18nProvider.tsx",
    ...expectedLocaleCodes.map((locale) => `src/i18n/catalogs/${locale}.mjs`)
  ];
  const source = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /XMLHttpRequest/u);
  assert.doesNotMatch(source, /navigator\.language/u);
  assert.doesNotMatch(source, /navigator\.languages/u);
  assert.doesNotMatch(source, /i18next|react-i18next|react-intl|@lingui/u);
});

test("catalog loading validation is wired into the full package validation chain", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.match(String(packageJson.scripts?.["validate:i18n-catalog-loading"] ?? ""), /check-i18n-catalog-loading\.mjs/u);
  assert.match(String(packageJson.scripts?.validate ?? ""), /validate:i18n-catalog-loading/u);
});
