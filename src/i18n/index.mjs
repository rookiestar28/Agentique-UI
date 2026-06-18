import englishMessagesCatalog from "./catalogs/en.mjs";

const localeCodes = ["en","zh-Hans","zh-Hant","ja","ko","de","fr","it","es","ru"];

export const defaultLocale = "en";
export const localeStorageKey = "agentique.ui.locale.v1";

export const supportedLocales = Object.freeze([
  Object.freeze({ code: "en", englishName: "English", nativeName: "English", dir: "ltr", enabled: true }),
  Object.freeze({ code: "zh-Hans", englishName: "Chinese (Simplified)", nativeName: "简体中文", dir: "ltr", enabled: true }),
  Object.freeze({ code: "zh-Hant", englishName: "Chinese (Traditional)", nativeName: "繁體中文", dir: "ltr", enabled: true }),
  Object.freeze({ code: "ja", englishName: "Japanese", nativeName: "日本語", dir: "ltr", enabled: true }),
  Object.freeze({ code: "ko", englishName: "Korean", nativeName: "한국어", dir: "ltr", enabled: true }),
  Object.freeze({ code: "de", englishName: "German", nativeName: "Deutsch", dir: "ltr", enabled: true }),
  Object.freeze({ code: "fr", englishName: "French", nativeName: "Français", dir: "ltr", enabled: true }),
  Object.freeze({ code: "it", englishName: "Italian", nativeName: "Italiano", dir: "ltr", enabled: true }),
  Object.freeze({ code: "es", englishName: "Spanish", nativeName: "Español", dir: "ltr", enabled: true }),
  Object.freeze({ code: "ru", englishName: "Russian", nativeName: "Русский", dir: "ltr", enabled: true })
]);

const supportedLocaleSet = new Set(localeCodes);

export const englishMessages = deepFreeze(englishMessagesCatalog);

const loadedCatalogs = new Map([[defaultLocale, englishMessages]]);

export const localeCatalogModulePaths = Object.freeze({
  "en": "src/i18n/catalogs/en.mjs",
  "zh-Hans": "src/i18n/catalogs/zh-Hans.mjs",
  "zh-Hant": "src/i18n/catalogs/zh-Hant.mjs",
  "ja": "src/i18n/catalogs/ja.mjs",
  "ko": "src/i18n/catalogs/ko.mjs",
  "de": "src/i18n/catalogs/de.mjs",
  "fr": "src/i18n/catalogs/fr.mjs",
  "it": "src/i18n/catalogs/it.mjs",
  "es": "src/i18n/catalogs/es.mjs",
  "ru": "src/i18n/catalogs/ru.mjs"
});

export const localeCatalogLoaders = Object.freeze({
  en: () => Promise.resolve(englishMessages),
  "zh-Hans": () => import("./catalogs/zh-Hans.mjs").then((module) => module.default),
  "zh-Hant": () => import("./catalogs/zh-Hant.mjs").then((module) => module.default),
  "ja": () => import("./catalogs/ja.mjs").then((module) => module.default),
  "ko": () => import("./catalogs/ko.mjs").then((module) => module.default),
  "de": () => import("./catalogs/de.mjs").then((module) => module.default),
  "fr": () => import("./catalogs/fr.mjs").then((module) => module.default),
  "it": () => import("./catalogs/it.mjs").then((module) => module.default),
  "es": () => import("./catalogs/es.mjs").then((module) => module.default),
  "ru": () => import("./catalogs/ru.mjs").then((module) => module.default)
});

export function isSupportedLocale(value) {
  return typeof value === "string" && supportedLocaleSet.has(value);
}

export function normalizeLocale(value) {
  return isSupportedLocale(value) ? value : defaultLocale;
}

export function getLocaleMetadata(value) {
  const normalized = normalizeLocale(value);
  return supportedLocales.find((locale) => locale.code === normalized) ?? supportedLocales[0];
}

export function readPersistedLocale(storage) {
  if (!storage || typeof storage.getItem !== "function") {
    return defaultLocale;
  }
  try {
    return normalizeLocale(storage.getItem(localeStorageKey));
  } catch {
    return defaultLocale;
  }
}

export function writePersistedLocale(storage, locale) {
  const normalized = normalizeLocale(locale);
  if (!storage || typeof storage.setItem !== "function") {
    return normalized;
  }
  try {
    storage.setItem(localeStorageKey, normalized);
  } catch {
    return normalized;
  }
  return normalized;
}

export function getLoadedLocaleCatalog(locale) {
  return loadedCatalogs.get(normalizeLocale(locale)) ?? englishMessages;
}

export async function loadLocaleCatalog(locale) {
  const normalized = normalizeLocale(locale);
  const cached = loadedCatalogs.get(normalized);
  if (cached) {
    return cached;
  }
  const loader = localeCatalogLoaders[normalized];
  if (!loader) {
    return englishMessages;
  }
  try {
    const loaded = deepFreeze(await loader());
    loadedCatalogs.set(normalized, loaded);
    return loaded;
  } catch {
    return englishMessages;
  }
}

export async function loadAllLocaleCatalogs() {
  const entries = await Promise.all(supportedLocales.map(async (locale) => [locale.code, await loadLocaleCatalog(locale.code)]));
  return Object.freeze(Object.fromEntries(entries));
}

export function createTranslator(locale, options = {}) {
  const normalized = normalizeLocale(locale);
  const fallbackCatalog = options.fallbackCatalog ?? englishMessages;
  const catalog = options.catalog ?? getLoadedLocaleCatalog(normalized);
  return Object.freeze({
    locale: normalized,
    t(messageId, params) {
      return translateFromCatalog(catalog, fallbackCatalog, messageId, params);
    }
  });
}

export function translate(locale, messageId, params, options = {}) {
  const normalized = normalizeLocale(locale);
  const fallbackCatalog = options.fallbackCatalog ?? englishMessages;
  const catalog = options.catalog ?? getLoadedLocaleCatalog(normalized);
  return translateFromCatalog(catalog, fallbackCatalog, messageId, params);
}

export async function translateAsync(locale, messageId, params) {
  const normalized = normalizeLocale(locale);
  const catalog = await loadLocaleCatalog(normalized);
  return translate(normalized, messageId, params, { catalog });
}

export function translateFromCatalog(catalog, fallbackCatalog, messageId, params) {
  const selected = getMessage(catalog, messageId);
  const fallback = getMessage(fallbackCatalog, messageId);
  const template = typeof selected === "string" ? selected : fallback;
  return typeof template === "string" ? formatMessage(template, params) : messageId;
}

export function formatMessage(template, params = {}) {
  return String(template).replace(/\{([A-Za-z0-9_.-]+)\}/gu, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      return match;
    }
    return String(params[key]);
  });
}

export function flattenMessageKeys(catalog) {
  const result = [];
  visit(catalog, []);
  return result.sort((a, b) => a.localeCompare(b));

  function visit(value, path) {
    if (typeof value === "string") {
      result.push(path.join("."));
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      visit(value[key], [...path, key]);
    }
  }
}

export async function getCatalogParityReport() {
  const catalogs = await loadAllLocaleCatalogs();
  const expectedKeys = flattenMessageKeys(catalogs[defaultLocale]);
  const expectedKeySet = new Set(expectedKeys);
  const locales = supportedLocales.map((locale) => {
    const keys = flattenMessageKeys(catalogs[locale.code]);
    const keySet = new Set(keys);
    return {
      code: locale.code,
      keyCount: keys.length,
      missing: expectedKeys.filter((key) => !keySet.has(key)),
      extra: keys.filter((key) => !expectedKeySet.has(key))
    };
  });

  return {
    ok: locales.every((locale) => locale.missing.length === 0 && locale.extra.length === 0 && locale.keyCount === expectedKeys.length),
    expectedKeyCount: expectedKeys.length,
    locales
  };
}

function getMessage(catalog, messageId) {
  return String(messageId)
    .split(".")
    .reduce((current, key) => (current && typeof current === "object" ? current[key] : undefined), catalog);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}
