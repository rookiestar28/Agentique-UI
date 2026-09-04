#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(root, ".tmp", "uirun011-e2e");
const supportedScenarios = ["deny", "success", "sleep", "exit-failure"];
const requestedScenario = process.argv[2];
const scenarios = requestedScenario == null ? supportedScenarios : supportedScenarios.includes(requestedScenario) ? [requestedScenario] : [];
if (scenarios.length === 0) throw new Error("Unknown native runner E2E scenario.");
const tauriCli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const playwrightCli = path.join(root, "node_modules", "@playwright", "test", "cli.js");

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

for (const scenario of scenarios) await runScenario(scenario);
console.log(JSON.stringify({ ok: true, scenarios, transport: "tauri-webview2-cdp", outputRoot: ".tmp/uirun011-e2e" }));

async function runScenario(scenario) {
  const scenarioRoot = path.join(outputRoot, scenario);
  const appDataRoot = path.join(scenarioRoot, "appdata");
  const profileRoot = path.join(scenarioRoot, "webview2-profile");
  const nativeStorageRoot = path.join(scenarioRoot, "native-storage");
  const playwrightOutput = path.join(scenarioRoot, "playwright");
  fs.mkdirSync(appDataRoot, { recursive: true });
  fs.mkdirSync(profileRoot, { recursive: true });
  fs.mkdirSync(nativeStorageRoot, { recursive: true });
  fs.mkdirSync(playwrightOutput, { recursive: true });

  const hostEnvironment = {
    ...process.env,
    APPDATA: appDataRoot,
    WEBVIEW2_USER_DATA_FOLDER: profileRoot,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=0",
    AGENTIQUE_E2E_APP_DATA_ROOT: nativeStorageRoot,
    AGENTIQUE_E2E_ADAPTER_MODE: scenario === "sleep" ? "sleep" : scenario === "exit-failure" ? "exit-failure" : "success"
  };
  const host = spawn(process.execPath, [tauriCli, "dev", "--no-watch", "--config", "src-tauri/tauri.e2e.conf.json"], {
    cwd: root,
    env: hostEnvironment,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output = [];
  host.stdout.on("data", (chunk) => appendOutput(output, chunk));
  host.stderr.on("data", (chunk) => appendOutput(output, chunk));

  try {
    const portFile = await waitForDevToolsPortFile(profileRoot, host, 180_000);
    const port = Number(fs.readFileSync(portFile, "utf8").split(/\r?\n/u)[0]);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("WebView2 returned an invalid ephemeral debugger port.");
    await waitForProductTarget(port, 30_000);
    const testEnvironment = {
      ...process.env,
      AGENTIQUE_E2E_CDP_ENDPOINT: `http://127.0.0.1:${port}`,
      AGENTIQUE_E2E_PRODUCT_ORIGIN: "http://127.0.0.1:4173",
      AGENTIQUE_E2E_SCENARIO: scenario,
      AGENTIQUE_E2E_PLAYWRIGHT_OUTPUT: playwrightOutput
    };
    const result = spawnSync(process.execPath, [playwrightCli, "test", "e2e/native-runner.spec.mjs", "--config=playwright.native.config.mjs"], {
      cwd: root,
      env: testEnvironment,
      encoding: "utf8",
      windowsHide: true,
      timeout: 120_000
    });
    fs.writeFileSync(path.join(scenarioRoot, "playwright.log"), `${result.stdout ?? ""}${result.stderr ?? ""}`, "utf8");
    if (result.status !== 0) throw new Error(`Playwright scenario ${scenario} failed with exit ${String(result.status)}.\n${bounded(result.stdout)}${bounded(result.stderr)}`);
  } finally {
    terminateExactProcessTree(host.pid);
    fs.writeFileSync(path.join(scenarioRoot, "tauri.log"), output.join(""), "utf8");
  }
}

async function waitForDevToolsPortFile(profileRoot, host, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = findFile(profileRoot, "DevToolsActivePort");
    if (match) return match;
    if (host.exitCode != null) throw new Error(`Tauri host exited before WebView2 was ready.\n${bounded(host.exitCode)}`);
    await delay(200);
  }
  throw new Error("Timed out waiting for the isolated WebView2 DevToolsActivePort file.");
}

async function waitForProductTarget(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = JSON.parse(await getText(`http://127.0.0.1:${port}/json`));
      if (targets.some((target) => target.title === "Agentique UI" && String(target.url).startsWith("http://127.0.0.1:4173"))) return;
    } catch {
      // The ephemeral debugger can publish its port before the product target is ready.
    }
    await delay(200);
  }
  throw new Error("Timed out waiting for the Agentique UI WebView2 target.");
}

function findFile(directory, fileName) {
  if (!fs.existsSync(directory)) return null;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === fileName) return fullPath;
    if (entry.isDirectory()) {
      const nested = findFile(fullPath, fileName);
      if (nested) return nested;
    }
  }
  return null;
}

function terminateExactProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The exact host process may already have exited.
    }
  }
}

function getText(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 2_000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    });
    request.on("timeout", () => request.destroy(new Error("request timed out")));
    request.on("error", reject);
  });
}

function appendOutput(output, chunk) {
  if (output.join("").length < 262_144) output.push(String(chunk));
}

function bounded(value) {
  return String(value ?? "").slice(-4_000);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
