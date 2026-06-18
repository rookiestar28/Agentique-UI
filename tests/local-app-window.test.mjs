import assert from "node:assert/strict";
import test from "node:test";
import { resolveBrowserLaunchPlan } from "../scripts/open-local-app-window.mjs";

const url = "http://127.0.0.1:5173";

test("Chrome uses Chromium app-window mode when installed", () => {
  const localAppData = ["C", ":\\Users\\Demo\\AppData\\Local"].join("");
  const chromePath = `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`;
  const result = resolveBrowserLaunchPlan({
    platform: "win32",
    env: { LOCALAPPDATA: localAppData },
    url,
    pathExists: (candidate) => candidate === chromePath,
    commandExists: () => false
  });

  assert.equal(result.ok, true);
  assert.equal(result.id, "chrome");
  assert.equal(result.mode, "app-window");
  assert.equal(result.command, chromePath);
  assert.deepEqual(result.args, [`--app=${url}`]);
});

test("Edge app-window is selected after Chrome is absent", () => {
  const edgePath = ["C", ":\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].join("");
  const result = resolveBrowserLaunchPlan({
    platform: "win32",
    env: { ProgramFiles: ["C", ":\\Program Files"].join("") },
    url,
    pathExists: (candidate) => candidate === edgePath,
    commandExists: () => false
  });

  assert.equal(result.ok, true);
  assert.equal(result.id, "edge");
  assert.equal(result.mode, "app-window");
  assert.deepEqual(result.args, [`--app=${url}`]);
});

test("Firefox falls back to a browser window by default", () => {
  const result = resolveBrowserLaunchPlan({
    platform: "linux",
    url,
    pathExists: () => false,
    commandExists: (command) => command === "firefox"
  });

  assert.equal(result.ok, true);
  assert.equal(result.id, "firefox");
  assert.equal(result.mode, "browser-window");
  assert.deepEqual(result.args, ["--new-window", url]);
});

test("Firefox can be explicitly selected in kiosk mode", () => {
  const result = resolveBrowserLaunchPlan({
    platform: "linux",
    url,
    preferredBrowser: "firefox",
    firefoxKiosk: true,
    pathExists: () => false,
    commandExists: (command) => command === "firefox"
  });

  assert.equal(result.ok, true);
  assert.equal(result.id, "firefox");
  assert.equal(result.mode, "kiosk-window");
  assert.deepEqual(result.args, ["--kiosk", url]);
});

test("Safari is a macOS browser-window fallback", () => {
  const result = resolveBrowserLaunchPlan({
    platform: "darwin",
    url,
    preferredBrowser: "safari",
    pathExists: () => false,
    commandExists: (command) => command === "open"
  });

  assert.equal(result.ok, true);
  assert.equal(result.id, "safari");
  assert.equal(result.mode, "browser-window");
  assert.deepEqual(result.args, ["-a", "Safari", url]);
});

test("system default browser is the final fallback", () => {
  const result = resolveBrowserLaunchPlan({
    platform: "linux",
    url,
    pathExists: () => false,
    commandExists: (command) => command === "xdg-open"
  });

  assert.equal(result.ok, true);
  assert.equal(result.id, "default");
  assert.equal(result.mode, "default-browser");
  assert.deepEqual(result.args, [url]);
});
