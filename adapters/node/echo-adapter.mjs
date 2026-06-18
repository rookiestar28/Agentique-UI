#!/usr/bin/env node

const ambientKeys = [
  "PATH",
  "Path",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "TEMP",
  "TMP",
  "NODE_OPTIONS",
  "NPM_TOKEN",
  "npm_config_userconfig"
];

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

  if (mode === "secret") {
    const marker = "bearer " + "abcdefghijklmnop";
    process.stderr.write(`diagnostic marker ${marker}\n`);
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
