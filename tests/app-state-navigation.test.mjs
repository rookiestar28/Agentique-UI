import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  createNavigationHash,
  fallbackNavigationKey,
  normalizeNavigationKey,
  readNavigationHash,
  writeNavigationHash
} from "../src/app-state/navigation-route.mjs";

test("navigation route adapter normalizes hashes with a fail-closed library fallback", () => {
  assert.equal(fallbackNavigationKey, "library");
  assert.equal(normalizeNavigationKey("graph"), "graph");
  assert.equal(normalizeNavigationKey("run"), "run");
  assert.equal(normalizeNavigationKey("unknown"), "library");
  assert.equal(readNavigationHash({ hash: "#settings" }), "settings");
  assert.equal(readNavigationHash({ hash: "#not-a-page" }), "library");
  assert.equal(readNavigationHash({ hash: "" }), "library");
  assert.equal(createNavigationHash("handoff"), "#handoff");
  assert.equal(createNavigationHash("bad-value"), "#library");
});

test("navigation route adapter writes only normalized hashes through replaceState", () => {
  const calls = [];
  const history = {
    replaceState: (...args) => calls.push(args)
  };

  writeNavigationHash(history, "run");
  writeNavigationHash(history, "not-a-page");

  assert.deepEqual(calls, [
    [null, "", "#run"],
    [null, "", "#library"]
  ]);
});

test("app state hooks keep navigation import and runner state outside App composition", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const graphRunRoute = fs.readFileSync("src/workspaces/routes/GraphWorkspaceAndRunWorkspaceRoute.tsx", "utf8");
  const navigationHook = fs.readFileSync("src/app-state/useNavigationRoute.ts", "utf8");
  const importHook = fs.readFileSync("src/app-state/useImportWorkspaceState.ts", "utf8");
  const runnerHook = fs.readFileSync("src/app-state/useRunnerWorkspaceState.ts", "utf8");

  assert.match(app, /useNavigationRoute\(\)/u);
  assert.match(app, /useImportWorkspaceState\(\)/u);
  assert.match(graphRunRoute, /useRunnerWorkspaceState\(\{ activeWorkflowIr, blockedWorkflowIr \}\)/u);
  assert.doesNotMatch(app, /\buseState\b/u);
  assert.doesNotMatch(app, /window\.location\.hash/u);
  assert.match(navigationHook, /hashchange/u);
  assert.match(importHook, /scanExternalIntakeFiles/u);
  assert.match(importHook, /sampleImportIntent/u);
  assert.match(runnerHook, /approveRunnerPermissionGrants/u);
  assert.match(runnerHook, /runAcceptedWorkflowSession/u);
  assert.match(runnerHook, /createRunHistoryEvidence/u);
});
