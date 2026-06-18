import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  createTranslator,
  defaultLocale,
  englishMessages,
  flattenMessageKeys,
  formatMessage,
  getCatalogParityReport,
  isSupportedLocale,
  localeStorageKey,
  loadAllLocaleCatalogs,
  normalizeLocale,
  readPersistedLocale,
  supportedLocales,
  writePersistedLocale
} from "../src/i18n/index.mjs";

const requestedLocales = ["en", "zh-Hans", "zh-Hant", "ja", "ko", "de", "fr", "it", "es", "ru"];
const loadedMessages = await loadAllLocaleCatalogs();

test("locale metadata exactly covers the initial supported locale contract", () => {
  assert.equal(defaultLocale, "en");
  assert.equal(localeStorageKey, "agentique.ui.locale.v1");
  assert.deepEqual(supportedLocales.map((locale) => locale.code), requestedLocales);
  assert.equal(new Set(supportedLocales.map((locale) => locale.code)).size, requestedLocales.length);

  for (const locale of supportedLocales) {
    assert.equal(locale.dir, "ltr");
    assert.equal(locale.enabled, true);
    assert.match(locale.englishName, /\S/u);
    assert.match(locale.nativeName, /\S/u);
  }
});

test("locale normalization fails closed to English without browser-language autodetection", () => {
  for (const locale of requestedLocales) {
    assert.equal(isSupportedLocale(locale), true);
    assert.equal(normalizeLocale(locale), locale);
  }

  for (const invalid of [undefined, null, "", "en-US", "zh", "fr-FR", "ar", "../en", "ru<script>"]) {
    assert.equal(isSupportedLocale(invalid), false);
    assert.equal(normalizeLocale(invalid), "en");
  }
});

test("persisted locale helpers restore only supported explicit choices", () => {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };

  assert.equal(readPersistedLocale(storage), "en");
  assert.equal(writePersistedLocale(storage, "ja"), "ja");
  assert.equal(readPersistedLocale(storage), "ja");
  assert.equal(writePersistedLocale(storage, "fr-FR"), "en");
  assert.equal(readPersistedLocale(storage), "en");
  assert.equal(readPersistedLocale({ getItem: () => { throw new Error("blocked"); } }), "en");
});

test("all locale catalogs have deterministic key parity with English", async () => {
  const englishKeys = flattenMessageKeys(englishMessages);
  assert.ok(englishKeys.length > 20, "English catalog should already cover shell and settings seed copy");

  const report = await getCatalogParityReport();
  assert.equal(report.ok, true, JSON.stringify(report, null, 2));
  assert.deepEqual(report.locales.map((locale) => locale.code), requestedLocales);
  for (const locale of report.locales) {
    assert.deepEqual(locale.missing, []);
    assert.deepEqual(locale.extra, []);
    assert.equal(locale.keyCount, englishKeys.length);
  }
});

test("translator returns selected-locale strings, falls back to English, and interpolates safely", () => {
  const zhHant = createTranslator("zh-Hant", { catalog: loadedMessages["zh-Hant"] });
  const de = createTranslator("de", { catalog: loadedMessages.de });
  const invalid = createTranslator("not-supported");

  assert.equal(zhHant.locale, "zh-Hant");
  assert.equal(zhHant.t("navigation.settings"), "設定");
  assert.equal(de.t("settings.language.heading"), "Sprache");
  assert.equal(invalid.locale, "en");
  assert.equal(invalid.t("navigation.settings"), "Settings");
  assert.equal(formatMessage("Selected resource: {resource}", { resource: "<demo>" }), "Selected resource: <demo>");
});

test("i18n source stays local-only with no remote catalogs or browser language detection", () => {
  const sourceFiles = [
    "src/i18n/index.mjs",
    ...requestedLocales.map((locale) => `src/i18n/catalogs/${locale}.mjs`),
    "src/i18n/locales.ts",
    "src/i18n/messages.ts",
    "src/i18n/I18nProvider.tsx"
  ];

  const source = sourceFiles
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");

  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /XMLHttpRequest/u);
  assert.doesNotMatch(source, /navigator\.language/u);
  assert.doesNotMatch(source, /navigator\.languages/u);
  assert.doesNotMatch(source, /i18next|react-i18next|react-intl|@lingui/u);
});
