#!/usr/bin/env node
import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
const capability = JSON.parse(fs.readFileSync("src-tauri/capabilities/default.json", "utf8"));

const findings = [];

if (config.identifier !== "io.agentique.ui") {
  findings.push("identifier must be io.agentique.ui");
}

if (config.bundle?.active !== true) {
  findings.push("bundle.active must be true for release packaging metadata validation");
}

if (config.bundle?.createUpdaterArtifacts !== false) {
  findings.push("createUpdaterArtifacts must remain false until updater signing is configured");
}

if (!Array.isArray(config.bundle?.targets) || !config.bundle.targets.includes("nsis") || !config.bundle.targets.includes("dmg") || !config.bundle.targets.includes("appimage")) {
  findings.push("bundle targets must explicitly cover Windows, macOS, and Linux");
}

if (!String(config.app?.security?.csp ?? "").includes("default-src 'self'")) {
  findings.push("CSP must include default-src self");
}

if (!String(config.build?.devUrl ?? "").startsWith("http://127.0.0.1:")) {
  findings.push("devUrl must bind to loopback");
}

if (Array.isArray(capability.permissions) && capability.permissions.length !== 0) {
  findings.push("UI Lite default capability must not grant runtime permissions");
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checked: ["tauri.conf.json", "capabilities/default.json"] }, null, 2));
