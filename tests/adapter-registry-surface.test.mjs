import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("run page exposes adapter registry review and update decisions", () => {
  const app = [
    "src/workspaces/TrustRunSettingsWorkspaces.tsx",
    "src/workspaces/TrustRunSettingsTypes.ts",
    "src/workspaces/VerifyWorkspace.tsx",
    "src/workspaces/RunWorkspace.tsx",
    "src/workspaces/AdapterRegistryTrustPanel.tsx",
    "src/workspaces/SettingsWorkspace.tsx"
  ]
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  for (const phrase of [
    "Adapter registry",
    "Adapter registry manifest trust policy",
    "Adapter registry review summary",
    "Adapter trust policy summary",
    "Adapter portability and drift status",
    "Adapter blocked trust reasons",
    "Adapter update decision",
    "Revocation overrides compatibility",
    "fail closed before launch planning"
  ]) {
    assert.match(app, new RegExp(phrase));
  }
});
