import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("run workspace exposes accessible agent protocol bridge evidence without execution controls", () => {
  const paths = ["src/workspaces/AgentProtocolBridgePanel.tsx", "src/workspaces/RunWorkspace.tsx", "src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx"];
  const panelText = fs.readFileSync(paths[0], "utf8");
  const text = paths.map((path) => fs.readFileSync(path, "utf8")).join("\n");
  for (const phrase of [
    "Agent protocol bridge",
    "Signed extension",
    "Capability scope",
    "Explicit permission",
    "Host-owned dispatch",
    "Generic authority denied",
    "No package bridge adopted"
  ]) {
    assert.match(text, new RegExp(phrase, "u"), phrase);
  }
  assert.match(text, /aria-label="Agent protocol bridge"/u);
  assert.doesNotMatch(panelText, /onClick=|invoke\(|spawn\(|exec\(|fetch\(|WebSocket\(|install extension|load extension/u);
});
