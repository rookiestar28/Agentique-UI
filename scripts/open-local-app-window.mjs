#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const DEFAULT_PORT = 5173;
const DEFAULT_URL = `http://127.0.0.1:${DEFAULT_PORT}`;
const CHROMIUM_MODE = "app-window";
const FALLBACK_MODE = "browser-window";
const DEFAULT_MODE = "default-browser";

export function resolveBrowserLaunchPlan({
  platform = process.platform,
  env = process.env,
  url = DEFAULT_URL,
  preferredBrowser = "",
  firefoxKiosk = false,
  pathExists = fs.existsSync,
  commandExists = (command) => defaultCommandExists(command, platform)
} = {}) {
  const requested = normalizeBrowserId(preferredBrowser);
  const definitions = browserDefinitions({ platform, env, firefoxKiosk });
  const ordered = requested
    ? definitions.filter((definition) => definition.id === requested || definition.aliases.includes(requested))
    : definitions;

  if (requested && ordered.length === 0) {
    return failure(`Unsupported browser preference: ${preferredBrowser}`);
  }

  for (const definition of ordered) {
    const plan = resolveDefinition(definition, { url, pathExists, commandExists });
    if (plan) return plan;
  }

  if (requested) {
    return failure(`Requested browser is not installed or not discoverable: ${preferredBrowser}`);
  }

  return defaultBrowserPlan({ platform, url, commandExists });
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(helpText());
    return 0;
  }

  const url = options.url ?? `http://127.0.0.1:${options.port ?? DEFAULT_PORT}`;
  let devServer = null;
  if (options.startDevServer) {
    devServer = await ensureDevServer({ url, port: options.port ?? DEFAULT_PORT });
  }

  const plan = resolveBrowserLaunchPlan({
    url,
    preferredBrowser: options.browser,
    firefoxKiosk: options.firefoxKiosk
  });

  if (!plan.ok) {
    console.error(plan.message);
    if (devServer?.child) devServer.child.kill();
    return 1;
  }

  if (options.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    if (devServer?.child) devServer.child.kill();
    return 0;
  }

  launchPlan(plan);
  console.log(`Opened Agentique UI with ${plan.label} (${plan.mode}).`);
  if (plan.mode !== CHROMIUM_MODE) {
    console.log("This browser does not expose Chromium-style app mode; opened a browser-window fallback.");
  }

  if (devServer?.child) {
    console.log("Dev server is running. Press Ctrl+C to stop it.");
    await waitForExit(devServer.child);
  }
  return 0;
}

function browserDefinitions({ platform, env, firefoxKiosk }) {
  return [
    chromiumDefinition("chrome", "Google Chrome", ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"], platform, {
      win32: [
        envPath(env, "LOCALAPPDATA", "Google", "Chrome", "Application", "chrome.exe"),
        envPath(env, "ProgramFiles", "Google", "Chrome", "Application", "chrome.exe"),
        envPath(env, "ProgramFiles(x86)", "Google", "Chrome", "Application", "chrome.exe")
      ],
      darwin: [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        path.join(os.homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome")
      ]
    }),
    chromiumDefinition("edge", "Microsoft Edge", ["msedge", "microsoft-edge", "microsoft-edge-stable"], platform, {
      win32: [
        envPath(env, "ProgramFiles", "Microsoft", "Edge", "Application", "msedge.exe"),
        envPath(env, "ProgramFiles(x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
        envPath(env, "LOCALAPPDATA", "Microsoft", "Edge", "Application", "msedge.exe")
      ],
      darwin: [
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        path.join(os.homedir(), "Applications", "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge")
      ]
    }),
    chromiumDefinition("brave", "Brave", ["brave", "brave-browser"], platform, {
      win32: [
        envPath(env, "ProgramFiles", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        envPath(env, "ProgramFiles(x86)", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        envPath(env, "LOCALAPPDATA", "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
      ],
      darwin: [
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        path.join(os.homedir(), "Applications", "Brave Browser.app", "Contents", "MacOS", "Brave Browser")
      ]
    }),
    chromiumDefinition("vivaldi", "Vivaldi", ["vivaldi", "vivaldi-stable"], platform, {
      win32: [
        envPath(env, "LOCALAPPDATA", "Vivaldi", "Application", "vivaldi.exe"),
        envPath(env, "ProgramFiles", "Vivaldi", "Application", "vivaldi.exe"),
        envPath(env, "ProgramFiles(x86)", "Vivaldi", "Application", "vivaldi.exe")
      ],
      darwin: [
        "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi",
        path.join(os.homedir(), "Applications", "Vivaldi.app", "Contents", "MacOS", "Vivaldi")
      ]
    }),
    {
      id: "firefox",
      aliases: ["mozilla", "mozilla-firefox"],
      label: firefoxKiosk ? "Firefox kiosk" : "Firefox",
      mode: firefoxKiosk ? "kiosk-window" : FALLBACK_MODE,
      commands: platform === "linux" ? ["firefox", "firefox-esr"] : ["firefox"],
      paths: platform === "win32"
        ? [
            envPath(env, "ProgramFiles", "Mozilla Firefox", "firefox.exe"),
            envPath(env, "ProgramFiles(x86)", "Mozilla Firefox", "firefox.exe")
          ]
        : platform === "darwin"
          ? ["/Applications/Firefox.app/Contents/MacOS/firefox", path.join(os.homedir(), "Applications", "Firefox.app", "Contents", "MacOS", "firefox")]
          : [],
      args: firefoxKiosk ? ["--kiosk", urlMarker()] : ["--new-window", urlMarker()]
    },
    {
      id: "safari",
      aliases: [],
      label: "Safari",
      mode: FALLBACK_MODE,
      commands: platform === "darwin" ? ["open"] : [],
      paths: [],
      args: ["-a", "Safari", urlMarker()]
    }
  ];
}

function chromiumDefinition(id, label, linuxCommands, platform, pathsByPlatform) {
  return {
    id,
    aliases: [],
    label,
    mode: CHROMIUM_MODE,
    commands: platform === "linux" ? linuxCommands : id === "edge" ? ["msedge"] : [id],
    paths: pathsByPlatform[platform] ?? [],
    args: [`--app=${urlMarker()}`]
  };
}

function resolveDefinition(definition, { url, pathExists, commandExists }) {
  for (const candidatePath of definition.paths.filter(Boolean)) {
    if (pathExists(candidatePath)) {
      return plan(definition, candidatePath, materializeArgs(definition.args, url));
    }
  }
  for (const command of definition.commands) {
    if (commandExists(command)) {
      return plan(definition, command, materializeArgs(definition.args, url));
    }
  }
  return null;
}

function defaultBrowserPlan({ platform, url, commandExists }) {
  if (platform === "win32") {
    return {
      ok: true,
      id: "default",
      label: "system default browser",
      mode: DEFAULT_MODE,
      command: "cmd.exe",
      args: ["/c", "start", "", url]
    };
  }
  const command = platform === "darwin" ? "open" : "xdg-open";
  if (!commandExists(command)) {
    return failure(`No supported browser or system opener found for ${platform}.`);
  }
  return {
    ok: true,
    id: "default",
    label: "system default browser",
    mode: DEFAULT_MODE,
    command,
    args: [url]
  };
}

function plan(definition, command, args) {
  return {
    ok: true,
    id: definition.id,
    label: definition.label,
    mode: definition.mode,
    command,
    args
  };
}

function failure(message) {
  return {
    ok: false,
    message
  };
}

function launchPlan(plan) {
  const child = spawn(plan.command, plan.args, {
    detached: true,
    stdio: "ignore",
    shell: false
  });
  child.unref();
}

async function ensureDevServer({ url, port }) {
  if (await isReachable(url)) return { alreadyRunning: true, child: null };
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["run", "dev", "--", "--port", String(port), "--strictPort"], {
    stdio: "inherit",
    shell: false
  });
  await waitForUrlOrExit(url, child);
  return { alreadyRunning: false, child };
}

async function waitForUrlOrExit(url, child) {
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await isReachable(url)) return;
    if (exited) throw new Error("Dev server exited before the local URL became reachable.");
    await delay(250);
  }
  child.kill();
  throw new Error("Timed out waiting for the dev server.");
}

async function isReachable(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

function waitForExit(child) {
  return new Promise((resolve) => child.once("exit", resolve));
}

function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    firefoxKiosk: false,
    startDevServer: false,
    dryRun: false,
    help: false
  };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--start-dev-server") options.startDevServer = true;
    else if (arg === "--firefox-kiosk") options.firefoxKiosk = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--browser=")) options.browser = arg.slice("--browser=".length);
    else if (arg.startsWith("--url=")) options.url = arg.slice("--url=".length);
    else if (arg.startsWith("--port=")) options.port = Number.parseInt(arg.slice("--port=".length), 10);
  }
  if (!Number.isInteger(options.port) || options.port <= 0) options.port = DEFAULT_PORT;
  return options;
}

function helpText() {
  return [
    "Usage: node scripts/open-local-app-window.mjs [options]",
    "",
    "Options:",
    "  --start-dev-server      Start the local Vite dev server before opening the window.",
    "  --browser=<id>          Prefer chrome, edge, brave, vivaldi, firefox, or safari.",
    "  --firefox-kiosk         Use Firefox kiosk mode when Firefox is selected or reached as fallback.",
    "  --url=<url>             Open a custom local URL.",
    "  --port=<port>           Dev server port when --start-dev-server is used.",
    "  --dry-run               Print the selected launch plan without opening a browser."
  ].join("\n");
}

function materializeArgs(args, url) {
  return args.map((arg) => arg.replace(urlMarker(), url));
}

function urlMarker() {
  return "__AGENTIQUE_UI_URL__";
}

function envPath(env, key, ...parts) {
  const root = env[key];
  return root ? path.join(root, ...parts) : "";
}

function normalizeBrowserId(value) {
  return String(value ?? "").trim().toLowerCase();
}

function defaultCommandExists(command, platform) {
  const lookup = platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(lookup, [command], { stdio: "ignore" });
  return result.status === 0;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
