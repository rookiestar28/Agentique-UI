import { spawnSync } from "node:child_process";
import process from "node:process";
import { buildValidationFailureSummary, flattenValidationCommands, validationStages } from "../src/core/validation-stage-reporting.mjs";

const npmBinary = "npm";
const useShell = process.platform === "win32";

const options = parseArgs(process.argv.slice(2));
const selectedStages = options.stageId ? validationStages.filter((stage) => stage.id === options.stageId) : validationStages;

if (options.stageId && selectedStages.length === 0) {
  console.error(JSON.stringify({ status: "failed", error: `Unknown validation stage: ${options.stageId}` }, null, 2));
  process.exit(1);
}

if (options.list) {
  console.log(
    JSON.stringify(
      {
        status: "listed",
        stages: selectedStages.map((stage) => ({
          id: stage.id,
          label: stage.label,
          commands: stage.commands.map((command) => command.text)
        }))
      },
      null,
      2
    )
  );
  process.exit(0);
}

const startedAt = Date.now();
const commands = flattenValidationCommands(selectedStages);
let completedCommands = 0;

for (const stage of selectedStages) {
  console.log(`[validate] stage ${stage.id}: ${stage.label}`);
  for (const command of stage.commands) {
    const commandStartedAt = Date.now();
    completedCommands += 1;
    console.log(`[validate] command ${completedCommands}/${commands.length}: ${command.text}`);
    const result = runNpmCommand(command);
    if (result.status !== 0) {
      const summary = buildValidationFailureSummary({
        stage,
        command,
        exitCode: typeof result.status === "number" ? result.status : 1,
        signal: result.signal,
        durationMs: Date.now() - startedAt
      });
      summary.completedCommands = completedCommands - 1;
      summary.commandDurationMs = Date.now() - commandStartedAt;
      if (result.error) summary.error = result.error.message;
      console.error(JSON.stringify(summary, null, 2));
      process.exit(summary.failed.exitCode);
    }
  }
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      stages: selectedStages.length,
      commands: commands.length,
      durationMs: Date.now() - startedAt
    },
    null,
    2
  )
);

function runNpmCommand(command) {
  /** @type {import("node:child_process").SpawnSyncOptions} */
  const baseOptions = {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  };
  if (useShell) {
    // IMPORTANT: direct npm.cmd spawning returns EINVAL in some Windows shells; use a static manifest command string.
    return spawnSync([npmBinary, ...command.args].join(" "), {
      ...baseOptions,
      shell: true
    });
  }
  return spawnSync(npmBinary, command.args, {
    ...baseOptions,
    shell: false
  });
}

function parseArgs(args) {
  const parsed = {
    list: false,
    stageId: null
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--list") {
      parsed.list = true;
    } else if (arg === "--stage") {
      parsed.stageId = args[index + 1] ?? null;
      index += 1;
    } else if (arg === "--contract") {
      index += 1;
    }
  }
  return parsed;
}
