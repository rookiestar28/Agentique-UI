import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("run surface exposes function expansion closeout evidence", () => {
  const app = [
    "src/workspaces/TrustRunSettingsTypes.ts",
    "src/workspaces/FunctionExpansionCloseoutPanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  for (const phrase of [
    "Function expansion closeout",
    "Claim sync review",
    "Accepted evidence families",
    "Portability drift profile mapping",
    "Graph block runtime handoff",
    "Closeout validation evidence",
    "No-Go claims",
    "Desktop and narrow evidence",
    "functionExpansionCloseout: AnyRecord"
  ]) {
    assert.match(app, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  }
});

test("function expansion closeout surfaces avoid runtime effects", () => {
  const closeoutSurface = [
    "src/workspaces/FunctionExpansionCloseoutPanel.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx",
    "src/workspaces/TrustRunSettingsTypes.ts"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  assert.doesNotMatch(
    closeoutSurface,
    /@tauri-apps\/plugin-fs|@tauri-apps\/plugin-store|@tauri-apps\/plugin-sql|@tauri-apps\/plugin-stronghold|node:fs|writeFile|appendFile|createWriteStream|readFile|process\.env|localStorage\s*[.:]|document\.cookie|storageState\s*[:(]|fetch\(|WebSocket\(|invoke\(|Command\.create|new\s+Command/u
  );
});
