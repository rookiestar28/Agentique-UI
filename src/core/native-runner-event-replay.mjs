import fs from "node:fs";
import path from "node:path";

const requiredEvents = Object.freeze(["prepare.accepted", "approval.pending", "start.accepted", "adapter.launching", "run-folder.written", "run.succeeded"]);

const unsafePayloadPattern = /(?<![A-Za-z])[A-Za-z]:[\\/]|bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9_-]{16,}/iu;

export function readNativeRunnerEventReplayInputs(root = process.cwd()) {
  const repoRoot = path.resolve(root);
  return {
    root: repoRoot,
    rustSource: readText(repoRoot, "src-tauri/src/lib.rs"),
    runnerEventStreamSource: readText(repoRoot, "src/core/runner-event-stream.mjs"),
    packageJson: readJson(repoRoot, "package.json"),
    nativeContract: readText(repoRoot, "docs/contracts/native-runner-boundary.md")
  };
}

export function reviewNativeRunnerEventReplay(input = readNativeRunnerEventReplayInputs()) {
  const rustSource = String(input.rustSource ?? "");
  const runnerEventStreamSource = String(input.runnerEventStreamSource ?? "");
  const packageJson = input.packageJson ?? {};
  const nativeContract = String(input.nativeContract ?? "");
  const errors = [];

  if (unsafePayloadPattern.test(rustSource)) {
    errors.push(issue("native-event.unsafe-payload", "Native event payloads must not expose raw local paths, secrets, interpreter paths, or native run root paths."));
  }

  const eventPresence = Object.fromEntries(requiredEvents.map((eventType) => [eventType, rustSource.includes(eventType)]));
  for (const [eventType, present] of Object.entries(eventPresence)) {
    if (!present) {
      errors.push(issue("native-event.missing-event", `Native replay is missing required event: ${eventType}.`));
    }
  }

  const replay = {
    nativeBacked:
      rustSource.includes("agentique.nativeRunnerEventReplay.v1") &&
      rustSource.includes("NativeRunnerEventReplayReceipt") &&
      rustSource.includes("NativeRunnerEventReceipt") &&
      rustSource.includes("event_replay: Option<NativeRunnerEventReplayReceipt>") &&
      rustSource.includes("record_native_event") &&
      rustSource.includes("event_replay_for"),
    descriptorOnly: false,
    liveTransport: false,
    replayable: rustSource.includes("replayable: true"),
    statusCommandReplays: /fn\s+agentique_runner_status[\s\S]*native_replay_receipt[\s\S]*replay\.status/u.test(rustSource),
    logsCommandReplays: /fn\s+agentique_runner_logs[\s\S]*native_replay_receipt[\s\S]*replay\.logs/u.test(rustSource),
    redactedAndPathNeutral:
      rustSource.includes("MAX_NATIVE_EVENT_COUNT") &&
      rustSource.includes("safe_event_text") &&
      rustSource.includes("safe_relative_event_ref") &&
      rustSource.includes("redact_runner_text") &&
      !unsafePayloadPattern.test(rustSource),
    descriptorSampleSeparated: /descriptorOnly:\s*true/u.test(runnerEventStreamSource) && /liveTransport:\s*false/u.test(runnerEventStreamSource),
    requiredEvents
  };

  for (const [name, ok] of Object.entries({
    nativeBacked: replay.nativeBacked,
    replayable: replay.replayable,
    statusCommandReplays: replay.statusCommandReplays,
    logsCommandReplays: replay.logsCommandReplays,
    redactedAndPathNeutral: replay.redactedAndPathNeutral,
    descriptorSampleSeparated: replay.descriptorSampleSeparated
  })) {
    if (ok !== true) {
      errors.push(issue(`native-event.${kebab(name)}`, `Native event replay gate is missing ${name}.`));
    }
  }

  if (/descriptorOnly:\s*true/u.test(runnerEventStreamSource) && !/liveTransport:\s*false/u.test(runnerEventStreamSource)) {
    errors.push(issue("native-event.descriptor-live-claim", "Descriptor-only runner event samples must not claim live transport."));
  }

  if (!String(packageJson.scripts?.["validate:native-runner-event-replay"] ?? "").includes("scripts/check-native-runner-event-replay.mjs")) {
    errors.push(issue("native-event.package-script", "package.json must expose validate:native-runner-event-replay."));
  }
  if (!String(packageJson.scripts?.validate ?? "").includes("npm run validate:native-runner-event-replay")) {
    errors.push(issue("native-event.validate-chain", "npm run validate must include native runner event replay validation."));
  }

  for (const phrase of ["native event", "replay", "bounded", "redacted", "descriptor-only"]) {
    if (!nativeContract.includes(phrase)) {
      errors.push(issue("native-event.contract", `Native contract must mention ${phrase}.`));
    }
  }

  return {
    schemaVersion: "agentique.nativeRunnerEventReplayReview.v1",
    ok: errors.length === 0,
    replay,
    errors
  };
}

function readText(root, relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function readJson(root, relPath) {
  return JSON.parse(readText(root, relPath));
}

function kebab(value) {
  return String(value).replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

function issue(code, message) {
  return { code, message };
}
