import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

import { loadAllLocaleCatalogs, supportedLocales, translate } from "../src/i18n/index.mjs";

await loadAllLocaleCatalogs();

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const settingsSource = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
const shellSource = fs.readFileSync("src/ui/WorkspaceShell.tsx", "utf8");

test("locale QA closeout validator is wired into validation", () => {
  assert.match(String(packageJson.scripts?.["validate:i18n-locale-qa"] ?? ""), /check-i18n-locale-qa-closeout\.mjs/u);
  assert.match(String(packageJson.scripts?.validate ?? ""), /validate:i18n-locale-qa/u);
  assert.equal(fs.existsSync("scripts/check-i18n-locale-qa-closeout.mjs"), true);
});

test("smoke locale catalog candidates cover English CJK German and Russian", () => {
  assert.deepEqual(
    supportedLocales.map((locale) => locale.code),
    ["en", "zh-Hans", "zh-Hant", "ja", "ko", "de", "fr", "it", "es", "ru"]
  );
  for (const [locale, messageId] of [
    ["zh-Hant", "settings.language.heading"],
    ["de", "workspace.graph.title"],
    ["ru", "workspace.run.title"]
  ]) {
    assert.notEqual(translate(locale, messageId), translate("en", messageId));
  }
});

test("language selector and shell retain accessibility hooks for live smoke", () => {
  for (const phrase of [
    "id=\"settings-language-select\"",
    "htmlFor=\"settings-language-select\"",
    "aria-describedby=\"settings-language-description settings-language-storage\"",
    "onChange={(event) => setLocale(event.target.value as LocaleCode)}"
  ]) {
    assert.match(settingsSource, new RegExp(escapeRegExp(phrase), "u"));
  }

  for (const phrase of [
    "aria-label={t(\"app.ariaLabel\")}",
    "aria-label={t(\"shell.primaryNavigation\")}",
    "aria-controls=\"active-workspace-page\"",
    "aria-pressed={isActive}",
    "hidden={!isMobileNavOpen}"
  ]) {
    assert.match(shellSource, new RegExp(escapeRegExp(phrase), "u"));
  }
});

test("locale QA closeout validator passes", () => {
  const output = execFileSync(process.execPath, ["scripts/check-i18n-locale-qa-closeout.mjs"], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.status, "passed");
  assert.deepEqual(report.smokeLocales, ["en", "zh-Hant", "de", "ru"]);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
