#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ambientKeys = ["PATH", "Path", "HOME", "USERPROFILE", "APPDATA", "TEMP", "TMP", "NODE_OPTIONS", "NPM_TOKEN", "npm_config_userconfig"];

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", async () => {
  const request = JSON.parse(input);
  const mode = request.mode ?? "success";
  const sleepMs = Number(request.sleepMs ?? 0);

  if (mode === "sleep") {
    await new Promise((resolve) => setTimeout(resolve, Math.max(sleepMs, 0)));
  }

  if (mode === "descendant-sleep" || mode === "descendant-exit") {
    // IMPORTANT: this fixed native-test mode proves process-tree containment. It never accepts
    // executable or argument input and must remain unreachable from renderer commands.
    spawn(process.execPath, [fileURLToPath(new URL("./descendant-helper.mjs", import.meta.url))], {
      detached: false,
      stdio: "ignore",
      env: process.platform === "win32" ? { SystemRoot: process.env.SystemRoot ?? "", WINDIR: process.env.WINDIR ?? "" } : {}
    }).unref();
  }

  if (mode === "descendant-sleep") {
    await new Promise((resolve) => setTimeout(resolve, Math.max(sleepMs, 0)));
  }

  if (mode === "secret") {
    const marker = "bearer " + "abcdefghijklmnop";
    process.stderr.write(`diagnostic marker ${marker}\n`);
  }

  if (mode === "invalid-json") {
    process.stdout.write("not-json\n");
    return;
  }

  if (mode === "exit-failure") {
    process.stderr.write("intentional adapter failure\n");
    process.exitCode = 7;
    return;
  }

  const payload = {
    runId: request.runId,
    resourceId: request.resource?.id,
    mode,
    message: request.payload?.message ?? "node-adapter-ready",
    envKeys: Object.keys(process.env).sort(),
    ambientEnvNonEmpty: ambientKeys.filter((key) => Boolean(process.env[key])).sort()
  };
  const serialized = JSON.stringify(payload);

  const result = {
    schemaVersion: "agentique.nodeAdapterResult.v1",
    ok: true,
    ready: true,
    outputs: [
      {
        path: "outputs/node-result.json",
        mediaType: "application/json",
        bytes: Buffer.byteLength(serialized, "utf8")
      }
    ],
    artifacts: [
      {
        id: "artifact-node-result-json",
        path: "artifacts/node-result.json",
        viewer: "json",
        redacted: true
      }
    ],
    payload
  };

  process.stdout.write(`${JSON.stringify(result)}\n`);
});
