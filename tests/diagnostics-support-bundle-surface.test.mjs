import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("run surface exposes diagnostics support bundle evidence", () => {
  const app = [
    "src/workspaces/TrustRunSettingsTypes.ts",
    "src/workspaces/DiagnosticsSupportBundlePanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  for (const phrase of [
    "Diagnostics support bundle",
    "Redacted support export",
    "Bundle contents",
    "Environment summary",
    "Validation summary",
    "Run and cleanup evidence",
    "Adapter drift and compatibility",
    "Credential reference summary",
    "Denied support materials",
    "Blocked unsafe support samples",
    "diagnosticsSupportBundle: AnyRecord"
  ]) {
    assert.match(app, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  }
});

test("diagnostics support bundle surfaces avoid runtime effects", () => {
  const supportSurface = [
    "src/workspaces/DiagnosticsSupportBundlePanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx",
    "src/workspaces/TrustRunSettingsTypes.ts"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(
    supportSurface,
    /@tauri-apps\/plugin-fs|@tauri-apps\/plugin-store|@tauri-apps\/plugin-sql|@tauri-apps\/plugin-stronghold|node:fs|writeFile|appendFile|createWriteStream|readFile|process\.env|localStorage\s*[.:]|document\.cookie|storageState\s*[:(]|fetch\(|WebSocket\(|invoke\(|Command\.create|new\s+Command/u
  );
});
