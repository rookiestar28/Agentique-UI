import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { getCatalogParityReport, getLocaleMetadata, loadAllLocaleCatalogs, translate } from "../src/i18n/index.mjs";

await loadAllLocaleCatalogs();

const shellSource = fs.readFileSync("src/ui/WorkspaceShell.tsx", "utf8");
const navigationSource = fs.readFileSync("src/ui/navigation.ts", "utf8");
const settingsSource = ["src/workspaces/TrustRunSettingsWorkspaces.tsx", "src/workspaces/TrustRunSettingsTypes.ts", "src/workspaces/VerifyWorkspace.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/SettingsWorkspace.tsx"].map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");

test("workspace shell uses i18n facade for chrome navigation and page metadata", () => {
  assert.match(shellSource, /import \{ useI18n \} from "\.\.\/i18n\/I18nProvider"/u);
  assert.match(shellSource, /const \{ t \} = useI18n\(\)/u);

  for (const messageId of [
    "app.ariaLabel",
    "app.brandName",
    "app.brandSubtitle",
    "command.ariaLabel",
    "command.selectedResource",
    "command.resetIntent",
    "command.validateIntent"
  ]) {
    assert.match(shellSource, new RegExp(`t\\("${escapeRegExp(messageId)}"\\)`, "u"));
  }

  assert.match(navigationSource, /labelMessageId: "navigation\.library"/u);
  assert.match(navigationSource, /captionMessageId: "page\.settings\.caption"/u);
  assert.match(navigationSource, /titleMessageId: "page\.settings\.title"/u);
  assert.match(shellSource, /t\(item\.labelMessageId\)/u);
  assert.match(shellSource, /t\(currentPage\.captionMessageId\)/u);
  assert.match(shellSource, /t\(currentPage\.titleMessageId\)/u);
});

test("mobile navigation labels are catalog-backed without changing disclosure state", () => {
  for (const messageId of [
    "shell.primaryNavigation",
    "shell.workspacePages",
    "shell.mobileWorkspaceNavigation",
    "shell.openWorkspaceNavigation",
    "shell.closeWorkspaceNavigation",
    "shell.workspaceNavigationTitle"
  ]) {
    assert.match(shellSource, new RegExp(`t\\("${escapeRegExp(messageId)}"\\)`, "u"));
  }

  assert.match(shellSource, /const \[isMobileNavOpen, setIsMobileNavOpen\] = useState\(false\)/u);
  assert.match(shellSource, /hidden=\{!isMobileNavOpen\}/u);
  assert.match(shellSource, /renderNavigationItems\(true\)/u);
  assert.match(shellSource, /setIsMobileNavOpen\(false\)/u);
});

test("settings fixed surface copy uses i18n facade", () => {
  for (const messageId of [
    "settings.sectionCaption",
    "settings.permissionHeading",
    "settings.permissionPostureLabel",
    "settings.files",
    "settings.network",
    "settings.shell",
    "settings.environment",
    "settings.release.caption",
    "settings.release.heading",
    "settings.release.summaryLabel",
    "settings.release.blockersLabel",
    "settings.release.blockerScope",
    "settings.release.status",
    "settings.release.platforms",
    "settings.release.blockers",
    "settings.release.bundling",
    "settings.release.noInstallerClaimTitle",
    "settings.release.noInstallerClaimBody",
    "settings.config.caption",
    "settings.config.heading",
    "settings.config.draftLabel",
    "settings.config.actionsLabel",
    "settings.config.resetDraft",
    "settings.config.importDraft",
    "settings.config.exportRedactedDraft",
    "settings.config.draftDifferences",
    "settings.config.exportUsesRedactedValues",
    "settings.config.exportBlockedByInvalidSchema",
    "settings.config.invalidSchemaTitle",
    "settings.config.invalidSchemaBody",
    "settings.vault.caption",
    "settings.vault.heading",
    "settings.vault.summaryLabel",
    "settings.vault.listLabel",
    "settings.vault.references",
    "settings.vault.inlineValues",
    "settings.vault.screenshotsRedacted",
    "settings.vault.exportsRedacted",
    "settings.vault.secretValuesTitle",
    "settings.vault.secretValuesBody",
    "common.ready",
    "common.blocked",
    "common.enabled",
    "common.disabled",
    "common.invalid"
  ]) {
    assert.match(settingsSource, new RegExp(`t\\("${escapeRegExp(messageId)}"`, "u"));
  }
});

test("catalog proves visible non-English shell and settings labels differ from English", async () => {
  assert.equal((await getCatalogParityReport()).ok, true);
  assert.equal(getLocaleMetadata("zh-Hant").code, "zh-Hant");
  assert.equal(getLocaleMetadata("zh-Hant").dir, "ltr");

  for (const messageId of [
    "navigation.settings",
    "page.settings.title",
    "command.validateIntent",
    "settings.permissionHeading",
    "settings.release.heading",
    "settings.config.exportRedactedDraft",
    "settings.vault.secretValuesTitle"
  ]) {
    assert.notEqual(translate("zh-Hant", messageId), translate("en", messageId), messageId);
  }
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
