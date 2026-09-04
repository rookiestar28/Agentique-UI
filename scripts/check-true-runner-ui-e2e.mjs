#!/usr/bin/env node
import fs from "node:fs";

const requiredFiles = [
  "playwright.native.config.mjs",
  "scripts/run-native-runner-e2e.mjs",
  "e2e/native-runner.spec.mjs",
  "src-tauri/tauri.e2e.conf.json",
  "src/core/sha256-sync.mjs",
  "docs/contracts/true-runner-ui-e2e.md"
];
const missing = requiredFiles.filter((file) => !fs.existsSync(file));
if (missing.length > 0) throw new Error(`Missing true native runner E2E files: ${missing.join(", ")}`);

const rendererBoundary = fs.readFileSync("src/core/evidence-redaction-boundary.mjs", "utf8");
if (/from\s+["']node:|\bBuffer\s*[.(]/u.test(rendererBoundary)) throw new Error("Renderer evidence boundary must not depend on Node-only APIs.");

const client = fs.readFileSync("src/core/tauri-native-async-run-client.ts", "utf8");
if (/adapterMode|testScenario|executable|arguments/u.test(client)) throw new Error("Renderer must not control the native adapter mode or process shape.");

console.log(JSON.stringify({ ok: true, files: requiredFiles.length, rendererProcessAuthority: false, realTauriTransportRequired: true }));
