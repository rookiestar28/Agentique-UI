#!/usr/bin/env node
import fs from "node:fs";

import {
  defaultLocale,
  getCatalogParityReport,
  getLocaleMetadata,
  loadAllLocaleCatalogs,
  supportedLocales,
  translate
} from "../src/i18n/index.mjs";

const failures = [];
const requestedLocales = ["en", "zh-Hans", "zh-Hant", "ja", "ko", "de", "fr", "it", "es", "ru"];
const smokeLocales = ["en", "zh-Hant", "de", "ru"];
const visibleTerminologyExpectations = {
  en: {
    "page.library.title": "Local resource library",
    "workspace.import.intentLabel": "Import content",
    "command.resetIntent": "Reset import content",
    "command.validateIntent": "Validate import content"
  },
  "zh-Hans": {
    "navigation.library": "资源库",
    "page.library.caption": "资源库",
    "page.library.title": "本地资源库",
    "workspace.library.caption": "资源库",
    "workspace.import.intentLabel": "导入内容",
    "command.resetIntent": "重置导入内容",
    "command.validateIntent": "验证导入内容"
  },
  "zh-Hant": {
    "navigation.library": "資源庫",
    "page.library.caption": "資源庫",
    "page.library.title": "本機資源庫",
    "workspace.library.caption": "資源庫",
    "workspace.import.intentLabel": "匯入內容",
    "command.resetIntent": "重設匯入內容",
    "command.validateIntent": "驗證匯入內容"
  },
  ja: {
    "page.library.title": "ローカルリソースライブラリ",
    "workspace.import.intentLabel": "インポート内容",
    "command.resetIntent": "インポート内容をリセット",
    "command.validateIntent": "インポート内容を検証"
  },
  ko: {
    "page.library.title": "로컬 리소스 라이브러리",
    "workspace.import.intentLabel": "가져오기 내용",
    "command.resetIntent": "가져오기 내용 초기화",
    "command.validateIntent": "가져오기 내용 검증"
  },
  de: {
    "page.library.title": "Lokale Ressourcenbibliothek",
    "workspace.import.intentLabel": "Importinhalt",
    "command.resetIntent": "Importinhalt zurücksetzen",
    "command.validateIntent": "Importinhalt prüfen"
  },
  fr: {
    "page.library.title": "Bibliothèque locale de ressources",
    "workspace.import.intentLabel": "Contenu d'import",
    "command.resetIntent": "Réinitialiser le contenu d'import",
    "command.validateIntent": "Valider le contenu d'import"
  },
  it: {
    "page.library.title": "Libreria risorse locale",
    "workspace.import.intentLabel": "Contenuto di importazione",
    "command.resetIntent": "Reimposta contenuto di importazione",
    "command.validateIntent": "Verifica contenuto di importazione"
  },
  es: {
    "page.library.title": "Biblioteca local de recursos",
    "workspace.import.intentLabel": "Contenido de importación",
    "command.resetIntent": "Restablecer contenido de importación",
    "command.validateIntent": "Validar contenido de importación"
  },
  ru: {
    "page.library.title": "Локальная библиотека ресурсов",
    "workspace.import.intentLabel": "Данные импорта",
    "command.resetIntent": "Сбросить данные импорта",
    "command.validateIntent": "Проверить данные импорта"
  }
};
const forbiddenVisibleTerminology = {
  en: ["intent"],
  "zh-Hans": ["资料库", "带版本的本地资源", "资源意图", "重置意图", "验证意图", "意图"],
  "zh-Hant": ["資料庫", "具版本的本機資源", "資源意圖", "重設意圖", "驗證意圖", "意圖"],
  ja: ["インテント"],
  ko: ["의도"],
  de: ["intent"],
  fr: ["intention"],
  it: ["intento"],
  es: ["intención"],
  ru: ["намерение"]
};

await loadAllLocaleCatalogs();

const packageJson = JSON.parse(readText("package.json"));
const provider = readText("src/i18n/I18nProvider.tsx");
const index = readText("src/i18n/index.mjs");
const shell = readText("src/ui/WorkspaceShell.tsx");
const settings = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map(readText).join("\n");

const forbiddenPublicPatterns = [
  new RegExp(`\\.${"planning"}`, "iu"),
  new RegExp(`${"reference"}\\/`, "iu"),
  new RegExp(["R", "29", "\\d{2}"].join(""), "u"),
  new RegExp(`${"B"}:\\\\`, "u")
];

if (defaultLocale !== "en") {
  failures.push(`default locale must remain en, got ${defaultLocale}`);
}

const actualLocales = supportedLocales.map((locale) => locale.code);
if (JSON.stringify(actualLocales) !== JSON.stringify(requestedLocales)) {
  failures.push(`supported locale order drift: ${actualLocales.join(", ")}`);
}

const parity = await getCatalogParityReport();
if (!parity.ok) {
  failures.push("catalog parity report must pass before locale QA closeout");
}

for (const [locale, expectedMessages] of Object.entries(visibleTerminologyExpectations)) {
  for (const [messageId, expected] of Object.entries(expectedMessages)) {
    const actual = translate(locale, messageId);
    if (actual !== expected) {
      failures.push(`${locale} visible terminology drift for ${messageId}: expected ${expected}, got ${actual}`);
    }
  }
}

for (const [locale, forbiddenFragments] of Object.entries(forbiddenVisibleTerminology)) {
  const visibleText = [
    "workspace.import.intentLabel",
    "command.resetIntent",
    "command.validateIntent"
  ].map((messageId) => translate(locale, messageId)).join(" ").toLocaleLowerCase(locale);
  for (const forbidden of forbiddenFragments) {
    if (visibleText.includes(forbidden.toLocaleLowerCase(locale))) {
      failures.push(`${locale} visible import copy leaked protocol wording: ${forbidden}`);
    }
  }
}

for (const locale of smokeLocales) {
  const metadata = getLocaleMetadata(locale);
  if (metadata.code !== locale) {
    failures.push(`metadata lookup failed for smoke locale ${locale}`);
  }
  if (metadata.dir !== "ltr") {
    failures.push(`initial smoke locale must remain ltr: ${locale}`);
  }
}

for (const messageId of [
  "navigation.settings",
  "page.settings.title",
  "settings.language.heading",
  "workspace.graph.title",
  "workspace.run.title"
]) {
  const english = translate("en", messageId);
  for (const locale of smokeLocales.filter((code) => code !== "en")) {
    const translated = translate(locale, messageId);
    if (translated === english) {
      failures.push(`${locale} smoke message did not differ from English: ${messageId}`);
    }
    if (!/\S/u.test(translated)) {
      failures.push(`${locale} smoke message is empty: ${messageId}`);
    }
  }
}

const germanGraphTitle = translate("de", "workspace.graph.title");
const englishGraphTitle = translate("en", "workspace.graph.title");
if (germanGraphTitle.length <= englishGraphTitle.length) {
  failures.push("German graph title should remain a long-string smoke candidate");
}

const russianRunTitle = translate("ru", "workspace.run.title");
if (!/[А-Яа-яЁё]/u.test(russianRunTitle)) {
  failures.push("Russian run title should remain a Cyrillic smoke candidate");
}

requireIncludes(provider, [
  "document.documentElement.lang",
  "document.documentElement.dir",
  "writePersistedLocale(",
  "window.localStorage"
], "i18n provider metadata and persistence");
for (const forbidden of [/navigator\.language/u, /navigator\.languages/u]) {
  if (forbidden.test(index) || forbidden.test(provider)) {
    failures.push(`i18n source must not use browser-language auto-detection: ${forbidden}`);
  }
}

requireIncludes(settings, [
  "id=\"settings-language-select\"",
  "htmlFor=\"settings-language-select\"",
  "aria-describedby=\"settings-language-description settings-language-storage\"",
  "value={locale}",
  "onChange={(event) => setLocale(event.target.value as LocaleCode)}",
  "supportedLocales.map((localeOption) =>",
  "{localeOption.nativeName} - {localeOption.englishName}"
], "Settings language selector accessibility contract");

requireIncludes(shell, [
  "aria-label={t(\"app.ariaLabel\")}",
  "aria-label={t(\"shell.primaryNavigation\")}",
  "aria-controls=\"active-workspace-page\"",
  "aria-pressed={isActive}",
  "hidden={!isMobileNavOpen}"
], "workspace shell navigation accessibility contract");

if (!String(packageJson.scripts?.["validate:i18n-locale-qa"] ?? "").includes("check-i18n-locale-qa-closeout.mjs")) {
  failures.push("package scripts must define validate:i18n-locale-qa");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:i18n-locale-qa")) {
  failures.push("validate script must include validate:i18n-locale-qa");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  checked: [
    "src/i18n/index.mjs",
    "src/i18n/I18nProvider.tsx",
    "src/ui/WorkspaceShell.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx",
    "package.json"
  ],
  smokeLocales
}, null, 2));

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function requireIncludes(text, required, label) {
  for (const phrase of required) {
    if (!text.includes(phrase)) {
      failures.push(`${label} missing required phrase: ${phrase}`);
    }
  }
}
