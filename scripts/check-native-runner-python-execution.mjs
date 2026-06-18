#!/usr/bin/env node
import { reviewNativeRunnerPythonExecution } from "../src/core/native-runner-python-execution.mjs";

const review = reviewNativeRunnerPythonExecution();

if (!review.ok) {
  console.error(JSON.stringify({ status: "failed", errors: review.errors }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      schemaVersion: review.schemaVersion,
      execution: review.execution,
      commandNewArgs: review.commandNewArgs
    },
    null,
    2
  )
);
