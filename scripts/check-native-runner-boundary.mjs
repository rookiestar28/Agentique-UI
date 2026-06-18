#!/usr/bin/env node
import { readNativeRunnerBoundaryInputs, reviewNativeRunnerBoundary } from "../src/core/native-runner-boundary.mjs";

const review = reviewNativeRunnerBoundary(readNativeRunnerBoundaryInputs());

if (!review.ok) {
  console.error(JSON.stringify({ status: "failed", errors: review.errors }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checked: ["src-tauri/src/lib.rs", "src-tauri/capabilities/default.json", "src-tauri/Cargo.toml", "src frontend invokes"],
      commands: review.commands.allowed,
      transitionGate: review.transitionGate
    },
    null,
    2
  )
);
