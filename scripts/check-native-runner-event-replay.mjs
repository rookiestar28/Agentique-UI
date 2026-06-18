#!/usr/bin/env node
import { reviewNativeRunnerEventReplay } from "../src/core/native-runner-event-replay.mjs";

const review = reviewNativeRunnerEventReplay();

if (!review.ok) {
  console.error(
    JSON.stringify(
      {
        schemaVersion: review.schemaVersion,
        ok: review.ok,
        replay: review.replay,
        errors: review.errors
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      schemaVersion: review.schemaVersion,
      replay: review.replay
    },
    null,
    2
  )
);
