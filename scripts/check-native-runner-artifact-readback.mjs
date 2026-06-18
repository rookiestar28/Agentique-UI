#!/usr/bin/env node
import { reviewNativeRunnerArtifactReadback } from "../src/core/native-runner-artifact-readback.mjs";

const review = reviewNativeRunnerArtifactReadback();

if (!review.ok) {
  console.error(
    JSON.stringify(
      {
        schemaVersion: review.schemaVersion,
        ok: review.ok,
        readback: review.readback,
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
      readback: review.readback
    },
    null,
    2
  )
);
