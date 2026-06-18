#!/usr/bin/env node
import fs from "node:fs";
import { reviewLocalVaultSecretsGate } from "../src/core/local-vault-secrets-ux.mjs";

const failures = [];
const moduleText = readText("src/core/local-vault-secrets-ux.mjs");
const tests = readText("tests/local-vault-secrets-ux.test.mjs");
const surfaceTests = readText("tests/local-vault-secrets-surface.test.mjs");
const docs = readText("docs/contracts/local-vault-secrets-ux.md");
const panel = readText("src/workspaces/LocalVaultSecretsPanel.tsx");
const settings = readText("src/workspaces/SettingsWorkspace.tsx");
const runWorkspace = readText("src/workspaces/RunWorkspace.tsx");
const route = readText("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx");
const settingsRoute = readText("src/workspaces/routes/SettingsWorkspaceRoute.tsx");
const types = readText("src/workspaces/TrustRunSettingsTypes.ts");
const packageJson = JSON.parse(readText("package.json"));
const review = reviewLocalVaultSecretsGate();

requireIncludes(
  moduleText,
  [
    "agentique.localVaultSecretsUx.v1",
    "reviewed-not-integrated",
    "secret-reference-only",
    "metadata-only",
    "packagedSecretsIncluded: false",
    "ambientEnvironmentImport: false",
    "browserDataImport: false",
    "tokenExchange: false",
    "webhookExecution: false",
    "assertLocalVaultSecretsPolicySafe"
  ],
  "local vault secrets module"
);

requireIncludes(
  tests,
  [
    "complete local vault review is reference-only and redacted",
    "inline secret material and malformed references fail closed",
    "native keychain overclaims and web-layer readback fail closed",
    "raw exports logs screenshots packaged secrets and unsafe sources are rejected",
    "OAuth webhook and provider boundaries stay reference-only"
  ],
  "local vault secrets tests"
);

requireIncludes(
  surfaceTests,
  [
    "settings and run surfaces expose local vault redaction evidence",
    "local vault surfaces avoid raw secret runtime effects",
    "Local vault secrets UX",
    "Reference-only secret review",
    "Vault lifecycle operations",
    "Denied vault authorities",
    "Blocked unsafe vault samples"
  ],
  "local vault secrets surface tests"
);

requireIncludes(
  docs,
  [
    "Local Vault Secrets UX Contract",
    "reference-only",
    "reviewed but not integrated",
    "metadata-only screenshots",
    "no packaged secrets",
    "does not implement native keychain storage"
  ],
  "local vault secrets docs"
);

requireIncludes(
  panel,
  [
    "Local vault secrets UX",
    "Reference-only secret review",
    "Keychain feasibility",
    "Native integration",
    "Reference-only vault records",
    "Vault lifecycle operations",
    "Vault redaction evidence",
    "Denied vault authorities",
    "Blocked unsafe vault samples"
  ],
  "local vault secrets panel"
);

requireIncludes(settings, ["settings.vault.keychainStatus", "settings.vault.lifecycleStates", "settings.vault.supportBundleRedacted"], "Settings local vault wiring");
requireIncludes(runWorkspace, ["LocalVaultSecretsPanel", "localVaultSecretsUx"], "Run workspace local vault wiring");
requireIncludes(route, ["createLocalVaultSecretsReview", "reviewLocalVaultSecretsGate", "localVaultSecretsUx"], "Run route local vault wiring");
requireIncludes(settingsRoute, ["createLocalVaultSecretsReview", "localVaultSecretsUx"], "Settings route local vault wiring");
requireIncludes(types, ["localVaultSecretsUx: AnyRecord"], "workspace props");

const vaultSurface = [panel, settings, runWorkspace, route, settingsRoute].join("\n");
const forbiddenRuntime =
  /@tauri-apps\/plugin-stronghold|@tauri-apps\/plugin-store|keyring|stronghold\.|Store\.load|node:fs|writeFile|appendFile|createWriteStream|readFile|process\.env|localStorage\s*[.:]|document\.cookie|storageState\s*[:(]|fetch\(|WebSocket\(|invoke\(|Command\.create|new\s+Command/u;
if (forbiddenRuntime.test(vaultSurface)) {
  failures.push("local vault surfaces must stay review-only and avoid secret storage/runtime-effect APIs");
}

if (!review.ok || review.approvedStatus !== "reference-only-ready" || review.storesSecretValues !== false || review.exposesSecretValues !== false) {
  failures.push("local vault review must prove reference-only readiness without secret storage or exposure");
}

if (!review.inlineSecretBlocked || !review.malformedReferenceBlocked || !review.unsupportedNativeClaimBlocked || !review.rawEvidenceBlocked || !review.unsafeSourcesBlocked) {
  failures.push("local vault review must prove inline secret, malformed reference, native overclaim, raw evidence, and unsafe source blockers");
}

if (!String(packageJson.scripts?.["validate:local-vault-secrets-ux"] ?? "").includes("check-local-vault-secrets-ux.mjs")) {
  failures.push("package scripts must define validate:local-vault-secrets-ux");
}

if (!String(packageJson.scripts?.validate ?? "").includes("validate:local-vault-secrets-ux")) {
  failures.push("validate script must include validate:local-vault-secrets-ux");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: [
        "src/core/local-vault-secrets-ux.mjs",
        "tests/local-vault-secrets-ux.test.mjs",
        "tests/local-vault-secrets-surface.test.mjs",
        "src/workspaces/LocalVaultSecretsPanel.tsx",
        "src/workspaces/RunWorkspace.tsx",
        "src/workspaces/SettingsWorkspace.tsx",
        "docs/contracts/local-vault-secrets-ux.md"
      ],
      summary: review.summary
    },
    null,
    2
  )
);

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
