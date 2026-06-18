import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { supportedLocales } from "../src/i18n/index.mjs";

const mainSource = fs.readFileSync("src/main.tsx", "utf8");
const settingsSource = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");

test("app root wires the i18n provider without changing app construction", () => {
  assert.match(mainSource, /import \{ I18nProvider \} from "\.\/i18n\/I18nProvider"/u);
  assert.match(mainSource, /<I18nProvider>\s*<App \/>/u);
  assert.match(mainSource, /<\/I18nProvider>/u);
  assert.match(mainSource, /<React\.StrictMode>/u);
});

test("settings exposes an accessible language selector backed by supported locale metadata", () => {
  assert.match(settingsSource, /import \{ useI18n \} from "\.\.\/i18n\/I18nProvider"/u);
  assert.match(settingsSource, /import type \{ LocaleCode \} from "\.\.\/i18n\/types"/u);
  assert.match(settingsSource, /const \{ locale, setLocale, supportedLocales, t \} = useI18n\(\)/u);
  assert.match(settingsSource, /id="settings-language-select"/u);
  assert.match(settingsSource, /htmlFor="settings-language-select"/u);
  assert.match(settingsSource, /aria-describedby="settings-language-description settings-language-storage"/u);
  assert.match(settingsSource, /value=\{locale\}/u);
  assert.match(settingsSource, /onChange=\{\(event\) => setLocale\(event\.target\.value as LocaleCode\)\}/u);
  assert.match(settingsSource, /supportedLocales\.map\(\(localeOption\) =>/u);
  assert.match(settingsSource, /value=\{localeOption\.code\}/u);
  assert.match(settingsSource, /\{localeOption\.nativeName\} - \{localeOption\.englishName\}/u);
});

test("settings language selector uses translated visible labels", () => {
  for (const messageId of [
    "settings.language.caption",
    "settings.language.heading",
    "settings.language.label",
    "settings.language.description",
    "settings.language.storageNote",
    "settings.language.fallbackNote"
  ]) {
    assert.match(settingsSource, new RegExp(`t\\("${escapeRegExp(messageId)}"\\)`, "u"));
  }
});

test("settings selector contract covers all initial locale options", () => {
  assert.deepEqual(
    supportedLocales.map((locale) => locale.code),
    ["en", "zh-Hans", "zh-Hant", "ja", "ko", "de", "fr", "it", "es", "ru"]
  );
  assert.equal(supportedLocales.length, 10);
});

test("permission release config and vault settings surfaces stay present", () => {
  for (const anchor of [
    "settings.permissionHeading",
    "settings.release.summaryLabel",
    "settings.release.blockersLabel",
    "settings.config.draftLabel",
    "settings.config.actionsLabel",
    "settings.vault.listLabel",
    "settings.vault.secretValuesTitle"
  ]) {
    assert.match(settingsSource, new RegExp(escapeRegExp(anchor), "u"));
  }
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
