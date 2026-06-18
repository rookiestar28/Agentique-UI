import assert from "node:assert/strict";
import test from "node:test";

import { loadAllLocaleCatalogs, supportedLocales, translate } from "../src/i18n/index.mjs";

await loadAllLocaleCatalogs();

const expectedTerminology = Object.freeze({
  en: Object.freeze({
    "navigation.library": "Library",
    "page.library.caption": "Library",
    "page.library.title": "Local resource library",
    "workspace.library.caption": "Library",
    "workspace.library.proofSummary": "Resource library proof summary",
    "workspace.import.intentLabel": "Import content",
    "command.resetIntent": "Reset import content",
    "command.validateIntent": "Validate import content"
  }),
  "zh-Hans": Object.freeze({
    "navigation.library": "资源库",
    "page.library.caption": "资源库",
    "page.library.title": "本地资源库",
    "workspace.library.caption": "资源库",
    "workspace.library.proofSummary": "资源库验证摘要",
    "workspace.import.intentLabel": "导入内容",
    "command.resetIntent": "重置导入内容",
    "command.validateIntent": "验证导入内容"
  }),
  "zh-Hant": Object.freeze({
    "navigation.library": "資源庫",
    "page.library.caption": "資源庫",
    "page.library.title": "本機資源庫",
    "workspace.library.caption": "資源庫",
    "workspace.library.proofSummary": "資源庫驗證摘要",
    "workspace.import.intentLabel": "匯入內容",
    "command.resetIntent": "重設匯入內容",
    "command.validateIntent": "驗證匯入內容"
  }),
  ja: Object.freeze({
    "page.library.title": "ローカルリソースライブラリ",
    "workspace.library.proofSummary": "リソースライブラリ検証サマリー",
    "workspace.import.intentLabel": "インポート内容",
    "command.resetIntent": "インポート内容をリセット",
    "command.validateIntent": "インポート内容を検証"
  }),
  ko: Object.freeze({
    "page.library.caption": "리소스 라이브러리",
    "page.library.title": "로컬 리소스 라이브러리",
    "workspace.library.caption": "리소스 라이브러리",
    "workspace.library.proofSummary": "리소스 라이브러리 검증 요약",
    "workspace.import.intentLabel": "가져오기 내용",
    "command.resetIntent": "가져오기 내용 초기화",
    "command.validateIntent": "가져오기 내용 검증"
  }),
  de: Object.freeze({
    "page.library.title": "Lokale Ressourcenbibliothek",
    "workspace.library.proofSummary": "Prüfzusammenfassung der Ressourcenbibliothek",
    "workspace.import.intentLabel": "Importinhalt",
    "command.resetIntent": "Importinhalt zurücksetzen",
    "command.validateIntent": "Importinhalt prüfen"
  }),
  fr: Object.freeze({
    "page.library.title": "Bibliothèque locale de ressources",
    "workspace.library.proofSummary": "Résumé de validation de la bibliothèque de ressources",
    "workspace.import.intentLabel": "Contenu d'import",
    "command.resetIntent": "Réinitialiser le contenu d'import",
    "command.validateIntent": "Valider le contenu d'import"
  }),
  it: Object.freeze({
    "page.library.title": "Libreria risorse locale",
    "workspace.library.proofSummary": "Riepilogo verifica libreria risorse",
    "workspace.import.intentLabel": "Contenuto di importazione",
    "command.resetIntent": "Reimposta contenuto di importazione",
    "command.validateIntent": "Verifica contenuto di importazione"
  }),
  es: Object.freeze({
    "page.library.title": "Biblioteca local de recursos",
    "workspace.library.proofSummary": "Resumen de validación de la biblioteca de recursos",
    "workspace.import.intentLabel": "Contenido de importación",
    "command.resetIntent": "Restablecer contenido de importación",
    "command.validateIntent": "Validar contenido de importación"
  }),
  ru: Object.freeze({
    "page.library.title": "Локальная библиотека ресурсов",
    "workspace.library.proofSummary": "Сводка проверки библиотеки ресурсов",
    "workspace.import.intentLabel": "Данные импорта",
    "command.resetIntent": "Сбросить данные импорта",
    "command.validateIntent": "Проверить данные импорта"
  })
});

const forbiddenVisibleTerminology = Object.freeze({
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
});

const visibleImportKeys = Object.freeze([
  "workspace.import.intentLabel",
  "command.resetIntent",
  "command.validateIntent"
]);

test("resource library and import editor terminology uses local-language UI labels", () => {
  const actualLocales = supportedLocales.map((locale) => locale.code);
  assert.deepEqual(actualLocales, Object.keys(expectedTerminology));

  for (const [locale, expectedMessages] of Object.entries(expectedTerminology)) {
    for (const [messageId, expected] of Object.entries(expectedMessages)) {
      assert.equal(translate(locale, messageId), expected, `${locale} ${messageId}`);
    }
  }
});

test("visible import labels do not expose internal intent protocol wording", () => {
  for (const [locale, forbiddenFragments] of Object.entries(forbiddenVisibleTerminology)) {
    const visibleText = visibleImportKeys.map((messageId) => translate(locale, messageId)).join(" ");
    const normalizedVisibleText = visibleText.toLocaleLowerCase(locale);

    for (const forbidden of forbiddenFragments) {
      assert.equal(
        normalizedVisibleText.includes(forbidden.toLocaleLowerCase(locale)),
        false,
        `${locale} visible import copy leaked protocol wording: ${forbidden}`
      );
    }
  }
});

test("Chinese library copy uses resource-library wording instead of database wording", () => {
  for (const locale of ["zh-Hans", "zh-Hant"]) {
    const libraryText = [
      "navigation.library",
      "page.library.caption",
      "page.library.title",
      "workspace.library.caption",
      "workspace.library.proofSummary"
    ].map((messageId) => translate(locale, messageId)).join(" ");

    assert.equal(/資料庫|资料库/u.test(libraryText), false, `${locale} library copy must not say database`);
    assert.equal(/資源庫|资源库/u.test(libraryText), true, `${locale} library copy must say resource library`);
  }
});
