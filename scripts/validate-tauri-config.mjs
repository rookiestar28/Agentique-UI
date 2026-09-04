#!/usr/bin/env node
import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
const capability = JSON.parse(fs.readFileSync("src-tauri/capabilities/default.json", "utf8"));

const findings = [];
const allowedPermissions = ["core:event:allow-listen", "core:event:allow-unlisten"];

if (config.identifier !== "io.agentique.ui") {
  findings.push("identifier must be io.agentique.ui");
}

if (config.bundle?.active !== true) {
  findings.push("bundle.active must be true for release packaging metadata validation");
}

if (config.bundle?.createUpdaterArtifacts !== false) {
  findings.push("createUpdaterArtifacts must remain false until updater signing is configured");
}

const requiredBundleTargets = ["nsis", "msi", "deb", "rpm", "appimage"];
if (!Array.isArray(config.bundle?.targets) || JSON.stringify(config.bundle.targets) !== JSON.stringify(requiredBundleTargets)) {
  findings.push("bundle targets must exactly cover the supported Windows and Linux packages");
}

if (!String(config.app?.security?.csp ?? "").includes("default-src 'self'")) {
  findings.push("CSP must include default-src self");
}

if (!String(config.build?.devUrl ?? "").startsWith("http://127.0.0.1:")) {
  findings.push("devUrl must bind to loopback");
}

if (JSON.stringify(capability.permissions) !== JSON.stringify(allowedPermissions)) {
  findings.push("default capability must grant only event listen and unlisten");
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checked: ["tauri.conf.json", "capabilities/default.json"] }, null, 2));
