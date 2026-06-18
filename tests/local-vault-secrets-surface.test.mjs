import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("settings and run surfaces expose local vault redaction evidence", () => {
  const app = [
    "src/workspaces/TrustRunSettingsTypes.ts",
    "src/workspaces/LocalVaultSecretsPanel.tsx",
    "src/workspaces/SettingsWorkspace.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx",
    "src/workspaces/routes/SettingsWorkspaceRoute.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  for (const phrase of [
    "Local vault secrets UX",
    "Reference-only secret review",
    "Keychain feasibility",
    "Native integration",
    "Reference-only vault records",
    "Vault lifecycle operations",
    "Vault redaction evidence",
    "Denied vault authorities",
    "Blocked unsafe vault samples",
    "settings.vault.keychainStatus",
    "settings.vault.lifecycleStates",
    "settings.vault.supportBundleRedacted"
  ]) {
    assert.match(app, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  }
});

test("local vault surfaces avoid raw secret runtime effects", () => {
  const vaultSurface = [
    "src/workspaces/LocalVaultSecretsPanel.tsx",
    "src/workspaces/SettingsWorkspace.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx",
    "src/workspaces/routes/SettingsWorkspaceRoute.tsx",
    "src/workspaces/TrustRunSettingsWorkspaces.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(
    vaultSurface,
    /@tauri-apps\/plugin-stronghold|@tauri-apps\/plugin-store|keyring|stronghold\.|Store\.load|node:fs|writeFile|appendFile|createWriteStream|readFile|process\.env|localStorage\s*[.:]|document\.cookie|storageState\s*[:(]|fetch\(|WebSocket\(|invoke\(|Command\.create|new\s+Command/u
  );
});
